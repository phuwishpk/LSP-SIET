// Largest Contentful Paint (LCP) of every screen that e2e-4.6.mjs opens, for the page-load criterion
// of report section 4.6.1 (Core Web Vitals: good <= 2.5 s, poor > 4.0 s at the 75th percentile).
//
// e2e-4.6.mjs times a visit up to network idle plus a fixed 1.5 s pause, so its "ms" column is not a
// load time. This script reads the browser's own LCP entry instead (PerformanceObserver), with no
// fixed pause. Each role's screens are opened RUNS times in a fresh browser context per run (the
// first screen of a run starts with an empty cache, later ones reuse it like a real session).
//
//   IT46_PW=... IT46_ADMIN_PW=... node lcp-4.6.mjs          # writes ../eval/results/lcp.json
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
const RUNS = Number(process.env.RUNS || 3)
const OUT = new URL('../eval/results/', import.meta.url).pathname
const CHROME = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')

async function login(username, password) {
  const r = await fetch(`${API}/users/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (!r.ok) throw new Error(`login ${username}: ${r.status}`)
  return r.json()
}

async function context(browser, session) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'th-TH' })
  await ctx.addInitScript(() => {
    window.__lcp = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lcp = e.renderTime || e.loadTime || e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  if (session) {
    await ctx.addInitScript(([token, user]) => {
      localStorage.setItem('auth-storage', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }))
      localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
    }, [session.access_token, session.user])
  }
  return ctx
}

async function measure(ctx, role, url, run) {
  const page = await ctx.newPage()
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  const idle = Date.now() - t0
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      lcp: Math.round(window.__lcp),
      fcp: fcp ? Math.round(fcp.startTime) : 0,
      ttfb: Math.round(nav.responseStart),
      dcl: Math.round(nav.domContentLoadedEventEnd),
    }
  })
  await page.close()
  const row = { role, url: url.replace(/token=[^&]+/, 'token=<jwt>'), run, ...m, network_idle: idle }
  console.log(`${String(m.lcp).padStart(6)}ms LCP  fcp=${m.fcp} ttfb=${m.ttfb} dcl=${m.dcl} idle=${idle} [${role}#${run}] ${row.url}`)
  return row
}

// p-th percentile, nearest-rank method
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil((p / 100) * xs.length) - 1)]

const sessions = {
  anonymous: null,
  student: await login('it46.student1', process.env.IT46_PW),
  teacher: await login('it46.teacher', process.env.IT46_PW),
  admin: await login('it46.admin', process.env.IT46_ADMIN_PW),
}
// The screens of e2e-4.6.mjs that render for the role (route-guard rows only redirect, so they have no LCP).
const plan = {
  anonymous: ['/login'],
  student: ['/dashboard', '/community', '/community?view=mine', '/community?view=saved', '/community?view=library',
    '/community?view=materials', '/community?view=rules', `/community?course=${COURSE}`, '/community/search?q=IT46',
    '/community/ask', '/community/profile/me', '/features'],
  teacher: ['/teacher', `/teacher/courses/${COURSE}`, '/community', '/features', '/notebooks', '/sources', '/search', '/transformations'],
  admin: ['/admin', '/admin/community', '/admin/rag', '/admin/roadmap', '/admin/quiz', '/settings', '/settings/models', '/advanced', '/notebooks'],
}

const browser = await chromium.launch({ executablePath: CHROME })
const rows = []
try {
  for (let run = 1; run <= RUNS; run++) {
    for (const [role, pages] of Object.entries(plan)) {
      const ctx = await context(browser, sessions[role])
      for (const p of pages) rows.push(await measure(ctx, role, `${APP}${p}`, run))
      await ctx.close()
    }
    const ext = await context(browser, null)
    rows.push(await measure(ext, 'teacher (roadmap app)', `${ROADMAP}?token=${sessions.teacher.access_token}&theme=light`, run))
    rows.push(await measure(ext, 'student (quiz app)', `${QUIZ}?token=${sessions.student.access_token}&theme=light`, run))
    await ext.close()
  }
} finally {
  await browser.close()
}

// A load where the browser recorded no LCP entry is left out of the percentiles (counting it as 0 ms
// would flatter them) and reported in no_lcp, with its FCP kept in the row.
const measured = rows.filter((r) => r.lcp > 0)
const groups = {}
for (const r of measured) (groups[r.role] ||= []).push(r.lcp)
groups.all = measured.map((r) => r.lcp)
const missing = rows.filter((r) => r.lcp <= 0)
const summary = Object.fromEntries(Object.entries(groups).map(([k, xs]) => [k, {
  loads: xs.length, no_lcp: missing.filter((r) => k === 'all' || r.role === k).length,
  p50: pct(xs, 50), p75: pct(xs, 75), max: Math.max(...xs),
  good: xs.filter((x) => x <= 2500).length, needs_improvement: xs.filter((x) => x > 2500 && x <= 4000).length, poor: xs.filter((x) => x > 4000).length,
}]))
console.table(summary)
fs.writeFileSync(path.join(OUT, 'lcp.json'), JSON.stringify({ generated_at: new Date().toISOString(), app: APP, runs: RUNS, summary, rows }, null, 2))
