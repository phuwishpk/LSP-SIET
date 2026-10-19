// LSP-SIET Admin: builds the admin screens that are still missing in the Figma
// file and wires every button to the screen or dialog it opens.
//
// Run it once inside the file "LSP-SIET Admin" (the one that already holds the
// "Components" frame and the five "จัดการระบบ" screens):
//   Figma desktop app > Plugins > Development > Import plugin from manifest...
//   pick manifest.json next to this file, then run the plugin.
// It is safe to run again: every frame it makes is replaced, not duplicated.
(async () => {
  const report = [];
  let failures = 0;
  const step = async (name, fn) => {
    try { await fn(); report.push('ok    ' + name); }
    catch (e) { failures += 1; report.push('FAIL  ' + name + ': ' + (e && e.message ? e.message : e)); console.error(name, e); }
  };
  try {
    figma.skipInvisibleInstanceChildren = false;
    // `createAutoLayout` only exists in Figma's own scripting host
    const AL = dir => {
      if (figma.createAutoLayout) return figma.createAutoLayout(dir);
      const f = figma.createFrame(); f.layoutMode = dir; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; return f;
    };
    const pg = figma.currentPage;
    const F = { th: ['Regular', 'Medium', 'SemiBold'].map(style => ({ family: 'IBM Plex Sans Thai', style })), en: ['Regular', 'Medium', 'Semi Bold'].map(style => ({ family: 'Inter', style })) };
    await Promise.all([...F.th, ...F.en].map(f => figma.loadFontAsync(f)));
    const V = {}; for (const v of await figma.variables.getLocalVariablesAsync('COLOR')) V[v.name] = v;
    const C = {}; for (const c of pg.findAllWithCriteria({ types: ['COMPONENT'] })) C[c.name] = c;
    if (!C['Sidebar'] || !V['canvas']) throw new Error('เปิดไฟล์ "LSP-SIET Admin" ที่มีเฟรม Components ก่อนรัน');

    // ------------------------------------------------------------------ helpers
    const LH = { 10: 14, 11: 16, 12: 16, 13: 18, 14: 20, 16: 24, 18: 28, 20: 28, 24: 32 };
    const P = (name, op) => [figma.variables.setBoundVariableForPaint(op == null ? { type: 'SOLID', color: { r: 0, g: 0, b: 0 } } : { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: op }, 'color', V[name])];
    // Thai glyphs stay in IBM Plex Sans Thai; every Latin run is set in Inter, as the app renders it
    function latin(t, w) { const s = t.characters, re = /[^฀-๿\s]+(\s+[^฀-๿\s]+)*/g; let m; while ((m = re.exec(s))) t.setRangeFontName(m.index, m.index + m[0].length, F.en[w]); }
    function setT(t, str, w = 0) { t.fontName = F.th[w]; t.characters = String(str); latin(t, w); return t; }
    // o.wrap: wrap to the parent's inner width (which must already be final); o.fw: wrap to an explicit width
    function T(parent, str, o = {}) {
      const t = figma.createText(), w = o.w ?? 0, s = o.s ?? 14;
      t.fontName = F.th[w]; t.fontSize = s; t.lineHeight = { unit: 'PIXELS', value: o.lh ?? LH[s] ?? Math.round(s * 1.45) };
      setT(t, str, w); t.fills = P(o.c ?? 'foreground');
      if (o.name) t.name = o.name;
      parent.appendChild(t);
      if (o.wrap || o.fw) {
        const W = o.fw ?? (parent.width - parent.paddingLeft - parent.paddingRight);
        t.textAutoResize = 'HEIGHT'; t.resize(Math.max(W, 20), t.height);
        if (o.max) { t.textTruncation = 'ENDING'; t.maxLines = o.max; }
      }
      return t;
    }
    function SZ(n, w, h) {
      if (typeof w === 'number' || typeof h === 'number') n.resize(typeof w === 'number' ? w : Math.max(n.width, 1), typeof h === 'number' ? h : Math.max(n.height, 1));
      n.layoutSizingHorizontal = typeof w === 'number' ? 'FIXED' : w === 'fill' ? 'FILL' : 'HUG';
      n.layoutSizingVertical = typeof h === 'number' ? 'FIXED' : h === 'fill' ? 'FILL' : 'HUG';
    }
    function B(parent, o = {}) {
      const f = AL(o.v ? 'VERTICAL' : 'HORIZONTAL');
      f.name = o.n ?? 'Box'; f.itemSpacing = o.g ?? 0;
      const p = o.p ?? 0, q = typeof p === 'number' ? [p, p, p, p] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;
      f.paddingTop = q[0]; f.paddingRight = q[1]; f.paddingBottom = q[2]; f.paddingLeft = q[3];
      f.fills = o.bg ? P(o.bg, o.bgo) : [];
      if (o.bd) { f.strokes = P(o.bd === true ? 'border' : o.bd); f.strokeWeight = 1; f.strokeAlign = 'INSIDE'; }
      if (o.r != null) f.cornerRadius = o.r;
      if (o.ai) f.counterAxisAlignItems = o.ai;
      if (o.ji) f.primaryAxisAlignItems = o.ji;
      (parent ?? pg).appendChild(f);
      SZ(f, o.w, o.h);
      return f;
    }
    // an empty hugging frame keeps its 100px default height, so a spacer always gets a height
    const SPACER = row => B(row, { n: 'Spacer', w: 'fill', h: 1 });
    function edge(n, top, bottom) { n.strokes = P('border'); n.strokeAlign = 'INSIDE'; n.strokeTopWeight = top; n.strokeBottomWeight = bottom; n.strokeLeftWeight = 0; n.strokeRightWeight = 0; }
    function tint(n, c) { for (const v of n.findAll(x => ['VECTOR', 'ELLIPSE', 'RECTANGLE', 'LINE', 'BOOLEAN_OPERATION'].includes(x.type))) { if (v.strokes.length) v.strokes = P(c); if (v.fills !== figma.mixed && v.fills.length) v.fills = P(c); } }
    const find = (n, name) => n.findOne(x => x.name === name);
    function IC(parent, name, s = 16, c) { const i = C['icon/' + name].createInstance(); parent.appendChild(i); if (s !== 16) i.resize(s, s); if (c) tint(i, c); return i; }
    function BTN(parent, kind, label, icon, o = {}) {
      const b = C['Button/' + kind].createInstance(); parent.appendChild(b);
      const fg = o.c ?? (kind === 'Primary' || kind === 'Destructive' ? 'primary-foreground' : 'foreground');
      const l = find(b, 'Label'), ic = find(b, 'Icon');
      if (label) { setT(l, label, 1); if (o.c) l.fills = P(o.c); if (o.sm) { l.fontSize = 12; l.lineHeight = { unit: 'PIXELS', value: 16 }; } } else l.visible = false;
      if (icon) { ic.swapComponent(C['icon/' + icon]); if (o.sm) ic.resize(14, 14); tint(ic, fg); } else ic.visible = false;
      if (o.sm) { b.paddingLeft = 8; b.paddingRight = 8; b.paddingTop = 8; b.paddingBottom = 8; b.itemSpacing = 4; }
      b.name = o.n ?? 'Button ' + (label || icon);
      return b;
    }
    function BDG(parent, kind, text) { const b = C['Badge/' + kind].createInstance(); parent.appendChild(b); setT(find(b, 'Label'), text, 1); return b; }
    function TILE(parent, [icon, label, value, hint, accent]) {
      const t = C['StatTile'].createInstance(); parent.appendChild(t); t.layoutSizingHorizontal = 'FILL';
      const ic = find(t, 'Icon'); ic.swapComponent(C['icon/' + icon]); tint(ic, accent ? 'ai' : 'subtle-foreground');
      setT(find(t, 'Label'), label, 0); setT(find(t, 'Value'), value, 2); setT(find(t, 'Hint'), hint || ' ', 0);
      return t;
    }
    function TILES(parent, cols, items) { for (let i = 0; i < items.length; i += cols) { const row = B(parent, { n: 'Tiles', g: 12, w: 'fill' }); items.slice(i, i + cols).forEach(it => TILE(row, it)); } }
    function CARD(parent, title, desc, o = {}) {
      const c = B(parent, { n: 'Card · ' + title, v: true, w: o.w ?? 'fill', p: 24, g: 16, r: 16, bg: 'card', bd: true });
      const h = B(c, { n: 'Header', v: true, w: 'fill', g: 6 });
      const row = B(h, { n: 'TitleRow', w: 'fill', g: 8, ai: 'CENTER' });
      if (o.icon) IC(row, o.icon, 16, o.ic ?? 'foreground');
      T(row, title, { s: 16, w: 2 });
      if (desc) T(h, desc, { c: 'muted-foreground', wrap: true });
      return [c, row];
    }
    function SEG(parent, labels, active = 0) { const s = B(parent, { n: 'Segmented', p: 2, r: 10, bd: true }); labels.forEach((l, i) => { const it = B(s, { n: 'seg/' + i, p: [4, 10], r: 8, bg: i === active ? 'primary' : null }); T(it, l, { s: 12, c: i === active ? 'primary-foreground' : 'foreground' }); }); return s; }
    function SEARCH(parent, ph) { const i = C['Input/Search'].createInstance(); parent.appendChild(i); i.layoutSizingHorizontal = 'FILL'; setT(find(i, 'Text'), ph, 0); return i; }
    function SEL(parent, label) { const s = C['Select'].createInstance(); parent.appendChild(s); setT(find(s, 'Label'), label, 0); return s; }
    function RANGE(parent) { const r = B(parent, { n: 'Range', g: 8, ai: 'CENTER' }); T(r, 'ช่วงเวลา', { c: 'muted-foreground' }); SEL(r, '30 วันล่าสุด'); }
    function LIST(parent) { return B(parent, { n: 'List', v: true, w: 'fill', r: 12, bd: true }); }
    function ROW(list, o = {}) { const r = B(list, { n: o.n ?? 'Row', w: 'fill', g: 12, p: 12, ai: o.ai ?? 'MIN', bg: o.bg }); if (list.children.length > 1) edge(r, 1, 0); return r; }
    const COL = r => B(r, { n: 'Body', v: true, w: 'fill', g: 4 });
    function TABLE(parent, cols, rows) {
      const t = B(parent, { n: 'Table', v: true, w: 'fill' });
      const mk = (cells, head) => {
        const r = B(t, { n: head ? 'Head' : 'Row', w: 'fill', g: 12, p: [8, 0], ai: 'CENTER' }); edge(r, 0, 1);
        cells.forEach((cell, i) => {
          const c = B(r, { n: 'Cell', v: true, w: cols[i][1], g: 2 }); if (cols[i][2] === 'r') c.counterAxisAlignItems = 'MAX';
          if (typeof cell === 'function') cell(c);
          else (Array.isArray(cell) ? cell : [cell]).forEach((ln, k) => T(c, ln, head ? { s: 12, w: 1, c: 'muted-foreground' } : k ? { s: 11, c: 'muted-foreground' } : {}));
        });
      };
      mk(cols.map(c => c[0]), true); rows.forEach(r => mk(r));
      return t;
    }
    function CHART(parent, o) {
      const w = B(parent, { n: 'Chart', v: true, w: 'fill', g: 8 });
      const hl = B(w, { g: 6, ai: 'CENTER' }); T(hl, o.head, { w: 2 }); T(hl, o.sub, { c: 'muted-foreground' });
      const area = B(w, { n: 'Plot area', w: 'fill', g: 8 });
      const ax = B(area, { n: 'Axis', v: true, w: 28, h: 160, ji: 'SPACE_BETWEEN', ai: 'MAX' }); o.ticks.forEach(t => T(ax, t, { s: 10, c: 'muted-foreground', lh: 10 }));
      const plot = B(area, { n: 'Plot', w: 'fill', h: 160, ai: 'MAX', ji: 'SPACE_BETWEEN' }); edge(plot, 1, 1);
      const mid = figma.createRectangle(); mid.name = 'Gridline'; plot.appendChild(mid); mid.layoutPositioning = 'ABSOLUTE'; mid.resize(Math.max(plot.width, 10), 1); mid.x = 0; mid.y = 80; mid.fills = P('border'); mid.constraints = { horizontal: 'STRETCH', vertical: 'CENTER' };
      o.vals.forEach((v, i) => { const b = figma.createRectangle(); b.name = 'Bar ' + (i + 1); plot.appendChild(b); b.resize(24, Math.max(1, Math.round(158 * v / o.max))); b.topLeftRadius = 4; b.topRightRadius = 4; b.fills = v ? P(o.tone ?? 'ai') : []; });
      const xl = B(w, { n: 'X labels', w: 'fill', p: [0, 0, 0, 36], ji: 'SPACE_BETWEEN' }); T(xl, o.from, { s: 10, c: 'muted-foreground' }); T(xl, 'วันนี้', { s: 10, c: 'muted-foreground' });
      const more = B(w, { g: 4, ai: 'CENTER' }); IC(more, 'chevron-right', 12, 'muted-foreground'); T(more, 'ดูเป็นตาราง', { s: 12, c: 'muted-foreground' });
    }
    function BARS(parent, rows, tone = 'ai') {
      const max = Math.max(1, ...rows.map(r => r[1])); const w = B(parent, { n: 'Bar list', v: true, w: 'fill', g: 8 });
      rows.forEach(([label, v]) => { const r = B(w, { n: 'Bar row', w: 'fill', g: 12, ai: 'CENTER' }); const lb = B(r, { w: 152 }); T(lb, label, { c: 'muted-foreground' }); const bw = B(r, { g: 8, ai: 'CENTER' }); if (v) { const b = figma.createRectangle(); b.name = 'Bar'; bw.appendChild(b); b.resize(Math.max(4, Math.round(250 * v / max)), 12); b.topRightRadius = 4; b.bottomRightRadius = 4; b.fills = P(tone); } T(bw, String(v), {}); });
    }
    function RANK(parent, rows) {
      const w = B(parent, { n: 'Ranked', v: true, w: 'fill', g: 8 });
      rows.forEach(([name, sub, right], i) => { const r = B(w, { n: 'Rank row', w: 'fill', g: 8, ai: 'CENTER' }); const n = B(r, { w: 16, ji: 'MAX' }); T(n, String(i + 1), { c: 'muted-foreground' }); const c = B(r, { w: 'fill', g: 6, ai: 'CENTER' }); T(c, name, { w: 1 }); if (sub) T(c, sub, { s: 12, c: 'muted-foreground' }); T(r, right, { s: 12, c: 'muted-foreground' }); });
    }
    function FACTS(parent, title, rows) { const w = B(parent, { n: 'Facts', v: true, w: 'fill', g: 4 }); T(w, title, { s: 12, w: 1, c: 'muted-foreground' }); rows.forEach(([k, v]) => { const r = B(w, { w: 'fill', ji: 'SPACE_BETWEEN' }); T(r, k, { c: 'muted-foreground' }); T(r, String(v), {}); }); }
    function COUNTS(parent, [l, c, s]) { [['heart', l], ['message-circle', c], ['repeat-2', s]].forEach(([ic, v]) => { const g = B(parent, { g: 2, ai: 'CENTER' }); IC(g, ic, 12, 'muted-foreground'); T(g, String(v), { s: 11, c: 'muted-foreground' }); }); }
    function EMPTY(parent, text) { const e = B(parent, { n: 'Empty', w: 'fill', p: 32, r: 12, bd: true, ji: 'CENTER' }); e.dashPattern = [4, 4]; T(e, text, { c: 'muted-foreground' }); return e; }
    // the shorter card of a pair stretches to the taller one, as the web grid does
    function EQ(row) { const max = Math.max(...row.children.map(k => k.height)); for (const k of row.children) if (k.height < max) k.layoutSizingVertical = 'FILL'; }
    const days = (n, set) => { const a = Array(n).fill(0); for (const [i, v] of set) a[i] = v; return a; };
    const SHADOW = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.16 }, offset: { x: 0, y: 10 }, radius: 30, spread: 0, visible: true, blendMode: 'NORMAL' }];

    // ------------------------------------------------------------------ the admin pages
    const STEP_X = 1560, STEP_Y = 2600;
    const PAGES = {
      system: { nav: 'admin-system', title: 'จัดการระบบ', row: 0, tabs: ['ภาพรวม', 'ผู้ใช้', 'แต้ม', 'การใช้ AI', 'นำเข้า CSV'] },
      community: { nav: 'admin-community', title: 'จัดการ Community', icon: 'message-square', desc: 'ความเคลื่อนไหวในฟีด โพสต์ ความคิดเห็น และห้องทั้งหมดของ SIET Space', row: 1, tabs: ['ภาพรวม', 'โพสต์', 'ความคิดเห็น', 'ห้อง'] },
      rag: { nav: 'admin-rag', title: 'จัดการ RAG AI', icon: 'database', desc: 'การใช้งาน KMITL RAG AI เอกสารที่ AI อ่าน และแหล่งความรู้ที่ใช้ตอบ — เห็นเฉพาะสถิติ ไม่เห็นบทสนทนาของใคร', row: 2, tabs: ['ภาพรวม', 'เอกสารที่ AI อ่าน', 'แหล่งความรู้'] },
      roadmap: { nav: 'admin-roadmap', title: 'จัดการ AI Roadmap', icon: 'map', desc: 'การใช้งาน AI Roadmap ทั้งระบบ รายการของผู้ใช้ทุกคน และโพสต์ Roadmap ที่อยู่ในฟีด', row: 3, tabs: ['ภาพรวม', 'Roadmap ทั้งหมด', 'ที่แชร์ในฟีด'] },
      quiz: { nav: 'admin-quiz', title: 'จัดการ Quiz', icon: 'brain-circuit', desc: 'การใช้งาน AI Quiz ทั้งระบบ รายการของผู้ใช้ทุกคน และโพสต์ Quiz ที่อยู่ในฟีดพร้อมผลการทำ', row: 4, tabs: ['ภาพรวม', 'Quiz ทั้งหมด', 'ที่แชร์ในฟีด'] },
    };
    const screenName = (key, i) => PAGES[key].title + ' / ' + PAGES[key].tabs[i];
    const frame = name => pg.children.find(n => n.name === name);
    const drop = name => { for (const old of pg.children.filter(n => n.name === name)) old.remove(); };
    function SCREEN(pageKey, tabIdx) {
      const pgd = PAGES[pageKey], name = screenName(pageKey, tabIdx);
      drop(name);
      const s = B(null, { n: name, w: 1440, bg: 'canvas' }); s.x = tabIdx * STEP_X; s.y = pgd.row * STEP_Y; s.minHeight = 1348;
      const sb = C['Sidebar'].createInstance(); s.appendChild(sb); sb.layoutSizingVertical = 'FILL';
      find(sb, 'nav/' + pgd.nav).fills = P('muted');
      const main = B(s, { n: 'Main', v: true, w: 'fill', p: [24, 40], g: 20 });
      const h = C['PageHeader'].createInstance(); main.appendChild(h); h.layoutSizingHorizontal = 'FILL';
      const hi = find(h, 'Icon'); hi.swapComponent(C['icon/' + pgd.icon]); hi.resize(20, 20);
      setT(find(h, 'Title'), pgd.title, 2); setT(find(h, 'Desc'), pgd.desc, 0);
      const tabs = C['Tabs/' + pageKey].createInstance(); main.appendChild(tabs);
      const tab = find(tabs, 'tab/' + tabIdx); tab.fills = P('background'); tab.strokes = P('border'); tab.strokeWeight = 1; find(tab, 'Label').fills = P('foreground');
      return B(main, { n: 'Content', v: true, w: 'fill', g: 16 });
    }

    await step('แก้ spacer ที่สูงเกินในหน้าจัดการระบบ', () => {
      for (const sp of pg.findAll(n => n.type === 'FRAME' && n.name === 'Spacer' && n.height > 50)) { sp.resize(Math.max(sp.width, 1), 1); sp.layoutSizingHorizontal = 'FILL'; sp.layoutSizingVertical = 'FIXED'; }
    });

    // ---------------------------------------------------------------- Community
    await step(screenName('community', 0), () => {
      const body = SCREEN('community', 0);
      RANGE(body);
      TILES(body, 4, [['file-text', 'โพสต์ใหม่ใน 30 วัน', '12', 'ไม่นับโพสต์ที่ถูกซ่อน'], ['message-circle', 'ความคิดเห็น', '25'], ['heart', 'ถูกใจและ Helpful', '51'], ['repeat-2', 'แชร์', '60'], ['users', 'ผู้มีส่วนร่วม', '12', 'โพสต์หรือคอมเมนต์อย่างน้อย 1 ครั้ง'], ['bookmark', 'บันทึกโพสต์', '47'], ['door-open', 'เข้าร่วมห้อง', '37'], ['eye-off', 'โพสต์ที่ซ่อนไว้ทั้งหมด', '58', 'กู้คืนได้ในแท็บโพสต์']]);
      const [cc] = CARD(body, 'โพสต์ใหม่ต่อวัน', 'ทุกชนิดรวมกัน ไม่นับโพสต์ที่ถูกซ่อน');
      CHART(cc, { head: '12 โพสต์', sub: 'ใน 30 วันล่าสุด · ชี้ที่แท่งเพื่อดูรายวัน', vals: days(30, [[7, 4], [11, 1], [14, 7]]), max: 10, ticks: ['10', '5', '0'], from: '9 ก.ย.', tone: 'primary' });
      const two = B(body, { n: 'Columns', g: 16, w: 'fill' });
      const [t1] = CARD(two, 'โพสต์แยกตามชนิด', 'โพสต์ใหม่ใน 30 วัน', { w: 544 });
      BARS(t1, [['สรุป', 4], ['คำถาม', 6], ['ควิซ', 0], ['Roadmap', 0], ['สื่อการสอน', 2]], 'primary');
      const [t2] = CARD(two, 'ผู้มีส่วนร่วมมากที่สุด', 'นับโพสต์และความคิดเห็นใน 30 วัน', { w: 544 });
      RANK(t2, [['ณัฐธิดา แก้วประเสริฐ', '@demo.student2', '1 โพสต์ · 14 ความคิดเห็น'], ['Student 1', '@student1', '3 โพสต์ · 1 ความคิดเห็น'], ['Student 2', '@student2', '0 โพสต์ · 3 ความคิดเห็น'], ['อ.ธนากร วงศ์สวัสดิ์', '@demo.teacher1', '1 โพสต์ · 2 ความคิดเห็น'], ['อ.พิมพ์ชนก ศรีสุข', '@demo.teacher2', '1 โพสต์ · 2 ความคิดเห็น'], ['กานต์ ชัยมงคล', '@demo.student1', '1 โพสต์ · 1 ความคิดเห็น']]);
      EQ(two);
      const [tp] = CARD(body, 'โพสต์ที่มีคนตอบรับมากที่สุด', 'รวมถูกใจ Helpful ความคิดเห็น และแชร์ ของโพสต์ใหม่ใน 30 วัน');
      const tl = B(tp, { n: 'Top posts', v: true, w: 'fill' });
      [['สรุป', 'สรุปบทที่ 2: if / elif / else', 'กานต์ ชัยมงคล', [3, 2, 2]], ['สรุป', 'สรุป Normalization 1NF–3NF แบบจำง่าย', 'ภูมิ รุ่งเรือง', [2, 1, 1]], ['สื่อการสอน', 'ประกาศ: สอบย่อยครั้งที่ 1 สัปดาห์หน้า', 'อ.ธนากร วงศ์สวัสดิ์', [4, 1, 0]], ['คำถาม', 'ถามเรื่อง TLB 65f547 (แก้ไข)', 'Student 1', [3, 0, 1]], ['สื่อการสอน', 'แนวข้อสอบกลางภาค DEMO202', 'อ.พิมพ์ชนก ศรีสุข', [2, 0, 0]]].forEach(([k, title, by, cnt], i) => {
        const r = B(tl, { n: 'Top post', w: 'fill', g: 8, p: [8, 0], ai: 'CENTER' }); if (i) edge(r, 1, 0);
        BDG(r, 'Outline', k); const c = B(r, { w: 'fill' }); T(c, title, { w: 1 }); T(r, by, { s: 12, c: 'muted-foreground' }); COUNTS(r, cnt);
      });
    });

    await step(screenName('community', 1), () => {
      const body = SCREEN('community', 1);
      const [mc] = CARD(body, 'เนื้อหาในระบบ', '12 โพสต์ · ซ่อนโพสต์ที่ผิดกฎได้จากที่นี่ · โพสต์ที่ซ่อนไว้ยังอยู่ในฐานข้อมูลและกู้คืนได้');
      const fr = B(mc, { n: 'Filters', g: 8, w: 'fill', ai: 'CENTER' }); SEARCH(fr, 'ค้นหัวข้อ เนื้อหา หรือชื่อผู้เขียน'); SEL(fr, 'ทุกชนิด'); SEG(fr, ['แสดงอยู่', 'ซ่อนไว้', 'ทั้งหมด'], 0);
      const ml = LIST(mc);
      [['คำถาม', 'แนะนำเว็บฝึกเขียน SQL ฟรีหน่อยครับ', 'อยากฝึก SQL เพิ่มก่อนสอบ มีเว็บไหนที่มีโจทย์ให้ลองรันได้เลยบ้างครับ', 'ธีรเดช อินทร์แก้ว (@demo.student5) · 15 วันที่ผ่านมา', [0, 1, 0]],
       ['สื่อการสอน', 'แนวข้อสอบกลางภาค DEMO202', 'แนวข้อสอบกลางภาค: (1) วาด ER Diagram จากโจทย์ระบบลงทะเบียนเรียน (2) แปลง ER เป็นตาราง (3) ทำ Normalization ถึง 3NF (4) เขียน SQL แบบ JOIN และ GROUP BY', 'อ.พิมพ์ชนก ศรีสุข (@demo.teacher2) · 15 วันที่ผ่านมา · DEMO202', [2, 0, 0]],
       ['คำถาม', 'Primary Key กับ Foreign Key ต่างกันอย่างไร', 'ถ้าตาราง enrollment มีทั้ง student_id และ course_id ตัวไหนเป็น Primary Key ตัวไหนเป็น Foreign Key คะ', 'ปาริชาติ บุญมา (@demo.student4) · 15 วันที่ผ่านมา · DEMO202', [1, 2, 0]],
       ['สรุป', 'สรุป Normalization 1NF–3NF แบบจำง่าย', '1NF = ช่องละค่าเดียว ไม่มีข้อมูลเป็นกลุ่ม 2NF = ทุกคอลัมน์ต้องขึ้นกับคีย์หลัก ‘ทั้งก้อน’ 3NF = คอลัมน์ธรรมดาห้ามขึ้นกับคอลัมน์ธรรมดาด้วยกัน', 'ภูมิ รุ่งเรือง (@demo.student3) · 15 วันที่ผ่านมา · DEMO202', [2, 1, 1]],
       ['คำถาม', 'for กับ while ต่างกันยังไง ควรใช้ตอนไหน', 'อ่านเอกสารแล้วยังงงอยู่ว่าโจทย์แบบไหนควรใช้ for แบบไหนควรใช้ while ครับ มีหลักจำง่าย ๆ ไหม', 'ณัฐธิดา แก้วประเสริฐ (@demo.student2) · 15 วันที่ผ่านมา · DEMO101', [1, 2, 0]],
       ['สรุป', 'สรุปบทที่ 2: if / elif / else', 'สรุปสั้น ๆ ครับ 1) if ตรวจเงื่อนไขแรก ถ้าจริงทำบล็อกนั้นแล้วจบ 2) elif ตรวจต่อเมื่อเงื่อนไขก่อนหน้าเป็นเท็จ มีได้หลายอัน 3) else ทำเมื่อทุกเงื่อนไขเป็นเท็จ', 'กานต์ ชัยมงคล (@demo.student1) · 15 วันที่ผ่านมา · DEMO101', [3, 2, 2]]].forEach(([k, title, ex, meta, cnt]) => {
        const r = ROW(ml, { n: 'post-row' }); const col = COL(r);
        const tl = B(col, { g: 6, ai: 'CENTER' }); BDG(tl, 'Outline', k); T(tl, title, { w: 1 });
        T(col, ex, { s: 12, c: 'muted-foreground', fw: 860, max: 1 });
        const m2 = B(col, { g: 8, ai: 'CENTER' }); T(m2, meta, { s: 11, c: 'muted-foreground' }); COUNTS(m2, cnt);
        const act = B(r, { n: 'Actions', g: 4, ai: 'CENTER' }); BTN(act, 'Ghost', null, 'external-link', { sm: 1, n: 'open-post' }); BTN(act, 'Ghost', 'ซ่อน', 'trash-2', { sm: 1, c: 'muted-foreground', n: 'hide-post' });
      });
      const nt = B(mc, { g: 4, ai: 'CENTER' }); IC(nt, 'eye-off', 12, 'muted-foreground'); T(nt, 'การซ่อนโพสต์ไม่ได้ลบข้อมูลจริง เปลี่ยนแค่ธง is_deleted เท่านั้น', { s: 11, c: 'muted-foreground' });
    });

    await step(screenName('community', 2), () => {
      const body = SCREEN('community', 2);
      const [cm] = CARD(body, 'ความคิดเห็นทั้งหมด', '25 ความคิดเห็น · ใหม่สุดก่อน · การลบความคิดเห็นเป็นการลบถาวร กู้คืนไม่ได้');
      const sr = B(cm, { n: 'Filters', w: 'fill' }); SEARCH(sr, 'ค้นจากข้อความ หรือชื่อผู้เขียน');
      const cl = LIST(cm);
      ['d8f614', '9afb29', 'f61822', 'c5855a', 'a7815b', 'e5249d', '27d7f7'].forEach(id => {
        const r = ROW(cl, { n: 'comment-row', ai: 'CENTER' }); const col = COL(r); T(col, 'คอมเมนต์ทดสอบ ' + id, {});
        const m2 = B(col, { g: 6, ai: 'CENTER' }); T(m2, 'ณัฐธิดา แก้วประเสริฐ (@demo.student2) · 6 วันที่ผ่านมา · ในโพสต์', { s: 11, c: 'muted-foreground' }); T(m2, 'โพสต์ทดสอบย้ายชื่อ ' + id, { s: 11, c: 'muted-foreground' }); BDG(m2, 'Outline', 'โพสต์ถูกซ่อน');
        BTN(r, 'Ghost', 'ลบ', 'trash-2', { sm: 1, c: 'muted-foreground', n: 'delete-comment' });
      });
      const pgr = B(cm, { n: 'Pager', w: 'fill', ai: 'CENTER', ji: 'SPACE_BETWEEN' }); BTN(pgr, 'Outline', 'ก่อนหน้า'); T(pgr, 'หน้า 1 จาก 1', { c: 'muted-foreground' }); BTN(pgr, 'Outline', 'ถัดไป');
    });

    await step(screenName('community', 3), () => {
      const body = SCREEN('community', 3);
      const [rc] = CARD(body, 'ห้องทั้งหมด', 'ห้องวิชา 12 · ห้องพูดคุย 0 · ยังไม่มีโพสต์ 10 · ไม่มีเจ้าของ 4');
      const room = (code, desc) => c => { const l = B(c, { g: 6, ai: 'CENTER' }); IC(l, 'hash', 14, 'subtle-foreground'); T(l, code, { w: 1 }); if (desc) T(c, desc, { s: 11, c: 'muted-foreground' }); };
      const none = c => BDG(c, 'Outline', 'ไม่มีเจ้าของ');
      const acts = c => { const a = B(c, { g: 4, ai: 'CENTER' }); BTN(a, 'Ghost', null, 'external-link', { sm: 1, n: 'open-room' }); BTN(a, 'Ghost', null, 'trash-2', { sm: 1, c: 'muted-foreground', n: 'close-room' }); };
      TABLE(rc, [['ห้อง', 'fill'], ['เจ้าของ', 260], ['สมาชิก', 56, 'r'], ['โพสต์', 48, 'r'], ['เอกสาร', 52, 'r'], ['โพสต์ล่าสุด', 110], [' ', 72, 'r']], [
        [room('CS101 Data Structure', 'โครงสร้างข้อมูลและอัลกอริทึมพื้นฐาน'), none, '11', '0', '0', 'ยังไม่มี', acts],
        [room('CS201 Web Technology', 'การพัฒนาเว็บ ฝั่งหน้าบ้านและหลังบ้าน'), none, '0', '0', '0', 'ยังไม่มี', acts],
        [room('CS301 OS & Linux', 'ระบบปฏิบัติการและการใช้งาน Linux'), none, '0', '0', '0', 'ยังไม่มี', acts],
        [room('CS302 Computer Network', 'เครือข่ายคอมพิวเตอร์และโปรโตคอล'), none, '1', '0', '0', 'ยังไม่มี', acts],
        [room('CS999 Teacher course'), 'somchai.bc0471 (@somchai.bc0471)', '1', '0', '0', 'ยังไม่มี', acts],
        [room('DEMO101 การเขียนโปรแกรมคอมพิวเตอร์', 'ห้องวิชาตัวอย่าง (ข้อมูลทดสอบ) – ตัวแปร เงื่อนไข ลูป ฟังก์ชัน'), 'อ.ธนากร วงศ์สวัสดิ์ (@demo.teacher1)', '7', '3', '1', '15 วันที่ผ่านมา', acts],
        [room('DEMO202 ระบบฐานข้อมูล', 'ห้องวิชาตัวอย่าง (ข้อมูลทดสอบ) – ER Diagram, SQL, Normalization'), 'อ.พิมพ์ชนก ศรีสุข (@demo.teacher2)', '5', '3', '1', '15 วันที่ผ่านมา', acts],
      ]);
      const nt = B(rc, { v: true, w: 'fill', p: 10, r: 12, bg: 'muted' });
      T(nt, 'ห้องที่ “ไม่มีเจ้าของ” คือห้องตัวอย่างที่ระบบสร้างตอนติดตั้ง หรือห้องที่เจ้าของถูกลบบัญชีไป — อาจารย์จะแก้ไข/ปิดห้องเหล่านี้เองไม่ได้ ต้องให้ผู้ดูแลทำ', { s: 11, c: 'muted-foreground', wrap: true });
    });

    // ---------------------------------------------------------------- RAG AI
    await step(screenName('rag', 0), () => {
      const body = SCREEN('rag', 0);
      RANGE(body);
      TILES(body, 4, [['messages-square', 'คำถามใน 30 วัน', '3', '3 บทสนทนา', 1], ['users', 'ผู้ถามใน 30 วัน', '3'], ['book-open-check', 'ตอบได้ครบจากคลัง', '67%', '2 จาก 3 คำตอบ', 1], ['earth', 'คำตอบที่ค้นเว็บเพิ่ม', '1', 'ค้นเว็บ 2 ครั้ง'], ['zap', 'ตอบจากแคช', '0', 'ไม่เรียก AI ซ้ำ และไม่ตัดแต้ม'], ['coins', 'แต้มที่ใช้ใน 30 วัน', '69', 'คำถามละ 1 · เซสชัน 4 แต้ม/5 ข้อความ', 1], ['wallet', 'ค่าใช้จ่าย AI (ประมาณ)', '฿0.16', '7.9k โทเค็น · เรียกโมเดล 6 ครั้ง', 1], ['timer', 'เวลาตอบเฉลี่ย', '2.7 วินาที', 'ต่อการเรียกโมเดล 1 ครั้ง']]);
      const [qc] = CARD(body, 'คำถามต่อวัน', 'นับจากประวัติแชตที่ผู้ใช้ยังเก็บไว้ · ผู้ดูแลเห็นเฉพาะจำนวน ไม่เห็นคำถามหรือคำตอบของใคร');
      CHART(qc, { head: '3 คำถาม', sub: 'ใน 30 วันล่าสุด · ชี้ที่แท่งเพื่อดูรายวัน', vals: days(30, [[13, 2], [14, 1]]), max: 4, ticks: ['4', '2', '0'], from: '9 ก.ย.' });
      const two = B(body, { n: 'Columns', g: 16, w: 'fill' });
      const [c1] = CARD(two, 'คลังความรู้ตอบได้แค่ไหน', 'ถ้า “ไม่พบในคลัง” สูง แปลว่าคนถามเรื่องที่ยังไม่มีเอกสารรองรับ', { w: 544 });
      BARS(c1, [['ตอบได้ครบจากคลัง', 2], ['ตอบได้บางส่วน', 1], ['ไม่พบในคลัง', 0]]);
      const [c2] = CARD(two, 'เอกสารที่ถูกอ้างอิงมากที่สุด', 'นับจำนวนคำตอบที่อ้างถึงเอกสารนั้นใน 30 วัน', { w: 544 });
      RANK(c2, [['01. หลักสูตร ค.อ.บ. เทคโนโลยีคอมพิวเตอร์ (พ.ศ. 2567).pdf', '', '2 คำตอบ'], ['เอกสารประกอบการสอน DEMO101 บทที่ 1–3', '', '1 คำตอบ']]);
      EQ(two);
      const two2 = B(body, { n: 'Columns', g: 16, w: 'fill' });
      const [c3] = CARD(two2, 'ผู้ที่ถามมากที่สุด', 'จำนวนคำถามใน 30 วัน', { w: 544 });
      RANK(c3, [['Student 1', '@student1 · นักศึกษา', '1 คำถาม'], ['พรพรม ทดสอบ', '@67030002 · นักศึกษา', '1 คำถาม'], ['กานต์ ชัยมงคล', '@demo.student1 · นักศึกษา', '1 คำถาม']]);
      const [c4] = CARD(two2, 'คลังเอกสารและข้อจำกัดการถาม', 'สิ่งที่ AI อ่านได้ตอนนี้ และเพดานการถามของผู้ใช้แต่ละคน', { w: 544 });
      const fx = B(c4, { n: 'Facts row', g: 24, w: 'fill' });
      FACTS(fx, 'เอกสารในคลัง', [['พร้อมใช้งาน', 2], ['ของรายวิชา', 2], ['ส่วนตัวของผู้ใช้', 0], ['กำลังประมวลผล', 0], ['ทำดัชนีไม่สำเร็จ', 0], ['ชิ้นข้อความที่ค้นได้', 4]]);
      FACTS(fx, 'เพดานต่อผู้ใช้ 1 คน', [['เว้นระหว่างคำถาม', '3 วินาที'], ['ต่อนาที', 8], ['ต่อชั่วโมง', 60], ['ต่อวัน', 300], ['อาจารย์และผู้ดูแล', '× 4']]);
      EQ(two2);
    });

    await step(screenName('rag', 1), () => {
      const body = SCREEN('rag', 1);
      const [dc] = CARD(body, 'เอกสารที่ AI อ่าน', '2 รายการ · ทั้งของรายวิชาและที่ผู้ใช้อัปโหลดส่วนตัว · เห็นเฉพาะชื่อและสถานะ ไม่เห็นเนื้อหาข้างใน');
      const fr = B(dc, { n: 'Filters', g: 8, w: 'fill', ai: 'CENTER' }); SEARCH(fr, 'ค้นชื่อเอกสาร ชื่อไฟล์ เจ้าของ หรือรหัสวิชา'); SEL(fr, 'ทุกคลัง'); SEG(fr, ['ทั้งหมด', 'พร้อมใช้ 2', 'กำลังประมวลผล 0', 'ไม่สำเร็จ 0'], 0);
      const doc = title => c => { T(c, title, { w: 1, fw: 330, max: 1 }); T(c, 'ข้อความ', { s: 11, c: 'muted-foreground' }); };
      const lib = code => c => { const l = B(c, { g: 4, ai: 'CENTER' }); IC(l, 'users', 12, 'subtle-foreground'); T(l, code, { s: 12 }); };
      const ok = c => { const l = B(c, { g: 4, ai: 'CENTER' }); IC(l, 'circle-check', 14, 'success'); T(l, 'พร้อมใช้', { s: 12 }); };
      const del = c => BTN(c, 'Ghost', null, 'trash-2', { sm: 1, c: 'muted-foreground', n: 'delete-document' });
      TABLE(dc, [['เอกสาร', 'fill'], ['คลัง', 96], ['เจ้าของ', 250], ['สถานะ', 84], ['ชิ้นข้อความ', 76, 'r'], ['อัปเดต', 104], [' ', 36, 'r']], [
        [doc('เอกสารประกอบการสอน DEMO202: การออกแบบฐานข้อมูลและ Normalization'), lib('DEMO202'), 'อ.พิมพ์ชนก ศรีสุข (@demo.teacher2)', ok, '2', '15 วันที่ผ่านมา', del],
        [doc('เอกสารประกอบการสอน DEMO101 บทที่ 1–3: ตัวแปร เงื่อนไข และลูป'), lib('DEMO101'), 'อ.ธนากร วงศ์สวัสดิ์ (@demo.teacher1)', ok, '2', '15 วันที่ผ่านมา', del],
      ]);
    });

    await step(screenName('rag', 2), () => {
      const body = SCREEN('rag', 2);
      const [kc] = CARD(body, 'แหล่งความรู้ที่ AI ตอบได้', '24 Notebook · 49 เอกสาร · ทุกคนถามได้ 4 · เห็นเฉพาะผู้ดูแล 20');
      const kl = B(kc, { n: 'Notebooks', v: true, w: 'fill', g: 8 });
      [['[วิชา] CS301 OS & Linux', 'คลังรายวิชา', 1, '2 เอกสาร'], ['[วิชา] DEMO101 การเขียนโปรแกรมคอมพิวเตอร์', 'คลังรายวิชา', 1, '1 เอกสาร'], ['[วิชา] DEMO202 ระบบฐานข้อมูล', 'คลังรายวิชา', 1, '1 เอกสาร'], ['[วิชา] TST57F0 วิชาทดสอบ 57f0b1', 'คลังรายวิชา', 0, '1 เอกสาร'], ['[ส่วนตัว] Student 1', 'คลังส่วนตัวของผู้ใช้', 0, '9 เอกสาร'], ['[ส่วนตัว] Student 4', 'คลังส่วนตัวของผู้ใช้', 0, '1 เอกสาร'], ['[ส่วนตัว] Student 5', 'คลังส่วนตัวของผู้ใช้', 0, '10 เอกสาร'], ['[ส่วนตัว] stu10c4b8b', 'คลังส่วนตัวของผู้ใช้', 0, '1 เอกสาร']].forEach(([name, kind, shared, n]) => {
        const r = B(kl, { n: 'notebook', w: 'fill', g: 8, p: 12, r: 12, bd: true, ai: 'CENTER' });
        IC(r, 'chevron-right', 14, 'subtle-foreground'); IC(r, shared ? 'globe' : 'lock', 14, 'subtle-foreground');
        const c = B(r, { w: 'fill' }); T(c, name, { w: 1 });
        BDG(r, 'Outline', kind); BDG(r, shared ? 'Secondary' : 'Outline', shared ? 'ทุกคนถามได้' : 'เห็นเฉพาะผู้ดูแล'); T(r, n, { s: 12, c: 'muted-foreground' });
      });
      T(kc, 'ต้องการซ่อน Notebook จากตัวเลือกของผู้ใช้ ให้เก็บถาวร (archive) Notebook นั้นในหน้า Notebooks', { s: 11, c: 'muted-foreground' });
    });

    // ---------------------------------------------------------------- AI Roadmap
    await step(screenName('roadmap', 0), () => {
      const body = SCREEN('roadmap', 0);
      RANGE(body);
      TILES(body, 3, [['map', 'Roadmap ทั้งหมดในระบบ', '65'], ['sparkles', 'สร้างใน 30 วัน', '47', null, 1], ['footprints', 'เดินตามใน 30 วัน', '18', 'ยอดเดินตามสะสม 0'], ['share-2', 'โพสต์ Roadmap ในฟีด', '0'], ['coins', 'แต้มที่ใช้ใน 30 วัน', '1,511', 'หักคืนแต้มที่ refund แล้ว', 1], ['git-branch', 'ขยายด่านใน 30 วัน', '43', 'นับจากรายการหักแต้ม (ไม่รวมอาจารย์/ผู้ดูแล)']]);
      const [cc] = CARD(body, 'Roadmap ที่สร้างต่อวัน', 'นับเฉพาะที่ผู้ใช้สร้างเอง ไม่รวมสำเนาจากการเดินตาม');
      CHART(cc, { head: '47 แผน', sub: 'ใน 30 วันล่าสุด · ชี้ที่แท่งเพื่อดูรายวัน', vals: days(30, [[6, 39], [7, 8]]), max: 50, ticks: ['50', '25', '0'], from: '9 ก.ย.' });
      const two = B(body, { n: 'Columns', g: 16, w: 'fill' });
      const [c1] = CARD(two, 'อ้างอิงจากอะไร', 'Roadmap ที่สร้างใน 30 วัน แยกตามแหล่งที่ใช้', { w: 544 });
      BARS(c1, [['คลังความรู้', 0], ['คลังความรู้ + เว็บ', 0], ['เว็บ', 1], ['ความรู้ทั่วไปของ AI', 46]]);
      const [c2] = CARD(two, 'Roadmap ที่มีคนเดินตามมากที่สุด', 'จากโพสต์ที่ยังแสดงอยู่ในฟีด', { w: 544 });
      T(c2, 'ยังไม่มี Roadmap ที่แชร์ในฟีด', { c: 'muted-foreground' });
      EQ(two);
    });

    await step(screenName('roadmap', 1), () => {
      const body = SCREEN('roadmap', 1);
      const [rc] = CARD(body, 'Roadmap ทั้งหมด', '65 รายการ · เห็นเฉพาะข้อมูลสรุป · เนื้อหาเต็มเปิดดูได้เฉพาะ Roadmap ที่เจ้าของแชร์ลงฟีดแล้ว');
      const fr = B(rc, { n: 'Filters', g: 8, w: 'fill', ai: 'CENTER' }); SEARCH(fr, 'ค้นจากชื่อ Roadmap'); SEG(fr, ['ทั้งหมด', 'สร้างเอง', 'เดินตามจากฟีด'], 0);
      const rl = LIST(rc);
      [['แผนอ่านสอบ OS เรื่อง Memory Management', 0, 'stu136f374 (@stu136f374) · 6 ด่าน · 23 วันที่ผ่านมา'], ['แผนอ่านสอบ Network', 1, 'Student 2 (@student2) · 3 ด่าน · 23 วันที่ผ่านมา'], ['แผนอ่านสอบ Network', 0, 'นวพล ทดสอบ (@67421677) · 3 ด่าน · 23 วันที่ผ่านมา'], ['แผนอ่านสอบ OS เรื่อง Memory Management', 0, 'stu1ca1733 (@stu1ca1733) · 6 ด่าน · 23 วันที่ผ่านมา'], ['แผนอ่านสอบ Network', 1, 'Student 2 (@student2) · 3 ด่าน · 23 วันที่ผ่านมา'], ['แผนอ่านสอบ Network', 0, 'นวพล ทดสอบ (@67875167) · 3 ด่าน · 23 วันที่ผ่านมา']].forEach(([title, followed, meta]) => {
        const r = ROW(rl, { n: 'roadmap-row', ai: 'CENTER' }); const col = COL(r);
        const tl = B(col, { g: 6, ai: 'CENTER' }); T(tl, title, { w: 1 }); BDG(tl, 'Outline', followed ? 'เดินตามจากฟีด' : 'สร้างเอง');
        T(col, meta, { s: 11, c: 'muted-foreground' });
        const act = B(r, { n: 'Actions', g: 4, ai: 'CENTER' });
        if (followed) BTN(act, 'Ghost', 'โพสต์ต้นทาง', 'external-link', { sm: 1, n: 'source-post' });
        else { const l = B(act, { g: 4, p: [0, 8], ai: 'CENTER' }); IC(l, 'lock', 12, 'muted-foreground'); T(l, 'ยังไม่แชร์', { s: 11, c: 'muted-foreground' }); }
        BTN(act, 'Ghost', 'ลบ', 'trash-2', { sm: 1, c: 'muted-foreground', n: 'delete-roadmap' });
      });
      const pgr = B(rc, { n: 'Pager', w: 'fill', ai: 'CENTER', ji: 'SPACE_BETWEEN' }); BTN(pgr, 'Outline', 'ก่อนหน้า'); T(pgr, 'หน้า 1 จาก 3', { c: 'muted-foreground' }); BTN(pgr, 'Outline', 'ถัดไป');
    });

    await step(screenName('roadmap', 2), () => {
      const body = SCREEN('roadmap', 2);
      const [sc] = CARD(body, 'Roadmap ที่แชร์ในฟีด', '0 โพสต์ · เรียงตามจำนวนคนเดินตาม · ซ่อนแล้วกู้คืนได้ และคนที่เดินตามไปแล้วยังมีสำเนาของตัวเอง');
      SEG(sc, ['แสดงอยู่', 'ซ่อนไว้', 'ทั้งหมด'], 0);
      EMPTY(sc, 'ยังไม่มี Roadmap ที่แชร์ในฟีด');
    });

    // ---------------------------------------------------------------- Quiz
    await step(screenName('quiz', 0), () => {
      const body = SCREEN('quiz', 0);
      RANGE(body);
      TILES(body, 4, [['brain-circuit', 'Quiz ทั้งหมดในระบบ', '85'], ['sparkles', 'สร้างใน 30 วัน', '67', null, 1], ['download', 'นำเข้าจากฟีดใน 30 วัน', '18', 'สำเนาควิซของคนอื่น'], ['share-2', 'โพสต์ Quiz ในฟีด', '0', 'เล่นสะสม 0 ครั้ง'], ['gamepad-2', 'ทำควิซใน 30 วัน', '0', 'ทำจนจบ 0 ครั้ง · 0 คน'], ['target', 'คะแนนเฉลี่ยใน 30 วัน', '—', 'เฉพาะครั้งที่ทำจนจบ'], ['coins', 'แต้มที่ใช้ใน 30 วัน', '148', 'หักคืนแต้มที่ refund แล้ว', 1], ['hand-coins', 'แต้มคืนให้เจ้าของควิซ', '18', 'เมื่อมีคนทำควิซจนจบ', 1]]);
      const [cc] = CARD(body, 'Quiz ที่สร้างต่อวัน', 'นับเฉพาะที่ผู้ใช้สร้างเอง ไม่รวมสำเนาที่นำเข้าจากฟีด');
      CHART(cc, { head: '67 ชุด', sub: 'ใน 30 วันล่าสุด · ชี้ที่แท่งเพื่อดูรายวัน', vals: days(30, [[6, 51], [7, 16]]), max: 100, ticks: ['100', '50', '0'], from: '9 ก.ย.' });
      const two = B(body, { n: 'Columns', g: 16, w: 'fill' });
      const [c1] = CARD(two, 'สร้างจากอะไร', 'Quiz ที่สร้างใน 30 วัน แยกตามแหล่งที่ใช้', { w: 544 });
      BARS(c1, [['คลังความรู้', 0], ['ความรู้ทั่วไปของ AI', 67]]);
      const [c2] = CARD(two, 'Quiz ที่มีคนเล่นมากที่สุด', 'จากโพสต์ที่ยังแสดงอยู่ในฟีด', { w: 544 });
      T(c2, 'ยังไม่มี Quiz ที่แชร์ในฟีด', { c: 'muted-foreground' });
      EQ(two);
    });

    await step(screenName('quiz', 1), () => {
      const body = SCREEN('quiz', 1);
      const [qc] = CARD(body, 'Quiz ทั้งหมด', '85 รายการ · เห็นเฉพาะข้อมูลสรุป · คำถามและเฉลยเปิดดูได้เฉพาะ Quiz ที่เจ้าของแชร์ลงฟีดแล้ว');
      const fr = B(qc, { n: 'Filters', g: 8, w: 'fill', ai: 'CENTER' }); SEARCH(fr, 'ค้นจากหัวข้อ Quiz'); SEG(fr, ['ทั้งหมด', 'สร้างเอง', 'นำเข้าจากฟีด'], 0);
      const ql = LIST(qc);
      [['Memory management จากสไลด์สัปดาห์ที่ 5', 0, 'stu136f374 (@stu136f374) · 3 ข้อ · 23 วันที่ผ่านมา'], ['test', 0, 'Student 2 (@student2) · 2 ข้อ · 23 วันที่ผ่านมา'], ['เตรียมสอบ OS', 1, 'Student 1 (@student1) · 2 ข้อ · 23 วันที่ผ่านมา'], ['เตรียมสอบ OS', 0, 'นวพล ทดสอบ (@67421677) · 2 ข้อ · 23 วันที่ผ่านมา'], ['ทดสอบ d2a2c9', 0, 'ajarn.d2a2c9 (@ajarn.d2a2c9) · 2 ข้อ · 23 วันที่ผ่านมา'], ['Memory management จากสไลด์สัปดาห์ที่ 5', 0, 'stu1ca1733 (@stu1ca1733) · 3 ข้อ · 23 วันที่ผ่านมา']].forEach(([title, imported, meta]) => {
        const r = ROW(ql, { n: 'quiz-row', ai: 'CENTER' }); const col = COL(r);
        const tl = B(col, { g: 6, ai: 'CENTER' }); T(tl, title, { w: 1 }); BDG(tl, 'Outline', imported ? 'นำเข้าจากฟีด' : 'สร้างเอง');
        T(col, meta, { s: 11, c: 'muted-foreground' });
        const act = B(r, { n: 'Actions', g: 4, ai: 'CENTER' });
        if (imported) BTN(act, 'Ghost', 'โพสต์ต้นทาง', 'external-link', { sm: 1, n: 'source-post' });
        else { const l = B(act, { g: 4, p: [0, 8], ai: 'CENTER' }); IC(l, 'lock', 12, 'muted-foreground'); T(l, 'ยังไม่แชร์', { s: 11, c: 'muted-foreground' }); }
        BTN(act, 'Ghost', 'ลบ', 'trash-2', { sm: 1, c: 'muted-foreground', n: 'delete-quiz' });
      });
      const pgr = B(qc, { n: 'Pager', w: 'fill', ai: 'CENTER', ji: 'SPACE_BETWEEN' }); BTN(pgr, 'Outline', 'ก่อนหน้า'); T(pgr, 'หน้า 1 จาก 4', { c: 'muted-foreground' }); BTN(pgr, 'Outline', 'ถัดไป');
    });

    await step(screenName('quiz', 2), () => {
      const body = SCREEN('quiz', 2);
      const [sc] = CARD(body, 'Quiz ที่แชร์ในฟีด', '0 โพสต์ · เรียงตามจำนวนครั้งที่เล่น · ซ่อนแล้วกู้คืนได้ และผลการทำที่ผ่านมายังเก็บไว้');
      SEG(sc, ['แสดงอยู่', 'ซ่อนไว้', 'ทั้งหมด'], 0);
      EMPTY(sc, 'ยังไม่มี Quiz ที่แชร์ในฟีด');
    });

    // ---------------------------------------------------------------- dialogs (shown as overlays)
    function OVERLAY(name, col, row) {
      drop(name);
      const o = B(null, { n: name, w: 1440, h: 900, bg: 'scrim', bgo: 0.5, ai: 'CENTER', ji: 'CENTER' });
      o.x = col * STEP_X; o.y = row * STEP_Y;
      return o;
    }
    function DIALOG(overlay, title, desc) {
      const d = B(overlay, { n: 'Dialog', v: true, w: 512, p: 24, g: 16, r: 12, bg: 'background', bd: true }); d.effects = SHADOW;
      const hr = B(d, { n: 'Title row', w: 'fill', g: 8, ai: 'CENTER' });
      return [d, hr, () => { SPACER(hr); BTN(hr, 'Ghost', null, 'x', { sm: 1, n: 'close' }); if (desc) T(d, desc, { c: 'muted-foreground', wrap: true }); }, title];
    }
    function FIELD(parent, label, ph, w = 'fill') {
      const f = B(parent, { n: 'Field', v: true, w, g: 4 }); T(f, label, { w: 1 });
      const i = B(f, { n: 'Input', w: 'fill', p: [8, 12], r: 10, bd: true, bg: 'background' }); T(i, ph, { c: 'muted-foreground' });
      return f;
    }
    function CONFIRM(name, col, row, title, desc) {
      const o = OVERLAY(name, col, row);
      const d = C['Dialog/Confirm'].createInstance(); o.appendChild(d);
      setT(find(d, 'Title'), title, 2); setT(find(d, 'Desc'), desc, 0);
    }

    await step('Overlay / สร้างบัญชี', () => {
      const o = OVERLAY('Overlay / สร้างบัญชี', 5, 0);
      const [d, hr, finish] = DIALOG(o, 'สร้างบัญชีใหม่', 'ใช้เมื่อปิดการสมัครเองแล้ว หรือต้องการสร้างบัญชีอาจารย์ให้ทันที · บัญชีนักศึกษาจะได้ 20 แต้มต้อนรับ (อาจารย์และผู้ดูแลไม่ถูกตัดแต้มอยู่แล้ว)');
      T(hr, 'สร้างบัญชีใหม่', { s: 18, w: 2 }); finish();
      const u = FIELD(d, 'ชื่อผู้ใช้', 'เช่น somsri.kw'); T(u, '3-32 ตัวอักษร · ตัวอักษร ตัวเลข จุด ขีดล่าง ขีดกลาง', { s: 11, c: 'muted-foreground' });
      FIELD(d, 'รหัสผ่านเริ่มต้น', 'อย่างน้อย 6 ตัวอักษร');
      FIELD(d, 'ชื่อที่แสดง', 'อ.สมศรี ขวัญเมือง');
      const two = B(d, { n: 'Row', g: 12, w: 'fill' });
      const rl = B(two, { n: 'Field', v: true, w: 226, g: 4 }); T(rl, 'สิทธิ์', { w: 1 }); const sel = SEL(rl, 'อาจารย์'); sel.layoutSizingHorizontal = 'FILL'; sel.primaryAxisAlignItems = 'SPACE_BETWEEN';
      FIELD(two, 'รหัสนักศึกษา (ถ้ามี)', '67030101', 226);
      const fo = B(d, { n: 'Footer', w: 'fill', ji: 'MAX' }); BTN(fo, 'Primary', 'สร้างบัญชี', 'user-plus', { n: 'submit-create' });
    });

    await step('Overlay / ผู้ใช้', () => {
      const o = OVERLAY('Overlay / ผู้ใช้', 6, 0);
      const [d, hr, finish] = DIALOG(o, '', '@demo.student1 · แต้มคงเหลือ 78');
      const av = B(hr, { n: 'Avatar', w: 32, h: 32, r: 999, bd: true, bg: 'muted', ai: 'CENTER', ji: 'CENTER' }); T(av, 'ก', { s: 12, w: 2 });
      T(hr, 'กานต์ ชัยมงคล', { s: 18, w: 2 }); finish();
      const sec = label => { const s = B(d, { n: 'Section', v: true, w: 'fill', g: 6 }); T(s, label, { w: 1 }); return s; };
      const s1 = sec('สิทธิ์การใช้งาน'); const r1 = B(s1, { g: 8, ai: 'CENTER' });
      BTN(r1, 'Primary', 'นักศึกษา'); BTN(r1, 'Outline', 'อาจารย์'); BTN(r1, 'Outline', 'ผู้ดูแล'); BTN(r1, 'Outline', 'บันทึกสิทธิ์', null, { c: 'muted-foreground' });
      const s2 = sec('ปรับแต้ม (ใส่ค่าติดลบเพื่อหัก)'); const r2 = B(s2, { g: 8, w: 'fill', ai: 'CENTER' });
      const a = B(r2, { n: 'Input', w: 112, p: [8, 12], r: 10, bd: true, bg: 'background' }); T(a, 'เช่น 50', { c: 'muted-foreground' });
      const b = B(r2, { n: 'Input', w: 'fill', p: [8, 12], r: 10, bd: true, bg: 'background' }); T(b, 'เหตุผล เช่น รางวัลกิจกรรม', { c: 'muted-foreground' });
      BTN(r2, 'Primary', 'ปรับแต้ม');
      const s3 = sec('ตั้งรหัสผ่านใหม่'); const r3 = B(s3, { g: 8, w: 'fill', ai: 'CENTER' });
      const c = B(r3, { n: 'Input', w: 'fill', p: [8, 12], r: 10, bd: true, bg: 'background' }); T(c, 'อย่างน้อย 6 ตัวอักษร', { c: 'muted-foreground' });
      BTN(r3, 'Outline', 'ตั้งรหัส', 'key-round');
      T(s3, 'ใช้ได้เฉพาะบัญชีที่เข้าระบบด้วยชื่อผู้ใช้ บัญชีที่ผูก Google จะยังเข้าผ่าน Google ตามเดิม', { s: 12, c: 'muted-foreground', wrap: true });
      const s4 = sec('ประวัติแต้มล่าสุด'); const hl = B(s4, { n: 'History', v: true, w: 'fill', r: 10, bd: true });
      [['ขยายด่าน Roadmap', '-2'], ['สร้าง AI Roadmap', '-15'], ['ผู้ดูแลเพิ่มแต้ม · รางวัลกิจกรรม', '+50']].forEach(([k, v], i) => { const r = B(hl, { w: 'fill', p: [6, 12], ai: 'CENTER', ji: 'SPACE_BETWEEN' }); if (i) edge(r, 1, 0); T(r, k, { s: 12 }); T(r, v, { s: 12, w: 2, c: v[0] === '+' ? 'success' : 'destructive' }); });
      const fo = B(d, { n: 'Footer', w: 'fill', g: 8, ai: 'CENTER' });
      BTN(fo, 'Destructive', 'ระงับบัญชี', 'user-x'); BTN(fo, 'Ghost', 'ลบบัญชีถาวร', 'trash-2', { c: 'destructive' }); SPACER(fo); BTN(fo, 'Ghost', 'ปิด', null, { n: 'close' });
    });

    await step('Overlay / ยืนยันการลบ (4)', () => {
      CONFIRM('Overlay / ลบความคิดเห็น', 4, 1, 'ลบความคิดเห็นนี้ถาวร?', 'ความคิดเห็นของ ณัฐธิดา แก้วประเสริฐ จะถูกลบออกจากโพสต์และกู้คืนไม่ได้');
      CONFIRM('Overlay / ลบเอกสาร', 3, 2, 'ลบเอกสารนี้ถาวร?', '“เอกสารประกอบการสอน DEMO202: การออกแบบฐานข้อมูลและ Normalization” ของ อ.พิมพ์ชนก ศรีสุข (@demo.teacher2) จะถูกลบพร้อมไฟล์และดัชนีทั้งหมด AI จะไม่ใช้เอกสารนี้ตอบอีก และกู้คืนไม่ได้');
      CONFIRM('Overlay / ลบ Roadmap', 3, 3, 'ลบ Roadmap นี้ถาวร?', '“แผนอ่านสอบ OS เรื่อง Memory Management” ของ stu136f374 (@stu136f374) จะหายจากรายการของเจ้าของและกู้คืนไม่ได้');
      CONFIRM('Overlay / ลบ Quiz', 3, 4, 'ลบ Quiz นี้ถาวร?', '“Memory management จากสไลด์สัปดาห์ที่ 5” ของ stu136f374 (@stu136f374) จะหายจากรายการของเจ้าของและกู้คืนไม่ได้');
    });

    // ---------------------------------------------------------------- row labels on the canvas
    await step('ป้ายชื่อแถวบนแคนวาส', () => {
      for (const key of Object.keys(PAGES)) {
        const name = 'Label / ' + PAGES[key].title; drop(name);
        const t = T(pg, PAGES[key].title, { s: 64, w: 2, lh: 80, name }); t.x = 0; t.y = PAGES[key].row * STEP_Y - 140;
      }
    });

    // ---------------------------------------------------------------- prototype wiring
    let wired = 0;
    const need = name => { const f = frame(name); if (!f) throw new Error('ไม่พบเฟรม ' + name); return f; };
    const go = id => ({ type: 'NODE', destinationId: id, navigation: 'NAVIGATE', transition: null, preserveScrollPosition: false });
    const over = id => ({ type: 'NODE', destinationId: id, navigation: 'OVERLAY', transition: null, preserveScrollPosition: false });
    const CLOSE = { type: 'CLOSE' };
    async function click(node, action) {
      const trigger = { type: 'ON_CLICK' };
      try { await node.setReactionsAsync([{ trigger, actions: [action] }]); }
      catch (e) { await node.setReactionsAsync([{ trigger, action }]); }
      wired += 1;
    }
    const named = (root, name) => root.findAll(n => n.name === name);

    await step('โยงเมนู sidebar ไปหน้าแรกของแต่ละส่วน', async () => {
      for (const key of Object.keys(PAGES)) await click(find(C['Sidebar'], 'nav/' + PAGES[key].nav), go(need(screenName(key, 0)).id));
    });
    await step('โยงแท็บของแต่ละหน้า', async () => {
      for (const key of Object.keys(PAGES)) for (let i = 0; i < PAGES[key].tabs.length; i++) await click(find(C['Tabs/' + key], 'tab/' + i), go(need(screenName(key, i)).id));
    });
    await step('โยงปุ่มที่เปิดหน้าต่าง', async () => {
      // the header's only action is "สร้างบัญชี", shown on the system page
      await click(find(C['PageHeader'], 'Action'), over(need('Overlay / สร้างบัญชี').id));
      const openers = [[screenName('system', 1), 'user-row', 'Overlay / ผู้ใช้'], [screenName('community', 2), 'delete-comment', 'Overlay / ลบความคิดเห็น'], [screenName('rag', 1), 'delete-document', 'Overlay / ลบเอกสาร'], [screenName('roadmap', 1), 'delete-roadmap', 'Overlay / ลบ Roadmap'], [screenName('quiz', 1), 'delete-quiz', 'Overlay / ลบ Quiz']];
      for (const [screen, node, target] of openers) for (const n of named(need(screen), node)) await click(n, over(need(target).id));
    });
    await step('โยงปุ่มปิดหน้าต่าง', async () => {
      for (const name of ['Cancel', 'Confirm']) await click(find(C['Dialog/Confirm'], name), CLOSE);
      for (const n of named(need('Overlay / สร้างบัญชี'), 'close')) await click(n, CLOSE);
      for (const n of named(need('Overlay / สร้างบัญชี'), 'submit-create')) await click(n, CLOSE);
      for (const n of named(need('Overlay / ผู้ใช้'), 'close')) await click(n, CLOSE);
    });
    await step('ตั้งจุดเริ่ม prototype', () => {
      pg.flowStartingPoints = [{ nodeId: need(screenName('system', 0)).id, name: 'Admin' }];
    });
    report.push('โยงทั้งหมด ' + wired + ' จุด');
  } catch (e) {
    failures += 1; report.push('FATAL ' + (e && e.message ? e.message : e)); console.error(e);
  }
  console.log(report.join('\n'));
  figma.notify(failures ? 'เสร็จ แต่มี ' + failures + ' ขั้นไม่ผ่าน เปิด Console เพื่อดูรายละเอียด' : 'สร้างหน้าที่เหลือและโยงปุ่มครบแล้ว', { timeout: 10000, error: failures > 0 });
  figma.closePlugin();
})();
