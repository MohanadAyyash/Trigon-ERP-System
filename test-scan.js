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

// ---------- 2. in a real browser: scan two pages from the employee's claim form ----------
const { findBrowser } = require('./lib/pdf');
const skipPdf = process.env.SKIP_PDF; delete process.env.SKIP_PDF;
const exe = process.env.SKIP_UI === '1' ? null : findBrowser();
if (skipPdf !== undefined) process.env.SKIP_PDF = skipPdf;
if (!exe || typeof WebSocket !== 'function') { console.log(`test-scan: browser part skipped (${!exe ? 'SKIP_UI=1 or no Chrome/Edge' : 'no built-in WebSocket'})\nSCAN TESTS PASSED`); process.exit(0); }
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-scanui-')); process.env.ZOHO_NO_SCHEDULER = '1'; process.env.SALES_NO_SCHEDULER = '1';
const { server, ctx } = require('./server.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let proc, ws, seq = 0; const pending = new Map();
async function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-scan-chrome-'));
  proc = spawn(exe, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${prof}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let buf = ''; const t = setTimeout(() => rej(new Error('browser did not start')), 20000);
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
    await ev(`localStorage.lang = 'en'; true`); await cdp('Page.navigate', { url: 'about:blank' }); await sleep(100);
    await cdp('Page.navigate', { url: base + 'index.html#myaccount' }); await waitFor(`!!document.querySelector('#nc')`);
    await ev(`document.querySelector('#nc').click(); true`); await waitFor(`!!document.querySelector('#scanrc')`);
    await ev(`document.querySelector('#scanrc').click(); true`); await waitFor(`!!document.querySelector('#scpick')`);
    assert.equal(await ev(`document.querySelector('#sccam').getAttribute('capture')`), 'environment', 'the camera button opens the back camera');
    // two "photos" (made on a canvas: grey paper with dark text), given to the picker as if chosen on the phone
    await ev(`(async () => { const mk = (w, h, t) => new Promise(ok => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#b9b29c'; x.fillRect(0, 0, w, h); x.fillStyle = '#333'; x.font = '40px sans-serif'; x.fillText(t, 40, 120); c.toBlob(b => ok(new File([b], t + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9); });
      const dt = new DataTransfer(); dt.items.add(await mk(1200, 1600, 'PAGE ONE')); dt.items.add(await mk(1600, 1000, 'PAGE TWO'));
      const inp = document.querySelector('#scpick'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; })()`);
    await waitFor(`document.querySelectorAll('#scpages figure').length === 2 && !document.querySelector('#scok').disabled`, 15000);
    // the clean-up is applied (the preview of a page is grey: equal channels at a paper pixel)
    assert.ok(await ev(`new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(5, 5, 1, 1).data; ok(Math.abs(d[0] - d[1]) < 6 && Math.abs(d[1] - d[2]) < 6 && d[0] > 230); }; im.src = document.querySelector('#scpages img').src; })`), 'cleaned up: grey, paper white');
    assert.ok(await ev(`document.querySelector('#scpages img').naturalWidth <= 1700 && document.querySelector('#scpages img').naturalHeight <= 1700`), 'reduced to at most 1700 px');
    // remove the second page, add it again, then attach
    await ev(`document.querySelector('[data-scdel="1"]').click(); true`); await waitFor(`document.querySelectorAll('#scpages figure').length === 1`);
    await ev(`(async () => { const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#ccc'; x.fillRect(0, 0, 900, 1200); const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg')); const dt = new DataTransfer(); dt.items.add(new File([b], 'p2.jpg', { type: 'image/jpeg' })); const inp = document.querySelector('#sccam'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; })()`);
    await waitFor(`document.querySelectorAll('#scpages figure').length === 2 && !document.querySelector('#scok').disabled`, 15000);
    await ev(`document.querySelector("#scok").click(); true`); await waitFor(`/2 page/.test((document.querySelector('#scaninfo') || {}).textContent || '')`, 15000);
    // the claim with the scanned receipt
    await ev(`(() => { const s = (n, v) => { const e = document.querySelector('[name=' + n + ']'); e.value = v; e.dispatchEvent(new Event('input')); }; s('description', 'Site water'); s('amount', '40'); s('date', '2026-11-20'); document.querySelector('#save').click(); return true; })()`);
    await waitFor(`!document.querySelector('#scanrc')`, 15000); await sleep(300);
    const claim = ctx.db.prepare("SELECT * FROM expense_claims WHERE description='Site water'").get(); assert.ok(claim, 'claim saved'); assert.equal(claim.employee_id, emp);
    const doc = ctx.db.prepare("SELECT * FROM documents WHERE entity='expense_claim' AND entity_id=?").get(claim.id);
    assert.ok(doc, 'receipt stored'); assert.equal(doc.mime, 'application/pdf'); assert.match(doc.name, /^receipt-\d{8}-\d{4}\.pdf$/);
    checkPdf(Buffer.from(doc.data), 2); assert.ok(doc.size < 2 * 1024 * 1024, 'small file: ' + doc.size);
    // "Scan" on a claim already sent (attach later): one more PDF
    await cdp('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp('Page.navigate', { url: base + 'index.html#myaccount' });
    await waitFor(`!!document.querySelector('[data-scan]') || !!document.querySelector('#nc')`);
    const c2 = (await fetch(base + 'api/me/claims', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: (await api('POST', 'login', { username: 'worker1', password: 'pass1234' })).c }, body: JSON.stringify({ date: '2026-11-21', description: 'No receipt yet', amount: 15 }) }).then(r => r.json())).id;
    await cdp('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp('Page.navigate', { url: base + 'index.html#myaccount' });
    await waitFor(`!!document.querySelector('[data-scan="${c2}"]')`); await ev(`document.querySelector('[data-scan="${c2}"]').click(); true`); await waitFor(`!!document.querySelector('#scpick')`);
    await ev(`(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; c.getContext('2d').fillRect(10, 10, 50, 50); const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg')); const dt = new DataTransfer(); dt.items.add(new File([b], 'r.jpg', { type: 'image/jpeg' })); const inp = document.querySelector('#scpick'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; })()`);
    await waitFor(`!document.querySelector('#scok').disabled`, 15000); await ev(`document.querySelector('#scok').click(); true`);
    await waitFor(`!!${JSON.stringify(c2)} && !document.querySelector('[data-scan="${c2}"]')`, 15000);
    const d2 = ctx.db.prepare("SELECT * FROM documents WHERE entity='expense_claim' AND entity_id=?").get(c2); assert.ok(d2); checkPdf(Buffer.from(d2.data), 1);
    console.log('✔ browser: the claim form scans two pages (cleaned up, reduced, one removed and re-taken) into one PDF stored with the claim; "Scan" on a sent claim attaches one too');
    console.log('\nSCAN TESTS PASSED');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { try { ws && ws.close(); } catch {} try { proc && proc.kill(); } catch {} server.close(); setTimeout(() => process.exit(process.exitCode || 0), 200); }
});
