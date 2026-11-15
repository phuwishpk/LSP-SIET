"""
siet_quiz: the AI quiz feature of LSP-SIET (backend half of my-ai-quiz).

QuizSession (domain), quiz generation (service: multiple choice, fill in the blank,
matching, mixed), the /api/features/quiz/sessions* routes and the admin delete.
Depends on siet_platform only; siet_community builds on it (study tools, quiz posts).
"""
