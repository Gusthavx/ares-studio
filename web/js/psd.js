'use strict';
// Arquivos: abrir/salvar PSD (ag-psd), abrir e exportar PNG/JPG/WebP, ponte com o app de mesa.
(function () {
  const PS = window.PS;
  const qs = new URLSearchParams(location.search), TOKEN = qs.get('t') || '';
  const io = PS.io = { native: () => !!(window.pywebview && window.pywebview.api && TOKEN) };
  const base = p => p.split(/[\\/]/).pop();
  const stem = n => n.replace(/\.[^.]+$/, '');

  // ---------- PSD -> documento ----------
  function maskToAlpha(m, w, h) {
    const c = PS.mk(w, h), x = c.getContext('2d'), def = m.defaultColor ?? 0;
    if (def) { x.fillStyle = `rgba(255,255,255,${def / 255})`; x.fillRect(0, 0, w, h); }
    const mw = m.canvas.width, mh = m.canvas.height;
    const src = m.canvas.getContext('2d').getImageData(0, 0, mw, mh), s = src.data;
    for (let i = 0; i < s.length; i += 4) { s[i + 3] = s[i]; s[i] = s[i + 1] = s[i + 2] = 255; }
    const t = PS.mk(mw, mh); t.getContext('2d').putImageData(src, 0, 0);
    x.clearRect(m.left || 0, m.top || 0, mw, mh);
    x.drawImage(t, m.left || 0, m.top || 0);
    return c;
  }
  function alphaToGray(c) {
    const n = PS.mk(c.width, c.height), x = n.getContext('2d');
    const im = c.getContext('2d').getImageData(0, 0, c.width, c.height), s = im.data;
    for (let i = 0; i < s.length; i += 4) { s[i] = s[i + 1] = s[i + 2] = s[i + 3]; s[i + 3] = 255; }
    x.putImageData(im, 0, 0);
    return n;
  }
  function fromPsd(l, w, h) {
    const src = Object.assign({}, l);
    delete src.canvas; delete src.children; delete src.imageData; delete src.mask;
    const n = PS.mkLayer({
      name: l.name || 'Camada', visible: !l.hidden, opacity: l.opacity ?? 1, blend: l.blendMode || 'normal',
      clipping: !!l.clipping, lockAlpha: !!l.transparencyProtected, x: l.left || 0, y: l.top || 0, ox: l.left || 0, oy: l.top || 0,
      canvas: l.canvas || null, src,
    });
    if (l.children) { n.type = 'group'; n.children = l.children.map(c => fromPsd(c, w, h)); n.open = l.opened !== false; n.canvas = null; }
    else if (l.adjustment) { n.type = 'adjust'; n.adj = l.adjustment; }
    else if (l.text) n.type = 'text';
    if (l.mask && l.mask.canvas) {
      const meta = Object.assign({}, l.mask); delete meta.canvas; delete meta.imageData;
      n.mask = { canvas: maskToAlpha(l.mask, w, h), enabled: !l.mask.disabled, def: l.mask.defaultColor ?? 0, rev: PS.nextRev(), meta };
    } else if (l.mask) src.mask = l.mask;
    return n;
  }
  io.openPsd = (buf, name, path) => {
    const psd = agPsd.readPsd(buf, { skipThumbnail: true });
    const extra = Object.assign({}, psd);
    ['children', 'canvas', 'imageData', 'width', 'height', 'channels', 'bitsPerChannel', 'colorMode'].forEach(k => delete extra[k]);
    let layers = (psd.children || []).map(c => fromPsd(c, psd.width, psd.height));
    if (!layers.length && psd.canvas) layers = [PS.mkLayer({ name: 'Plano de fundo', canvas: psd.canvas })];
    const d = PS.newDoc({ name, path, w: psd.width, h: psd.height, layers, extra, first: 'Abrir' });
    const gg = psd.imageResources && psd.imageResources.gridAndGuidesInformation;
    d.guides = ((gg && gg.guides) || []).map(g => ({ o: g.direction === 'horizontal' ? 'h' : 'v', p: Math.round(g.location) }));
    const notes = [];
    if (psd.bitsPerChannel && psd.bitsPerChannel !== 8) notes.push(`${psd.bitsPerChannel} bits por canal (aqui trabalha em 8)`);
    const semPrevia = PS.flat(d.layers).filter(l => l.type === 'adjust' && !PS.adjustFn(l.adj)).map(l => l.name);
    if (semPrevia.length) notes.push(`ajustes sem prévia (ficam guardados no arquivo): ${semPrevia.join(', ')}`);
    if (notes.length) PS.toast('Aviso: ' + notes.join('; ') + '.');
    return d;
  };

  // ---------- documento -> PSD ----------
  const PSFONT = { 'Arial': 'ArialMT', 'Arial Black': 'Arial-Black', 'Times New Roman': 'TimesNewRomanPSMT', 'Courier New': 'CourierNewPSMT', 'Comic Sans MS': 'ComicSansMS', 'Trebuchet MS': 'TrebuchetMS', 'Segoe UI': 'SegoeUI', 'Segoe Print': 'SegoePrint', 'Segoe Script': 'SegoeScript' };
  function shiftSrc(s, dx, dy) {
    try {
      if (s.text && s.text.transform) { s.text = Object.assign({}, s.text, { transform: s.text.transform.slice() }); s.text.transform[4] += dx; s.text.transform[5] += dy; }
      if (s.placedLayer && s.placedLayer.transform) {
        s.placedLayer = Object.assign({}, s.placedLayer, { transform: s.placedLayer.transform.map((v, i) => v + (i % 2 ? dy : dx)) });
        if (s.placedLayer.nonAffineTransform) s.placedLayer.nonAffineTransform = s.placedLayer.nonAffineTransform.map((v, i) => v + (i % 2 ? dy : dx));
      }
      if (s.vectorMask && s.vectorMask.paths) {
        s.vectorMask = Object.assign({}, s.vectorMask, {
          paths: s.vectorMask.paths.map(p => Object.assign({}, p, { knots: (p.knots || []).map(k => Object.assign({}, k, { points: k.points.map((v, i) => v + (i % 2 ? dy : dx)) })) })),
        });
      }
      const list = s.vectorOrigination && s.vectorOrigination.keyDescriptorList;
      if (list) {
        s.vectorOrigination = {
          keyDescriptorList: list.map(k => {
            const bb = k.keyOriginShapeBoundingBox; if (!bb) return k;
            const mv = (u, d) => u && typeof u.value === 'number' ? Object.assign({}, u, { value: u.value + d }) : u;
            return Object.assign({}, k, { keyOriginShapeBoundingBox: Object.assign({}, bb, { top: mv(bb.top, dy), bottom: mv(bb.bottom, dy), left: mv(bb.left, dx), right: mv(bb.right, dx) }) });
          }),
        };
      }
    } catch (e) { /* estrutura inesperada: deixa como veio */ }
  }
  function toPsd(n, d, flags) {
    const s = n.src ? Object.assign({}, n.src) : {};
    delete s.right; delete s.bottom;
    if (n.stale || n.text) ['text', 'placedLayer', 'vectorMask', 'vectorFill', 'vectorStroke', 'vectorOrigination'].forEach(k => delete s[k]);
    else if (n.src && (n.x !== n.ox || n.y !== n.oy)) shiftSrc(s, n.x - n.ox, n.y - n.oy);
    Object.assign(s, {
      name: n.name, hidden: !n.visible, opacity: n.opacity, blendMode: n.blend, clipping: !!n.clipping,
      transparencyProtected: !!n.lockAlpha, left: n.x, top: n.y,
    });
    if (n.type === 'group') { s.children = n.children.map(c => toPsd(c, d, flags)); s.opened = n.open; delete s.left; delete s.top; }
    else if (n.canvas) s.canvas = n.canvas;
    if (n.type === 'adjust' && n.adj) s.adjustment = n.adj;
    if (n.text) {
      const t = n.text;
      flags.text = true;
      s.text = {
        text: t.value.replace(/\n/g, '\r'), transform: [1, 0, 0, 1, t.ax, t.ay + (t.asc || t.size)], antiAlias: 'smooth',
        style: { font: { name: PSFONT[t.font] || t.font.replace(/\s+/g, '') }, fontSize: t.size, fillColor: PS.hexToRgb(t.color), fauxBold: !!t.bold, fauxItalic: !!t.italic },
        paragraphStyle: { justification: t.align },
      };
    }
    if (n.mask) {
      s.mask = Object.assign({}, n.mask.meta || {}, {
        left: 0, top: 0, right: d.w, bottom: d.h, defaultColor: n.mask.def, disabled: !n.mask.enabled,
        positionRelativeToLayer: false, canvas: alphaToGray(n.mask.canvas),
      });
    }
    return s;
  }
  io.toPsdBuffer = d => {
    PS.renderDoc(d);
    const flags = {}, extra = Object.assign({}, d.extra);
    extra.imageResources = Object.assign({}, extra.imageResources); delete extra.imageResources.thumbnail; delete extra.imageResources.thumbnailRaw;
    if ((d.guides && d.guides.length) || extra.imageResources.gridAndGuidesInformation) {
      extra.imageResources.gridAndGuidesInformation = Object.assign({}, extra.imageResources.gridAndGuidesInformation, { guides: (d.guides || []).map(g => ({ location: g.p, direction: g.o === 'h' ? 'horizontal' : 'vertical' })) });
    }
    const psd = Object.assign(extra, { width: d.w, height: d.h, children: d.layers.map(n => toPsd(n, d, flags)), canvas: d.comp });
    return agPsd.writePsd(psd, { generateThumbnail: true, trimImageData: true, invalidateTextLayers: !!flags.text });
  };

  // ---------- abrir ----------
  io.openBuffer = async (buf, name, path) => {
    const ext = (name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'psd' || ext === 'psb') return io.openPsd(buf, name, path);
      const bmp = await createImageBitmap(new Blob([buf]));
      const c = PS.mk(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
      return PS.newDoc({ name, w: bmp.width, h: bmp.height, layers: [PS.mkLayer({ name: 'Plano de fundo', canvas: c })], first: 'Abrir' });
    } catch (e) {
      console.error(e);
      PS.toast(`Não consegui abrir "${name}": ${e.message || e}`);
      return null;
    }
  };
  io.readPath = async p => {
    const r = await fetch(`/api/read?t=${encodeURIComponent(TOKEN)}&path=${encodeURIComponent(p)}`);
    if (!r.ok) throw new Error(await r.text());
    return r.arrayBuffer();
  };
  io.openPath = async p => {
    try { const d = await io.openBuffer(await io.readPath(p), base(p), p); if (d) PS.addRecent(p); return d; }
    catch (e) { PS.toast(`Não consegui ler o arquivo: ${e.message || e}`); return null; }
  };
  io.openFiles = async files => { for (const f of files) await io.openBuffer(await f.arrayBuffer(), f.name, null); };
  io.openDialog = async () => {
    if (io.native()) { for (const p of await pywebview.api.pick_open()) await io.openPath(p); }
    else document.getElementById('filein').click();
  };
  // Coloca uma imagem como camada nova no documento aberto.
  io.placeFiles = async files => {
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f), c = PS.mk(bmp.width, bmp.height);
        c.getContext('2d').drawImage(bmp, 0, 0);
        PS.pasteCanvas(c, null, null, stem(f.name));
      } catch (e) { PS.toast(`"${f.name}" não é uma imagem que dá para inserir.`); }
    }
  };

  // ---------- salvar / exportar ----------
  function download(buf, name, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: mime })); a.download = name;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function writePath(p, buf) {
    const r = await fetch(`/api/write?t=${encodeURIComponent(TOKEN)}&path=${encodeURIComponent(p)}`, { method: 'POST', body: buf });
    if (!r.ok) throw new Error(await r.text());
  }
  io.save = async saveAs => {
    const d = PS.doc; if (!d) return;
    try {
      const buf = io.toPsdBuffer(d);
      let p = d.path && /\.psd$/i.test(d.path) && !saveAs ? d.path : null;
      const nome = stem(d.name) + '.psd';
      if (io.native()) {
        if (!p) p = await pywebview.api.pick_save(nome, 'psd');
        if (!p) return;
        await writePath(p, buf);
        d.path = p; d.name = base(p); PS.addRecent(p);
      } else { download(buf, nome, 'image/vnd.adobe.photoshop'); d.name = nome; }
      d.dirty = false; d.saved = d.history[d.hidx];
      PS.emit('doc'); PS.toast(`Salvo: ${d.name}`);
    } catch (e) { console.error(e); PS.toast(`Erro ao salvar: ${e.message || e}`); }
  };
  io.exportAs = async (fmt, quality) => {
    const d = PS.doc; if (!d) return;
    PS.renderDoc(d);
    let c = d.comp;
    if (fmt === 'jpg') { // JPEG não tem transparência: fundo branco
      c = PS.mk(d.w, d.h); const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, d.w, d.h); x.drawImage(d.comp, 0, 0);
    }
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    const blob = await new Promise(r => c.toBlob(r, mime, quality));
    const buf = await blob.arrayBuffer(), nome = `${stem(d.name)}.${fmt}`;
    try {
      if (io.native()) {
        const p = await pywebview.api.pick_save(nome, fmt);
        if (!p) return;
        await writePath(p, buf); PS.toast(`Exportado: ${base(p)}`);
      } else download(buf, nome, mime);
    } catch (e) { PS.toast(`Erro ao exportar: ${e.message || e}`); }
  };
  io.boot = () => { const p = qs.get('open'); if (p && io.native()) io.openPath(p); };
})();
