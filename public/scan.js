// Document scanner for receipts: take one or more photos with the phone camera, clean each page up like a scanner (grey, paper made
// white, ink made dark, size reduced) and join them into ONE PDF. Everything happens in the browser; nothing new on the server (the
// receipt upload already accepts PDF). No library: the PDF is written by hand, with the JPEG pages embedded as they are (DCTDecode).
(function (root) {
  'use strict';
  const enc = s => new TextEncoder().encode(s);
  // pages: [{ jpeg: Uint8Array, width, height }] → Uint8Array of a PDF, one page per image (longest side 842 pt = A4 height)
  function imagesToPdf(pages) {
    if (!Array.isArray(pages) || !pages.length) throw new Error('No pages');
    const parts = [], offsets = []; let size = 0;
    const put = x => { const b = typeof x === 'string' ? enc(x) : x; parts.push(b); size += b.length; };
    const obj = (n, body) => { offsets[n] = size; put(`${n} 0 obj\n`); for (const b of [].concat(body)) put(b); put('\nendobj\n'); };
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, '?'));
    const n = pages.length, pageNo = i => 3 + i * 3;          // per page: page, image, content
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`);
    pages.forEach((p, i) => {
      const w = Math.max(1, p.width | 0), h = Math.max(1, p.height | 0), k = 842 / Math.max(w, h), W = +(w * k).toFixed(2), H = +(h * k).toFixed(2);
      const pn = pageNo(i), content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${pn + 1} 0 R >> >> /Contents ${pn + 2} 0 R >>`);
      obj(pn + 1, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
      obj(pn + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const total = 3 + n * 3, xref = size;
    put(`xref\n0 ${total}\n0000000000 65535 f \n${Array.from({ length: total - 1 }, (_, i) => String(offsets[i + 1]).padStart(10, '0') + ' 00000 n \n').join('')}`);
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(size); let o = 0; for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }
  // "document" look: grey, the paper pushed to white and the ink to black. The paper's brightness is taken region by region (the brightest
  // pixels of each block, smoothed), so a shadow or uneven light over part of the page is evened out, as a scanner app does.
  // rgba: Uint8ClampedArray of canvas pixels (changed in place); w × h its size (one row when not given).
  function enhance(rgba, w, h) {
    const n = rgba.length / 4; w = w || n; h = h || 1;
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    // local paper level: max of each B×B block, then a 3×3 average of the blocks, then bilinear between block centres
    const B = Math.max(8, Math.round(Math.max(w, h) / 24)), bw = Math.ceil(w / B), bh = Math.ceil(h / B), mx = new Float32Array(bw * bh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y / B | 0) * bw + (x / B | 0), v = g[y * w + x]; if (v > mx[k]) mx[k] = v; }
    const bg = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = by + dy, xx = bx + dx; if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) { s += mx[yy * bw + xx]; c++; } } bg[by * bw + bx] = s / c; }
    const at = (bx, by) => bg[Math.min(bh - 1, Math.max(0, by)) * bw + Math.min(bw - 1, Math.max(0, bx))];
    const hist = new Uint32Array(256), nv = new Uint8ClampedArray(n);
    for (let y = 0; y < h; y++) {
      const fy = y / B - 0.5, y0 = Math.floor(fy), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = x / B - 0.5, x0 = Math.floor(fx), tx = fx - x0;
        const b = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
        const v = Math.min(255, g[y * w + x] * 255 / Math.max(40, b)); nv[y * w + x] = v; hist[v | 0]++;
      }
    }
    // ink: the darkest few pixels, but always well below the paper (a receipt is mostly paper)
    let c = 0, lo = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= 0.02 * n) { lo = v; break; } }
    lo = Math.min(lo, 150); const hi = 235;
    for (let i = 0; i < n; i++) { let v = (nv[i] - lo) * 255 / (hi - lo); v = v < 0 ? 0 : v > 255 ? 255 : 255 * Math.pow(v / 255, 1.4); rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; }
    return rgba;
  }
  const api = { imagesToPdf, enhance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  Object.assign(window, { scanPdf: api });

  const MAX_SIDE = 1700, MAX_PAGES = 10, MAX_BYTES = 7.5 * 1024 * 1024;
  const loadImage = file => new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error(tr('تعذّر قراءة الصورة', 'Could not read the photo'))); }; im.src = u; });
  async function processPage(file, clean, quality = 0.72) {
    const im = await loadImage(file), k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    if (clean) { const d = x.getImageData(0, 0, c.width, c.height); enhance(d.data, c.width, c.height); x.putImageData(d, 0, 0); }
    const url = c.toDataURL('image/jpeg', quality), bin = atob(url.split(',')[1]), jpeg = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    return { jpeg, width: c.width, height: c.height, preview: url };
  }
  const toDataUrl = bytes => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(new Blob([bytes], { type: 'application/pdf' })); });
  // the scanner window: resolves { name, data (data: URL of the PDF), pages } or null when cancelled
  window.scanDocument = () => new Promise(resolve => {
    const files = []; let pages = [], clean = true, busy = false, done = false;
    // its own window above the form that opened it (the app's modal() has one slot: it would close the expense claim form)
    const m = document.createElement('div'); m.className = 'overlay scan-overlay'; m.innerHTML = `<div class="modal"><h2>${ico('camera')} ${tr('مسح المستند بالكاميرا', 'Scan the document with the camera')}</h2>
      <p class="muted">${tr('صوّر الإيصال صفحة صفحة على سطح مستوٍ وإضاءة جيدة. تُجمع الصفحات في ملف PDF واحد.', 'Photograph the receipt page by page, flat and in good light. The pages are joined into one PDF.')}</p>
      <div id="scpages" class="scpages"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">
        <label class="btn">${ico('camera')} <span id="sclbl">${tr('تصوير صفحة', 'Take a photo')}</span><input type="file" id="sccam" accept="image/*" capture="environment" hidden></label>
        <label class="btn sec">${tr('من الصور', 'From photos')}<input type="file" id="scpick" accept="image/*" multiple hidden></label>
        <label style="display:flex;gap:6px;align-items:center;width:auto"><input type="checkbox" id="scclean" checked style="width:auto"> ${tr('تحسين كمستند (أبيض وأسود)', 'Clean up as a document (black and white)')}</label></div>
      <p id="scmsg" class="muted"></p>
      <div class="acts"><button class="btn" id="scok" disabled>${tr('إرفاق PDF', 'Attach the PDF')}</button><button class="btn sec" id="sccancel">${tr('إلغاء', 'Cancel')}</button></div></div>`;
    document.body.appendChild(m);
    const finish = v => { if (done) return; done = true; m.remove(); resolve(v); };
    const draw = () => {
      $('#scpages', m).innerHTML = pages.map((p, i) => `<figure><img src="${p.preview}" alt=""><figcaption>${i + 1} <button type="button" class="x" data-scdel="${i}" aria-label="${tr('حذف', 'Remove')}">×</button></figcaption></figure>`).join('');
      $('#scok', m).disabled = !pages.length || busy; $('#sclbl', m).textContent = pages.length ? tr('تصوير الصفحة التالية', 'Photograph the next page') : tr('تصوير صفحة', 'Take a photo');
      m.querySelectorAll('[data-scdel]').forEach(b => b.onclick = () => { files.splice(+b.dataset.scdel, 1); pages.splice(+b.dataset.scdel, 1); draw(); });
    };
    const add = async list => {
      for (const f of [...list]) {
        if (files.length >= MAX_PAGES) { $('#scmsg', m).textContent = tr(`الحد ${MAX_PAGES} صفحات`, `At most ${MAX_PAGES} pages`); break; }
        busy = true; $('#scmsg', m).textContent = tr('جارٍ تجهيز الصفحة…', 'Preparing the page…'); draw();
        try { const p = await processPage(f, clean); files.push(f); pages.push(p); $('#scmsg', m).textContent = ''; } catch (e) { $('#scmsg', m).textContent = e.message; }
        busy = false; draw();
      }
    };
    $('#sccam', m).onchange = e => { add(e.target.files).then(() => { e.target.value = ''; }); };
    $('#scpick', m).onchange = e => { add(e.target.files).then(() => { e.target.value = ''; }); };
    $('#scclean', m).onchange = async e => { clean = e.target.checked; busy = true; draw(); pages = []; for (const f of files) pages.push(await processPage(f, clean)); busy = false; draw(); };
    $('#sccancel', m).onclick = () => finish(null);
    $('#scok', m).onclick = async () => {
      busy = true; draw(); $('#scmsg', m).textContent = tr('جارٍ إنشاء الملف…', 'Making the file…');
      let pdf = imagesToPdf(pages);
      for (const q of [0.6, 0.5, 0.4]) { if (pdf.length <= MAX_BYTES) break; pages = []; for (const f of files) pages.push(await processPage(f, clean, q)); pdf = imagesToPdf(pages); }
      if (pdf.length > MAX_BYTES) { busy = false; draw(); $('#scmsg', m).textContent = tr('الملف كبير جداً — قلّل عدد الصفحات', 'The file is too large — use fewer pages'); return; }
      const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      finish({ name: `receipt-${stamp}.pdf`, data: await toDataUrl(pdf), pages: pages.length, bytes: pdf.length });
    };
    draw();
    setTimeout(() => { try { $('#sccam', m).click(); } catch { /* the browser may need a tap first */ } }, 50);   // open the camera straight away
  });
})(typeof window !== 'undefined' ? window : globalThis);
