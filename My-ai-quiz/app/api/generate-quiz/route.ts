export const maxDuration = 45;

interface GenerateQuizRequest {
  topic: string;
  subject?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  timerMode?: 'standard' | 'speed' | 'zen';
  questionType?: 'mcq' | 'fill' | 'matching' | 'mixed';
}

const FREE_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'minimax/minimax-m3.1-flash:free',
];

export async function POST(req: Request) {
  try {
    const body: any = await req.json();
    const topic = body?.topic?.trim() || 'General Knowledge';
    const subject = body?.subject || 'คอมพิวเตอร์และเทคโนโลยี';
    const difficulty = body?.difficulty || 'medium';
    const count = Math.max(1, Math.min(Number(body?.count || body?.questionCount || 5), 15));
    const questionType = body?.questionType || 'mixed';

    const apiKey =
      process.env.OPENROUTER_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error:
            'ไม่พบ OPENROUTER_API_KEY ในระบบ กรุณาใส่ OPENROUTER_API_KEY ในไฟล์ .env.local ก่อนเริ่มสร้างข้อสอบ',
        },
        { status: 500 }
      );
    }

    const difficultyText =
      difficulty === 'easy'
        ? 'ระดับง่าย เน้นความจำและแนวคิดพื้นฐาน'
        : difficulty === 'hard'
        ? 'ระดับท้าทาย เน้นการวิเคราะห์ ประยุกต์ใช้ และแก้โจทย์ปัญหาเชิงลึก'
        : 'ระดับปานกลาง เน้นความเข้าใจและการวิเคราะห์';

    let typeInstruction = '';
    if (questionType === 'fill') {
      typeInstruction = 'ให้สร้างข้อสอบเป็นแบบ "fill" (เติมคำในช่องว่าง) ทั้งหมด โดยมีโจทย์ที่มีช่องว่าง [___] และคำตอบที่ถูกต้องเป็นข้อความสั้นๆ';
    } else if (questionType === 'matching') {
      typeInstruction = 'ให้สร้างข้อสอบเป็นแบบ "matching" (จับคู่คำศัพท์และความหมาย) โดยมี pairs ซ้ายและขวาให้จับคู่กัน';
    } else if (questionType === 'mcq') {
      typeInstruction = 'ให้สร้างข้อสอบเป็นแบบ "mcq" (ปรนัย 4 ตัวเลือก A B C D) ทั้งหมด';
    } else {
      typeInstruction = 'ให้ผสมผสานกันทั้งแบบปรนัย (mcq), เติมคำในช่องว่าง (fill), และจับคู่ (matching) เพื่อความหลากหลายและน่าสนใจ';
    }

    const systemPrompt = `คุณคือระบบสร้างข้อสอบ AI อัจฉริยะสำหรับนักศึกษา
หน้าที่ของคุณคือสร้างแบบทดสอบวิชาการที่มีคุณภาพสูง ชัดเจน และถูกต้องตามหลักสูตร
รูปแบบคำตอบต้องเป็น JSON เท่านั้น (Strict JSON Output) ห้ามใส่ markdown backticks อื่นๆ นอกเหนือจาก JSON object`;

    const userPrompt = `สร้างข้อสอบจำนวน ${count} ข้อ
- วิชา: "${subject}"
- หัวข้อเฉพาะเจาะจง: "${topic}"
- ระดับความยาก: ${difficultyText}
- รูปแบบข้อสอบ: ${typeInstruction}
- ภาษา: ภาษาไทย (หากเป็นศัพท์เทคนิค ให้เขียนภาษาไทยพร้อมวงเล็บภาษาอังกฤษ หรือเขียนคำศัพท์เทคนิคภาษาอังกฤษทับศัพท์ที่ถูกต้อง)

โครงสร้าง JSON ที่ต้องการ:
{
  "subject": "${subject}",
  "topic": "${topic}",
  "quiz": [
    // ตัวอย่างกรณี type เป็น "mcq":
    {
      "id": 1,
      "type": "mcq",
      "question": "คำถามปรนัย...",
      "options": ["ตัวเลือก 1", "ตัวเลือก 2", "ตัวเลือก 3", "ตัวเลือก 4"],
      "correctAnswer": "ตัวเลือก 2",
      "explanation": "คำอธิบายละเอียดว่าทำไมถึงถูก..."
    },
    // ตัวอย่างกรณี type เป็น "fill" (เติมคำ):
    {
      "id": 2,
      "type": "fill",
      "question": "โปรโตคอลที่ใช้ในการส่งอีเมลบนอินเทอร์เน็ตคือโปรโตคอล [___]",
      "correctAnswer": "SMTP",
      "acceptableAnswers": ["SMTP", "Simple Mail Transfer Protocol"],
      "explanation": "SMTP ย่อมาจาก Simple Mail Transfer Protocol ใช้สำหรับส่งอีเมล..."
    },
    // ตัวอย่างกรณี type เป็น "matching" (จับคู่ 3-4 คู่):
    {
      "id": 3,
      "type": "matching",
      "question": "จงจับคู่หน่วยความจำคอมพิวเตอร์กับคุณสมบัติให้ถูกต้อง",
      "matchingPairs": [
        { "left": "Register", "right": "ความเร็วสูงสุด อยู่ภายใน CPU" },
        { "left": "RAM", "right": "หน่วยความจำหลัก ลบเลือนเมื่อดับไฟ (Volatile)" },
        { "left": "SSD", "right": "หน่วยความจำสำรอง ไม่ลบเลือน (Non-volatile)" }
      ],
      "explanation": "Register ทำงานเร็วสุด ตามด้วย Cache, RAM, และ SSD ตามลำดับ Storage Hierarchy"
    }
  ]
}`;

    // Try calling OpenRouter with fallback models
    let generatedData = null;
    let lastError = null;

    for (const model of FREE_MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://kmitl.ac.th',
            'X-Title': 'KMITL AI Quiz Arena',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.warn(`Model ${model} failed (${response.status}):`, errBody);
          lastError = errBody;
          continue;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) continue;

        // Parse JSON
        const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/i).trim();
        const parsed = JSON.parse(cleaned);

        if (Array.isArray(parsed?.quiz) && parsed.quiz.length > 0) {
          generatedData = parsed;
          break;
        }
      } catch (err) {
        console.warn(`Error trying model ${model}:`, err);
        lastError = err;
      }
    }

    if (!generatedData) {
      return Response.json(
        {
          error:
            'โมเดล AI ยังไม่สามารถสร้างข้อสอบได้ในขณะนี้ กรุณาตรวจสอบว่าได้ระบุ OPENROUTER_API_KEY ถูกต้อง หรือลองอีกครั้งในสักครู่',
          details: String(lastError),
        },
        { status: 502 }
      );
    }

    return Response.json(generatedData);
  } catch (error) {
    console.error('API Error:', error);
    return Response.json(
      { error: 'เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง' },
      { status: 500 }
    );
  }
}
