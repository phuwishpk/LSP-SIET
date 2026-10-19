// Renders real terminal output and the two Mermaid diagrams to PNG for the report.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const OUT = new URL('../images/', import.meta.url).pathname
const MD = fs.readFileSync(new URL('../4.1-infrastructure-database.md', import.meta.url).pathname, 'utf8')
const mermaids = [...MD.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1])
const shell = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browser = await chromium.launch({ executablePath: shell })
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---- terminal figures
const term = (text) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#1e1e1e}
.win{display:inline-block;background:#1e1e1e;border-radius:10px;overflow:hidden;font:13px/1.5 "SF Mono",Menlo,monospace;color:#d4d4d4;min-width:760px}
.bar{height:30px;background:#2d2d2d;display:flex;align-items:center;padding:0 12px;gap:8px}
.dot{width:12px;height:12px;border-radius:50%}
.t{margin-left:auto;margin-right:auto;color:#9a9a9a;font:12px -apple-system,sans-serif}
pre{margin:0;padding:14px 18px;white-space:pre}
.p{color:#7dd3fc}.ok{color:#86efac}</style>
<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="t">kmitlAI — zsh</span></div>
<pre>${esc(text).replace(/^(\$ .*|&gt; .*)$/gm, '<span class="p">$1</span>').replace(/(healthy|healthcheck: OK)/g, '<span class="ok">$1</span>')}</pre></div>`
const page = await browser.newPage({ deviceScaleFactor: 2 })
for (const [n, file] of (process.env.TERM_ONLY === '0' ? [] : [['1', 'fig-4.1-compose-ps.png'], ['2', 'fig-4.2-mariadb-check.png'], ['5', 'fig-4.5-surreal-check.png']])) {
  await page.setContent(term(fs.readFileSync(`figma/term/fig${n}.txt`, 'utf8').trimEnd()))
  const el = page.locator('.win')
  await el.screenshot({ path: path.join(OUT, file) })
  console.log('wrote', file)
}

// ---- mermaid figures
const MERMAID = fs.readFileSync('node_modules/mermaid/dist/mermaid.min.js', 'utf8')
const mm = (src) => `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;padding:16px}#d svg{max-width:none!important}</style>
<div id="d"></div><script>${MERMAID}</script><script>mermaid.initialize({startOnLoad:false,theme:'neutral',er:{fontSize:13,useMaxWidth:false},securityLevel:'loose'});
mermaid.render('g', ${JSON.stringify(src)}).then(r=>{document.getElementById('d').innerHTML=r.svg;document.body.dataset.done=1}).catch(e=>{document.body.dataset.err=String(e)})</script>`
for (const [i, file] of [[0, 'fig-4.3-er-diagram.png'], [1, 'fig-4.4-surreal-collections.png']]) {
  const p = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 2400, height: 1600 } })
  p.on('console', (m) => m.type() === 'error' && console.log('console:', m.text().slice(0, 200)))
  await p.setContent(mm(mermaids[i]), { waitUntil: 'load' })
  await p.waitForFunction(() => document.body.dataset.done || document.body.dataset.err, { timeout: 60000 })
  const err = await p.evaluate(() => document.body.dataset.err)
  if (err) { console.log('mermaid error', file, err); continue }
  const box = await p.locator('#d svg').boundingBox()
  await p.locator('#d svg').screenshot({ path: path.join(OUT, file) })
  console.log('wrote', file, Math.round(box.width) + 'x' + Math.round(box.height))
}
await browser.close()
