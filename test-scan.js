// Receipt scanner (public/scan.js): photos → cleaned-up pages → one PDF, attached to an expense claim.   node --no-warnings test-scan.js
//  1. the PDF writer and the "document" clean-up on their own (no browser);
//  2. in a real headless browser (skipped with SKIP_UI=1 or without Chrome / Edge): an employee scans two pages from the claim form, and
//     the receipt stored with the claim is one PDF of two pages. Fake data only.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), { spawn, spawnSync } = require('child_process');
const { imagesToPdf, enhance } = require('./public/scan.js');

// ---------- 1. PDF writer and clean-up ----------
const J1 = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABAADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDufEPiG08NWCXt7HNJG8oiAhUE5IJ7kcfKa5z/AIWzoP8Az6aj/wB+0/8Ai6Piz/yK9t/1+p/6A9eR1CSaKbPXP+Fs6D/z6aj/AN+0/wDi67Gxu47+wt72IMsdxEsqBhyAwBGffmvnKvoHw1/yK+k/9eUP/oApSSQJmnRRRUjOV+IWjahrmgwWum2/nzJdLIV3quFCuM5YjuRXnX/Cu/Ff/QK/8mIv/iq9vopqTQrHiH/Cu/Ff/QK/8mIv/iq9h0S3ls9B0+1nTZNDaxRyLkHDBQCMj3q9RQ3cdgooopAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/9k=', 'base64'), J2 = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAyAFADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDqNd1218P2SXd3HK6PIIwIgCckE9yPQ1g/8LN0X/n1v/8Av2n/AMVR8Tf+Rct/+vtf/QHry+gD1D/hZui/8+t//wB+0/8AiqP+Fm6L/wA+t/8A9+0/+Kry+igD1D/hZui/8+t//wB+0/8Aiq6qzukvbKC7iDBJ41kUN1AYZGfzrwWvcPD/APyLmmf9ekX/AKAKANCiiigAooooAhurO1vYxFd20VwgO4LKgcA+uD9TVX/hH9F/6A9h/wCAyf4VoUUAZ/8Awj+i/wDQHsP/AAGT/Cj/AIR/Rf8AoD2H/gMn+FaFFAGf/wAI/ov/AEB7D/wGT/Cr0caQxrFEioiAKqqMBQOgAp1FABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//2Q==', 'base64');   // real JPEGs, 48×64 and 80×50
function checkPdf(buf, pages) {
  const s = Buffer.from(buf).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n') && s.trimEnd().endsWith('%%EOF'), 'header and end');
  const sx = +/startxref\n(\d+)\n%%EOF\s*$/.exec(s)[1]; assert.equal(s.slice(sx, sx + 4), 'xref', 'startxref points at the table');
  const xr = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(s), n = +xr[1], rows = xr[2].trim().split('\n');
  assert.equal(rows.length, n); assert.equal(n, 3 + pages * 3);
  rows.slice(1).forEach((r, i) => { const off = +r.slice(0, 10); assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} at its offset`); });
  assert.match(s, new RegExp(`/Type /Pages /Count ${pages} `));
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) { const start = m.index + m[0].length, len = +m[1]; assert.equal(s.slice(start + len, start + len + 10), '\nendstream', 'stream length exact'); }
  return s;
}
{
  const pdf = imagesToPdf([{ jpeg: new Uint8Array(J1), width: 48, height: 64 }, { jpeg: new Uint8Array(J2), width: 80, height: 50 }]);
  const s = checkPdf(pdf, 2);
  assert.ok(Buffer.from(pdf).includes(J1) && Buffer.from(pdf).includes(J2), 'the JPEG pages are embedded unchanged');
  assert.match(s, /\/MediaBox \[0 0 631\.5 842\]/, 'portrait page: longest side 842 pt'); assert.match(s, /\/MediaBox \[0 0 842 526\.25\]/, 'landscape page');
  assert.match(s, /\/Width 48 \/Height 64 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode/);
  assert.throws(() => imagesToPdf([]), /No pages/);
  checkPdf(imagesToPdf([{ jpeg: new Uint8Array(J1), width: 48, height: 64 }]), 1);
  // an independent reader agrees (pdfinfo, when installed)
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'erp-scan-')), 'two.pdf'); fs.writeFileSync(tmp, pdf);
  const pi = spawnSync('pdfinfo', [tmp], { encoding: 'utf8' });
  if (pi.status === 0) { assert.match(pi.stdout, /Pages:\s+2/); assert.doesNotMatch(pi.stderr || '', /error/i, 'no reader errors: ' + pi.stderr); console.log('✔ pdfinfo reads the PDF (2 pages, no errors)'); }
  else console.log('  (pdfinfo not installed: independent reader check skipped)');
}
{
  // dim, yellowish paper with grey ink → white paper, black ink, grey channels equal
  const px = []; for (let i = 0; i < 100; i++) px.push(...(i < 15 ? [70, 66, 60, 255] : [180, 172, 150, 255]));
  const out = enhance(new Uint8ClampedArray(px), 10, 10);
  for (let i = 0; i < 100; i++) { const [r, g, b, a] = out.slice(i * 4, i * 4 + 4); assert.ok(r === g && g === b && a === 255, 'grey'); assert.ok(i < 15 ? r <= 40 : r >= 240, `pixel ${i}: ${r}`); }
  // a receipt with very little ink (1%): the paper must stay white, not turn black
  { const q = []; for (let i = 0; i < 200; i++) q.push(...(i < 2 ? [50, 50, 50, 255] : [176, 170, 150, 255])); const o = enhance(new Uint8ClampedArray(q), 20, 10);
    assert.ok(o[2 * 4] >= 240 && o[100 * 4] >= 240, 'paper white with little ink: ' + o[100 * 4]); assert.ok(o[0] <= 40, 'ink black: ' + o[0]); }
  // a photo with a shadow over the lower half (paper 200 above, 110 below; ink 60 above, 30 below): both halves end white paper, black ink
  { const W = 96, H = 96, q = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const shade = y >= H / 2, ink = x % 16 < 2 && y % 16 < 12; const v = ink ? (shade ? 30 : 60) : (shade ? 110 : 200); q.set([v, v, v, 255], (y * W + x) * 4); }
    enhance(q, W, H); const px = (x, y) => q[(y * W + x) * 4];
    assert.ok(px(8, 8) >= 240 && px(8, 80) >= 240, `paper white in the light and in the shadow: ${px(8, 8)} / ${px(8, 80)}`);
    assert.ok(px(0, 2) <= 40 && px(0, 66) <= 40, `ink black in both: ${px(0, 2)} / ${px(0, 66)}`); }
  // a blank page does not divide by zero
  const blank = enhance(new Uint8ClampedArray(Array(40).fill(200)), 5, 2); assert.ok([...blank].every(v => Number.isFinite(v)));
}
console.log('✔ PDF writer: one page per photo, JPEG embedded as is, exact offsets / lengths; clean-up: white paper, black ink, grey');

// ---------- finding the paper and straightening it ----------
{
  const { detectQuad, warp, pageSize, inset } = require('./public/scan.js');
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const inside = (q, x, y) => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  // a 320×240 "photo": desk (with a light gradient and noise), paper with lines of text
  const scene = (q, { bg = 60, paper = 225, text = true } = {}) => { const a = new Uint8ClampedArray(320 * 240 * 4);
    for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) { let v = inside(q, x + 0.5, y + 0.5) ? paper : bg + (x / 320) * 25;
      if (text && v === paper && y % 14 < 3 && (x * 7 + y) % 23 < 15) v = paper > 128 ? 40 : 230; v += (rnd() - 0.5) * 12; a.set([v, v * 0.98, v * 0.95, 255], (y * 320 + x) * 4); }
    return a; };
  const rot = (cx, cy, w, h, deg) => { const r = deg * Math.PI / 180; return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]); };
  const tlFirst = q => { let k = 0; for (let i = 1; i < 4; i++) if (q[i][0] + q[i][1] < q[k][0] + q[k][1]) k = i; return [0, 1, 2, 3].map(i => q[(k + i) % 4]); };
  const err = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
  const cases = { upright: [[80, 40], [240, 40], [240, 220], [80, 220]], 'turned 20°': rot(160, 130, 120, 170, 20), 'turned 45°': rot(160, 125, 110, 150, 45), 'turned -30°': rot(165, 120, 150, 110, -30),
    perspective: [[110, 30], [215, 35], [270, 225], [50, 220]], 'steep angle': [[130, 40], [190, 42], [300, 225], [20, 220]], 'fills the frame': [[8, 6], [312, 10], [315, 236], [5, 232]] };
  for (const [k, q] of Object.entries(cases)) {
    const r = detectQuad(scene(q), 320, 240); assert.ok(r, k + ': found');
    // corners in order top-left, top-right, bottom-right, bottom-left, within 4 px (1.3 % of the width)
    const want = tlFirst(q.slice().sort((a, b) => Math.atan2(a[1] - 120, a[0] - 160) - Math.atan2(b[1] - 120, b[0] - 160)));
    const tol = k === 'steep angle' ? 6 : 4;                     // the narrow far edge of a steeply tilted page is the hardest (the crop is inset 1.5 %)
    assert.ok(err(r.corners, want) < tol, `${k}: corners within ${tol} px (${err(r.corners, want).toFixed(1)})`);
  }
  assert.ok(detectQuad(scene(rot(160, 120, 130, 170, 15), { bg: 215, paper: 70 }), 320, 240), 'dark paper on a light desk');
  assert.equal(detectQuad(scene([[0, 0], [1, 0], [1, 1], [0, 1]]), 320, 240), null, 'an empty desk (a gradient only) is not a paper');
  assert.equal(detectQuad(scene(cases.upright, { bg: 218, paper: 226 }), 320, 240), null, 'white paper on a white desk: not found (the scanner asks for a dark surface)');
  // straightened: a paper photographed at an angle becomes an upright page of its own shape, with no desk left at the edges
  const src = scene(cases.perspective, { text: false }), r = detectQuad(src, 320, 240), c = inset(r.corners), [W, H] = pageSize(c), out = warp(src, 320, 240, c, W, H);
  let dark = 0; for (let i = 0; i < W * H; i++) if (out[i * 4] < 150) dark++; assert.equal(dark, 0, 'no desk in the straightened page');
  const r2 = detectQuad(scene(rot(160, 120, 100, 150, 30), { text: false }), 320, 240), [W2, H2] = pageSize(r2.corners); assert.ok(Math.abs(W2 / H2 - 100 / 150) < 0.05, `shape kept: ${W2}×${H2}`);
  assert.deepEqual(pageSize([[0, 0], [3400, 0], [3400, 4400], [0, 4400]]), [1314, 1700], 'at most 1700 px on the longest side');
}
console.log('✔ paper found on the desk upright, turned 20° / 45° / −30°, in perspective, at a steep angle, filling the frame, dark on light (corners within 4 px, 6 px at a steep angle); not on an empty desk or white on white; straightened to its shape with no desk at the edges');

// ---------- 2. in a real browser: scan two pages from the employee's claim form ----------
const { findBrowser } = require('./lib/pdf');
const skipPdf = process.env.SKIP_PDF; delete process.env.SKIP_PDF;
const exe = process.env.SKIP_UI === '1' ? null : findBrowser();
if (skipPdf !== undefined) process.env.SKIP_PDF = skipPdf;
if (!exe || typeof WebSocket !== 'function') { console.log(`test-scan: browser part skipped (${!exe ? 'SKIP_UI=1 or no Chrome/Edge' : 'no built-in WebSocket'})\nSCAN TESTS PASSED`); process.exit(0); }
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-scanui-')); process.env.ZOHO_NO_SCHEDULER = '1'; process.env.SALES_NO_SCHEDULER = '1';
const { server, ctx } = require('./server.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CAM = { W: 640, H: 480, cx: 330, cy: 240, w: 250, h: 330, deg: 12 };               // the paper in the fake camera picture
function fakeCamera(file) {                                                             // YUV4MPEG2 (I420), a few identical frames (Chrome loops it)
  const { W, H, cx, cy, w, h, deg } = CAM, r = deg * Math.PI / 180, Y = Buffer.alloc(W * H), UV = Buffer.alloc(W * H / 2, 128);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy, u = dx * Math.cos(r) + dy * Math.sin(r), v = -dx * Math.sin(r) + dy * Math.cos(r), inPaper = Math.abs(u) < w / 2 && Math.abs(v) < h / 2;
    const text = inPaper && Math.abs(u) < w / 2 - 20 && ((v + h / 2) % 22) > 16 && ((u * 3 + v) % 40 + 40) % 40 < 30;
    Y[y * W + x] = text ? 45 : inPaper ? 228 : 42 + (x / W) * 20;
  }
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, UV]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame, frame]));
}
let proc, ws, seq = 0; const pending = new Map();
async function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-scan-chrome-'));
  // a fake back camera: a video of a receipt (white paper with text, turned 12°) lying on a dark desk
  const cam = path.join(prof, 'camera.y4m'); fakeCamera(cam);
  proc = spawn(exe, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${prof}`,
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let buf = ''; const t = setTimeout(() => rej(new Error('browser did not start')), 60000);   // a slow CI machine can need more than 20 s
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } }); });
  const port = new URL(wsUrl).port; let page;
  for (let i = 0; i < 50 && !page; i++) { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); if (!page) await sleep(100); }
  ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } };
}
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function ev(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(`${expr.slice(0, 120)}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`); return r.result.value; }
async function waitFor(expr, ms = 8000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await ev(expr); if (last) return last; } catch (e) { last = e.message; } await sleep(80); } throw new Error(`timed out waiting for: ${expr} (last: ${last})`); }

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/`;
  const api = async (m, u, b, cookie) => { const r = await fetch(base + 'api/' + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); return { s: r.status, j: await r.json().catch(() => null), c: sc ? sc.split(';')[0] : null }; };
  try {
    const setup = await api('POST', 'setup', { username: 'admin', password: 'secret12', company: 'Demo Contracting' }), ck = setup.c || (await api('POST', 'login', { username: 'admin', password: 'secret12' })).c;
    const cl = (await api('POST', 'parties', { type: 'client', name: 'Sample Client' }, ck)).j.id, pj = (await api('POST', 'projects', { name: 'Sample Tower', client_id: cl, status: 'active' }, ck)).j.id;
    const emp = (await api('POST', 'employees', { name: 'Sample Worker', join_date: '2026-01-01', basic: 2000, project_id: pj }, ck)).j.id;
    const u = (await api('POST', 'users', { username: 'worker1', password: 'pass1234', role: 'viewer' }, ck)).j.id; assert.equal((await api('PUT', 'users/' + u, { employee_id: emp }, ck)).s, 200);
    await launch(); await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.navigate', { url: base + 'index.html' }); await waitFor('document.readyState === "complete"');
    assert.equal(await ev(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'worker1', password: 'pass1234' }) }).then(r => r.status)`), 200);
    await ev(`localStorage.lang = 'en'; true`);
    const reopen = async () => { await cdp('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp('Page.navigate', { url: base + 'index.html#myaccount' }); await waitFor(`!!document.querySelector('#nc')`); };
    // a photo as taken by a phone: dark desk, white paper turned `deg`° with lines of text (or only paper: no desk to find)
    const photo = (name, w, h, deg, onlyPaper) => `await new Promise(ok => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const x = c.getContext('2d');
      x.fillStyle = ${onlyPaper ? "'#ece6d6'" : "'#383838'"}; x.fillRect(0, 0, 1200, 900); x.translate(600, 450); x.rotate(${deg} * Math.PI / 180);
      x.fillStyle = '#ece6d6'; x.fillRect(${-w / 2}, ${-h / 2}, ${w}, ${h}); x.fillStyle = '#333'; x.font = '28px sans-serif'; for (let i = 0; i < 14; i++) x.fillText('Line ' + i + ' ...... ' + (i * 9) + '.00', ${-w / 2 + 30}, ${-h / 2 + 60} + i * 44);
      c.toBlob(b => ok(new File([b], ${JSON.stringify(name)}, { type: 'image/jpeg' })), 'image/jpeg', 0.9); })`;
    const pick = list => ev(`(async () => { const dt = new DataTransfer(); ${list.map(p => `dt.items.add(${p});`).join(' ')} const inp = document.querySelector('#scpick'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; })()`);
    // the first page preview: its width / height and the brightness of its four corners (desk left in the picture would be dark)
    const pageInfo = i => ev(`new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const px = (a, b) => x.getImageData(a, b, 1, 1).data[0]; ok({ w: im.width, h: im.height, corners: [px(3, 3), px(im.width - 4, 3), px(3, im.height - 4), px(im.width - 4, im.height - 4)] }); }; im.src = document.querySelectorAll('#scpages img')[${i}].src; })`);

    // ---- 1. the live scanner: the camera finds the paper and takes the picture by itself; cut out and straightened; no duplicate ----
    await reopen(); await ev(`document.querySelector('#nc').click(); true`); await waitFor(`!!document.querySelector('#scanrc')`);
    await ev(`(() => { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async c => { const st = await g(c); (window.__streams = window.__streams || []).push(st); return st; }; document.querySelector('#scanrc').click(); return true; })()`);
    await waitFor(`!!document.querySelector('.scan-live video')`);
    await waitFor(`document.querySelector('.scan-live video').videoWidth > 0`, 15000);
    await waitFor(`document.querySelectorAll('#scpages figure').length === 1`, 20000);           // nobody pressed anything
    let pi = await pageInfo(0), want = CAM.w / CAM.h;
    assert.ok(Math.abs(pi.w / pi.h - want) < 0.06, `straightened to the paper's shape: ${pi.w}×${pi.h} (${(pi.w / pi.h).toFixed(3)} vs ${want.toFixed(3)})`);
    assert.ok(pi.corners.every(v => v > 200), 'cut out at the paper: no desk in the corners ' + pi.corners);
    await sleep(2500); assert.equal(await ev(`document.querySelectorAll('#scpages figure').length`), 1, 'the same page is not taken twice');
    assert.match(await ev(`document.querySelector('#schint').textContent`), /next page/);
    await ev(`document.querySelector('#scok').click(); true`); await waitFor(`/1 page/.test((document.querySelector('#scaninfo') || {}).textContent || '') && !document.querySelector('.scan-live')`, 15000);
    await ev(`(() => { const s = (n, v) => { const e = document.querySelector('[name=' + n + ']'); e.value = v; e.dispatchEvent(new Event('input')); }; s('description', 'Site water'); s('amount', '40'); s('date', '2026-11-20'); document.querySelector('#save').click(); return true; })()`);
    await waitFor(`!document.querySelector('#scanrc')`, 15000); await sleep(300);
    const claim = ctx.db.prepare("SELECT * FROM expense_claims WHERE description='Site water'").get(); assert.ok(claim, 'claim saved'); assert.equal(claim.employee_id, emp);
    let doc = ctx.db.prepare("SELECT * FROM documents WHERE entity='expense_claim' AND entity_id=?").get(claim.id);
    assert.ok(doc, 'receipt stored'); assert.equal(doc.mime, 'application/pdf'); assert.match(doc.name, /^receipt-\d{8}-\d{4}\.pdf$/); checkPdf(Buffer.from(doc.data), 1);
    assert.equal(await ev(`(window.__streams || []).flatMap(s => s.getTracks()).filter(t => t.readyState !== 'ended').length`), 0, 'the camera is switched off after attaching');
    assert.ok(await ev(`(window.__streams || []).length`) >= 1);
    console.log('✔ live scanner: the camera found the paper on the desk and took it by itself (no button), cut out and straightened to the paper\'s shape, not taken twice, attached as a 1-page PDF');

    // ---- 2. without a live camera: photos from the phone, each cut out and straightened the same way ----
    await reopen(); await ev(`document.querySelector('#nc').click(); true`); await waitFor(`!!document.querySelector('#scanrc')`);
    await ev(`navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('no camera')); document.querySelector('#scanrc').click(); true`);
    await waitFor(`!!document.querySelector('#sccam') && !document.querySelector('.scan-live')`);
    assert.equal(await ev(`document.querySelector('#sccam').getAttribute('capture')`), 'environment', 'the phone\'s back camera');
    await pick([photo('p1.jpg', 600, 800, 15), photo('p2.jpg', 800, 560, -8)]);
    await waitFor(`document.querySelectorAll('#scpages figure').length === 2 && !document.querySelector('#scok').disabled`, 20000);
    pi = await pageInfo(0); assert.ok(Math.abs(pi.w / pi.h - 0.75) < 0.05 && pi.corners.every(v => v > 200), 'photo 1 cut out and straightened ' + JSON.stringify(pi));
    pi = await pageInfo(1); assert.ok(Math.abs(pi.w / pi.h - 800 / 560) < 0.07 && pi.corners.every(v => v > 200), 'photo 2 (landscape, turned the other way) ' + JSON.stringify(pi));
    assert.ok(await ev(`document.querySelectorAll('#scpages img')[0].naturalWidth <= 1700`), 'at most 1700 px');
    // remove page 2; a photo with no desk around the paper: kept whole, the user is told
    await ev(`document.querySelector('[data-scdel="1"]').click(); true`); await waitFor(`document.querySelectorAll('#scpages figure').length === 1`);
    await pick([photo('p3.jpg', 1200, 900, 0, true)]); await waitFor(`document.querySelectorAll('#scpages figure').length === 2`, 20000);
    assert.match(await ev(`document.querySelector('#scmsg').textContent`), /edges were not found/);
    await ev(`document.querySelector('#scok').click(); true`); await waitFor(`/2 page/.test((document.querySelector('#scaninfo') || {}).textContent || '')`, 15000);
    await ev(`(() => { const s = (n, v) => { const e = document.querySelector('[name=' + n + ']'); e.value = v; e.dispatchEvent(new Event('input')); }; s('description', 'Fuel'); s('amount', '25'); s('date', '2026-11-21'); document.querySelector('#save').click(); return true; })()`);
    await waitFor(`!document.querySelector('#scanrc')`, 15000); await sleep(300);
    const c2 = ctx.db.prepare("SELECT * FROM expense_claims WHERE description='Fuel'").get(); doc = ctx.db.prepare("SELECT * FROM documents WHERE entity='expense_claim' AND entity_id=?").get(c2.id);
    checkPdf(Buffer.from(doc.data), 2); assert.ok(doc.size < 2 * 1024 * 1024, 'small file: ' + doc.size);
    console.log('✔ without a live camera: photos cut out and straightened (portrait and landscape, turned either way), a photo with no desk kept whole with a notice, 2-page PDF');

    // ---- 3. "Scan" on a claim already sent: the live scanner attaches one more PDF ----
    const ck2 = (await api('POST', 'login', { username: 'worker1', password: 'pass1234' })).c;
    const c3 = (await fetch(base + 'api/me/claims', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck2 }, body: JSON.stringify({ date: '2026-11-21', description: 'No receipt yet', amount: 15 }) }).then(r => r.json())).id;
    await reopen(); await waitFor(`!!document.querySelector('[data-scan="${c3}"]')`); await ev(`document.querySelector('[data-scan="${c3}"]').click(); true`);
    await waitFor(`document.querySelectorAll('#scpages figure').length === 1`, 20000); await ev(`document.querySelector('#scok').click(); true`);
    await waitFor(`!document.querySelector('[data-scan="${c3}"]')`, 15000);
    const d3 = ctx.db.prepare("SELECT * FROM documents WHERE entity='expense_claim' AND entity_id=?").get(c3); assert.ok(d3); checkPdf(Buffer.from(d3.data), 1);
    console.log('✔ "Scan" on a sent claim: taken by itself and attached');
    console.log('\nSCAN TESTS PASSED');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { try { ws && ws.close(); } catch {} try { proc && proc.kill(); } catch {} server.close(); setTimeout(() => process.exit(process.exitCode || 0), 200); }
});
