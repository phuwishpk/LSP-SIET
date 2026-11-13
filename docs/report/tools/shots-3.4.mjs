// Screenshots for report section 3.4 (figures 3.1-3.10) from the running prod stack
// (web :3000, API :5055), 1360px wide @2x, light theme.
//
//   node shots-3.4.mjs                      # every figure except 3.3
//   ADMIN_PW='<admin1 password>' node shots-3.4.mjs 3.3
//
// Needs the demo accounts (demo.teacher1 / demo.student1, password Demo@2026), the DEMO101
// room (id 250) and the files in demo-files/ uploaded to it (see make-demo-files.mjs).
// PDF_DOC = library id of the uploaded slide PDF (84 on 2026-10-23).
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const APP = 'http://localhost:3000'
const API = 'http://localhost:5055/api'
const OUT = new URL('../images/', import.meta.url).pathname
const CHROME = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)
const COURSE = 250 // DEMO101
const PDF_DOC = Number(process.env.PDF_DOC || 84)

async function login(username, password = 'Demo@2026') {
  const r = await fetch(`${API}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) throw new Error(`login ${username}: ${r.status}`)
  return r.json()
}

async function open(session, height) {
  const browser = await chromium.launch({ executablePath: CHROME })
  const ctx = await browser.newContext({
    viewport: { width: 1360, height },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    locale: 'th-TH',
  })
  await ctx.addInitScript(([token, user]) => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }))
    localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'light' }, version: 0 }))
  }, [session.access_token, session.user])
  return { browser, page: await ctx.newPage() }
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

const shots = {
  '3.1': { user: 'demo.teacher1', file: 'fig-3.1-teacher-console.png', async run(page) {
    await page.goto(`${APP}/teacher`)
    await settle(page)
  } },
  '3.2': { user: 'demo.teacher1', file: 'fig-3.2-course-settings.png', height: 1300, async run(page) {
    await page.goto(`${APP}/teacher/courses/${COURSE}`)
    await settle(page)
  } },
  '3.3': { user: 'admin1', file: 'fig-3.3-admin-categories.png', async run(page) {
    await page.goto(`${APP}/admin/community`)
    await settle(page)
    await page.getByRole('tab', { name: 'หมวดหมู่', exact: true }).click()
    await settle(page)
  } },
  '3.4': { api: true, file: 'fig-3.4-api-swagger.png', height: 975, async run(page) {
    await page.goto('http://localhost:5055/docs')
    await page.waitForSelector('.opblock')
    // Re-render the live spec with only the course and category endpoints.
    await page.evaluate(async () => {
      const spec = await (await fetch('/openapi.json')).json()
      const keep = (p) => /\/(courses|categories)(\/|$)/.test(p) && !/reports|import|^\/api\/admin\/courses/.test(p)
      spec.paths = Object.fromEntries(Object.entries(spec.paths).filter(([p]) => keep(p)))
      for (const ops of Object.values(spec.paths)) for (const op of Object.values(ops)) op.tags = [...new Set(op.tags)]
      spec.tags = [{ name: 'community' }, { name: 'admin' }]
      // eslint-disable-next-line no-undef
      ui.specActions.updateSpec(JSON.stringify(spec))
    })
    await page.waitForTimeout(1500)
    await page.addStyleTag({ content: `
      .swagger-ui .information-container .info { margin: 24px 0 8px }
      .swagger-ui .scheme-container, .swagger-ui .models { display: none }
      .swagger-ui .opblock { margin: 0 0 6px }
      .swagger-ui .opblock .opblock-summary { padding: 3px 8px }
      .swagger-ui .opblock-tag { padding: 6px 10px; margin: 0 0 6px }` })
    await page.waitForTimeout(500)
  } },
  '3.5': { user: 'demo.teacher1', file: 'fig-3.5-library-upload.png', height: 1165, async run(page) {
    await page.goto(`${APP}/community?view=library`)
    await settle(page, 2500)
    // Fill the form the way a teacher would, without submitting it.
    const pdf = decodeURIComponent(new URL('./demo-files/DEMO101-บทที่4-ฟังก์ชัน.pdf', import.meta.url).pathname)
    await page.setInputFiles('input[type=file][accept*=".epub"]', pdf)
    const select = page.locator('select').filter({ hasText: 'เลือกรายวิชา' })
    const value = await select.locator('option', { hasText: 'DEMO101' }).first().getAttribute('value')
    await select.selectOption(value)
    await page.waitForTimeout(800)
  } },
  '3.6': { user: 'demo.teacher1', file: 'fig-3.6-teacher-docs.png', async run(page) {
    await page.goto(`${APP}/teacher`)
    await settle(page)
    await page.getByRole('tab', { name: 'เอกสารแยกตามวิชา' }).click()
    await settle(page)
  } },
  '3.7': { user: 'demo.student1', file: 'fig-3.7-download-result.png', async run(page, s) {
    await page.goto(`${API}/community/library/${PDF_DOC}/download?token=${s.access_token}`)
    await page.waitForTimeout(3000)
  } },
  '3.8': { user: 'demo.student1', file: 'fig-3.8-advanced-search.png', height: 960, async run(page) {
    await page.goto(`${APP}/community/search?q=${encodeURIComponent('ข้อมูล')}`)
    await settle(page, 4000)
  } },
  '3.9': { user: 'demo.student1', file: 'fig-3.9-search-filters.png', height: 1100, async run(page) {
    const q = new URLSearchParams({ q: 'ลูป', course_id: String(COURSE), since: '2026-09-01' })
    await page.goto(`${APP}/community/search?${q}`)
    await settle(page, 4000)
  } },
  '3.10': { user: 'demo.student1', file: 'fig-3.10-search-documents.png', async run(page) {
    const q = 'การแบ่งโปรแกรมเป็นส่วนย่อยที่เรียกใช้ซ้ำได้'
    await page.goto(`${APP}/community/search?q=${encodeURIComponent(q)}&kind=documents`)
    await settle(page, 6000)
  } },
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(shots).filter((id) => id !== '3.3')
for (const id of ids) {
  const shot = shots[id]
  const s = shot.api
    ? { access_token: '', user: null }
    : await login(shot.user, shot.user === 'admin1' ? process.env.ADMIN_PW : undefined)
  const { browser, page } = await open(s, shot.height || 900)
  try {
    await shot.run(page, s)
    await page.screenshot({ path: OUT + shot.file })
    console.log(`ok ${id} -> ${shot.file}`)
  } catch (e) {
    console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
  }
}
