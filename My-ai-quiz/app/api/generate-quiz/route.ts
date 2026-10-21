export const maxDuration = 45;

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  codeSnippet?: string;
  topic?: string;
}

interface GenerateQuizRequest {
  topic: string;
  subject?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  timerMode?: 'standard' | 'speed' | 'zen';
  questionType?: 'mcq' | 'tf' | 'code';
}

const FREE_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'minimax/minimax-m3.1-flash:free',
];

export async function POST(req: Request) {
  try {
    const body: GenerateQuizRequest = await req.json();
    const topic = body?.topic?.trim() || 'General Knowledge';
    const subject = body?.subject || 'คอมพิวเตอร์และเทคโนโลยี';
    const difficulty = body?.difficulty || 'medium';
    const count = Math.max(1, Math.min(Number(body?.count || 5), 15));

    const apiKey =
      process.env.OPENROUTER_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error:
            'ไม่พบ OPENROUTER_API_KEY ในระบบ กรุณาใส่ OPENROUTER_API_KEY ในไฟล์ .env ก่อนเริ่มสร้างข้อสอบ',
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

    const systemPrompt = `คุณคือระบบสร้างข้อสอบ AI อัจฉริยะสำหรับนักศึกษา
หน้าที่ของคุณคือสร้างแบบทดสอบวิชาการแบบ Multiple Choice ที่มีคุณภาพสูง ชัดเจน และถูกต้องตามหลักสูตร
รูปแบบคำตอบต้องเป็น JSON เท่านั้น (Strict JSON Output) ห้ามใส่ markdown backticks อื่นๆ นอกเหนือจาก JSON object`;

    const userPrompt = `สร้างข้อสอบแบบปรนัย (4 ตัวเลือก) จำนวน ${count} ข้อ
- วิชา: "${subject}"
- หัวข้อเฉพาะเจาะจง: "${topic}"
- ระดับความยาก: ${difficultyText}
- ภาษา: ภาษาไทย (หากเป็นศัพท์เทคนิค ให้เขียนภาษาไทยพร้อมวงเล็บภาษาอังกฤษ หรือเขียนคำศัพท์เทคนิคภาษาอังกฤษทับศัพท์ที่ถูกต้อง)

ข้อกำหนดสำคัญ:
1. แต่ละข้อต้องมี 4 ตัวเลือกใน array "options"
2. "correctAnswer" ต้องตรงกับข้อใดข้อหนึ่งใน "options" แบบคำต่อคำ (exact match)
3. มี "explanation" อธิบายเหตุผลที่ข้อนั้นถูก และทำไมตัวเลือกอื่นจึงผิด อย่างละเอียดและเข้าใจง่าย
4. หากเป็นคำถามที่เกี่ยวกับโค้ดหรืออัลกอริทึม ให้ระบุ "codeSnippet" ด้วย (ถ้าไม่มีให้เป็น "")

คืนค่าเป็นรูปแบบ JSON โครงสร้างนี้เท่านั้น:
{
  "subject": "${subject}",
  "topic": "${topic}",
  "quiz": [
    {
      "id": 1,
      "question": "คำถามข้อที่ 1...",
      "codeSnippet": "โค้ดตัวอย่างถ้ามี หรือค่าว่าง",
      "options": ["ตัวเลือก ก", "ตัวเลือก ข", "ตัวเลือก ค", "ตัวเลือก ง"],
      "correctAnswer": "ตัวเลือก ข",
      "explanation": "คำอธิบายละเอียด..."
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
