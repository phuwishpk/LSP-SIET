import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

const MODEL_ID = '';

const quizSchema = z.object({
  quiz: z.array(
    z.object({
      id: z.number().describe('Question number starting from 1'),
      question: z.string().describe('The quiz question in Thai'),
      options: z.array(z.string()).length(4).describe('Four answer options in Thai'),
      correctAnswer: z.string().describe('The correct answer and it must match one option exactly'),
      explanation: z.string().describe('A clear explanation in Thai'),
    })
  ),
});

function createFallbackQuiz(topic: string, count: number) {
  const safeCount = Math.max(1, Math.min(count, 5));

  return Array.from({ length: safeCount }, (_, index) => ({
    id: index + 1,
    question: `คำถามตัวอย่างที่ ${index + 1}: สิ่งสำคัญที่สุดของ ${topic} คืออะไร?`,
    options: [
      `แนวคิดพื้นฐานของ ${topic}`,
      `รายละเอียดที่ไม่เกี่ยวข้อง`,
      `คำตอบที่ไม่ถูกต้อง`,
      `ตัวเลือกสุ่มเพื่อให้ครบ 4 ตัว`,
    ],
    correctAnswer: `แนวคิดพื้นฐานของ ${topic}`,
    explanation: `นี่คือตัวอย่างคำอธิบายสำหรับหัวข้อ ${topic} เนื่องจากระบบ AI ยังไม่ถูกตั้งค่าให้ใช้งานในเครื่องนี้`,
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
    const count = Number(body?.count ?? 3);

    if (!topic) {
      return Response.json({ error: 'Please enter a quiz topic' }, { status: 400 });
    }

    if (!Number.isInteger(count) || count < 1 || count > 10) {
      return Response.json({ error: 'Question count must be between 1 and 10' }, { status: 400 });
    }

    const workspaceApiUrl = process.env.OPEN_NOTEBOOK_API_URL;
    const authorization = req.headers.get('authorization');
    if (workspaceApiUrl && authorization) {
      const workspaceResponse = await fetch(
        `${workspaceApiUrl.replace(/\/$/, '')}/api/features/quiz/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authorization,
          },
          body: JSON.stringify({
            topic,
            question_count: count,
            language: 'th',
          }),
        }
      );
      const workspaceData = await workspaceResponse.json();
      if (!workspaceResponse.ok) {
        return Response.json(
          { error: workspaceData?.detail || 'Open Notebook RAG request failed' },
          { status: workspaceResponse.status }
        );
      }
      const quiz = (workspaceData?.session?.questions ?? []).map((question: {
        id: number;
        question: string;
        options: { text: string }[];
        correct_answer: string;
        explanation: string;
      }) => ({
        id: question.id,
        question: question.question,
        options: question.options.map((option) => option.text),
        correctAnswer: question.correct_answer,
        explanation: question.explanation,
      }));
      return Response.json({ quiz });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json({ error: 'AI service is not configured. Please add a Gemini API key.' }, { status: 500 });
    }

    try {
      const result = await generateObject({
        model: google(MODEL_ID),
        schema: quizSchema,
        prompt: `Create a multiple-choice quiz about "${topic}" with ${count} questions in Thai. Each question must have 4 options, one correct answer, and a clear explanation. Make sure the correct answer matches one of the provided options exactly.`,
      });

      return Response.json(result.object);
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: 'AI service is currently unavailable. Please try again later or check your Gemini quota/API key.' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Failed to generate the quiz. Please try again.' }, { status: 500 });
  }
}
