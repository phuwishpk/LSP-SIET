// Screenshots for report section 3.6 (figures 3.11-3.15): KMITL RAG AI and AI Roadmap,
// from the running prod stack (web :3000, roadmap app :3002), 1360px wide @2x, light theme.
//
//   node shots-3.6.mjs            # both
//   node shots-3.6.mjs rag        # 3.11-3.12: two real questions as demo.student1 (1 point each)
//   node shots-3.6.mjs roadmap    # 3.13-3.15: creates a NEW roadmap as demo.teacher1 and expands one topic
//
// Every run calls the AI (answers and plans differ between runs). Needs the DEMO101 room (id 250)
// and the slide PDF from demo-files/ uploaded to it (library id 84 on 2026-10-23).
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const APP = 'http://localhost:3000'
const API = 'http://localhost:5055/api'
const ROADMAP = 'http://localhost:3002/roadmap/'
const OUT = new URL('../images/', import.meta.url).pathname
const CHROME = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)
const COURSE = 250 // DEMO101
const SLIDES = Number(process.env.SLIDES_DOC || 84)
const GOAL = 'อยากเข้าใจเรื่องฟังก์ชันใน Python จนทำแบบฝึกหัดท้ายบทที่ 4 ได้'

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
  return { browser, ctx, page: await ctx.newPage() }
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

async function shot(page, file) {
  await page.screenshot({ path: OUT + file })
  console.log('ok', file)
}

async function askAndShoot(page, query, file, { expandSource = false } = {}) {
  await page.goto(`${APP}/community/ask?${new URLSearchParams(query)}`)
  await settle(page, 2500)
  await page.getByRole('button', { name: 'ถาม', exact: true }).click()
  await page.waitForURL(/[?&]c=/, { timeout: 180_000 }) // the page switches to ?c=<conversation> once answered
  await settle(page, 3000)
  if (expandSource) {
    await page.getByText('ดูข้อความ').first().click()
    await page.waitForTimeout(800)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await shot(page, file)
}

async function rag() {
  const s = await login('demo.student1')
  const { browser, page } = await open(s, 1250)
  try {
    await askAndShoot(page, {
      course: String(COURSE),
      prompt: 'ฟังก์ชันใน Python ประกาศอย่างไร และคำสั่ง return ทำหน้าที่อะไร',
    }, 'fig-3.11-rag-course-answer.png')
    await askAndShoot(page, {
      doc: String(SLIDES),
      prompt: 'แบบฝึกหัดท้ายบทที่ 4 มีอะไรบ้าง และต้องส่งเมื่อไร',
    }, 'fig-3.12-rag-document-answer.png', { expandSource: true })
  } finally {
    await browser.close()
  }
}

async function roadmap() {
  const s = await login('demo.teacher1')
  const q = `token=${s.access_token}&theme=light`
  const { browser, page } = await open(s, 790)
  try {
    await page.goto(`${ROADMAP}?${q}`)
    await settle(page, 3000)
    await page.locator('textarea').first().fill(GOAL)
    const source = page.locator('select#source')
    await source.selectOption(await source.locator('option', { hasText: 'DEMO101' }).first().getAttribute('value'))
    await page.locator('textarea').first().blur()
    await page.waitForTimeout(600)
    await shot(page, 'fig-3.13-roadmap-create.png')

    await page.setViewportSize({ width: 1360, height: 1100 })
    await page.getByRole('button', { name: 'สร้าง Roadmap' }).click()
    await page.waitForURL(/\/roadmap\/roadmap\/[^/?]+/, { timeout: 240_000 })
    await page.waitForSelector('.node-label', { timeout: 60_000 })
    await settle(page, 3000)
    await shot(page, 'fig-3.14-roadmap-result.png')

    const before = await page.locator('.node-label').count()
    await page.locator('.node-label').first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /ขยายหัวข้อนี้/ }).click()
    await page.waitForFunction((n) => document.querySelectorAll('.node-label').length > n, before, { timeout: 240_000 })
    await page.waitForTimeout(8000) // let the "เพิ่ม n หัวข้อย่อยแล้ว" toast go away
    await shot(page, 'fig-3.15-roadmap-expand.png')
    console.log(`   ${before} -> ${await page.locator('.node-label').count()} topics`)
  } finally {
    await browser.close()
  }
}

const which = process.argv.slice(2)
if (!which.length || which.includes('rag')) await rag().catch((e) => console.log('FAIL rag:', e.message.split('\n')[0]))
if (!which.length || which.includes('roadmap')) await roadmap().catch((e) => console.log('FAIL roadmap:', e.message.split('\n')[0]))
