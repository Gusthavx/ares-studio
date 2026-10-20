'use strict';
// Ajustes de imagem e filtros (aplicados na camada ativa, respeitando a seleção, com prévia ao vivo).
(function () {
  const PS = window.PS;
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const lutApply = (d, lut) => { for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; } };
  const mkLut = f => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = f(i); return l; };

  // Curva suave passando pelos pontos [{x,y}] (0..255) -> tabela de 256 valores.
  PS.curveLUT = pts => {
    const p = pts.slice().sort((a, b) => a.x - b.x), n = p.length, m = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { // inclinações monotônicas (Fritsch-Carlson simplificado)
      const a = i > 0 ? (p[i].y - p[i - 1].y) / Math.max(1, p[i].x - p[i - 1].x) : null;
      const b = i < n - 1 ? (p[i + 1].y - p[i].y) / Math.max(1, p[i + 1].x - p[i].x) : null;
      m[i] = a == null ? b : b == null ? a : a * b <= 0 ? 0 : (a + b) / 2;
    }
    return mkLut(v => {
      if (v <= p[0].x) return p[0].y;
      if (v >= p[n - 1].x) return p[n - 1].y;
      let i = 0; while (v > p[i + 1].x) i++;
      const h = p[i + 1].x - p[i].x, t = (v - p[i].x) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p[i].y + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1].y + (t3 - t2) * h * m[i + 1];
    });
  };
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
    const h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    return [h / 6, s, l];
  }
  const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  function conv(d, w, h, k, bias) {
    const s = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let a = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + j)), xx = Math.min(w - 1, Math.max(0, x + i));
          a += s[(yy * w + xx) * 4 + c] * k[(j + 1) * 3 + i + 1];
        }
        d[o + c] = a + bias;
      }
    }
  }
  const blurred = (c, r) => { const n = PS.mk(c.width, c.height), x = n.getContext('2d'); x.filter = `blur(${r}px)`; x.drawImage(c, 0, 0); return n; };

  const R = (k, label, min, max, val, step = 1) => ({ k, label, type: 'range', min, max, val, step });
  // px(dados, valores, w, h) altera os pixels; canvas(base, valores) devolve um canvas novo.
  PS.FILTERS = {
    brightness: { name: 'Brilho/Contraste', fields: [R('b', 'Brilho', -150, 150, 0), R('c', 'Contraste', -100, 100, 0)],
      px: (d, v) => { const c = v.c * 2.55, f = (259 * (c + 255)) / (255 * (259 - c)); lutApply(d, mkLut(i => f * (i - 128) + 128 + v.b)); } },
    levels: { name: 'Níveis', fields: [R('ib', 'Entrada: preto', 0, 253, 0), R('g', 'Entrada: gama', 0.1, 5, 1, 0.01), R('iw', 'Entrada: branco', 2, 255, 255), R('ob', 'Saída: preto', 0, 255, 0), R('ow', 'Saída: branco', 0, 255, 255)],
      px: (d, v) => { const iw = Math.max(v.ib + 1, v.iw); lutApply(d, mkLut(i => v.ob + Math.pow(Math.min(1, Math.max(0, (i - v.ib) / (iw - v.ib))), 1 / v.g) * (v.ow - v.ob))); } },
    curves: { name: 'Curvas', fields: [{ k: 'pts', label: 'Curva', type: 'curve', val: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }],
      px: (d, v) => lutApply(d, PS.curveLUT(v.pts)) },
    exposure: { name: 'Exposição', fields: [R('e', 'Exposição', -3, 3, 0, 0.01), R('g', 'Gama', 0.2, 3, 1, 0.01)],
      px: (d, v) => { const m = Math.pow(2, v.e); lutApply(d, mkLut(i => 255 * Math.pow(Math.min(1, i / 255 * m), 1 / v.g))); } },
    huesat: { name: 'Matiz/Saturação', fields: [R('h', 'Matiz', -180, 180, 0), R('s', 'Saturação', -100, 100, 0), R('l', 'Luminosidade', -100, 100, 0)],
      px: (d, v) => {
        const dh = v.h / 360, ds = v.s / 100, dl = v.l / 100;
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          let [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
          h = (h + dh + 1) % 1; s = Math.min(1, Math.max(0, ds >= 0 ? s + (1 - s) * ds * (s > 0 ? 1 : 0) : s * (1 + ds)));
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
          let r = hue(p, q, h + 1 / 3), g = hue(p, q, h), b = hue(p, q, h - 1 / 3);
          if (dl > 0) { r += (1 - r) * dl; g += (1 - g) * dl; b += (1 - b) * dl; } else { r *= 1 + dl; g *= 1 + dl; b *= 1 + dl; }
          d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
        }
      } },
    balance: { name: 'Equilíbrio de cores', fields: [R('r', 'Ciano ↔ Vermelho', -100, 100, 0), R('g', 'Magenta ↔ Verde', -100, 100, 0), R('b', 'Amarelo ↔ Azul', -100, 100, 0)],
      px: (d, v) => {
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 - 128) / 128, k = (1 - l * l) * 0.7;
          d[i] += v.r * k; d[i + 1] += v.g * k; d[i + 2] += v.b * k;
        }
      } },
    vibrance: { name: 'Vibratilidade', fields: [R('v', 'Vibratilidade', -100, 100, 0)],
      px: (d, v) => {
        const a = v.v / 100;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), avg = (d[i] + d[i + 1] + d[i + 2]) / 3, k = a * (1 - (mx - avg) / 128) * 1.2;
          d[i] += (d[i] - avg) * k; d[i + 1] += (d[i + 1] - avg) * k; d[i + 2] += (d[i + 2] - avg) * k;
        }
      } },
    autotone: { name: 'Tom automático',
      px: d => {
        for (let c = 0; c < 3; c++) {
          const hist = new Uint32Array(256); let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { hist[d[i + c]]++; n++; }
          if (!n) return;
          const cut = n * 0.005; let lo = 0, hi = 255, a = 0;
          while (lo < 255 && (a += hist[lo]) < cut) lo++;
          a = 0; while (hi > 0 && (a += hist[hi]) < cut) hi--;
          if (hi <= lo) continue;
          const lut = mkLut(i => (i - lo) * 255 / (hi - lo));
          for (let i = 0; i < d.length; i += 4) d[i + c] = lut[d[i + c]];
        }
      } },
    invert: { name: 'Inverter', px: d => lutApply(d, mkLut(i => 255 - i)) },
    desaturate: { name: 'Remover saturação', px: d => { for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; } },
    sepia: { name: 'Sépia', px: d => { for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; d[i] = r * 0.393 + g * 0.769 + b * 0.189; d[i + 1] = r * 0.349 + g * 0.686 + b * 0.168; d[i + 2] = r * 0.272 + g * 0.534 + b * 0.131; } } },
    threshold: { name: 'Limiar', fields: [R('t', 'Nível', 1, 255, 128)],
      px: (d, v) => { for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 >= v.t ? 255 : 0; } },
    posterize: { name: 'Posterizar', fields: [R('n', 'Níveis', 2, 32, 4)],
      px: (d, v) => lutApply(d, mkLut(i => Math.round(Math.floor(i * v.n / 256) * 255 / (v.n - 1)))) },
    blur: { name: 'Desfoque gaussiano', fields: [R('r', 'Raio (px)', 0.1, 100, 4, 0.1)], canvas: (c, v) => blurred(c, v.r) },
    sharpen: { name: 'Máscara de nitidez', fields: [R('a', 'Intensidade (%)', 1, 400, 80), R('r', 'Raio (px)', 0.2, 20, 1.5, 0.1)],
      px: (d, v, w, h, base) => {
        const b = blurred(base, v.r).getContext('2d').getImageData(0, 0, w, h).data, a = v.a / 100;
        for (let i = 0; i < d.length; i += 4) { d[i] += (d[i] - b[i]) * a; d[i + 1] += (d[i + 1] - b[i + 1]) * a; d[i + 2] += (d[i + 2] - b[i + 2]) * a; }
      } },
    noise: { name: 'Adicionar ruído', fields: [R('a', 'Quantidade', 1, 100, 12), { k: 'm', label: 'Monocromático', type: 'check', val: true }],
      px: (d, v) => {
        const a = v.a * 2.55;
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const n = (Math.random() - 0.5) * a;
          d[i] += n; d[i + 1] += v.m ? n : (Math.random() - 0.5) * a; d[i + 2] += v.m ? n : (Math.random() - 0.5) * a;
        }
      } },
    mosaic: { name: 'Mosaico', fields: [R('s', 'Tamanho do bloco', 2, 200, 12)],
      canvas: (c, v) => {
        const sw = Math.max(1, Math.round(c.width / v.s)), sh = Math.max(1, Math.round(c.height / v.s));
        const t = PS.mk(sw, sh); t.getContext('2d').drawImage(c, 0, 0, sw, sh);
        const n = PS.mk(c.width, c.height), x = n.getContext('2d');
        x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, c.width, c.height);
        return n;
      } },
    emboss: { name: 'Entalhe', px: (d, v, w, h) => conv(d, w, h, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 0) },
    edges: { name: 'Localizar arestas', px: (d, v, w, h) => { conv(d, w, h, [-1, -1, -1, -1, 8, -1, -1, -1, -1], 0); lutApply(d, mkLut(i => 255 - i)); } },
  };

  PS.runFilter = key => {
    const def = PS.FILTERS[key], d = PS.doc, L = PS.paintTarget();
    if (!L) return;
    if (!L.canvas) { PS.toast('A camada está vazia.'); return; }
    const base = PS.clone(L.canvas), w = base.width, h = base.height;
    const baseData = def.px ? base.getContext('2d').getImageData(0, 0, w, h) : null;
    const apply = v => {
      let res;
      if (def.canvas) res = def.canvas(base, v);
      else {
        const im = new ImageData(new Uint8ClampedArray(baseData.data), w, h);
        def.px(im.data, v, w, h, base);
        res = PS.mk(w, h); res.getContext('2d').putImageData(im, 0, 0);
      }
      const x = L.canvas.getContext('2d');
      x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
      if (d.sel) {
        const rx = res.getContext('2d');
        rx.globalCompositeOperation = 'destination-in'; rx.drawImage(d.sel, -L.x, -L.y);
        x.drawImage(base, 0, 0);
        x.globalCompositeOperation = 'destination-out'; x.drawImage(d.sel, -L.x, -L.y);
        x.globalCompositeOperation = 'source-over';
      }
      x.drawImage(res, 0, 0);
      d.compDirty = true; PS.render();
    };
    const done = () => { PS.touch(L); PS.commit(def.name); };
    if (!def.fields) { apply({}); done(); return; }
    let pend = null, busy = false, closed = false;
    const preview = v => { pend = v; if (busy) return; busy = true; requestAnimationFrame(() => { busy = false; if (!closed) apply(pend); }); };
    PS.dialog({
      title: def.name, fields: def.fields, side: true,
      onChange: preview,
      onOk: v => { closed = true; apply(v); done(); },
      onCancel: () => { closed = true; const x = L.canvas.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h); x.drawImage(base, 0, 0); d.compDirty = true; PS.render(); },
    });
    preview(Object.fromEntries(def.fields.map(f => [f.k, f.val])));
  };
})();
