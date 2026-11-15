# AI Quiz (standalone app)

The Next.js app behind `/quiz` (port 3001) of LSP-SIET. It generates its quizzes through the
LSP-SIET API (`LSP_SIET_API_URL`), so they use the platform's models, the course knowledge library and
the points wallet; the browser calls the API through this app's own `/quiz/api/ws/*` relay.

```bash
cd my-ai-quiz/app
npm install
npm run dev        # http://localhost:3000, point LSP_SIET_API_URL at a running API
```

The API side of the part (`siet_quiz`) and how the parts fit together: `my-ai-quiz/README.md`, `docs/ARCHITECTURE.md`.
