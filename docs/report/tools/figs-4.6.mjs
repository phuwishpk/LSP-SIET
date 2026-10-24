// Figures for report section 4.6: the integration diagram (Mermaid block in 4.6-integration-testing.md)
// and terminal figures from the real test output kept in term46/fig4.NN.txt.
//   node figs-4.6.mjs
// fig-4.22 (a browser screenshot) comes from e2e-4.6.mjs instead.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const OUT = new URL('../images/', import.meta.url).pathname
const MD = fs.readFileSync(new URL('../4.6-integration-testing.md', import.meta.url).pathname, 'utf8')
const mermaid = [...MD.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1])[0]
const shell = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell')
const browser = await chromium.launch({ executablePath: shell })
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---- terminal figures (same window style as render_figs.mjs, plus pass/fail colours)
const colour = (text) => esc(text)
  .replace(/^(\$ .*)$/gm, '<span class="p">$1</span>')
  .replace(/\b(PASS|passed|OK|REFUSE|cached=True)\b/g, '<span class="ok">$1</span>')
  .replace(/(✓)/g, '<span class="ok">$1</span>')
  .replace(/\b(FAIL|FAILED|failed)\b/g, '<span class="bad">$1</span>')
  .replace(/(❯|×)/g, '<span class="bad">$1</span>')
const term = (text) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#1e1e1e}
.win{display:inline-block;background:#1e1e1e;border-radius:10px;overflow:hidden;font:13px/1.5 "SF Mono",Menlo,"Thonburi",monospace;color:#d4d4d4;min-width:760px}
.bar{height:30px;background:#2d2d2d;display:flex;align-items:center;padding:0 12px;gap:8px}
.dot{width:12px;height:12px;border-radius:50%}
.t{margin-left:auto;margin-right:auto;color:#9a9a9a;font:12px -apple-system,sans-serif}
pre{margin:0;padding:14px 18px;white-space:pre}
.p{color:#7dd3fc}.ok{color:#86efac}.bad{color:#fca5a5}</style>
<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="t">kmitlAI — zsh</span></div>
<pre>${colour(text)}</pre></div>`
const page = await browser.newPage({ deviceScaleFactor: 2 })
for (const [n, file] of [
  ['19', 'fig-4.19-api-contract.png'], ['20', 'fig-4.20-integration-test.png'], ['21', 'fig-4.21-e2e.png'],
  ['23', 'fig-4.23-pytest.png'], ['24', 'fig-4.24-vitest.png'],
]) {
  await page.setContent(term(fs.readFileSync(new URL(`./term46/fig4.${n}.txt`, import.meta.url), 'utf8').trimEnd()))
  await page.locator('.win').screenshot({ path: path.join(OUT, file) })
  console.log('wrote', file)
}

// ---- Mermaid figure 4.18
const MERMAID = fs.readFileSync(new URL('./node_modules/mermaid/dist/mermaid.min.js', import.meta.url), 'utf8')
const mm = (src) => `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;padding:16px;font-family:Thonburi,sans-serif}#d svg{max-width:none!important}</style>
<div id="d"></div><script>${MERMAID}</script><script>mermaid.initialize({startOnLoad:false,theme:'neutral',flowchart:{useMaxWidth:false,htmlLabels:true,curve:'basis'},themeVariables:{fontFamily:'Thonburi, sans-serif',fontSize:'15px'},securityLevel:'loose'});
mermaid.render('g', ${JSON.stringify(mermaid)}).then(r=>{document.getElementById('d').innerHTML=r.svg;document.body.dataset.done=1}).catch(e=>{document.body.dataset.err=String(e)})</script>`
const p = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 2200, height: 1400 } })
await p.setContent(mm(mermaid), { waitUntil: 'load' })
await p.waitForFunction(() => document.body.dataset.done || document.body.dataset.err, { timeout: 60000 })
const err = await p.evaluate(() => document.body.dataset.err)
if (err) console.log('mermaid error', err)
else {
  await p.locator('#d svg').screenshot({ path: path.join(OUT, 'fig-4.18-integration-architecture.png') })
  console.log('wrote fig-4.18-integration-architecture.png')
}
await browser.close()
