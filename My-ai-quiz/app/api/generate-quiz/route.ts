/**
 * POST /quiz/api/generate-quiz - make a quiz with SIET Space's AI Quiz.
 *
 * Forwards to `POST /api/community/study/quiz` with the caller's token, so the
 * quiz is written by the system's model (Gemini) from the chosen knowledge
 * (RAG), costs the system's points, and is saved to the user's quiz sessions.
 * The answer is turned into the shape the player in this app reads.
 */

import { toAppQuestion, type SystemQuestion } from '../../lib/quizFormat';

export const maxDuration = 60;

type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionType = 'mcq' | 'fill' | 'matching' | 'mixed';

interface GenerateQuizRequest {
  topic?: string;
  difficulty?: Difficulty;
  count?: number;
  questionType?: QuestionType;
  // knowledge scope, as in POST /community/study/quiz
  scope?: string;
  course_id?: number;
  document_ids?: number[];
  notebook_ids?: string[];
  source_ids?: string[];
}

const PASS_HEADERS = ['x-points-required', 'x-points-balance', 'x-points-kind', 'retry-after'];

export async function POST(req: Request) {
  const base = process.env.OPEN_NOTEBOOK_API_URL;
  if (!base) {
    return Response.json({ detail: 'OPEN_NOTEBOOK_API_URL is not set for the quiz app' }, { status: 500 });
  }
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    return Response.json({ detail: 'กรุณาเปิดแอปนี้จาก SIET Space เพื่อเข้าสู่ระบบก่อน' }, { status: 401 });
  }

  const body: GenerateQuizRequest = await req.json().catch(() => ({}));
  const topic = (body.topic || '').trim();
  if (!topic) {
    return Response.json({ detail: 'กรุณาบอกหัวข้อที่อยากทำแบบทดสอบ' }, { status: 400 });
  }
  const payload = {
    topic: topic.slice(0, 500),
    question_count: Math.max(1, Math.min(Number(body.count) || 5, 20)),
    language: 'th',
    difficulty: body.difficulty || 'medium',
    question_type: body.questionType || 'mixed',
    scope: body.scope || 'auto',
    course_id: body.course_id ?? null,
    document_ids: body.document_ids || [],
    notebook_ids: body.notebook_ids || [],
    source_ids: body.source_ids || [],
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${base.replace(/\/$/, '')}/api/community/study/quiz`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (error) {
    return Response.json(
      { detail: `เชื่อมต่อ SIET Space ไม่ได้: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 }
    );
  }
  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const headers = new Headers();
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return Response.json(data ?? { detail: 'สร้างแบบทดสอบไม่สำเร็จ' }, { status: upstream.status, headers });
  }

  const questions: SystemQuestion[] = Array.isArray(data?.questions) ? data.questions : [];
  return Response.json({
    session_id: data?.session_id ?? null,
    topic: data?.topic ?? topic,
    difficulty: data?.difficulty ?? payload.difficulty,
    question_type: data?.question_type ?? payload.question_type,
    scope_label: data?.scope_label ?? '',
    grounded: Boolean(data?.grounded),
    cached: Boolean(data?.cached),
    charged: data?.charged ?? 0,
    balance: data?.balance ?? null,
    questions: questions.map(toAppQuestion),
  });
}
