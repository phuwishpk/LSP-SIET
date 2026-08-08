import { backendServices } from "@/backend/services/services";
import { OPEN_AI_FALLBACK_MODELS, OPEN_AI_MODEL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, POCKETBASE_URL } from "@/shared/constants/config";
import openAiInstance from "@/shared/helper/openai";
import cacheData from "memory-cache";
import { promises as fs } from "fs";
import { formidable } from "formidable";
import pdfParse from "pdf-parse";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_PDF_TEXT_CHARS = 60000;
const MAX_RAG_CONTEXT_CHARS = 12000;
const MAX_PDF_FILE_SIZE_MB = 500;

function extractJsonObject(text) {
  const cleanText = text.replace(/```(?:json)?/g, "").replace(/\@finish/g, "").trim();
  const start = cleanText.indexOf("{");
  if (start === -1) {
    throw new Error("AI response did not include JSON");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleanText.length; i++) {
    const char = cleanText[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth++;
    }

    if (char === "}") {
      depth--;
      if (depth === 0) {
        return cleanText.slice(start, i + 1);
      }
    }
  }

  throw new Error("AI response JSON was incomplete");
}

function getModelCandidates() {
  return [
    OPEN_AI_MODEL,
    ...(OPEN_AI_FALLBACK_MODELS || "gemini-3.1-flash-lite,gemini-3.1-flash,gemini-3.5-flash")
      .split(",")
      .map(model => model.trim())
  ].filter((model, index, models) => model && models.indexOf(model) === index);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createChatCompletionWithFallback(openai, payload) {
  const models = getModelCandidates();
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await openai.createChatCompletion({
          ...payload,
          model,
        });

        return {
          response,
          model,
        };
      } catch (error) {
        lastError = error;
        const status = error?.response?.status || error?.status;

        if (![429, 500, 503].includes(status)) {
          throw error;
        }

        await wait(500 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseMultipartForm(req) {
  const form = formidable({
    maxFileSize: MAX_PDF_FILE_SIZE_MB * 1024 * 1024,
    maxTotalFileSize: MAX_PDF_FILE_SIZE_MB * 1024 * 1024,
    multiples: false,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function chunkText(text, chunkSize = 1400, overlap = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const chunks = [];

  for (let start = 0; start < normalized.length; start += chunkSize - overlap) {
    chunks.push(normalized.slice(start, start + chunkSize));
  }

  return chunks;
}

function getRelevantPdfContext(text, query) {
  const queryTerms = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(term => term.length > 2)
  );

  const chunks = chunkText(text.slice(0, MAX_PDF_TEXT_CHARS));
  const rankedChunks = chunks
    .map((chunk, index) => {
      const lowerChunk = chunk.toLowerCase();
      let score = 0;
      queryTerms.forEach(term => {
        if (lowerChunk.includes(term)) {
          score++;
        }
      });

      return {
        chunk,
        index,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selectedChunks = rankedChunks
    .filter(item => item.score > 0)
    .slice(0, 8);

  const fallbackChunks = selectedChunks.length ? selectedChunks : rankedChunks.slice(0, 8);

  return fallbackChunks
    .map((item, index) => `[PDF chunk ${index + 1}]\n${item.chunk}`)
    .join("\n\n")
    .slice(0, MAX_RAG_CONTEXT_CHARS);
}

async function getRequestData(req) {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    return {
      title: req.query.title,
      token: req.query.token,
      pdfContext: "",
      pdfFileName: null,
      pdfWarning: null,
    };
  }

  const { fields, files } = await parseMultipartForm(req);
  const title = firstValue(fields.title) || req.query.title;
  const token = firstValue(fields.token) || req.query.token;
  const pdfFile = firstValue(files.pdf);

  if (!pdfFile) {
    return {
      title,
      token,
      pdfContext: "",
      pdfFileName: null,
      pdfWarning: null,
    };
  }

  let pdfText = "";
  let pdfWarning = null;

  try {
    const pdfBuffer = await fs.readFile(pdfFile.filepath);
    const parsedPdf = await pdfParse(pdfBuffer, { max: 50 });
    pdfText = parsedPdf.text || "";
    if (!pdfText.trim()) {
      pdfWarning = "PDF was uploaded, but no selectable text was found. If it is a scanned PDF, OCR is required.";
    }
  } catch (error) {
    pdfWarning = getPdfReadErrorMessage(error);
  }

  return {
    title,
    token,
    pdfContext: pdfText ? getRelevantPdfContext(pdfText, title || "") : "",
    pdfFileName: pdfFile.originalFilename,
    pdfWarning,
  };
}

function getPdfReadErrorMessage(error) {
  if (error?.code === 1009 || error?.message?.includes("maxTotalFileSize") || error?.message?.includes("maxFileSize")) {
    return `PDF file is too large. Please upload a PDF smaller than ${MAX_PDF_FILE_SIZE_MB}MB.`;
  }

  return `Could not read PDF: ${error?.message || "invalid file"}`;
}

export default async function handler(req, res) {
  let requestData;

  try {
    requestData = await getRequestData(req);
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: getPdfReadErrorMessage(error)
    })
  }

  const { title, token, pdfContext, pdfFileName, pdfWarning } = requestData;
  // config
  const maxItems = 24
  const minItems = 12
  const minLevels = 5
  const debug = true
  if (!title) {
    return res.status(400).json({
      ok: false,
      message: "bad request params"
    })
  }

  // Authenticated requests are generated and persisted by Open Notebook so
  // Roadmap shares the same model registry, RAG corpus and per-user storage.
  const workspaceApiUrl = process.env.OPEN_NOTEBOOK_API_URL;
  if (workspaceApiUrl && token) {
    try {
      const workspaceResponse = await fetch(
        `${workspaceApiUrl.replace(/\/$/, "")}/api/features/roadmap/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title,
            description: pdfContext
              ? `${title}\n\nUploaded document context:\n${pdfContext}`
              : title,
            language: "th",
            node_count: 15,
          }),
        }
      );
      const workspaceData = await workspaceResponse.json();
      if (!workspaceResponse.ok) {
        return res.status(workspaceResponse.status).json({
          ok: false,
          message: workspaceData?.detail || "Open Notebook RAG request failed",
        });
      }

      const session = workspaceData.session;
      const nodes = session?.nodes || [];
      const parentByTarget = new Map(
        (session?.edges || []).map(edge => [String(edge.target), String(edge.source)])
      );
      const numericIdByNode = new Map(nodes.map((node, index) => [String(node.id), index]));
      const roadmap = nodes.map((node, index) => {
        const parentNode = parentByTarget.get(String(node.id));
        return {
          id: index,
          level: index === 0 ? 0 : 1,
          parent: index === 0 ? 0 : (numericIdByNode.get(parentNode) ?? 0),
          title: node.label,
          description: node.description || "",
        };
      });
      const code = String(session.id || `rag-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
      const record = {
        code,
        title: session.title || title,
        data: JSON.stringify(roadmap),
        roadmap,
        created: session.created,
      };
      cacheData.put(`roadmap/local/${code}`, record);
      return res.status(200).json({
        ok: true,
        code,
        data: record,
        warning: pdfWarning,
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: `Open Notebook RAG is unavailable: ${error?.message || error}`,
      });
    }
  }
  let isFinished = false
  const hasPocketbaseConfig = Boolean(POCKETBASE_URL && POCKETBASE_ADMIN_EMAIL && POCKETBASE_ADMIN_PASSWORD);
  let cats = {
    items: [
      { id: null, title: "Other" }
    ]
  };

  if (hasPocketbaseConfig) {
    cats = await backendServices.getCategories();
  }

  const categoriesList = cats.items.map(item => item.title).join(" | ")

  const findCatId = (title) => cats.items.find(item => item.title == title?.trim())?.id ?? cats.items[0]?.id ?? null
  //  make minimum ${eachLevelItemsCount} items in first ${maximumLevels} levels
  const basePrompt = `based on my prompt , make up to date roadmap
important response rules :
- return only one valid JSON object
- do not use markdown
- do not explain your answer
- do not include @finish

common rules:
- all should has a parent
- root parent is 0
- root item level should be 0
- no null title
- short and efficient titles
- don't extra description

- response json should be single layer not nested items in items

- choose most related / similar category from here ( based on prompt ):
${categoriesList}
- choose Other Category if you not found right category

- sample response:
{ "category":"Other","roadmap":[{"id":0,"level":0,"parent":0,"title":"..."},{"id":1,"level":1,"parent":0,"title":"..."}] }

important items and levels rules:
- minimum ${minLevels} levels
- level 1 should has minimum 3 items
- minimum ${minItems} items
- maximum ${maxItems} items
- items should be less than ${maxItems}
- fill only requested fields
- no duplicate subjects

prompt: 
${title}
${pdfContext ? `
Use the following retrieved PDF context as the main source. If the prompt conflicts with the PDF, prefer the PDF.

${pdfContext}
` : ""}`
  const openai = openAiInstance(token || undefined)
  const messages = [];

  messages.push({
    "role": "user",
    "content": basePrompt,

  })
  var startTime = performance.now()
  try {
    const { response: openai_res, model } = await createChatCompletionWithFallback(openai, {
      temperature: 0.4,
      messages,
      max_tokens: 6000 // roadmap JSON plus PDF context overhead
    });

    if (openai_res.data.choices.length) {
      const text = openai_res.data.choices[0].message.content.trim();
      const newRes = text.replace(/\@finish/g, '').trim()
      messages.push({
        "role": "assistant",
        "content": newRes
      })
      if (debug) {
        console.log(`generated roadmap with ${model}`);
      }
      isFinished = true
    }
  } catch (e) {
    isFinished = true
    if (debug) {
      console.log("openai request error", e?.response?.status || e?.status || e?.message);
      console.log(e?.response?.data);
    }
    return res.status(e?.response?.status === 503 ? 503 : 500).json({
      ok: false,
      message: e?.response?.data?.[0]?.error?.message || e?.message
    })
  }

  messages.shift(); // first item is prompt

  let ai_res = ''
  for (const message of messages) {
    ai_res += message.content;
  }

  try {
    let obj = JSON.parse(extractJsonObject(ai_res));

    const categoryTitle = obj.category;
    const catId = findCatId(categoryTitle);
    let roadmap = obj.roadmap
    // sometimes models use a non-zero root id, so normalize it to React Flow's expected root id.
    const generatedRootIndex = roadmap.findIndex(item => item.level == 0 && item.parent == 0);
    if (generatedRootIndex != -1 && roadmap[generatedRootIndex].id != 0) {
      const oldRootId = roadmap[generatedRootIndex].id;
      roadmap[generatedRootIndex].id = 0;
      roadmap[generatedRootIndex].title = roadmap[generatedRootIndex].title || title;
      roadmap = roadmap.map(item => item.parent == oldRootId ? { ...item, parent: 0 } : item);
    }

    // sometimes gpt not giving root item , so we add it manually
    const rootIndex = roadmap.findIndex(item => item.id == 0);
    if (rootIndex == -1) {
      roadmap.push({
        id: 0,
        level: 0,
        parent: 0,
        title
      })
    } else {
      if (roadmap[rootIndex]?.title?.trim() == "Root") {
        roadmap[rootIndex].title = title
      }
    }
    // remove null titles
    roadmap = roadmap.filter(item => item?.title && item?.title != '')

    // end

    // save roadmap
    const code = (Math.random() + 1).toString(36).substring(5)

    var endTime = performance.now()

    if (hasPocketbaseConfig) {
      await backendServices.saveRoadmap({
        category: catId,
        code,
        title,
        data: JSON.stringify(roadmap),
        prompt: basePrompt,
        generate_time: Math.floor((endTime - startTime) / 1000) // save seconds
      })
    } else {
      cacheData.put(`roadmap/local/${code}`, {
        code,
        title,
        data: JSON.stringify(roadmap),
        source_pdf: pdfFileName,
        likes: 0,
        is_liked: false,
        created: new Date().toISOString()
      }, 1000 * 60 * 60)
    }

    return res.status(200).json({
      ok: true,
      data: {
        roadmap,
        code,
        saved: hasPocketbaseConfig,
        warning: pdfWarning,
      }
    })
  } catch (e) {
    if (debug) {
      console.log(ai_res);
      console.log(e);
    }
    res.status(500).json({
      ok: false,
      message: e.message
    })
  }
}
