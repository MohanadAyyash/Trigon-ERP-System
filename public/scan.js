// Document scanner for receipts, like a scanner app: the live camera finds the paper, takes the picture by itself when it is held steady,
// cuts the paper out and straightens it (perspective), cleans each page up (grey, paper white, ink dark, shadows evened out, size reduced)
// and joins the pages into ONE PDF. Everything happens in the browser; nothing new on the server (the
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
  // ---------- finding the paper and straightening it (pure functions; tested in Node) ----------
  // The paper is the largest region clearly brighter (or darker) than its surroundings whose outline is close to a quadrilateral:
  // grey → 5×5 blur → Otsu threshold → largest connected region → convex hull of its row ends → the 4 hull points enclosing the
  // most area → checks (size, how much of the quadrilateral the region fills, angles). Returns { corners: [tl, tr, br, bl], … } or null.
  function grayOf(rgba, n) { const g = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) g[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000; return g; }
  function blur(g, w, h, r) {
    const t = new Float32Array(w * h), o = new Uint8ClampedArray(w * h), k = 2 * r + 1;
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += g[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[y * w + x] = s / k; s += g[y * w + Math.min(w - 1, x + r + 1)] - g[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / k; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    return o;
  }
  // grey-level max / min over a (2r+1)² square (separable): closing = max then min removes thin dark lines (text) from light paper,
  // opening = min then max removes thin light lines from dark paper; the paper's outline stays where it is
  function rank(g, w, h, r, isMax) {
    const t = new Uint8ClampedArray(w * h), o = new Uint8ClampedArray(w * h), pick = isMax ? Math.max : Math.min;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = g[y * w + x]; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, g[y * w + k]); t[y * w + x] = v; }
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let v = t[y * w + x]; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, t[k * w + x]); o[y * w + x] = v; }
    return o;
  }
  function otsu(g) {
    const hist = new Float64Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
    let wb = 0, sb = 0, best = 0, t = 127;
    for (let v = 0; v < 256; v++) { wb += hist[v]; if (!wb) continue; const wf = g.length - wb; if (!wf) break; sb += v * hist[v]; const mb = sb / wb, mf = (sum - sb) / wf, between = wb * wf * (mb - mf) * (mb - mf); if (between > best) { best = between; t = v; } }
    let a = 0, c = 0, d = 0, e = 0; for (let v = 0; v < 256; v++) { if (v <= t) { a += v * hist[v]; c += hist[v]; } else { d += v * hist[v]; e += hist[v]; } }
    return { t, gap: c && e ? d / e - a / c : 0 };                  // gap: mean brightness of the bright side minus the dark side
  }
  // largest 4-connected region of the mask: its pixel count and, per row, its leftmost and rightmost pixel
  function largestRegion(mask, w, h) {
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h); let best = null;
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue;
      let head = 0, tail = 0, count = 0; const lo = new Int32Array(h).fill(w), hi = new Int32Array(h).fill(-1); q[tail++] = s; seen[s] = 1;
      while (head < tail) {
        const p = q[head++], x = p % w, y = (p / w) | 0; count++; if (x < lo[y]) lo[y] = x; if (x > hi[y]) hi[y] = x;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; q[tail++] = p - 1; } if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; q[tail++] = p + 1; }
        if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; q[tail++] = p - w; } if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; q[tail++] = p + w; }
      }
      if (!best || count > best.count) best = { count, lo, hi };
    }
    if (!best) return null;
    const pts = []; for (let y = 0; y < h; y++) if (best.hi[y] >= 0) { pts.push([best.lo[y], y], [best.hi[y] + 1, y]); }
    return { count: best.count, pts };
  }
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  const area = q => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  // the 4 hull points enclosing the most area: the farthest pair (a diagonal), the farthest point on each side of it, then a few rounds
  // of moving each corner to the hull point that enlarges the quadrilateral most
  function quadOf(hp) {
    if (hp.length < 4) return null;
    let A = 0, B = 1, dmax = -1;
    for (let i = 0; i < hp.length; i++) for (let j = i + 1; j < hp.length; j++) { const d = (hp[i][0] - hp[j][0]) ** 2 + (hp[i][1] - hp[j][1]) ** 2; if (d > dmax) { dmax = d; A = i; B = j; } }
    let C = -1, D = -1, cmax = 0, dmin = 0;
    for (let i = 0; i < hp.length; i++) { const c = cross(hp[A], hp[B], hp[i]); if (c > cmax) { cmax = c; C = i; } if (c < dmin) { dmin = c; D = i; } }
    if (C < 0 || D < 0) return null;
    const idx = [A, C, B, D].sort((x, y) => x - y);
    for (let round = 0; round < 3; round++) for (let k = 0; k < 4; k++) {
      let bestI = idx[k], bestA = area(idx.map(i => hp[i]));
      for (let i = 0; i < hp.length; i++) { const t = idx.slice(); t[k] = i; if (new Set(t).size < 4) continue; const s = t.slice().sort((x, y) => x - y); const a = area(s.map(j => hp[j])); if (a > bestA + 1e-6) { bestA = a; bestI = i; } }
      idx[k] = bestI; idx.sort((x, y) => x - y);
    }
    return idx.map(i => hp[i].slice());
  }
  // corners as top-left, top-right, bottom-right, bottom-left (image y downwards)
  function order(q) {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
    const o = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let k = 0; for (let i = 1; i < 4; i++) if (o[i][0] + o[i][1] < o[k][0] + o[k][1]) k = i;
    return [0, 1, 2, 3].map(i => o[(k + i) % 4]);
  }
  const anglesOk = q => q.every((p, i) => { const a = q[(i + 3) % 4], b = q[(i + 1) % 4], v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    const c = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1); return c > -0.72 && c < 0.72; });   // between ~44° and ~136°
  function detectQuad(rgba, w, h, why) {
    const n = w * h, g0 = blur(grayOf(rgba, n), w, h, 1), r = Math.max(2, Math.round(Math.max(w, h) / 90));
    let best = null;
    for (const bright of [true, false]) {
      const g = bright ? rank(rank(g0, w, h, r, true), w, h, r, false) : rank(rank(g0, w, h, r, false), w, h, r, true), { t, gap } = otsu(g);
      if (gap < 40) { if (why) why.push(`${bright ? 'bright' : 'dark'}: contrast ${gap.toFixed(0)}`); continue; }   // no paper clearly brighter / darker than its background
      const mask = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = bright ? g[i] > t : g[i] <= t;
      const reg = largestRegion(mask, w, h); if (!reg || reg.count < 0.08 * n) { if (why) why.push((bright ? 'bright' : 'dark') + ': region too small'); continue; }
      const q = quadOf(hull(reg.pts)); if (!q) continue;
      const qa = area(q), fill = reg.count / qa;
      if (qa < 0.1 * n || qa > 0.985 * n || fill < 0.82 || fill > 1.1 || !anglesOk(order(q))) { if (why) why.push(`${bright ? 'bright' : 'dark'}: size ${(qa / n).toFixed(2)} fill ${fill.toFixed(2)} angles ${anglesOk(order(q))}`); continue; }
      const score = fill * Math.sqrt(qa / n) * (bright ? 1 : 0.9);
      if (!best || score > best.score) best = { corners: order(q), score, fill: +fill.toFixed(3), size: +(qa / n).toFixed(3), bright };
    }
    return best;
  }
  // homography taking the rectangle (0,0) (W,0) (W,H) (0,H) to the four corners (tl, tr, br, bl)
  function homography(W, H, c) {
    const src = [[0, 0], [W, 0], [W, H], [0, H]], A = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = c[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    for (let i = 0; i < 8; i++) {                                     // Gaussian elimination with partial pivoting
      let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = 0; r < 8; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let k = i; k < 8; k++) A[r][k] -= f * A[i][k]; b[r] -= f * b[i]; }
    }
    return b.map((v, i) => v / A[i][i]).concat(1);
  }
  // corners moved a little towards the centre (a fraction f of the way): the crop stays inside the paper's edge, never on the desk
  const inset = (c, f = 0.015) => { const cx = c.reduce((s, p) => s + p[0], 0) / 4, cy = c.reduce((s, p) => s + p[1], 0) / 4; return c.map(([x, y]) => [x + (cx - x) * f, y + (cy - y) * f]); };
  // the size of the straightened page: its longest sides, capped at max on the longest
  function pageSize(c, max = 1700) {
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(d(c[0], c[1]), d(c[3], c[2])), H = Math.max(d(c[0], c[3]), d(c[1], c[2])); const k = Math.min(1, max / Math.max(W, H));
    return [Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))];
  }
  // the page cut out of the photo and straightened (perspective corrected), bilinear sampling
  function warp(src, sw, sh, corners, W, H) {
    const m = homography(W, H, corners), out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const X = x + 0.5, Y = y + 0.5, z = m[6] * X + m[7] * Y + 1, u = (m[0] * X + m[1] * Y + m[2]) / z - 0.5, v = (m[3] * X + m[4] * Y + m[5]) / z - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u))), y0 = Math.max(0, Math.min(sh - 1, Math.floor(v))), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
      const o = (y * W + x) * 4, a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4;
      for (let k = 0; k < 3; k++) out[o + k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[c + k] * (1 - fx) + src[d + k] * fx) * fy;
      out[o + 3] = 255;
    }
    return out;
  }

  const api = { imagesToPdf, enhance, detectQuad, warp, pageSize, homography, inset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  Object.assign(window, { scanPdf: api });

  const MAX_SIDE = 1700, MAX_PAGES = 10, MAX_BYTES = 7.5 * 1024 * 1024, DET_W = 360, STEADY = 6, FULL = 2600;
  const loadImage = file => new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error(tr('تعذّر قراءة الصورة', 'Could not read the photo'))); }; im.src = u; });
  const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const ctx2d = c => c.getContext('2d', { willReadFrequently: true });
  // the paper in a picture (canvas / video frame of size w × h): found on a small copy, corners returned in the picture's pixels
  function findPaper(source, w, h) {
    const k = Math.min(1, DET_W / Math.max(w, h)), sm = canvasOf(w * k, h * k), x = ctx2d(sm); x.drawImage(source, 0, 0, sm.width, sm.height);
    const q = detectQuad(x.getImageData(0, 0, sm.width, sm.height).data, sm.width, sm.height);
    return q ? { ...q, corners: q.corners.map(([a, b]) => [a / k, b / k]), norm: q.corners.map(([a, b]) => [a / sm.width, b / sm.height]) } : null;
  }
  // the page cut out of the picture and straightened; the whole picture when no paper was found
  function straighten(src, corners) {
    if (!corners) return src;
    const c = inset(corners), [W, H] = pageSize(c, MAX_SIDE), d = ctx2d(src).getImageData(0, 0, src.width, src.height);
    const out = canvasOf(W, H); out.getContext('2d').putImageData(new ImageData(warp(d.data, src.width, src.height, c, W, H), W, H), 0, 0); return out;
  }
  // one page: picture → (paper found, cut out and straightened) → at most 1700 px → cleaned up → JPEG
  async function processPage(file, clean, quality = 0.72, crop = true) {
    const im = await loadImage(file), k0 = Math.min(1, FULL / Math.max(im.naturalWidth, im.naturalHeight)), full = canvasOf(im.naturalWidth * k0, im.naturalHeight * k0);
    const fx = ctx2d(full); fx.fillStyle = '#fff'; fx.fillRect(0, 0, full.width, full.height); fx.drawImage(im, 0, 0, full.width, full.height);
    const paper = crop ? findPaper(full, full.width, full.height) : null, pg = straighten(full, paper && paper.corners);
    const k = Math.min(1, MAX_SIDE / Math.max(pg.width, pg.height)), c = canvasOf(pg.width * k, pg.height * k), x = ctx2d(c); x.drawImage(pg, 0, 0, c.width, c.height);
    if (clean) { const d = x.getImageData(0, 0, c.width, c.height); enhance(d.data, c.width, c.height); x.putImageData(d, 0, 0); }
    const url = c.toDataURL('image/jpeg', quality), bin = atob(url.split(',')[1]), jpeg = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    return { jpeg, width: c.width, height: c.height, preview: url, found: !!paper };
  }
  const toDataUrl = bytes => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(new Blob([bytes], { type: 'application/pdf' })); });
  const moved = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));

  // the scanner: resolves { name, data (data: URL of the PDF), pages, bytes } or null when cancelled.
  // With a camera (getUserMedia): a live view that finds the paper, outlines it, takes the picture by itself once the paper is held
  // steady (about a second), cuts it out and straightens it, then waits for the next page. Without one: the phone's camera / photos,
  // each picture cut out and straightened the same way.
  window.scanDocument = () => new Promise(resolve => {
    const files = []; let pages = [], clean = true, busy = false, done = false, stream = null, timer = null, auto = true;
    const m = document.createElement('div'); m.className = 'overlay scan-overlay'; document.body.appendChild(m);
    const stop = () => { if (timer) clearInterval(timer); timer = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const finish = v => { if (done) return; done = true; stop(); m.remove(); resolve(v); };
    const msg = t => { const e = $('#scmsg', m); if (e) e.textContent = t; };
    const draw = () => {
      const pe = $('#scpages', m); if (!pe) return;
      pe.innerHTML = pages.map((p, i) => `<figure><img src="${p.preview}" alt=""><figcaption>${i + 1} <button type="button" class="x" data-scdel="${i}" aria-label="${tr('حذف', 'Remove')}">×</button></figcaption></figure>`).join('');
      const ok = $('#scok', m); ok.disabled = !pages.length || busy; ok.textContent = `${tr('إرفاق PDF', 'Attach the PDF')}${pages.length ? ` (${pages.length})` : ''}`;
      const lbl = $('#sclbl', m); if (lbl) lbl.textContent = pages.length ? tr('تصوير الصفحة التالية', 'Photograph the next page') : tr('تصوير صفحة', 'Take a photo');
      m.querySelectorAll('[data-scdel]').forEach(b => b.onclick = () => { files.splice(+b.dataset.scdel, 1); pages.splice(+b.dataset.scdel, 1); draw(); });
    };
    const addPage = async (blob, crop) => {
      if (files.length >= MAX_PAGES) { msg(tr(`الحد ${MAX_PAGES} صفحات`, `At most ${MAX_PAGES} pages`)); return false; }
      const p = await processPage(blob, clean, 0.72, crop); files.push({ blob, crop }); pages.push(p);
      if (crop && !p.found) msg(tr('لم تُحدَّد حواف الورقة في هذه الصورة — أُرفقت كما هي', 'The paper\'s edges were not found in this photo — attached as it is')); return true;
    };
    const add = async list => {
      for (const f of [...list]) { busy = true; msg(tr('جارٍ تجهيز الصفحة…', 'Preparing the page…')); draw(); try { if (!(await addPage(f, true))) break; if ($('#scmsg', m).textContent === tr('جارٍ تجهيز الصفحة…', 'Preparing the page…')) msg(''); } catch (e) { msg(e.message); } busy = false; draw(); }
    };
    const common = () => {
      $('#scpick', m).onchange = e => { add(e.target.files).then(() => { e.target.value = ''; }); };
      $('#scclean', m).onchange = async e => { clean = e.target.checked; busy = true; draw(); pages = []; for (const f of files) pages.push(await processPage(f.blob, clean, 0.72, f.crop)); busy = false; draw(); };
      $('#sccancel', m).onclick = () => finish(null);
      $('#scok', m).onclick = async () => {
        stop(); busy = true; draw(); msg(tr('جارٍ إنشاء الملف…', 'Making the file…'));
        let pdf = imagesToPdf(pages);
        for (const q of [0.6, 0.5, 0.4]) { if (pdf.length <= MAX_BYTES) break; pages = []; for (const f of files) pages.push(await processPage(f.blob, clean, q, f.crop)); pdf = imagesToPdf(pages); }
        if (pdf.length > MAX_BYTES) { busy = false; draw(); msg(tr('الملف كبير جداً — قلّل عدد الصفحات', 'The file is too large — use fewer pages')); return; }
        const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
        finish({ name: `receipt-${stamp}.pdf`, data: await toDataUrl(pdf), pages: pages.length, bytes: pdf.length });
      };
      draw();
    };
    const cleanBox = `<label class="scan-opt"><input type="checkbox" id="scclean" checked> ${tr('تحسين كمستند (أبيض وأسود)', 'Clean up as a document (black and white)')}</label>`;
    const pick = `<label class="btn sec">${tr('من الصور', 'From photos')}<input type="file" id="scpick" accept="image/*" multiple hidden></label>`;

    // ---- without a live camera: the phone's camera app / photos (each picture still cut out and straightened) ----
    const fallback = why => {
      stop(); m.className = 'overlay scan-overlay';
      m.innerHTML = `<div class="modal"><h2>${ico('camera')} ${tr('مسح المستند بالكاميرا', 'Scan the document with the camera')}</h2>
        <p class="muted">${tr('صوّر الإيصال على سطح داكن. يحدد النظام حواف الورقة ويقصّها ويعدّلها تلقائياً، وتُجمع الصفحات في ملف PDF واحد.', 'Photograph the receipt on a dark surface. The paper\'s edges are found, cut out and straightened automatically; the pages are joined into one PDF.')}${why ? `<br><span class="muted">${esc(why)}</span>` : ''}</p>
        <div id="scpages" class="scpages"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">
          <label class="btn">${ico('camera')} <span id="sclbl">${tr('تصوير صفحة', 'Take a photo')}</span><input type="file" id="sccam" accept="image/*" capture="environment" hidden></label>${pick}${cleanBox}</div>
        <p id="scmsg" class="muted"></p>
        <div class="acts"><button class="btn" id="scok" disabled>${tr('إرفاق PDF', 'Attach the PDF')}</button><button class="btn sec" id="sccancel">${tr('إلغاء', 'Cancel')}</button></div></div>`;
      $('#sccam', m).onchange = e => { add(e.target.files).then(() => { e.target.value = ''; }); };
      common();
    };

    // ---- the live scanner ----
    const live = async () => {
      m.className = 'scan-live';
      m.innerHTML = `<div class="scan-view"><video playsinline muted autoplay></video><canvas class="scan-ov"></canvas><div class="scan-hint" id="schint">${tr('جارٍ فتح الكاميرا…', 'Opening the camera…')}</div><div class="scan-flash"></div></div>
        <div class="scan-bar"><div id="scpages" class="scpages mini"></div>
          <div class="scan-row"><button type="button" class="btn sec" id="sccancel">${tr('إلغاء', 'Cancel')}</button><button type="button" class="scan-shutter" id="scshot" aria-label="${tr('تصوير', 'Take the picture')}"></button><button type="button" class="btn" id="scok" disabled>${tr('إرفاق PDF', 'Attach the PDF')}</button></div>
          <div class="scan-row small"><label class="scan-opt"><input type="checkbox" id="scauto" checked> ${tr('تصوير تلقائي', 'Automatic capture')}</label>${cleanBox}${pick}</div>
          <p id="scmsg"></p></div>`;
      common();
      const video = $('video', m), ov = $('.scan-ov', m), hint = t => { $('#schint', m).textContent = t; };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      } catch (e) { return fallback(tr('لم يُسمح بفتح الكاميرا المباشرة على هذا الجهاز — استخدم كاميرا الجوال.', 'The live camera could not be opened on this device — use the phone\'s camera.')); }
      if (done) return stop();
      video.srcObject = stream; await video.play().catch(() => {});
      $('#scauto', m).onchange = e => { auto = e.target.checked; };
      let seen = [], last = null, waitChange = false, gone = 0;
      const showQuad = (q, steady) => {
        const r = ov.getBoundingClientRect(); ov.width = r.width; ov.height = r.height; const g = ov.getContext('2d'); g.clearRect(0, 0, ov.width, ov.height);
        if (!q || !video.videoWidth) return;
        const s = Math.min(r.width / video.videoWidth, r.height / video.videoHeight), ox = (r.width - video.videoWidth * s) / 2, oy = (r.height - video.videoHeight * s) / 2;
        g.beginPath(); q.corners.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, ox + x * s, oy + y * s)); g.closePath();
        g.lineWidth = 4; g.strokeStyle = steady ? '#2ecc71' : '#f1c40f'; g.fillStyle = steady ? 'rgba(46,204,113,.18)' : 'rgba(241,196,15,.12)'; g.fill(); g.stroke();
      };
      const capture = async q => {
        busy = true;
        try {
          const vw = video.videoWidth, vh = video.videoHeight, k = Math.min(1, FULL / Math.max(vw, vh)), full = canvasOf(vw * k, vh * k); ctx2d(full).drawImage(video, 0, 0, full.width, full.height);
          const corners = q ? q.corners.map(([x, y]) => [x * k, y * k]) : null, pg = straighten(full, corners);
          const fl = $('.scan-flash', m); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); if (navigator.vibrate) navigator.vibrate(60);
          const blob = await new Promise(ok => pg.toBlob(ok, 'image/jpeg', 0.92));
          if (await addPage(blob, false)) { waitChange = true; gone = 0; last = q && q.norm; seen = []; msg(''); hint(tr('تم — ضع الصفحة التالية أو اضغط «إرفاق PDF»', 'Done — put the next page or press “Attach the PDF”')); }
        } catch (e) { msg(e.message); }
        busy = false; draw();
      };
      $('#scshot', m).onclick = () => { if (!busy && video.videoWidth) capture(video.videoWidth ? findPaper(video, video.videoWidth, video.videoHeight) : null); };
      timer = setInterval(() => {
        if (done || busy || !video.videoWidth || pages.length >= MAX_PAGES) return;
        const q = findPaper(video, video.videoWidth, video.videoHeight);
        if (waitChange) {                                              // the page just taken: wait until it is taken away or changed
          showQuad(q, false);
          if (!q) { if (++gone >= 4) waitChange = false; } else if (last && moved(q.norm, last) > 0.12) waitChange = false; else gone = 0;
          return;
        }
        if (!q) { seen = []; showQuad(null); hint(tr('وجّه الكاميرا نحو الورقة على سطح داكن', 'Point the camera at the paper on a dark surface')); return; }
        seen.push(q.norm); if (seen.length > STEADY) seen.shift();
        const steady = seen.length === STEADY && seen.every(n => moved(n, q.norm) < 0.02);
        showQuad(q, steady);
        if (steady && auto) { hint(tr('جارٍ التصوير…', 'Taking the picture…')); capture(q); }
        else hint(auto ? tr('ثبّت الجوال…', 'Hold still…') : tr('اضغط زر التصوير', 'Press the shutter'));
      }, 150);
    };
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext !== false) live(); else fallback();
  });
})(typeof window !== 'undefined' ? window : globalThis);
