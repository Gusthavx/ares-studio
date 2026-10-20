'use strict';
// Pacote PhotoCraft: filtros e ajustes recriados em cima do PhotoCraft (storytold/photocraft, MIT/Apache-2.0).
// As contas de distorção, estilização e sombras/realces seguem o código dele (crates/algo); o resto segue o comportamento.
// Tudo entra em PS.FILTERS e roda por PS.runFilter (camada ativa, respeita a seleção, prévia ao vivo).
(function () {
  const PS = window.PS, F = PS.FILTERS, TAU = Math.PI * 2;
  const R = (k, label, min, max, val, step = 1) => ({ k, label, type: 'range', min, max, val, step });
  const S = (k, label, val, options) => ({ k, label, type: 'select', val, options });
  const C = (k, label, val) => ({ k, label, type: 'check', val });
  const K = (k, label, val) => ({ k, label, type: 'color', val });
  const mkLut = f => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = f(i); return l; };
  const lutApply = (d, lut) => { for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; } };
  const lum = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114;
  const cl = (v, n) => v < 0 ? 0 : v >= n ? n - 1 : v;
  const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = (a, b, x) => { const t = sat((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
  const blurred = (c, r) => { const n = PS.mk(c.width, c.height), x = n.getContext('2d'); x.filter = `blur(${r}px)`; x.drawImage(c, 0, 0); return n; };
  const dataOf = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  // Número "aleatório" que se repete para a mesma posição: a prévia não treme enquanto o controle é arrastado.
  const hash01 = (x, y, c, seed) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(c | 0, 1274126177) ^ Math.imul((seed | 0) + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y, seed) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash01(x0, y0, 0, seed), b = hash01(x0 + 1, y0, 0, seed), c = hash01(x0, y0 + 1, 0, seed), e = hash01(x0 + 1, y0 + 1, 0, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  };

  // Mapeamento inverso com amostragem bilinear: f(x, y, o) grava em o de onde o pixel vem.
  // borda: 'repeat' (repete o pixel da borda), 'wrap' (dá a volta) ou 'clear' (transparente).
  function remap(d, w, h, edge, f) {
    const s = new Uint8ClampedArray(d), o = [0, 0];
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
      o[0] = x + 0.5; o[1] = y + 0.5;
      f(x + 0.5, y + 0.5, o);
      const fx = o[0] - 0.5, fy = o[1] - 0.5;
      if (fx === x && fy === y) continue;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      let r = 0, g = 0, b = 0, a = 0;
      for (let t = 0; t < 4; t++) {
        const wt = ((t & 1) ? ax : 1 - ax) * ((t >> 1) ? ay : 1 - ay);
        if (wt <= 0) continue;
        let xi = x0 + (t & 1), yi = y0 + (t >> 1);
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) {
          if (edge === 'clear') continue;
          if (edge === 'wrap') { xi = ((xi % w) + w) % w; yi = ((yi % h) + h) % h; } else { xi = cl(xi, w); yi = cl(yi, h); }
        }
        const j = (yi * w + xi) * 4, q = s[j + 3] * wt;
        r += s[j] * q; g += s[j + 1] * q; b += s[j + 2] * q; a += q;
      }
      if (a > 0) { d[i] = r / a; d[i + 1] = g / a; d[i + 2] = b / a; d[i + 3] = a; } else d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    }
  }
  const centre = (w, h) => [w / 2, h / 2, Math.min(w, h) / 2];

  // Média móvel em linha e coluna (desfoque de caixa), com cor pré-multiplicada pela transparência.
  function boxPass(src, dst, w, h, r, horiz) {
    const len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 4 : w * 4, k = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const base = horiz ? l * w * 4 : l * 4;
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let t = -r; t <= r; t++) acc += src[base + cl(t, len) * step + c];
        for (let p = 0; p < len; p++) {
          dst[base + p * step + c] = acc / k;
          acc += src[base + cl(p + r + 1, len) * step + c] - src[base + cl(p - r, len) * step + c];
        }
      }
    }
  }
  function boxBlur(d, w, h, r) {
    r = Math.max(1, Math.round(r));
    const P = new Float32Array(d.length), T = new Float32Array(d.length);
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; P[i] = d[i] * a; P[i + 1] = d[i + 1] * a; P[i + 2] = d[i + 2] * a; P[i + 3] = d[i + 3]; }
    boxPass(P, T, w, h, r, true); boxPass(T, P, w, h, r, false);
    for (let i = 0; i < d.length; i += 4) { const a = P[i + 3] / 255; if (a > 0.002) { d[i] = P[i] / a; d[i + 1] = P[i + 1] / a; d[i + 2] = P[i + 2] / a; } d[i + 3] = P[i + 3]; }
  }
  // Mediana com janela deslizante (histograma de Huang). limiar: só troca o pixel que foge mais que isso da mediana.
  function median(d, w, h, r, thr) {
    const s = new Uint8ClampedArray(d), th = ((2 * r + 1) * (2 * r + 1)) >> 1, hist = new Int32Array(256);
    for (let c = 0; c < 3; c++) for (let y = 0; y < h; y++) {
      hist.fill(0); let med = 0, lt = 0;
      for (let j = -r; j <= r; j++) { const row = cl(y + j, h) * w; for (let i = -r; i <= r; i++) hist[s[(row + cl(i, w)) * 4 + c]]++; }
      for (let x = 0; x < w; x++) {
        if (x > 0) {
          const xo = cl(x - r - 1, w), xi = cl(x + r, w);
          for (let j = -r; j <= r; j++) {
            const row = cl(y + j, h) * w, vo = s[(row + xo) * 4 + c], vi = s[(row + xi) * 4 + c];
            hist[vo]--; if (vo < med) lt--;
            hist[vi]++; if (vi < med) lt++;
          }
        }
        while (lt > th) { med--; lt -= hist[med]; }
        while (lt + hist[med] <= th) { lt += hist[med]; med++; }
        const o = (y * w + x) * 4 + c;
        if (thr == null || Math.abs(s[o] - med) > thr) d[o] = med;
      }
    }
  }
  // Máximo/mínimo: cópias deslocadas somadas com "clarear"/"escurecer" (um passe na horizontal, outro na vertical).
  function extreme(c, r, gco) {
    let cur = c;
    for (const horiz of [true, false]) {
      const n = PS.mk(c.width, c.height), x = n.getContext('2d');
      x.drawImage(cur, 0, 0); x.globalCompositeOperation = gco;
      for (let i = 1; i <= r; i++) { x.drawImage(cur, horiz ? i : 0, horiz ? 0 : i); x.drawImage(cur, horiz ? -i : 0, horiz ? 0 : -i); }
      cur = n;
    }
    return cur;
  }
  // Empilha cópias transformadas com peso igual (média): base do desfoque de movimento e do radial.
  function stack(c, steps, place) {
    const n = PS.mk(c.width, c.height), x = n.getContext('2d');
    x.drawImage(c, 0, 0);
    for (let i = 1; i <= steps; i++) { x.save(); x.globalAlpha = 1 / (i + 1); place(x, i / steps); x.drawImage(c, 0, 0); x.restore(); }
    return n;
  }
  function conv3(d, w, h, k, div = 1, bias = 0) {
    const s = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let a = 0;
        for (let j = -1; j <= 1; j++) { const row = cl(y + j, h) * w; for (let i = -1; i <= 1; i++) a += s[(row + cl(x + i, w)) * 4 + c] * k[(j + 1) * 3 + i + 1]; }
        d[o + c] = a / div + bias;
      }
    }
  }
  // Mistura o original com uma versão desfocada conforme uma máscara m(x, y) de 0 (nítido) a 1 (desfocado).
  function focusBlend(d, w, h, base, radius, m) {
    const b = dataOf(blurred(base, radius));
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
      const t = m(x, y); if (t <= 0) continue;
      d[i] += (b[i] - d[i]) * t; d[i + 1] += (b[i + 1] - d[i + 1]) * t; d[i + 2] += (b[i + 2] - d[i + 2]) * t; // a transparência fica como estava: a borda não escurece
    }
  }
  // Células de Voronoi sobre uma grade com sementes deslocadas (cristalizar e pontilhar).
  function voronoi(w, h, size, seed, each) {
    const sx = (gx, gy) => (gx + hash01(gx, gy, 1, seed)) * size, sy = (gx, gy) => (gy + hash01(gx, gy, 2, seed)) * size;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = Math.floor(x / size), gy = Math.floor(y / size);
      let best = 1e18, bx = 0, by = 0, bgx = 0, bgy = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const px = sx(gx + i, gy + j), py = sy(gx + i, gy + j), dd = (px - x) * (px - x) + (py - y) * (py - y);
        if (dd < best) { best = dd; bx = px; by = py; bgx = gx + i; bgy = gy + j; }
      }
      each(x, y, bgx, bgy, bx, by, Math.sqrt(best));
    }
  }
  const SEED = { v: 1 };
  const reseed = () => { SEED.v = (Math.random() * 1e9) | 0; };

  const NEW = {
    // ---------------- desfoque ----------------
    average: { name: 'Média', group: 'Desfoque', px: d => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; r += d[i] * a; g += d[i + 1] * a; b += d[i + 2] * a; n += a; }
      if (!n) return; r /= n; g /= n; b /= n;
      for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    } },
    blur1: { name: 'Desfocar', group: 'Desfoque', canvas: c => blurred(c, 0.8) },
    blur2: { name: 'Desfocar mais', group: 'Desfoque', canvas: c => blurred(c, 1.8) },
    boxblur: { name: 'Desfoque de caixa', group: 'Desfoque', fields: [R('r', 'Raio (px)', 1, 200, 8)], px: (d, v, w, h) => boxBlur(d, w, h, v.r) },
    motion: { name: 'Desfoque de movimento', group: 'Desfoque', fields: [R('a', 'Ângulo °', -90, 90, 0), R('d', 'Distância (px)', 1, 600, 30)],
      canvas: (c, v) => { const a = v.a * Math.PI / 180, n = Math.max(2, Math.min(120, Math.round(v.d))); return stack(c, n, (x, t) => { const k = (t - 0.5) * v.d; x.translate(Math.cos(a) * k, -Math.sin(a) * k); }); } },
    radial: { name: 'Desfoque radial', group: 'Desfoque', fields: [S('m', 'Método', 'spin', [['spin', 'Giro'], ['zoom', 'Zoom']]), R('a', 'Intensidade', 1, 100, 12), R('cx', 'Centro X %', 0, 100, 50), R('cy', 'Centro Y %', 0, 100, 50)],
      canvas: (c, v) => {
        const cx = c.width * v.cx / 100, cy = c.height * v.cy / 100;
        return stack(c, 48, (x, t) => {
          x.translate(cx, cy);
          if (v.m === 'spin') x.rotate((t - 0.5) * v.a * Math.PI / 180); else { const s = 1 + t * v.a / 100; x.scale(s, s); }
          x.translate(-cx, -cy);
        });
      } },
    surface: { name: 'Desfoque de superfície', group: 'Desfoque', fields: [R('r', 'Raio (px)', 1, 15, 4), R('t', 'Limiar', 2, 255, 20)],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d), r = Math.round(v.r), st = r > 5 ? 2 : 1, k = 1 / (2.5 * v.t);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            const p = s[o + c]; let acc = 0, wt = 0;
            for (let j = -r; j <= r; j += st) { const row = cl(y + j, h) * w; for (let i = -r; i <= r; i += st) { const q = s[(row + cl(x + i, w)) * 4 + c], g = 1 - Math.abs(q - p) * k; if (g > 0) { acc += q * g; wt += g; } } }
            d[o + c] = acc / wt;
          }
        }
      } },
    tiltshift: { name: 'Inclinação e deslocamento (tilt-shift)', group: 'Desfoque', fields: [R('r', 'Desfoque (px)', 1, 60, 14), R('cy', 'Centro %', 0, 100, 50), R('f', 'Faixa nítida %', 0, 80, 18), R('t', 'Transição %', 1, 80, 22), R('a', 'Ângulo °', -90, 90, 0)],
      px: (d, v, w, h, base) => {
        const a = v.a * Math.PI / 180, sn = Math.sin(a), cs = Math.cos(a), cx = w / 2, cy = h * v.cy / 100, f = h * v.f / 200, t = h * v.t / 100;
        focusBlend(d, w, h, base, v.r, (x, y) => smooth(f, f + t, Math.abs(-(x - cx) * sn + (y - cy) * cs)));
      } },
    iris: { name: 'Desfoque de íris', group: 'Desfoque', fields: [R('r', 'Desfoque (px)', 1, 60, 14), R('cx', 'Centro X %', 0, 100, 50), R('cy', 'Centro Y %', 0, 100, 50), R('s', 'Tamanho %', 5, 150, 45), R('t', 'Transição %', 1, 100, 35)],
      px: (d, v, w, h, base) => {
        const cx = w * v.cx / 100, cy = h * v.cy / 100, rx = w * v.s / 200, ry = h * v.s / 200, t = v.t / 100;
        focusBlend(d, w, h, base, v.r, (x, y) => smooth(1, 1 + t, Math.hypot((x - cx) / rx, (y - cy) / ry)));
      } },

    // ---------------- nitidez ----------------
    sharp1: { name: 'Tornar nítido', group: 'Nitidez', px: (d, v, w, h) => conv3(d, w, h, [0, -1, 0, -1, 8, -1, 0, -1, 0], 4) },
    sharp2: { name: 'Tornar mais nítido', group: 'Nitidez', px: (d, v, w, h) => conv3(d, w, h, [-1, -1, -1, -1, 12, -1, -1, -1, -1], 4) },
    sharpedges: { name: 'Nitidez nas arestas', group: 'Nitidez', px: (d, v, w, h, base) => {
      const b = dataOf(blurred(base, 1));
      for (let i = 0; i < d.length; i += 4) { const e = Math.min(1, Math.abs(lum(d[i], d[i + 1], d[i + 2]) - lum(b[i], b[i + 1], b[i + 2])) / 12); for (let c = 0; c < 3; c++) d[i + c] += (d[i + c] - b[i + c]) * 1.6 * e; }
    } },
    smartsharp: { name: 'Aplicação inteligente de nitidez', group: 'Nitidez', fields: [R('a', 'Intensidade %', 1, 500, 120), R('r', 'Raio (px)', 0.2, 20, 1.2, 0.1), R('n', 'Reduzir ruído %', 0, 100, 10)],
      px: (d, v, w, h, base) => {
        const b = dataOf(blurred(base, v.r)), a = v.a / 100, n = v.n * 0.12;
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const df = d[i + c] - b[i + c], m = Math.abs(df); d[i + c] += df * a * (n > 0 ? smooth(0, n, m) : 1); }
      } },

    // ---------------- ruído ----------------
    median: { name: 'Mediana', group: 'Ruído', fields: [R('r', 'Raio (px)', 1, 30, 2)], px: (d, v, w, h) => median(d, w, h, Math.round(v.r)) },
    despeckle: { name: 'Remoção de manchas', group: 'Ruído', px: (d, v, w, h) => median(d, w, h, 1, 18) },
    dust: { name: 'Poeira e rabiscos', group: 'Ruído', fields: [R('r', 'Raio (px)', 1, 30, 2), R('t', 'Limiar', 0, 255, 16)], px: (d, v, w, h) => median(d, w, h, Math.round(v.r), v.t) },
    denoise: { name: 'Reduzir ruído', group: 'Ruído', fields: [R('s', 'Intensidade', 1, 10, 5), R('p', 'Preservar detalhes %', 0, 100, 40)],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d);
        NEW.surface.px(d, { r: 2 + Math.round(v.s / 4), t: 6 + v.s * 5 }, w, h);
        const k = v.p / 100 * 0.6;
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] += (s[i + c] - d[i + c]) * k;
      } },

    // ---------------- distorção (contas do PhotoCraft: distort.rs e distort2.rs) ----------------
    twirl: { name: 'Redemoinho', group: 'Distorção', fields: [R('a', 'Ângulo °', -999, 999, 50)],
      px: (d, v, w, h) => { const [cx, cy, rr] = centre(w, h), a = v.a * Math.PI / 180; remap(d, w, h, 'repeat', (x, y, o) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= rr) return; const t = a * (1 - r / rr), s = Math.sin(t), c = Math.cos(t); o[0] = cx + dx * c - dy * s; o[1] = cy + dx * s + dy * c; }); } },
    pinch: { name: 'Achatar', group: 'Distorção', fields: [R('a', 'Intensidade %', -100, 100, 50)],
      px: (d, v, w, h) => { const [cx, cy, rr] = centre(w, h), a = v.a / 100; remap(d, w, h, 'repeat', (x, y, o) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= rr || r <= 0) return; const rs = rr * Math.pow(r / rr, 1 - a * 0.5); o[0] = cx + dx * rs / r; o[1] = cy + dy * rs / r; }); } },
    spherize: { name: 'Esferizar', group: 'Distorção', fields: [R('a', 'Intensidade %', -100, 100, 100), S('m', 'Modo', 'n', [['n', 'Normal'], ['h', 'Só horizontal'], ['v', 'Só vertical']])],
      px: (d, v, w, h) => {
        const [cx, cy, rr] = centre(w, h), a = v.a / 100, hx = w / 2, hy = h / 2;
        const s1 = rn => rn + Math.abs(a) * ((a >= 0 ? Math.asin(rn) * 2 / Math.PI : Math.sin(rn * Math.PI / 2)) - rn);
        remap(d, w, h, 'repeat', (x, y, o) => {
          const dx = x - cx, dy = y - cy;
          if (v.m === 'n') { const r = Math.hypot(dx, dy); if (r >= rr || r <= 0) return; const rs = rr * s1(r / rr); o[0] = cx + dx * rs / r; o[1] = cy + dy * rs / r; }
          else if (v.m === 'h') { if (Math.abs(dx) < hx) o[0] = cx + Math.sign(dx) * hx * s1(Math.abs(dx) / hx); }
          else if (Math.abs(dy) < hy) o[1] = cy + Math.sign(dy) * hy * s1(Math.abs(dy) / hy);
        });
      } },
    wave: { name: 'Onda', group: 'Distorção', fields: [R('n', 'Geradores', 1, 30, 5), R('l0', 'Comprimento mín.', 1, 500, 10), R('l1', 'Comprimento máx.', 1, 500, 120), R('a0', 'Amplitude mín.', 0, 200, 5), R('a1', 'Amplitude máx.', 0, 200, 35),
      S('t', 'Tipo', 'sine', [['sine', 'Senoide'], ['tri', 'Triângulo'], ['sq', 'Quadrado']]), S('e', 'Áreas vazias', 'repeat', [['repeat', 'Repetir pixels da borda'], ['wrap', 'Dar a volta']]), R('s', 'Variação', 1, 99, 1)],
      px: (d, v, w, h) => {
        const n = Math.round(v.n), gens = [];
        const lerp = (a, b, t) => a + Math.max(0, b - a) * t;
        for (let i = 0; i < n; i++) gens.push([Math.max(1, lerp(v.l0, v.l1, hash01(i, 1, 7, v.s))), lerp(v.a0, v.a1, hash01(i, 2, 7, v.s)), hash01(i, 3, 7, v.s) * TAU, hash01(i, 4, 7, v.s) * TAU]);
        const shape = ph => { if (v.t === 'sine') return Math.sin(ph); const p = (((ph % TAU) + TAU) % TAU) / TAU; return v.t === 'tri' ? 1 - 4 * Math.abs(p - 0.5) : p < 0.5 ? 1 : -1; };
        remap(d, w, h, v.e, (x, y, o) => { let dx = 0, dy = 0; for (const [len, amp, p1, p2] of gens) { dx += amp * shape(TAU * y / len + p1); dy += amp * shape(TAU * x / len + p2); } o[0] = x + dx / n; o[1] = y + dy / n; });
      } },
    ripple: { name: 'Ondulação', group: 'Distorção', fields: [R('a', 'Intensidade %', -999, 999, 100), S('s', 'Tamanho', '16', [['8', 'Pequeno'], ['16', 'Médio'], ['32', 'Grande']])],
      px: (d, v, w, h) => { const len = +v.s, amp = v.a / 100 * len / 8; remap(d, w, h, 'repeat', (x, y, o) => { o[0] = x + amp * Math.sin(TAU * y / len); o[1] = y + amp * Math.sin(TAU * x / len); }); } },
    zigzag: { name: 'Ziguezague', group: 'Distorção', fields: [R('a', 'Intensidade %', -100, 100, 40), R('k', 'Cristas', 1, 20, 5), S('s', 'Estilo', 'pond', [['pond', 'Ondas de lago'], ['out', 'Para fora do centro'], ['around', 'Em volta do centro']])],
      px: (d, v, w, h) => {
        const [cx, cy, rr] = centre(w, h), a = v.a / 100, k = Math.max(0.5, v.k);
        remap(d, w, h, 'repeat', (x, y, o) => {
          const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= rr || r <= 0 || !a) return;
          const rn = r / rr, wv = Math.sin(TAU * k * rn) * (1 - rn);
          const rad = v.s === 'out' ? a * wv * rr / (4 * k) : v.s === 'pond' ? a * wv * rr / (8 * k) : 0;
          const ang = v.s === 'around' ? a * wv * Math.PI / (2 * k) : v.s === 'pond' ? a * wv * Math.PI / (4 * k) : 0;
          const th = Math.atan2(dy, dx) + ang, rs = Math.max(0, r + rad);
          o[0] = cx + rs * Math.cos(th); o[1] = cy + rs * Math.sin(th);
        });
      } },
    polar: { name: 'Coordenadas polares', group: 'Distorção', fields: [S('m', 'Conversão', 'r2p', [['r2p', 'Retangular para polar'], ['p2r', 'Polar para retangular']])],
      px: (d, v, w, h) => {
        const cx = w / 2, cy = h / 2, rmax = Math.min(w, h) / 2;
        remap(d, w, h, 'clear', (x, y, o) => {
          if (v.m === 'r2p') { const dx = x - cx, dy = y - cy, th = ((Math.atan2(dx, -dy) % TAU) + TAU) % TAU; o[0] = th / TAU * w; o[1] = Math.hypot(dx, dy) / rmax * h; }
          else { const th = x / w * TAU, r = y / h * rmax; o[0] = cx + r * Math.sin(th); o[1] = cy - r * Math.cos(th); }
        });
      } },
    shear: { name: 'Inclinar', group: 'Distorção', fields: [R('a', 'Topo %', -100, 100, 30), R('b', 'Meio %', -100, 100, 0), R('c', 'Base %', -100, 100, -30), S('e', 'Áreas vazias', 'wrap', [['wrap', 'Dar a volta'], ['repeat', 'Repetir pixels da borda']])],
      px: (d, v, w, h) => {
        const at = t => { const p0 = v.a / 100, p1 = v.b / 100, p2 = v.c / 100; return (t < 0.5 ? p0 + (p1 - p0) * smooth(0, 0.5, t) : p1 + (p2 - p1) * smooth(0.5, 1, t)) * w / 2; };
        remap(d, w, h, v.e, (x, y, o) => { o[0] = x - at(y / h); });
      } },

    // ---------------- pixelização ----------------
    crystallize: { name: 'Cristalizar', group: 'Pixelização', fields: [R('s', 'Tamanho da célula', 3, 300, 16)],
      px: (d, v, w, h) => {
        const gw = Math.ceil(w / v.s) + 3, gh = Math.ceil(h / v.s) + 3, acc = new Float64Array(gw * gh * 5), id = new Int32Array(w * h);
        voronoi(w, h, v.s, 3, (x, y, gx, gy) => { const c = ((gy + 1) * gw + gx + 1) * 5, i = (y * w + x) * 4, a = d[i + 3]; id[y * w + x] = c; acc[c] += d[i] * a; acc[c + 1] += d[i + 1] * a; acc[c + 2] += d[i + 2] * a; acc[c + 3] += a; acc[c + 4]++; });
        for (let p = 0, i = 0; p < id.length; p++, i += 4) { const c = id[p], a = acc[c + 3]; if (a > 0) { d[i] = acc[c] / a; d[i + 1] = acc[c + 1] / a; d[i + 2] = acc[c + 2] / a; } d[i + 3] = a / acc[c + 4]; }
      } },
    pointillize: { name: 'Pontilhar', group: 'Pixelização', fields: [R('s', 'Tamanho do ponto', 3, 300, 10), K('c', 'Cor do papel', '#ffffff')],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d), bg = PS.hexToRgb(v.c), rad = v.s * 0.46;
        voronoi(w, h, v.s, 5, (x, y, gx, gy, sx, sy, dist) => {
          const i = (y * w + x) * 4, j = (cl(Math.round(sy), h) * w + cl(Math.round(sx), w)) * 4, t = sat(rad - dist + 0.5);
          d[i] = bg.r + (s[j] - bg.r) * t; d[i + 1] = bg.g + (s[j + 1] - bg.g) * t; d[i + 2] = bg.b + (s[j + 2] - bg.b) * t;
        });
      } },
    halftone: { name: 'Meio-tom em cores', group: 'Pixelização', fields: [R('r', 'Raio máx. (px)', 4, 127, 8), R('a1', 'Ângulo canal 1 °', 0, 360, 108), R('a2', 'Ângulo canal 2 °', 0, 360, 162), R('a3', 'Ângulo canal 3 °', 0, 360, 90)],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d), p = v.r * 2, ang = [v.a1, v.a2, v.a3].map(a => a * Math.PI / 180);
        for (let c = 0; c < 3; c++) {
          const sn = Math.sin(ang[c]), cs = Math.cos(ang[c]);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const u = x * cs + y * sn, t = -x * sn + y * cs, gu = Math.floor(u / p), gt = Math.floor(t / p);
            let cov = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
              const cu = (gu + i + 0.5) * p, ct = (gt + j + 0.5) * p, px = cl(Math.round(cu * cs - ct * sn), w), py = cl(Math.round(cu * sn + ct * cs), h);
              const ink = 1 - s[(py * w + px) * 4 + c] / 255, k = sat(p * 0.7071 * Math.sqrt(ink) - Math.hypot(u - cu, t - ct) + 0.5);
              if (k > cov) cov = k;
            }
            d[(y * w + x) * 4 + c] = 255 * (1 - cov);
          }
        }
      } },
    mezzotint: { name: 'Meia-tinta', group: 'Pixelização', fields: [S('t', 'Tipo', 'd1', [['d1', 'Pontos finos'], ['d2', 'Pontos médios'], ['d3', 'Pontos granulados'], ['d5', 'Pontos grossos'], ['l6', 'Linhas curtas'], ['l14', 'Linhas médias'], ['l30', 'Linhas longas']])],
      px: (d, v, w, h) => {
        const n = +v.t.slice(1), line = v.t[0] === 'l';
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) for (let c = 0; c < 3; c++) {
          const t = line ? hash01(Math.floor((x + hash01(y, c, 9, 2) * n) / n), y, c, 2) : hash01(Math.floor(x / n), Math.floor(y / n), c, 2);
          d[i + c] = d[i + c] / 255 > t ? 255 : 0;
        }
      } },
    fragment: { name: 'Fragmentar', group: 'Pixelização', px: (d, v, w, h) => {
      const s = new Uint8ClampedArray(d);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) for (let c = 0; c < 4; c++) d[i + c] = (s[(cl(y - 4, h) * w + cl(x - 4, w)) * 4 + c] + s[(cl(y - 4, h) * w + cl(x + 4, w)) * 4 + c] + s[(cl(y + 4, h) * w + cl(x - 4, w)) * 4 + c] + s[(cl(y + 4, h) * w + cl(x + 4, w)) * 4 + c]) / 4;
    } },
    facet: { name: 'Faceta', group: 'Pixelização', px: (d, v, w, h) => { median(d, w, h, 2); } },

    // ---------------- estilização ----------------
    emboss: { name: 'Entalhe', group: 'Estilização', fields: [R('a', 'Ângulo °', -180, 180, 135), R('h', 'Altura (px)', 1, 100, 3), R('k', 'Intensidade %', 1, 500, 100)],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d), a = v.a * Math.PI / 180, dx = Math.round(Math.cos(a) * v.h), dy = Math.round(-Math.sin(a) * v.h), k = v.k / 100;
        const L = (x, y) => { const j = (cl(y, h) * w + cl(x, w)) * 4; return lum(s[j], s[j + 1], s[j + 2]); };
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) d[i] = d[i + 1] = d[i + 2] = 127.5 + k * (L(x + dx, y + dy) - L(x - dx, y - dy));
      } },
    solarize: { name: 'Solarizar', group: 'Estilização', px: d => lutApply(d, mkLut(i => i < 128 ? i : 255 - i)) },
    diffuse: { name: 'Difusão', group: 'Estilização', fields: [S('m', 'Modo', 'n', [['n', 'Normal'], ['d', 'Só escurecer'], ['l', 'Só clarear']])],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d);
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          const k = Math.floor(hash01(x, y, 0, 4) * 8), n = k >= 4 ? k + 1 : k, j = (cl(y + Math.floor(n / 3) - 1, h) * w + cl(x + n % 3 - 1, w)) * 4;
          const a = lum(s[i], s[i + 1], s[i + 2]), b = lum(s[j], s[j + 1], s[j + 2]);
          if (v.m === 'n' || (v.m === 'd' && b < a) || (v.m === 'l' && b > a)) { d[i] = s[j]; d[i + 1] = s[j + 1]; d[i + 2] = s[j + 2]; }
        }
      } },
    wind: { name: 'Vento', group: 'Estilização', fields: [S('m', 'Método', 'wind', [['wind', 'Vento'], ['blast', 'Rajada'], ['stagger', 'Escalonado']]), S('dir', 'Direção', '1', [['1', 'Da esquerda'], ['-1', 'Da direita']])],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d), dir = +v.dir, max = v.m === 'wind' ? 14 : 40, prob = v.m === 'wind' ? 0.3 : 0.55;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, xn = x + dir; if (xn < 0 || xn >= w) continue;
          const j = (y * w + xn) * 4, a = lum(s[i], s[i + 1], s[i + 2]);
          if (a - lum(s[j], s[j + 1], s[j + 2]) < 18 || hash01(x, y, 0, 6) > prob) continue;
          const len = Math.ceil(hash01(x, y, 1, 6) * max), jump = v.m === 'stagger' ? Math.round(hash01(x, y, 2, 6) * 6) : 0;
          for (let k = 1; k <= len; k++) {
            const xt = x + dir * (k + jump); if (xt < 0 || xt >= w) break;
            const o = (y * w + xt) * 4, t = 1 - k / (len + 1);
            if (lum(d[o], d[o + 1], d[o + 2]) >= a) continue;
            d[o] += (s[i] - d[o]) * t; d[o + 1] += (s[i + 1] - d[o + 1]) * t; d[o + 2] += (s[i + 2] - d[o + 2]) * t;
          }
        }
      } },
    tiles: { name: 'Ladrilhos', group: 'Estilização', fields: [R('n', 'Número de ladrilhos', 1, 99, 10), R('o', 'Deslocamento máx. %', 1, 99, 10), S('f', 'Preencher o vazio com', 'bg', [['bg', 'Cor de fundo'], ['fg', 'Cor frontal'], ['inv', 'Imagem invertida'], ['img', 'Imagem original']])],
      canvas: (c, v) => {
        const w = c.width, h = c.height, n = PS.mk(w, h), x = n.getContext('2d'), ts = Math.max(2, Math.min(w, h) / v.n);
        if (v.f === 'img' || v.f === 'inv') { x.drawImage(c, 0, 0); if (v.f === 'inv') { x.globalCompositeOperation = 'difference'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-in'; x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-over'; } }
        else { x.fillStyle = v.f === 'fg' ? PS.fg : PS.bg; x.fillRect(0, 0, w, h); }
        for (let j = 0; j * ts < h; j++) for (let i = 0; i * ts < w; i++) {
          const ox = (hash01(i, j, 1, 8) - 0.5) * 2 * v.o / 100 * ts, oy = (hash01(i, j, 2, 8) - 0.5) * 2 * v.o / 100 * ts;
          x.drawImage(c, i * ts, j * ts, ts, ts, i * ts + ox, j * ts + oy, ts, ts);
        }
        return n;
      } },
    contour: { name: 'Traçar contorno', group: 'Estilização', fields: [R('l', 'Nível', 0, 255, 128), S('e', 'Aresta', 'u', [['u', 'Superior'], ['l', 'Inferior']])],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d);
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) for (let c = 0; c < 3; c++) {
          const a = s[i + c] >= v.l, r = s[(y * w + cl(x + 1, w)) * 4 + c] >= v.l, b = s[(cl(y + 1, h) * w + x) * 4 + c] >= v.l;
          d[i + c] = (a !== r || a !== b) && a === (v.e === 'u') ? 0 : 255;
        }
      } },
    oilpaint: { name: 'Pintura a óleo', group: 'Estilização', fields: [R('r', 'Tamanho do pincel', 1, 12, 4)],
      px: (d, v, w, h) => { // Kuwahara: de 4 quadrantes em volta do pixel, fica a média do mais uniforme
        const r = Math.round(v.r), W = w + 1, I = [0, 1, 2, 3, 4].map(() => new Float64Array(W * (h + 1)));
        for (let y = 0; y < h; y++) {
          const row = [0, 0, 0, 0, 0];
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, l = lum(d[i], d[i + 1], d[i + 2]), q = [d[i], d[i + 1], d[i + 2], l, l * l], o = (y + 1) * W + x + 1;
            for (let c = 0; c < 5; c++) { row[c] += q[c]; I[c][o] = I[c][o - W] + row[c]; }
          }
        }
        const sum = (T, x0, y0, x1, y1) => T[(y1 + 1) * W + x1 + 1] - T[y0 * W + x1 + 1] - T[(y1 + 1) * W + x0] + T[y0 * W + x0];
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          let best = 1e18, br = 0, bg = 0, bb = 0;
          for (let q = 0; q < 4; q++) {
            const x0 = cl(q & 1 ? x : x - r, w), x1 = cl(q & 1 ? x + r : x, w), y0 = cl(q & 2 ? y : y - r, h), y1 = cl(q & 2 ? y + r : y, h), n = (x1 - x0 + 1) * (y1 - y0 + 1);
            const m = sum(I[3], x0, y0, x1, y1) / n, va = sum(I[4], x0, y0, x1, y1) / n - m * m;
            if (va < best) { best = va; br = sum(I[0], x0, y0, x1, y1) / n; bg = sum(I[1], x0, y0, x1, y1) / n; bb = sum(I[2], x0, y0, x1, y1) / n; }
          }
          d[i] = br; d[i + 1] = bg; d[i + 2] = bb;
        }
      } },
    glowedges: { name: 'Arestas brilhantes', group: 'Estilização', fields: [R('b', 'Brilho', 1, 20, 6), R('s', 'Suavidade', 0, 10, 1, 0.1)],
      px: (d, v, w, h, base) => {
        const s = v.s > 0 ? dataOf(blurred(base, v.s)) : new Uint8ClampedArray(d);
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) for (let c = 0; c < 3; c++) {
          const g = (a, b) => s[(cl(y + b, h) * w + cl(x + a, w)) * 4 + c];
          const gx = g(1, -1) + 2 * g(1, 0) + g(1, 1) - g(-1, -1) - 2 * g(-1, 0) - g(-1, 1), gy = g(-1, 1) + 2 * g(0, 1) + g(1, 1) - g(-1, -1) - 2 * g(0, -1) - g(1, -1);
          d[i + c] = Math.hypot(gx, gy) * v.b / 8;
        }
      } },

    // ---------------- acabamento (render) ----------------
    clouds: { name: 'Nuvens', group: 'Acabamento', px: (d, v, w, h) => {
      const f = PS.hexToRgb(PS.fg), b = PS.hexToRgb(PS.bg);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) { const t = cloud(x, y); d[i] = b.r + (f.r - b.r) * t; d[i + 1] = b.g + (f.g - b.g) * t; d[i + 2] = b.b + (f.b - b.b) * t; d[i + 3] = 255; }
    } },
    diffclouds: { name: 'Nuvens por diferença', group: 'Acabamento', px: (d, v, w, h) => {
      const f = PS.hexToRgb(PS.fg), b = PS.hexToRgb(PS.bg);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) { const t = cloud(x, y); d[i] = Math.abs(d[i] - (b.r + (f.r - b.r) * t)); d[i + 1] = Math.abs(d[i + 1] - (b.g + (f.g - b.g) * t)); d[i + 2] = Math.abs(d[i + 2] - (b.b + (f.b - b.b) * t)); }
    } },
    fibers: { name: 'Fibras', group: 'Acabamento', fields: [R('v', 'Variação', 1, 64, 16), R('s', 'Intensidade', 1, 64, 4)],
      px: (d, v, w, h) => {
        const f = PS.hexToRgb(PS.fg), b = PS.hexToRgb(PS.bg);
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          const t = sat(0.5 + (vnoise(x * 0.5, y / (8 + v.s * 4), SEED.v) - 0.5) * (1 + v.v / 12) + (vnoise(x * 0.9 + 91, y / (2 + v.s), SEED.v) - 0.5) * 0.7);
          d[i] = b.r + (f.r - b.r) * t; d[i + 1] = b.g + (f.g - b.g) * t; d[i + 2] = b.b + (f.b - b.b) * t; d[i + 3] = 255;
        }
      } },
    flare: { name: 'Reflexo de lente', group: 'Acabamento', fields: [R('b', 'Brilho %', 10, 300, 100), R('cx', 'Posição X %', 0, 100, 30), R('cy', 'Posição Y %', 0, 100, 30)],
      px: (d, v, w, h) => {
        const fx = w * v.cx / 100, fy = h * v.cy / 100, D = Math.hypot(w, h), k = v.b / 100, vx = w / 2 - fx, vy = h / 2 - fy;
        const ghosts = [[0.5, 0.035, [255, 150, 90], 0.35], [1.25, 0.06, [110, 180, 255], 0.22], [1.6, 0.02, [255, 240, 170], 0.4], [2.05, 0.09, [140, 255, 170], 0.14]];
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          const r = Math.hypot(x - fx, y - fy) / D;
          let cr = 255 * Math.exp(-r * r / 0.0009) + 150 * Math.exp(-r * r / 0.012), cg = cr * 0.94, cb = cr * 0.82;
          const ring = Math.exp(-Math.pow((r - 0.21) / 0.012, 2)) * 46; cr += ring; cg += ring * 0.6; cb += ring * 0.45;
          for (const [t, rad, col, a] of ghosts) { const q = Math.hypot(x - (fx + vx * t), y - (fy + vy * t)) / D; if (q < rad) { const m = a * smooth(rad, rad * 0.6, q); cr += col[0] * m; cg += col[1] * m; cb += col[2] * m; } }
          d[i] += cr * k; d[i + 1] += cg * k; d[i + 2] += cb * k;
        }
      } },
    vignette: { name: 'Vinheta', group: 'Acabamento', fields: [R('a', 'Intensidade', -100, 100, -50), R('m', 'Ponto médio', 0, 100, 50), R('f', 'Difusão', 1, 100, 50)],
      px: (d, v, w, h) => {
        const cx = w / 2, cy = h / 2, a = v.a / 100, m = v.m / 100, f = v.f / 100;
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          const t = smooth(m * (1 - f), m + f * (1.42 - m) + 0.001, Math.hypot((x - cx) / cx, (y - cy) / cy)), k = a < 0 ? 1 + a * t : 1;
          for (let c = 0; c < 3; c++) d[i + c] = a < 0 ? d[i + c] * k : d[i + c] + (255 - d[i + c]) * a * t;
        }
      } },

    // ---------------- outros ----------------
    highpass: { name: 'Alta frequência', group: 'Outros', fields: [R('r', 'Raio (px)', 0.1, 250, 10, 0.1)],
      px: (d, v, w, h, base) => { const b = dataOf(blurred(base, v.r)); for (let i = 0; i < d.length; i += 4) { d[i] = d[i] - b[i] + 128; d[i + 1] = d[i + 1] - b[i + 1] + 128; d[i + 2] = d[i + 2] - b[i + 2] + 128; } } },
    maximum: { name: 'Máximo', group: 'Outros', fields: [R('r', 'Raio (px)', 1, 100, 2)], canvas: (c, v) => extreme(c, Math.round(v.r), 'lighten') },
    minimum: { name: 'Mínimo', group: 'Outros', fields: [R('r', 'Raio (px)', 1, 100, 2)], canvas: (c, v) => extreme(c, Math.round(v.r), 'darken') },
    offset: { name: 'Deslocamento', group: 'Outros', fields: [R('x', 'Horizontal (px)', -4000, 4000, 100), R('y', 'Vertical (px)', -4000, 4000, 100), S('e', 'Áreas vazias', 'wrap', [['wrap', 'Dar a volta'], ['repeat', 'Repetir pixels da borda'], ['clear', 'Transparente']])],
      px: (d, v, w, h) => {
        const s = new Uint8ClampedArray(d), dx = Math.round(v.x), dy = Math.round(v.y);
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
          let sx = x - dx, sy = y - dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
            if (v.e === 'clear') { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
            if (v.e === 'wrap') { sx = ((sx % w) + w) % w; sy = ((sy % h) + h) % h; } else { sx = cl(sx, w); sy = cl(sy, h); }
          }
          const j = (sy * w + sx) * 4; d[i] = s[j]; d[i + 1] = s[j + 1]; d[i + 2] = s[j + 2]; d[i + 3] = s[j + 3];
        }
      } },
    color2alpha: { name: 'Cor para transparência', group: 'Outros', fields: [K('c', 'Cor que some', '#ffffff')],
      px: (d, v) => {
        const k = PS.hexToRgb(v.c), col = [k.r, k.g, k.b];
        for (let i = 0; i < d.length; i += 4) {
          let a = 0;
          for (let c = 0; c < 3; c++) { const p = d[i + c], q = col[c], t = p > q ? (p - q) / (255 - q || 1) : p < q ? (q - p) / (q || 1) : 0; if (t > a) a = t; }
          if (a > 0) for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - col[c]) / a + col[c];
          d[i + 3] *= a;
        }
      } },

    // ---------------- ajustes (Imagem › Ajustes) ----------------
    bw: { name: 'Preto e branco', group: 'Ajuste', fields: [R('r', 'Vermelhos', -200, 300, 40), R('y', 'Amarelos', -200, 300, 60), R('g', 'Verdes', -200, 300, 40), R('c', 'Cianos', -200, 300, 60), R('b', 'Azuis', -200, 300, 20), R('m', 'Magentas', -200, 300, 80), C('t', 'Tingir', false), K('tc', 'Cor do tom', '#e1d3b3')],
      px: (d, v) => {
        PS.adjustFn({ type: 'black & white', reds: v.r, yellows: v.y, greens: v.g, cyans: v.c, blues: v.b, magentas: v.m })(d);
        if (!v.t) return;
        const k = PS.hexToRgb(v.tc), l = Math.max(1, lum(k.r, k.g, k.b));
        for (let i = 0; i < d.length; i += 4) { const g = d[i]; d[i] = g * k.r / l; d[i + 1] = g * k.g / l; d[i + 2] = g * k.b / l; }
      } },
    photofilter: { name: 'Filtro de fotos', group: 'Ajuste', fields: [K('c', 'Cor', '#ec8a00'), R('d', 'Densidade %', 1, 100, 25), C('p', 'Preservar luminosidade', true)],
      px: (d, v) => PS.adjustFn({ type: 'photo filter', color: PS.hexToRgb(v.c), density: v.d / 100, preserveLuminosity: v.p })(d) },
    chanmix: { name: 'Misturador de canais', group: 'Ajuste', fields: [
      { type: 'head', label: 'Saída: vermelho' }, R('rr', 'Vermelho %', -200, 200, 100), R('rg', 'Verde %', -200, 200, 0), R('rb', 'Azul %', -200, 200, 0),
      { type: 'head', label: 'Saída: verde' }, R('gr', 'Vermelho %', -200, 200, 0), R('gg', 'Verde %', -200, 200, 100), R('gb', 'Azul %', -200, 200, 0),
      { type: 'head', label: 'Saída: azul' }, R('br', 'Vermelho %', -200, 200, 0), R('bg', 'Verde %', -200, 200, 0), R('bb', 'Azul %', -200, 200, 100), C('m', 'Monocromático (usa a saída vermelha)', false)],
      px: (d, v) => PS.adjustFn(mixer(v))(d) },
    gradmap: { name: 'Mapa de degradê', group: 'Ajuste', fields: [K('a', 'Sombras', '#1b0a3c'), K('m', 'Meios-tons', '#c2336b'), K('b', 'Realces', '#ffd28a'), C('u', 'Usar o meio-tom', true), C('r', 'Inverter', false)],
      px: (d, v) => {
        const a = PS.hexToRgb(v.a), m = PS.hexToRgb(v.m), b = PS.hexToRgb(v.b), L = [[], [], []];
        for (let i = 0; i < 256; i++) {
          const t = (v.r ? 255 - i : i) / 255, p = v.u ? (t < 0.5 ? [a, m, t * 2] : [m, b, t * 2 - 1]) : [a, b, t];
          L[0][i] = p[0].r + (p[1].r - p[0].r) * p[2]; L[1][i] = p[0].g + (p[1].g - p[0].g) * p[2]; L[2][i] = p[0].b + (p[1].b - p[0].b) * p[2];
        }
        for (let i = 0; i < d.length; i += 4) { const g = Math.round(lum(d[i], d[i + 1], d[i + 2])); d[i] = L[0][g]; d[i + 1] = L[1][g]; d[i + 2] = L[2][g]; }
      } },
    selcolor: { name: 'Cor seletiva', group: 'Ajuste', fields: [S('t', 'Cores', 'reds', [['reds', 'Vermelhos'], ['yellows', 'Amarelos'], ['greens', 'Verdes'], ['cyans', 'Cianos'], ['blues', 'Azuis'], ['magentas', 'Magentas'], ['whites', 'Brancos'], ['neutrals', 'Neutros'], ['blacks', 'Pretos']]),
      R('c', 'Ciano %', -100, 100, 0), R('m', 'Magenta %', -100, 100, 0), R('y', 'Amarelo %', -100, 100, 0), R('k', 'Preto %', -100, 100, 0), C('rel', 'Relativo', true)],
      px: (d, v) => {
        const ink = [v.c / 100, v.m / 100, v.y / 100], k = v.k / 100;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), md = r + g + b - mx - mn;
          let wt = 0;
          switch (v.t) {
            case 'reds': wt = mx === r ? mx - md : 0; break; case 'greens': wt = mx === g ? mx - md : 0; break; case 'blues': wt = mx === b ? mx - md : 0; break;
            case 'cyans': wt = mn === r ? md - mn : 0; break; case 'magentas': wt = mn === g ? md - mn : 0; break; case 'yellows': wt = mn === b ? md - mn : 0; break;
            case 'whites': wt = mn > 0.5 ? (mn - 0.5) * 2 : 0; break; case 'blacks': wt = mx < 0.5 ? (0.5 - mx) * 2 : 0; break;
            default: wt = 1 - (Math.abs(mx - 0.5) + Math.abs(mn - 0.5));
          }
          if (wt <= 0) continue;
          for (let c = 0; c < 3; c++) {
            const val = d[i + c] / 255; let res = (-1 - ink[c]) * k - ink[c];
            if (v.rel) res *= 1 - val;
            d[i + c] = (val + Math.min(1 - val, Math.max(-val, res)) * wt) * 255;
          }
        }
      } },
    shadowhl: { name: 'Sombras/Realces', group: 'Ajuste', fields: [
      { type: 'head', label: 'Sombras' }, R('sa', 'Intensidade %', 0, 100, 35), R('st', 'Tom %', 1, 100, 50), R('sr', 'Raio (px)', 1, 250, 30),
      { type: 'head', label: 'Realces' }, R('ha', 'Intensidade %', 0, 100, 0), R('ht', 'Tom %', 1, 100, 50), R('hr', 'Raio (px)', 1, 250, 30),
      { type: 'head', label: 'Ajustes' }, R('c', 'Cor', -100, 100, 20), R('m', 'Contraste dos meios-tons', -100, 100, 0)],
      px: (d, v, w, h, base) => { // contas do PhotoCraft (tone.rs): máscara de luminância desfocada escolhe sombras e realces
        const bs = dataOf(blurred(base, v.sr)), bh = v.hr === v.sr ? bs : dataOf(blurred(base, v.hr));
        const sa = v.sa / 100, ha = v.ha / 100, st = Math.max(0.01, v.st / 100), ht = Math.max(0.01, v.ht / 100), col = v.c / 100, mid = v.m / 100;
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const ms = 1 - smooth(0, st, lum(bs[i], bs[i + 1], bs[i + 2]) / 255), mh = smooth(1 - ht, 1, lum(bh[i], bh[i + 1], bh[i + 2]) / 255);
          const o = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
          if (sa > 0 && ms > 0) { const g = 1 / (1 + 2 * sa * ms); for (let c = 0; c < 3; c++) o[c] = Math.pow(o[c], g); }
          if (ha > 0 && mh > 0) { const g = 1 / (1 + 2 * ha * mh); for (let c = 0; c < 3; c++) o[c] = 1 - Math.pow(1 - o[c], g); }
          if (mid) { const k = 1 + mid * sat(1 - ms - mh); for (let c = 0; c < 3; c++) o[c] = (o[c] - 0.5) * k + 0.5; }
          const ch = Math.min(1, ms * sa + mh * ha);
          if (col && ch > 0) { const l1 = lum(o[0], o[1], o[2]), s = 1 + col * ch; for (let c = 0; c < 3; c++) o[c] = l1 + (o[c] - l1) * s; }
          d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255;
        }
      } },
    replacecolor: { name: 'Substituir cor', group: 'Ajuste', fields: [K('c', 'Cor a trocar', '#ff0000'), R('f', 'Tolerância', 1, 200, 40), R('h', 'Matiz', -180, 180, 0), R('s', 'Saturação', -100, 100, 0), R('l', 'Luminosidade', -100, 100, 0)],
      px: (d, v) => {
        const k = PS.hexToRgb(v.c), t = new Uint8ClampedArray(d);
        F.huesat.px(t, { h: v.h, s: v.s, l: v.l });
        for (let i = 0; i < d.length; i += 4) {
          const wt = 1 - smooth(v.f * 0.5, v.f * 1.5, Math.hypot(d[i] - k.r, d[i + 1] - k.g, d[i + 2] - k.b) / 1.732);
          if (wt > 0) { d[i] += (t[i] - d[i]) * wt; d[i + 1] += (t[i + 1] - d[i + 1]) * wt; d[i + 2] += (t[i + 2] - d[i + 2]) * wt; }
        }
      } },
    autocontrast: { name: 'Contraste automático', group: 'Ajuste', px: d => {
      const hist = new Uint32Array(256); let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { hist[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; n++; }
      const r = clipRange(hist, n); if (r) lutApply(d, mkLut(i => (i - r[0]) * 255 / (r[1] - r[0])));
    } },
    autocolor: { name: 'Cor automática', group: 'Ajuste', px: d => {
      const avg = [0, 0, 0]; let n = 0;
      F.autotone.px(d);
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const l = lum(d[i], d[i + 1], d[i + 2]); if (l > 64 && l < 192) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; n++; } }
      if (!n) return;
      const m = (avg[0] + avg[1] + avg[2]) / 3 / n;
      for (let c = 0; c < 3; c++) { const a = avg[c] / n; if (a < 2 || a > 253) continue; const g = Math.log(m / 255) / Math.log(a / 255), l = mkLut(i => 255 * Math.pow(i / 255, g)); for (let i = 0; i < d.length; i += 4) d[i + c] = l[d[i + c]]; }
    } },
    equalize: { name: 'Equalizar', group: 'Ajuste', px: d => {
      const hist = new Uint32Array(256); let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { hist[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; n++; }
      if (!n) return;
      const cdf = new Float64Array(256); let a = 0, lo = -1;
      for (let i = 0; i < 256; i++) { a += hist[i]; cdf[i] = a; if (lo < 0 && a > 0) lo = a; }
      lutApply(d, mkLut(i => n === lo ? i : (cdf[i] - lo) * 255 / (n - lo)));
    } },
  };
  function cloud(x, y) {
    let t = 0, amp = 0.5, f = 1 / 128;
    for (let o = 0; o < 6; o++) { t += vnoise(x * f, y * f, SEED.v + o) * amp; amp *= 0.5; f *= 2; }
    return sat((t - 0.5) * 1.9 + 0.5);
  }
  function clipRange(hist, n) {
    if (!n) return null;
    const cut = n * 0.005; let lo = 0, hi = 255, a = 0;
    while (lo < 255 && (a += hist[lo]) < cut) lo++;
    a = 0; while (hi > 0 && (a += hist[hi]) < cut) hi--;
    return hi > lo ? [lo, hi] : null;
  }
  function mixer(v) {
    const row = (r, g, b) => ({ red: r, green: g, blue: b, constant: 0 });
    return { type: 'channel mixer', monochrome: !!v.m, red: row(v.rr, v.rg, v.rb), green: row(v.gr, v.gg, v.gb), blue: row(v.br, v.bg, v.bb), gray: row(v.rr, v.rg, v.rb) };
  }
  Object.assign(F, NEW);
  PS.CRAFT = Object.keys(NEW);
  // Filtros de acabamento sorteiam um padrão novo a cada uso (e o mesmo durante a prévia).
  const run = PS.runFilter;
  PS.runFilter = key => { if (key === 'clouds' || key === 'diffclouds' || key === 'fibers') reseed(); return run(key); };

  // ---------------- camadas de ajuste novas ----------------
  Object.assign(PS.ADJ, {
    'photo filter': { name: 'Filtro de fotos', fields: NEW.photofilter.fields,
      to: v => ({ type: 'photo filter', color: PS.hexToRgb(v.c), density: v.d / 100, preserveLuminosity: v.p }),
      from: a => ({ c: a.color && 'r' in a.color ? PS.rgbToHex(a.color.r, a.color.g, a.color.b) : '#ec8a00', d: Math.round((a.density > 1 ? a.density / 100 : (a.density ?? 0.25)) * 100), p: a.preserveLuminosity !== false }) },
    'channel mixer': { name: 'Misturador de canais', fields: NEW.chanmix.fields, to: mixer,
      from: a => { const g = (c, d) => c ? [c.red, c.green, c.blue] : d, r = g(a.monochrome ? a.gray : a.red, [100, 0, 0]), gg = g(a.green, [0, 100, 0]), b = g(a.blue, [0, 0, 100]); return { rr: r[0], rg: r[1], rb: r[2], gr: gg[0], gg: gg[1], gb: gg[2], br: b[0], bg: b[1], bb: b[2], m: !!a.monochrome }; } },
  });
})();
