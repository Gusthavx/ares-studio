'use strict';
// Núcleo: estado, documentos, árvore de camadas, composição, histórico, seleção e visualização.
(function () {
  const PS = window.PS = {
    docs: [], doc: null, tool: 'move', fg: '#000000', bg: '#ffffff', clip: null,
    opt: {
      size: 30, hardness: 80, opacity: 100, tolerance: 32, contiguous: true, autoSelect: true, showXf: true,
      gradType: 'linear', gradTransp: false, shapeFill: true, strokeW: 4, feather: 0,
      font: 'Arial', fontSize: 48, bold: false, italic: false, align: 'left',
    },
  };
  let uid = 1, rev = 1;
  const handlers = {};
  PS.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  PS.emit = (ev, a) => { (handlers[ev] || []).forEach(f => f(a)); };
  PS.nextRev = () => ++rev;
  PS.uid = () => uid++;

  PS.mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  };
  PS.clone = c => { const n = PS.mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };

  const pool = [];
  PS.scratch = (w, h) => {
    const i = pool.findIndex(c => c.width === w && c.height === h);
    const c = i >= 0 ? pool.splice(i, 1)[0] : PS.mk(w, h);
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.filter = 'none'; x.shadowColor = 'transparent'; x.clearRect(0, 0, w, h);
    return c;
  };
  PS.release = c => { if (pool.length >= 6) pool.shift(); pool.push(c); };

  PS.hexToRgb = h => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
  PS.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  // ---------- modos de mesclagem ----------
  PS.BLENDS = [
    ['normal', 'Normal'], ['dissolve', 'Dissolver'], null,
    ['darken', 'Escurecer'], ['multiply', 'Multiplicação'], ['color burn', 'Superexposição de cores'], ['linear burn', 'Superexposição linear'], ['darker color', 'Cor mais escura'], null,
    ['lighten', 'Clarear'], ['screen', 'Divisão'], ['color dodge', 'Subexposição de cores'], ['linear dodge', 'Subexposição linear (adicionar)'], ['lighter color', 'Cor mais clara'], null,
    ['overlay', 'Sobrepor'], ['soft light', 'Luz indireta'], ['hard light', 'Luz direta'], ['vivid light', 'Luz brilhante'], ['linear light', 'Luz linear'], ['pin light', 'Luz do pino'], ['hard mix', 'Mistura sólida'], null,
    ['difference', 'Diferença'], ['exclusion', 'Exclusão'], ['subtract', 'Subtrair'], ['divide', 'Dividir'], null,
    ['hue', 'Matiz'], ['saturation', 'Saturação'], ['color', 'Cor'], ['luminosity', 'Luminosidade'],
  ];
  const GCO = {
    'normal': 'source-over', 'pass through': 'source-over', 'dissolve': 'source-over',
    'darken': 'darken', 'multiply': 'multiply', 'color burn': 'color-burn', 'linear burn': 'multiply', 'darker color': 'darken',
    'lighten': 'lighten', 'screen': 'screen', 'color dodge': 'color-dodge', 'linear dodge': 'lighter', 'lighter color': 'lighten',
    'overlay': 'overlay', 'soft light': 'soft-light', 'hard light': 'hard-light', 'vivid light': 'hard-light', 'linear light': 'hard-light', 'pin light': 'hard-light', 'hard mix': 'hard-light',
    'difference': 'difference', 'exclusion': 'exclusion', 'subtract': 'difference', 'divide': 'color-dodge',
    'hue': 'hue', 'saturation': 'saturation', 'color': 'color', 'luminosity': 'luminosity',
  };
  PS.gco = b => GCO[b] || 'source-over';

  // ---------- camadas ----------
  PS.mkLayer = (o = {}) => Object.assign({
    id: uid++, name: 'Camada', type: 'raster', visible: true, opacity: 1, blend: 'normal',
    locked: false, lockAlpha: false, clipping: false, x: 0, y: 0, ox: 0, oy: 0,
    canvas: null, mask: null, text: null, children: null, open: true, src: null, stale: false, rev: ++rev,
  }, o);

  PS.walk = (list, fn, parent = null) => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      fn(n, parent, list, i);
      if (n.children) PS.walk(n.children, fn, n);
    }
  };
  PS.flat = (list = PS.doc.layers) => { const out = []; PS.walk(list, n => out.push(n)); return out; };
  PS.locate = (id, list = PS.doc.layers, parent = null) => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.id === id) return { node: n, list, idx: i, parent };
      if (n.children) { const r = PS.locate(id, n.children, n); if (r) return r; }
    }
    return null;
  };
  PS.active = () => { const d = PS.doc; if (!d) return null; const r = PS.locate(d.active); return r ? r.node : null; };
  PS.touch = L => { L.rev = ++rev; L.stale = true; if (PS.doc) PS.doc.compDirty = true; };
  PS.touchMask = L => { if (L.mask) L.mask.rev = ++rev; if (PS.doc) PS.doc.compDirty = true; };

  // Aumenta o canvas da camada para cobrir o documento inteiro (necessário antes de pintar).
  PS.expand = L => {
    const d = PS.doc;
    if (!L.canvas) { L.canvas = PS.mk(d.w, d.h); L.x = 0; L.y = 0; return; }
    const x0 = Math.min(0, L.x), y0 = Math.min(0, L.y);
    const x1 = Math.max(d.w, L.x + L.canvas.width), y1 = Math.max(d.h, L.y + L.canvas.height);
    if (x0 === L.x && y0 === L.y && x1 - x0 === L.canvas.width && y1 - y0 === L.canvas.height) return;
    const c = PS.mk(x1 - x0, y1 - y0);
    c.getContext('2d').drawImage(L.canvas, L.x - x0, L.y - y0);
    L.canvas = c; L.x = x0; L.y = y0;
  };

  // ---------- documentos ----------
  PS.newDoc = o => {
    const d = {
      id: uid++, name: o.name || 'Sem título', path: o.path || null, w: o.w, h: o.h,
      layers: o.layers || [], active: null, sel: null, selPath: null, selRev: 0, selEdge: null, selB: null,
      zoom: 1, panX: 0, panY: 0, history: [], hidx: -1, dirty: false, saved: null,
      extra: o.extra || {}, comp: PS.mk(o.w, o.h), compDirty: true, maskEdit: false,
    };
    if (!d.layers.length) {
      const c = PS.mk(d.w, d.h);
      if (o.bg && o.bg !== 'transparent') { const x = c.getContext('2d'); x.fillStyle = o.bg; x.fillRect(0, 0, d.w, d.h); }
      d.layers.push(PS.mkLayer({ name: o.bg && o.bg !== 'transparent' ? 'Plano de fundo' : 'Camada 1', canvas: c }));
    }
    d.active = d.layers[d.layers.length - 1].id;
    PS.docs.push(d);
    PS.doc = d;
    PS.commit(o.first || 'Novo');
    d.dirty = false; d.saved = d.history[0];
    PS.emit('doc');
    PS.fit();
    return d;
  };
  PS.setDoc = d => { PS.doc = d; PS.emit('doc'); PS.emit('layers'); PS.emit('history'); PS.render(); };
  PS.closeDoc = d => {
    const i = PS.docs.indexOf(d); if (i < 0) return;
    PS.docs.splice(i, 1);
    if (PS.doc === d) PS.doc = PS.docs[Math.min(i, PS.docs.length - 1)] || null;
    PS.emit('doc'); PS.emit('layers'); PS.emit('history'); PS.render();
  };

  // ---------- composição ----------
  function fxOf(L) {
    const fx = L.src && L.src.effects;
    if (!fx || fx.disabled || L.type === 'group') return null;
    const on = a => (a || []).filter(e => e && e.enabled !== false);
    const arr = v => [].concat(v || []);
    const ds = on(fx.dropShadow), sf = on(fx.solidFill), stk = on(arr(fx.stroke)), og = on(arr(fx.outerGlow));
    const is = on(arr(fx.innerShadow)), ig = on(arr(fx.innerGlow)), go = on(arr(fx.gradientOverlay)), sat = on(arr(fx.satin));
    return ds.length || sf.length || stk.length || og.length || is.length || ig.length || go.length || sat.length ? { ds, sf, stk, og, is, ig, go, sat } : null;
  }
  // Pinta `t` (já recortado na forma da camada) por cima dos pixels dela.
  function atop(sx, t, opacity, d) { sx.save(); sx.globalAlpha = opacity; sx.globalCompositeOperation = 'source-atop'; sx.drawImage(t, 0, 0); sx.restore(); PS.release(t); }
  // Cor só onde a camada (deslocada e desfocada) NÃO cobre, recortada na forma dela: base da sombra e do brilho internos.
  function inner(L, d, color, size, dx, dy) {
    const t = PS.scratch(d.w, d.h), tx = t.getContext('2d');
    tx.fillStyle = color; tx.fillRect(0, 0, d.w, d.h);
    tx.globalCompositeOperation = 'destination-out'; if (size > 0) tx.filter = `blur(${size / 2}px)`;
    tx.drawImage(L.canvas, L.x + dx, L.y + dy);
    tx.filter = 'none'; tx.globalCompositeOperation = 'destination-in'; tx.drawImage(L.canvas, L.x, L.y);
    return t;
  }
  function gradFill(L, d, g) {
    const t = PS.scratch(d.w, d.h), tx = t.getContext('2d'), w = L.canvas.width, h = L.canvas.height, cx = L.x + w / 2, cy = L.y + h / 2;
    const a = (g.angle ?? 90) * Math.PI / 180, len = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2 * (g.scale ?? 1), ux = Math.cos(a) * len, uy = -Math.sin(a) * len;
    const gr = g.type === 'radial' ? tx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, len)) : tx.createLinearGradient(cx - ux, cy - uy, cx + ux, cy + uy);
    const stops = ((g.gradient && g.gradient.colorStops) || []).slice().sort((p, q) => p.location - q.location);
    if (stops.length < 2) { PS.release(t); return null; }
    for (const s of stops) { const p = Math.min(1, Math.max(0, s.location > 1 ? s.location / 4096 : s.location)); gr.addColorStop(g.reverse ? 1 - p : p, rgba(s.color, 1)); }
    tx.drawImage(L.canvas, L.x, L.y);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = gr; tx.fillRect(0, 0, d.w, d.h);
    return t;
  }
  const rgba = (c, a) => c && 'r' in c ? `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})` : `rgba(0,0,0,${a})`;
  const uv = (v, d = 0) => v == null ? d : typeof v === 'number' ? v : (v.value ?? d);

  function drawPixels(L, sx, d, fx) {
    if (!L.canvas) return;
    if (fx) {
      try {
        for (const s of fx.ds) {
          const a = (s.angle ?? 120) * Math.PI / 180, dist = uv(s.distance, 5), off = d.w + L.canvas.width + 200;
          sx.save();
          sx.shadowColor = rgba(s.color, s.opacity ?? 0.75);
          sx.shadowBlur = uv(s.size, 5);
          sx.shadowOffsetX = -Math.cos(a) * dist + off; sx.shadowOffsetY = Math.sin(a) * dist;
          sx.drawImage(L.canvas, L.x - off, L.y);
          sx.restore();
        }
        for (const g of fx.og) { // brilho externo: sombra sem deslocamento, duas passadas para dar corpo
          const off = d.w + L.canvas.width + 200;
          sx.save();
          sx.shadowColor = rgba(g.color || { r: 255, g: 255, b: 190 }, g.opacity ?? 0.75);
          sx.shadowBlur = uv(g.size, 5) * 1.5; sx.shadowOffsetX = off;
          sx.drawImage(L.canvas, L.x - off, L.y); sx.drawImage(L.canvas, L.x - off, L.y);
          sx.restore();
        }
        for (const k of fx.stk) { // traçado: o contorno da camada engrossado, pintado por baixo dela
          const n = uv(k.size, 3) * (k.position === 'center' ? 0.5 : 1);
          if (k.position === 'inside' || n <= 0) continue;
          const t = PS.scratch(d.w, d.h), tx = t.getContext('2d'), steps = Math.max(16, Math.ceil(n * 3));
          for (let i = 0; i < steps; i++) { const a = i * 2 * Math.PI / steps; tx.drawImage(L.canvas, L.x + Math.cos(a) * n, L.y + Math.sin(a) * n); }
          tx.globalCompositeOperation = 'source-in'; tx.fillStyle = rgba(k.color, 1); tx.fillRect(0, 0, d.w, d.h);
          sx.save(); sx.globalAlpha = k.opacity ?? 1; sx.drawImage(t, 0, 0); sx.restore();
          PS.release(t);
        }
      } catch (e) { /* efeito fora do padrão: ignora */ }
    }
    sx.drawImage(L.canvas, L.x, L.y);
    if (fx) {
      try { // de baixo para cima, na ordem do Photoshop: degradê, cor, acetinado, brilho interno, sombra interna
        for (const g of fx.go) { const t = gradFill(L, d, g); if (t) atop(sx, t, g.opacity ?? 1, d); }
      } catch (e) { /* degradê fora do padrão: ignora */ }
      for (const s of fx.sf) {
        const t = PS.scratch(d.w, d.h), tx = t.getContext('2d');
        tx.drawImage(L.canvas, L.x, L.y);
        tx.globalCompositeOperation = 'source-in'; tx.fillStyle = rgba(s.color, 1); tx.fillRect(0, 0, d.w, d.h);
        sx.save(); sx.globalAlpha = s.opacity ?? 1; sx.globalCompositeOperation = 'source-atop'; sx.drawImage(t, 0, 0); sx.restore();
        PS.release(t);
      }
      try {
        for (const s of fx.sat) { // acetinado: duas cópias deslocadas em sentidos opostos, só onde elas não coincidem
          const a = (s.angle ?? 19) * Math.PI / 180, dist = uv(s.distance, 11), dx = Math.cos(a) * dist, dy = -Math.sin(a) * dist;
          const t = PS.scratch(d.w, d.h), tx = t.getContext('2d');
          tx.filter = `blur(${uv(s.size, 14) / 2}px)`; tx.drawImage(L.canvas, L.x + dx, L.y + dy);
          tx.globalCompositeOperation = 'xor'; tx.drawImage(L.canvas, L.x - dx, L.y - dy);
          tx.filter = 'none'; tx.globalCompositeOperation = 'source-in'; tx.fillStyle = rgba(s.color, 1); tx.fillRect(0, 0, d.w, d.h);
          tx.globalCompositeOperation = 'destination-in'; tx.drawImage(L.canvas, L.x, L.y);
          atop(sx, t, s.opacity ?? 0.5, d);
        }
        for (const g of fx.ig) atop(sx, inner(L, d, rgba(g.color || { r: 255, g: 255, b: 190 }, 1), uv(g.size, 5) * 2, 0, 0), g.opacity ?? 0.75, d);
        for (const s of fx.is) {
          const a = (s.angle ?? 120) * Math.PI / 180, dist = uv(s.distance, 5);
          atop(sx, inner(L, d, rgba(s.color, 1), uv(s.size, 5), -Math.cos(a) * dist, Math.sin(a) * dist), s.opacity ?? 0.75, d);
        }
      } catch (e) { /* efeito fora do padrão: ignora */ }
    }
  }

  function drawNode(L, clips, ctx, d) {
    if (L.type === 'adjust') { if (PS.applyAdjust) PS.applyAdjust(L, ctx, d); return; }
    const mask = L.mask && L.mask.enabled ? L.mask : null;
    const fx = fxOf(L);
    if (L.type !== 'group' && !mask && !clips.length && !fx) {
      if (!L.canvas) return;
      ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = PS.gco(L.blend);
      ctx.drawImage(L.canvas, L.x, L.y);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      return;
    }
    if (L.type === 'group' && L.blend === 'pass through' && L.opacity === 1 && !mask && !clips.length) {
      PS.renderList(L.children, ctx, d); return;
    }
    const s = PS.scratch(d.w, d.h), sx = s.getContext('2d');
    if (L.type === 'group') PS.renderList(L.children, sx, d); else drawPixels(L, sx, d, fx);
    for (const c of clips) {
      if (c.type === 'adjust') { if (PS.applyAdjust) PS.applyAdjust(c, sx, d); continue; }
      const t = PS.scratch(d.w, d.h), tx = t.getContext('2d');
      const o = c.opacity, b = c.blend; c.opacity = 1; c.blend = 'normal';
      drawNode(c, [], tx, d);
      c.opacity = o; c.blend = b;
      sx.globalAlpha = o; sx.globalCompositeOperation = b === 'normal' ? 'source-atop' : PS.gco(b);
      if (b !== 'normal') { tx.globalCompositeOperation = 'destination-in'; tx.drawImage(s, 0, 0); }
      sx.drawImage(t, 0, 0);
      sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over';
      PS.release(t);
    }
    if (mask) { sx.globalCompositeOperation = 'destination-in'; sx.drawImage(mask.canvas, 0, 0); sx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = PS.gco(L.blend);
    ctx.drawImage(s, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    PS.release(s);
  }

  PS.renderList = (list, ctx, d) => {
    for (let i = 0; i < list.length; i++) {
      const L = list[i], clips = [];
      while (i + 1 < list.length && list[i + 1].clipping) clips.push(list[++i]);
      if (!L.visible) continue;
      drawNode(L, clips.filter(c => c.visible), ctx, d);
    }
  };
  PS.renderDoc = (d = PS.doc) => {
    if (d.comp.width !== d.w || d.comp.height !== d.h) { d.comp.width = d.w; d.comp.height = d.h; }
    const ctx = d.comp.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, d.w, d.h);
    PS.renderList(d.layers, ctx, d);
    d.compDirty = false;
  };

  // ---------- histórico (cópia só do que mudou) ----------
  function snapNode(L) {
    const s = Object.assign({}, L);
    delete s._snap; delete s._msnap;
    if (L.canvas) {
      if (!L._snap || L._snap.rev !== L.rev) L._snap = { rev: L.rev, canvas: PS.clone(L.canvas) };
      s.canvas = L._snap.canvas;
    }
    if (L.mask) {
      if (!L._msnap || L._msnap.rev !== L.mask.rev) L._msnap = { rev: L.mask.rev, canvas: PS.clone(L.mask.canvas) };
      s.mask = Object.assign({}, L.mask, { canvas: L._msnap.canvas });
    }
    if (L.text) s.text = Object.assign({}, L.text);
    if (L.children) s.children = L.children.map(snapNode);
    return s;
  }
  function restoreNode(s, live) {
    const old = live.get(s.id), L = Object.assign({}, s);
    if (s.canvas) {
      const same = old && old.canvas && old._snap && old._snap.canvas === s.canvas && old._snap.rev === old.rev;
      L.canvas = same ? old.canvas : PS.clone(s.canvas);
      L._snap = { rev: s.rev, canvas: s.canvas };
    }
    if (s.mask) {
      const same = old && old.mask && old._msnap && old._msnap.canvas === s.mask.canvas && old._msnap.rev === old.mask.rev;
      L.mask = Object.assign({}, s.mask, { canvas: same ? old.mask.canvas : PS.clone(s.mask.canvas) });
      L._msnap = { rev: s.mask.rev, canvas: s.mask.canvas };
    }
    if (s.text) L.text = Object.assign({}, s.text);
    if (s.children) L.children = s.children.map(c => restoreNode(c, live));
    return L;
  }
  const HMAX = 40;
  PS.commit = name => {
    const d = PS.doc; if (!d) return;
    d.history.length = d.hidx + 1;
    if (d.sel && (!d._selSnap || d._selSnap.rev !== d.selRev)) d._selSnap = { rev: d.selRev, canvas: PS.clone(d.sel) };
    d.history.push({
      name, w: d.w, h: d.h, active: d.active, layers: d.layers.map(snapNode),
      sel: d.sel ? d._selSnap.canvas : null, selPath: d.selPath, selRev: d.selRev,
    });
    if (d.history.length > HMAX) d.history.shift();
    d.hidx = d.history.length - 1;
    d.dirty = true; d.compDirty = true;
    PS.emit('history'); PS.emit('layers'); PS.emit('doc'); PS.render();
  };
  PS.gotoState = i => {
    const d = PS.doc; if (!d || i < 0 || i >= d.history.length) return;
    const st = d.history[i], live = new Map();
    PS.walk(d.layers, n => live.set(n.id, n));
    d.layers = st.layers.map(s => restoreNode(s, live));
    d.w = st.w; d.h = st.h; d.active = st.active; d.multi = [];
    d.sel = st.sel ? PS.clone(st.sel) : null; d.selPath = st.selPath; d.selRev = st.selRev;
    d._selSnap = st.sel ? { rev: st.selRev, canvas: st.sel } : null;
    d.selEdge = null; d.selB = null;
    d.hidx = i; d.dirty = st !== d.saved; d.compDirty = true;
    PS.emit('history'); PS.emit('layers'); PS.emit('doc'); PS.render();
  };
  PS.undo = () => PS.doc && PS.gotoState(PS.doc.hidx - 1);
  PS.redo = () => PS.doc && PS.gotoState(PS.doc.hidx + 1);

  // ---------- seleção ----------
  PS.setSel = (canvas, path = null) => {
    const d = PS.doc;
    d.sel = canvas; d.selPath = canvas ? path : null; d.selRev = ++rev; d.selEdge = null; d.selB = null;
    if (canvas && !PS.selBounds()) { d.sel = null; d.selPath = null; }
    PS.render();
  };
  PS.selFromPath = (path, mode = 'new', rule = 'nonzero') => {
    const d = PS.doc, c = PS.mk(d.w, d.h), x = c.getContext('2d');
    const f = PS.opt.feather;
    if (mode !== 'new' && d.sel) x.drawImage(d.sel, 0, 0);
    if (mode === 'sub') x.globalCompositeOperation = 'destination-out';
    if (f > 0) x.filter = `blur(${f}px)`;
    x.fillStyle = '#fff'; x.fill(path, rule);
    PS.setSel(c, mode === 'new' && !f ? path : null);
  };
  PS.selBounds = () => {
    const d = PS.doc; if (!d.sel) return null;
    if (d.selB && d.selB.rev === d.selRev) return d.selB.b;
    const { width: w, height: h } = d.sel, a = d.sel.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0, i = 3; y < h; y++) for (let x = 0; x < w; x++, i += 4) if (a[i] > 0) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const b = x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    d.selB = { rev: d.selRev, b };
    return b;
  };
  // Mantém em `c` (tamanho do documento) só o que está dentro da seleção.
  PS.clipToSel = c => {
    const d = PS.doc; if (!d.sel) return c;
    const x = c.getContext('2d');
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(d.sel, 0, 0); x.restore();
    return c;
  };
  function buildEdge(d) {
    const w = d.w, h = d.h, a = d.sel.getContext('2d').getImageData(0, 0, w, h).data;
    const A = PS.mk(w, h), B = PS.mk(w, h);
    const ia = new ImageData(w, h), ib = new ImageData(w, h), da = new Uint32Array(ia.data.buffer), db = new Uint32Array(ib.data.buffer);
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] <= 127) continue;
      if (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) continue;
      const p = ((x + y) >> 2) & 1, i = y * w + x;
      da[i] = p ? 0xff000000 : 0xffffffff; db[i] = p ? 0xffffffff : 0xff000000;
    }
    A.getContext('2d').putImageData(ia, 0, 0); B.getContext('2d').putImageData(ib, 0, 0);
    d.selEdge = [A, B];
  }

  // ---------- visualização ----------
  let view, vctx, checker, raf = 0, antsPhase = 0;
  PS.initView = canvas => {
    view = canvas; vctx = view.getContext('2d');
    const t = PS.mk(16, 16), x = t.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
    checker = vctx.createPattern(t, 'repeat');
    new ResizeObserver(() => {
      const r = view.parentElement.getBoundingClientRect();
      view.width = Math.max(1, Math.floor(r.width)); view.height = Math.max(1, Math.floor(r.height));
      PS.render();
    }).observe(view.parentElement);
    setInterval(() => { if (PS.doc && PS.doc.sel) { antsPhase++; PS.render(); } }, 280);
  };
  PS.toDoc = (sx, sy) => { const d = PS.doc; return { x: (sx - d.panX) / d.zoom, y: (sy - d.panY) / d.zoom }; };
  // Movimento da vista, como no Photoshop: zoom animado (suave até o alvo) e deslize com inércia ao soltar a mão.
  const calmo = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let anim = null, glide = null;
  PS.stopMotion = () => { anim = null; glide = null; };
  // Leva a vista até o zoom z, mantendo o ponto do documento p sob o ponto da tela s (p pode mudar de p0 para p1).
  function viewTo(z, s, p0, p1, ms) {
    const d = PS.doc; glide = null;
    if (!ms || calmo()) { anim = null; d.zoom = z; d.panX = s.x - p1.x * z; d.panY = s.y - p1.y * z; PS.emit('zoom'); PS.render(); return; }
    const novoLaco = !anim;
    anim = { d, z0: d.zoom, z1: z, s, p0, p1, t0: performance.now(), ms };
    if (novoLaco) requestAnimationFrame(passo);
  }
  function passo(agora) {
    const a = anim; if (!a) return;
    if (a.d !== PS.doc) { anim = null; return; }
    const t = Math.min(1, (agora - a.t0) / a.ms), e = 1 - Math.pow(1 - t, 3), d = a.d;
    const z = a.z0 * Math.pow(a.z1 / a.z0, e), x = a.p0.x + (a.p1.x - a.p0.x) * e, y = a.p0.y + (a.p1.y - a.p0.y) * e;
    d.zoom = z; d.panX = a.s.x - x * z; d.panY = a.s.y - y * z;
    PS.emit('zoom'); PS.drawView();
    if (t < 1) requestAnimationFrame(passo); else anim = null;
  }
  PS.fit = animate => {
    const d = PS.doc; if (!d || !view) return;
    const z = Math.max(0.01, Math.min((view.width - 60) / d.w, (view.height - 60) / d.h, 1));
    const s = { x: view.width / 2, y: view.height / 2 };
    viewTo(z, s, PS.toDoc(s.x, s.y), { x: d.w / 2, y: d.h / 2 }, animate === true ? 220 : 0);
  };
  PS.setZoom = (z, sx = view.width / 2, sy = view.height / 2, ms = 170) => {
    const d = PS.doc; if (!d) return;
    z = Math.max(0.01, Math.min(64, z));
    const p = PS.toDoc(sx, sy);
    viewTo(z, { x: sx, y: sy }, p, p, ms);
  };
  // Multiplica o zoom a partir do alvo em andamento: giros seguidos da roda se somam sem engasgar.
  PS.zoomBy = (f, sx, sy) => { const d = PS.doc; if (d) PS.setZoom((anim && anim.d === d ? anim.z1 : d.zoom) * f, sx, sy); };
  // Deslize: a vista continua andando com a velocidade do arrasto (px por ms) e vai parando.
  PS.glide = (vx, vy) => {
    if (calmo() || Math.hypot(vx, vy) < 0.25) return;
    anim = null;
    const g = glide = { d: PS.doc, vx, vy, t: performance.now() };
    const anda = agora => {
      if (glide !== g || g.d !== PS.doc) return;
      const dt = Math.min(40, agora - g.t); g.t = agora;
      g.d.panX += g.vx * dt; g.d.panY += g.vy * dt;
      const k = Math.pow(0.994, dt); g.vx *= k; g.vy *= k;
      PS.drawView();
      if (Math.hypot(g.vx, g.vy) > 0.02) requestAnimationFrame(anda); else glide = null;
    };
    requestAnimationFrame(anda);
  };
  PS.render = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; PS.drawView(); }); };
  PS.overlay = null; // definido em tools.js
  PS.drawView = () => {
    if (!vctx) return;
    const d = PS.doc;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, view.width, view.height);
    if (!d) return;
    if (d.compDirty) PS.renderDoc(d);
    const z = d.zoom, px = Math.round(d.panX), py = Math.round(d.panY), dw = d.w * z, dh = d.h * z;
    vctx.fillStyle = checker; vctx.fillRect(px, py, dw, dh);
    vctx.imageSmoothingEnabled = z < 2; vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(d.comp, px, py, dw, dh);
    if (d.sel) {
      if (d.selPath) {
        vctx.save(); vctx.translate(px, py); vctx.scale(z, z); vctx.lineWidth = 1 / z;
        vctx.strokeStyle = '#fff'; vctx.setLineDash([]); vctx.stroke(d.selPath);
        vctx.strokeStyle = '#000'; vctx.setLineDash([4 / z, 4 / z]); vctx.lineDashOffset = -(antsPhase % 8) / z; vctx.stroke(d.selPath);
        vctx.restore();
      } else {
        if (!d.selEdge) buildEdge(d);
        vctx.imageSmoothingEnabled = z < 1;
        vctx.drawImage(d.selEdge[antsPhase & 1], px, py, dw, dh);
      }
    }
    if (PS.overlay) PS.overlay(vctx, d, px, py, z);
  };
})();
