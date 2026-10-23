// Browser end-to-end check for report section 4.6.1: opens every main screen as each role on the
// isolated test stack and records each API call the page makes. A screen passes when it renders
// without bouncing to /login, makes no API call that fails (HTTP >= 400) and logs no JS error.
// Route-guard rows pass when the role is sent away from a screen it may not use.
//
//   IT46_PW=... IT46_ADMIN_PW=... node e2e-4.6.mjs            # writes ../eval/results/e2e.json
//   IT46_PW=... IT46_ADMIN_PW=... node e2e-4.6.mjs shots      # also the 4.6 figures
//
// APP/API/ROADMAP/QUIZ default to the test stack (web :28502, API :25055, roadmap :23002, quiz :23001).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const APP = process.env.APP || 'http://localhost:28502'
const API = process.env.API || 'http://localhost:25055/api'
const ROADMAP = process.env.ROADMAP || 'http://localhost:23002/roadmap'
const QUIZ = process.env.QUIZ || 'http://localhost:23001/quiz'
const COURSE = Number(process.env.COURSE || 1953)
const OUT = new URL('../eval/results/', import.meta.url).pathname
const IMAGES = new URL('../images/', import.meta.url).pathname
const CHROME = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')

async function login(username, password) {
  const r = await fetch(`${API}/users/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (!r.ok) throw new Error(`login ${username}: ${r.status}`)
  return r.json()
}

async function context(browser, session, height = 900) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'th-TH' })
  if (session) {
    await ctx.addInitScript(([token, user]) => {
      localStorage.setItem('auth-storage', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }))
      localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    }, [session.access_token, session.user])
  }
  return ctx
}

async function visit(ctx, role, url, { guard = false } = {}) {
  const page = await ctx.newPage()
  const calls = []
  const errors = []
  page.on('response', (res) => {
    const u = res.url()
    if (/\/api\//.test(u) && !/\/_next\//.test(u)) calls.push({ status: res.status(), method: res.request().method(), path: new URL(u).pathname })
  })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
  const t0 = Date.now()
  let status = 0
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    status = res ? res.status() : 0
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1500)
  } catch (e) {
    errors.push(`navigation: ${e.message.split('\n')[0]}`)
  }
  const ms = Date.now() - t0
  const final = page.url()
  const failed = calls.filter((c) => c.status >= 400)
  const bounced = /\/login(\?|$)/.test(new URL(final).pathname + new URL(final).search) && !/\/login/.test(url)
  const requested = new URL(url).pathname
  const left = new URL(final).pathname !== requested
  const ok = guard ? left : status < 400 && !bounced && failed.length === 0 && errors.filter((e) => !/favicon/.test(e)).length === 0
  await page.close()
  const row = { role, url: url.replace(/token=[^&]+/, 'token=<jwt>'), guard, status, final: final.replace(/token=[^&]+/, 'token=<jwt>'), ms, api_calls: calls.length, failed, errors, ok }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(ms).padStart(6)}ms api=${String(calls.length).padStart(3)} fail=${failed.length} err=${errors.length} [${role}] ${row.url}${guard ? ` -> ${new URL(final).pathname}` : ''}`)
  return row
}

const PW = process.env.IT46_PW
const ADMIN_PW = process.env.IT46_ADMIN_PW
const browser = await chromium.launch({ executablePath: CHROME })
const rows = []
try {
  const sessions = {
    student: await login('it46.student1', PW),
    teacher: await login('it46.teacher', PW),
    admin: await login('it46.admin', ADMIN_PW),
  }
  const plan = {
    anonymous: [['/login'], ['/community', { guard: true }]],
    student: [['/dashboard'], ['/community'], ['/community?view=mine'], ['/community?view=saved'], ['/community?view=library'],
      ['/community?view=materials'], ['/community?view=rules'], [`/community?course=${COURSE}`], ['/community/search?q=IT46'],
      ['/community/ask'], ['/community/profile/me'], ['/features'],
      ['/admin', { guard: true }], ['/teacher', { guard: true }], ['/notebooks', { guard: true }]],
    teacher: [['/teacher'], [`/teacher/courses/${COURSE}`], ['/community'], ['/features'], ['/notebooks'], ['/sources'], ['/search'],
      ['/transformations'], ['/admin', { guard: true }]],
    admin: [['/admin'], ['/admin/community'], ['/admin/rag'], ['/admin/roadmap'], ['/admin/quiz'], ['/settings'], ['/settings/models'],
      ['/advanced'], ['/notebooks']],
  }
  if (!process.argv.includes('shots-only')) {
    for (const [role, pages] of Object.entries(plan)) {
      const ctx = await context(browser, sessions[role])
      for (const [p, opts] of pages) rows.push(await visit(ctx, role, `${APP}${p}`, opts))
      await ctx.close()
    }
    // The two separate apps, opened the way the main app opens them (JWT hand-off in ?token=).
    const ext = await context(browser, null)
    rows.push(await visit(ext, 'teacher', `${ROADMAP}?token=${sessions.teacher.access_token}&theme=light`))
    rows.push(await visit(ext, 'student', `${QUIZ}?token=${sessions.student.access_token}&theme=light`))
    await ext.close()
  }

  if (process.argv.includes('shots') || process.argv.includes('shots-only')) {
    // รูป: หน้า KMITL RAG AI ตอบจากเอกสารของห้องทดสอบ พร้อมรายการอ้างอิง
    const ctx = await context(browser, sessions.student, 1250)
    const page = await ctx.newPage()
    const q = new URLSearchParams({ course: String(COURSE), prompt: 'ถ้าส่งงานปฏิบัติการวิชา IT46-201 ช้าไป 2 วัน จะได้คะแนนสูงสุดกี่เปอร์เซ็นต์' })
    await page.goto(`${APP}/community/ask?${q}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'ถาม', exact: true }).click()
    await page.waitForURL(/[?&]c=/, { timeout: 180_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(3000)
    // The chat panel scrolls itself to the end; bring the question bubble (the right-most copy of
    // the question text — the left one is the history list) to the top so question, answer and
    // references are all in view.
    await page.evaluate((question) => {
      const hits = [...document.querySelectorAll('body *')].filter((el) => el.childElementCount === 0 && el.textContent.trim() === question)
      const bubble = hits.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0]
      bubble?.scrollIntoView({ block: 'start' })
      window.scrollTo(0, 0)
      // leave room above the bubble so the sticky header does not cover it
      let box = bubble?.parentElement
      while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement
      if (box) box.scrollTop = Math.max(0, box.scrollTop - 110)
    }, q.get('prompt'))
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(IMAGES, 'fig-4.22-e2e-rag-answer.png') })
    console.log('shot fig-4.22-e2e-rag-answer.png')
    await ctx.close()
  }
} finally {
  await browser.close()
}
const summary = {}
for (const r of rows) {
  const k = r.guard ? `${r.role} (guard)` : r.role
  summary[k] ??= { pages: 0, passed: 0, api_calls: 0, failed_calls: 0, js_errors: 0, ms: [] }
  const s = summary[k]
  s.pages += 1; s.passed += r.ok ? 1 : 0; s.api_calls += r.api_calls; s.failed_calls += r.failed.length; s.js_errors += r.errors.length; s.ms.push(r.ms)
}
for (const s of Object.values(summary)) { s.ms_median = s.ms.sort((a, b) => a - b)[Math.floor(s.ms.length / 2)]; delete s.ms }
if (rows.length) {
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'e2e.json'), JSON.stringify({ generated_at: new Date().toISOString(), app: APP, summary, rows }, null, 1))
  console.log(JSON.stringify(summary, null, 1))
}
