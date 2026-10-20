'use strict';
// Ferramentas da tela: mover, seleções, corte, pincéis, preenchimentos, formas, texto, transformação livre.
(function () {
  const PS = window.PS, T = PS.tools = {};
  let view, drag = null;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, inside: false };
  PS.space = false; PS.pv = null; PS.pvLine = null; PS.cropRect = null; PS.xf = null; PS.cloneSrc = null; PS.cloneOff = null;
  const box = (a, b, square) => {
    let w = b.x - a.x, h = b.y - a.y;
    if (square) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    return { x: Math.round(Math.min(a.x, a.x + w)), y: Math.round(Math.min(a.y, a.y + h)), w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h)) };
  };
  const shapePath = (kind, b) => {
    const p = new Path2D();
    if (kind === 'ellipse') p.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); else p.rect(b.x, b.y, b.w, b.h);
    return p;
  };
  const selMode = e => e.shiftKey ? 'add' : e.altKey ? 'sub' : 'new';

  // Junta uma máscara (canvas do tamanho do documento) à seleção atual.
  PS.selCombine = (mask, mode) => {
    const d = PS.doc, c = PS.mk(d.w, d.h), x = c.getContext('2d');
    if (mode !== 'new' && d.sel) x.drawImage(d.sel, 0, 0);
    if (mode === 'sub') x.globalCompositeOperation = 'destination-out';
    x.drawImage(mask, 0, 0);
    PS.setSel(c);
  };
  PS.flood = (img, w, h, x0, y0, tol, contig) => {
    const d = img.data, out = new ImageData(w, h), o = new Uint32Array(out.data.buffer);
    const j0 = (y0 * w + x0) * 4, r = d[j0], g = d[j0 + 1], b = d[j0 + 2], a = d[j0 + 3];
    const ok = i => { const j = i * 4; return Math.abs(d[j] - r) <= tol && Math.abs(d[j + 1] - g) <= tol && Math.abs(d[j + 2] - b) <= tol && Math.abs(d[j + 3] - a) <= tol; };
    if (!contig) { for (let i = 0; i < w * h; i++) if (ok(i)) o[i] = 0xffffffff; }
    else {
      const seen = new Uint8Array(w * h), stack = [y0 * w + x0]; seen[stack[0]] = 1;
      while (stack.length) {
        const i = stack.pop(); o[i] = 0xffffffff;
        const x = i % w, y = (i - x) / w;
        const tryPush = k => { if (!seen[k]) { seen[k] = 1; if (ok(k)) stack.push(k); } };
        if (x > 0) tryPush(i - 1); if (x < w - 1) tryPush(i + 1); if (y > 0) tryPush(i - w); if (y < h - 1) tryPush(i + w);
      }
    }
    const c = PS.mk(w, h); c.getContext('2d').putImageData(out, 0, 0);
    return c;
  };
  function floodAt(p) {
    const d = PS.doc, x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return null;
    PS.renderDoc(d);
    return PS.flood(d.comp.getContext('2d').getImageData(0, 0, d.w, d.h), d.w, d.h, x, y, PS.opt.tolerance, PS.opt.contiguous);
  }
  function pick(p, bg) {
    const d = PS.doc, x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
    if (d.compDirty) PS.renderDoc(d);
    const c = d.comp.getContext('2d').getImageData(x, y, 1, 1).data;
    PS[bg ? 'bg' : 'fg'] = PS.rgbToHex(c[0], c[1], c[2]);
    PS.emit('color');
  }
  function hitTest(p) {
    const all = PS.flat().reverse();
    for (const L of all) {
      if (!L.visible || !L.canvas || L.type === 'group') continue;
      const x = Math.floor(p.x - L.x), y = Math.floor(p.y - L.y);
      if (x < 0 || y < 0 || x >= L.canvas.width || y >= L.canvas.height) continue;
      if (L.canvas.getContext('2d').getImageData(x, y, 1, 1).data[3] > 10) return L;
    }
    return null;
  }

  // ---------- mover ----------
  let mv = null;
  const subtree = L => L.children ? PS.flat(L.children).filter(n => n.type !== 'group') : [L];
  T.move = {
    down(p, e) {
      const d = PS.doc;
      if (PS.opt.autoSelect || e.ctrlKey) {
        const hit = hitTest(p);
        if (hit && e.shiftKey) PS.pickLayer(hit.id, 'toggle'); // Shift+clique soma/tira a camada do conjunto
        else if (hit && !PS.moveSet().includes(hit)) PS.pickLayer(hit.id);
      }
      const L = PS.active(); if (!L) return;
      if (L.locked) { PS.toast('A camada está bloqueada.'); return; }
      mv = { L, sx: p.x, sy: p.y, moved: false, b0: PS.snap ? PS.moveBounds() : null, nodes: PS.moveSet().map(n => ({ n, x: n.x, y: n.y, ax: n.text && n.text.ax, ay: n.text && n.text.ay })) };
      if (d.sel && L.type === 'raster' && L.canvas) {
        PS.expand(L); mv.nodes[0].x = L.x; mv.nodes[0].y = L.y;
        const hole = PS.clone(L.canvas), hx = hole.getContext('2d');
        hx.globalCompositeOperation = 'destination-out'; hx.drawImage(d.sel, -L.x, -L.y);
        const fl = PS.mk(d.w, d.h); fl.getContext('2d').drawImage(L.canvas, L.x, L.y); PS.clipToSel(fl);
        mv.float = { hole, fl, sel: d.sel, path: d.selPath };
      }
    },
    move(p, e) {
      if (!mv) return;
      const d = PS.doc; let dx = Math.round(p.x - mv.sx), dy = Math.round(p.y - mv.sy);
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (!dx && !dy && !mv.moved) return;
      mv.moved = true;
      if (!mv.float && !e.ctrlKey) [dx, dy] = PS.snapMove(mv.b0, dx, dy); else PS.snapLines = [];
      if (mv.float) {
        const f = mv.float, L = mv.L, x = L.canvas.getContext('2d');
        x.globalCompositeOperation = 'copy'; x.drawImage(f.hole, 0, 0);
        x.globalCompositeOperation = 'source-over'; x.drawImage(f.fl, dx - L.x, dy - L.y);
        const s = PS.mk(d.w, d.h); s.getContext('2d').drawImage(f.sel, dx, dy);
        d.sel = s; d.selRev = PS.nextRev(); d.selEdge = null; d.selB = null;
        if (f.path) { const np = new Path2D(); np.addPath(f.path, new DOMMatrix().translate(dx, dy)); d.selPath = np; }
      } else for (const o of mv.nodes) { o.n.x = o.x + dx; o.n.y = o.y + dy; if (o.n.text) { o.n.text.ax = o.ax + dx; o.n.text.ay = o.ay + dy; } }
      d.compDirty = true; PS.render();
    },
    up() {
      PS.snapLines = [];
      if (mv && mv.moved) { if (mv.float) PS.touch(mv.L); PS.commit('Mover'); } else PS.render();
      mv = null;
    },
  };
  PS.nudge = (dx, dy) => {
    const L = PS.active(); if (!L || L.locked) return;
    for (const n of subtree(L)) { n.x += dx; n.y += dy; if (n.text) { n.text.ax += dx; n.text.ay += dy; } }
    PS.commit('Mover');
  };

  // ---------- seleções ----------
  function marquee(kind) {
    let s = null;
    return {
      down(p, e) { s = { a: p, mode: selMode(e), b: null }; },
      move(p, e) { if (!s) return; s.b = box(s.a, p, e.shiftKey && s.mode === 'new'); PS.pv = shapePath(kind, s.b); PS.render(); },
      up() {
        if (!s) return;
        PS.pv = null;
        if (!s.b || s.b.w < 1 || s.b.h < 1) { if (s.mode === 'new') PS.deselect(); }
        else { PS.selFromPath(shapePath(kind, s.b), s.mode); PS.commit(kind === 'ellipse' ? 'Letreiro elíptico' : 'Letreiro retangular'); }
        s = null; PS.render();
      },
    };
  }
  T.marquee = marquee('rect');
  T.ellipse = marquee('ellipse');
  let las = null;
  T.lasso = {
    down(p, e) { las = { pts: [p], mode: selMode(e) }; },
    move(p) { if (!las) return; las.pts.push(p); const q = new Path2D(); las.pts.forEach((v, i) => i ? q.lineTo(v.x, v.y) : q.moveTo(v.x, v.y)); PS.pv = q; PS.render(); },
    up() {
      if (!las) return;
      PS.pv = null;
      if (las.pts.length < 3) { if (las.mode === 'new') PS.deselect(); }
      else { const q = new Path2D(); las.pts.forEach((v, i) => i ? q.lineTo(v.x, v.y) : q.moveTo(v.x, v.y)); q.closePath(); PS.selFromPath(q, las.mode); PS.commit('Laço'); }
      las = null; PS.render();
    },
  };
  let pl = null;
  const plDraw = p => { const q = new Path2D(); pl.pts.forEach((v, i) => i ? q.lineTo(v.x, v.y) : q.moveTo(v.x, v.y)); if (p) q.lineTo(p.x, p.y); PS.pv = q; PS.render(); };
  PS.closePoly = cancel => {
    if (!pl) return false;
    const s = pl; pl = null; PS.pv = null;
    if (!cancel && s.pts.length > 2) { const q = new Path2D(); s.pts.forEach((v, i) => i ? q.lineTo(v.x, v.y) : q.moveTo(v.x, v.y)); q.closePath(); PS.selFromPath(q, s.mode); PS.commit('Laço poligonal'); }
    PS.render();
    return true;
  };
  T.polylasso = {
    down(p, e) {
      if (!pl) pl = { pts: [p], mode: selMode(e) };
      else {
        const a = pl.pts[0], u = pl.pts[pl.pts.length - 1];
        if (pl.pts.length > 2 && Math.hypot(a.x - p.x, a.y - p.y) * PS.doc.zoom < 8) { PS.closePoly(); return; }
        if (Math.hypot(u.x - p.x, u.y - p.y) * PS.doc.zoom > 1) pl.pts.push(p);
      }
      plDraw(p);
    },
    move(p) { if (pl) plDraw(p); },
    hover(p) { if (pl) plDraw(p); },
  };
  T.wand = {
    down(p, e) { const m = floodAt(p); if (!m) return; PS.selCombine(m, selMode(e)); PS.commit('Varinha mágica'); },
  };

  // Seleção de objeto: clique no que quer mexer -> ativa a camada e seleciona a peça inteira debaixo do cursor.
  T.object = {
    down(p, e) {
      const d = PS.doc, x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
      const L = hitTest(p);
      if (!L) { if (selMode(e) === 'new') PS.deselect(); PS.toast('Não há nada nesse ponto.'); return; }
      d.active = L.id; d.maskEdit = false;
      const s = PS.scratch(d.w, d.h), sx = s.getContext('2d');
      sx.drawImage(L.canvas, L.x, L.y);
      const img = sx.getImageData(0, 0, d.w, d.h), px = img.data, n = d.w * d.h;
      PS.release(s);
      const alfa = new ImageData(d.w, d.h), a = alfa.data;
      let cheios = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 16) { a[i] = 255; cheios++; }
      // Camada que cobre a tela toda (foto, fundo): não há contorno transparente, então separa pela cor.
      const m = cheios > n * 0.97 ? PS.flood(img, d.w, d.h, x, y, PS.opt.tolerance, true) : PS.flood(alfa, d.w, d.h, x, y, 0, true);
      PS.selCombine(m, selMode(e));
      PS.commit('Seleção de objeto');
    },
  };

  // ---------- corte ----------
  let cr = null;
  T.crop = {
    down(p) { cr = p; },
    move(p, e) { if (!cr || Math.hypot(p.x - cr.x, p.y - cr.y) * PS.doc.zoom < 3) return; PS.cropRect = box(cr, p, e.shiftKey); PS.render(); },
    up() { cr = null; if (PS.cropRect && (PS.cropRect.w < 2 || PS.cropRect.h < 2)) PS.cropRect = null; PS.emit('tool'); PS.render(); },
  };

  // ---------- conta-gotas, zoom, mão ----------
  T.eyedropper = { down(p, e) { pick(p, e.altKey); }, move(p, e) { pick(p, e.altKey); } };
  let zs = null;
  T.zoom = {
    down(p, e) { zs = { sx: mouse.sx, sy: mouse.sy, z: PS.doc.zoom, alt: e.altKey, arrastou: false }; },
    move() {
      if (!zs) return;
      const dx = mouse.sx - zs.sx;
      if (!zs.arrastou && Math.abs(dx) < 4) return;
      zs.arrastou = true;
      PS.setZoom(zs.z * Math.pow(2, dx / 140), zs.sx, zs.sy, 0); // arrastar para a direita aproxima, para a esquerda afasta
    },
    up() { if (zs && !zs.arrastou) PS.zoomBy(zs.alt ? 0.5 : 2, zs.sx, zs.sy); zs = null; },
  };
  T.hand = {};

  // ---------- pincel, lápis, borracha, carimbo ----------
  const FXB = { blur: s => `blur(${Math.max(1.5, s / 10)}px)`, sharpen: () => 'contrast(1.35)', dodge: () => 'brightness(1.6)', burn: () => 'brightness(0.55)', sponge: () => 'saturate(0.2)' };
  function paintTool(kind, label) {
    let st = null;
    const stamp = p => {
      const x = st.sc.getContext('2d'), r = Math.max(0.5, PS.opt.size / 2);
      if (kind === 'clone') {
        x.save(); x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.clip();
        x.drawImage(st.base, st.L.x - PS.cloneOff.x, st.L.y - PS.cloneOff.y); x.restore();
        return;
      }
      const col = PS.hexToRgb(kind === 'eraser' ? '#000000' : PS.fg), h = kind === 'pencil' ? 1 : PS.opt.hardness / 100;
      if (h >= 0.99) x.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
      else {
        const g = x.createRadialGradient(p.x, p.y, r * h, p.x, p.y, r);
        g.addColorStop(0, `rgba(${col.r},${col.g},${col.b},1)`); g.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
        x.fillStyle = g;
      }
      x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.fill();
    };
    const line = (a, b) => {
      const dist = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(dist / Math.max(1, PS.opt.size * 0.12)));
      for (let i = 1; i <= n; i++) stamp({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
    };
    const compose = () => {
      const d = PS.doc, L = st.L, op = PS.opt.opacity / 100;
      let src = st.sc, tmp = null;
      if (d.sel) { tmp = PS.scratch(d.w, d.h); tmp.getContext('2d').drawImage(st.sc, 0, 0); PS.clipToSel(tmp); src = tmp; }
      if (st.onMask) {
        const x = L.mask.canvas.getContext('2d'), c = PS.hexToRgb(PS.fg), light = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 127;
        x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.drawImage(st.base, 0, 0);
        x.globalAlpha = op; x.globalCompositeOperation = light && kind !== 'eraser' ? 'source-over' : 'destination-out';
        x.drawImage(src, 0, 0);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      } else {
        const x = L.canvas.getContext('2d');
        x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.drawImage(st.base, 0, 0);
        x.globalAlpha = op; x.globalCompositeOperation = kind === 'eraser' ? 'destination-out' : L.lockAlpha || st.fx ? 'source-atop' : 'source-over';
        if (st.fx) { // pincel de efeito: mostra a versão tratada da camada só onde o traço passou
          const f = PS.scratch(d.w, d.h), fx = f.getContext('2d');
          fx.drawImage(st.fx, L.x, L.y); fx.globalCompositeOperation = 'destination-in'; fx.drawImage(src, 0, 0);
          x.drawImage(f, -L.x, -L.y); PS.release(f);
        } else x.drawImage(src, -L.x, -L.y);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
      if (tmp) PS.release(tmp);
      d.compDirty = true; PS.render();
    };
    return {
      paint: true,
      down(p, e) {
        const d = PS.doc;
        if (e.altKey && kind === 'clone') { PS.cloneSrc = { x: p.x, y: p.y }; PS.cloneOff = null; PS.toast('Origem do carimbo definida.'); PS.render(); return; }
        if (e.altKey && kind !== 'eraser') { pick(p); return; }
        const L = PS.paintTarget(true); if (!L) return;
        if (FXB[kind] && d.maskEdit && L.mask) { PS.toast('Esta ferramenta não pinta na máscara.'); return; }
        if (kind === 'clone' && !PS.cloneSrc) { PS.toast('Alt + clique para definir de onde copiar.'); return; }
        const onMask = !!(d.maskEdit && L.mask);
        if (kind === 'clone' && onMask) { PS.toast('O carimbo não pinta na máscara.'); return; }
        if (!onMask) PS.expand(L);
        st = { L, onMask, base: PS.clone(onMask ? L.mask.canvas : L.canvas), sc: PS.mk(d.w, d.h), last: p };
        if (FXB[kind]) { st.fx = PS.mk(st.base.width, st.base.height); const fx = st.fx.getContext('2d'); fx.filter = FXB[kind](PS.opt.size); fx.drawImage(st.base, 0, 0); }
        if (kind === 'clone' && !PS.cloneOff) PS.cloneOff = { x: PS.cloneSrc.x - p.x, y: PS.cloneSrc.y - p.y };
        if (e.shiftKey && PS.lastPaint) line(PS.lastPaint, p); else stamp(p);
        compose();
      },
      move(p) { if (!st) return; line(st.last, p); st.last = p; compose(); },
      up() {
        if (!st) return;
        PS.lastPaint = st.last;
        if (st.onMask) PS.touchMask(st.L); else PS.touch(st.L);
        st = null; PS.commit(label);
      },
    };
  }
  T.brush = paintTool('brush', 'Pincel');
  T.pencil = paintTool('pencil', 'Lápis');
  T.eraser = paintTool('eraser', 'Borracha');
  T.clone = paintTool('clone', 'Carimbo');
  T.blur = paintTool('blur', 'Desfoque');
  T.sharpen = paintTool('sharpen', 'Nitidez');
  T.dodge = paintTool('dodge', 'Subexposição');
  T.burn = paintTool('burn', 'Superexposição');
  T.sponge = paintTool('sponge', 'Esponja');

  // ---------- lata de tinta e degradê ----------
  function drawOnLayer(L, t, name) {
    const x = L.canvas.getContext('2d');
    x.globalAlpha = PS.opt.opacity / 100; x.globalCompositeOperation = L.lockAlpha ? 'source-atop' : 'source-over';
    x.drawImage(t, -L.x, -L.y);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    PS.touch(L); PS.commit(name);
  }
  T.bucket = {
    down(p, e) {
      if (e.altKey) { pick(p); return; }
      const d = PS.doc, L = PS.paintTarget(); if (!L) return;
      const m = floodAt(p); if (!m) return;
      PS.expand(L);
      const x = m.getContext('2d');
      x.globalCompositeOperation = 'source-in'; x.fillStyle = PS.fg; x.fillRect(0, 0, d.w, d.h);
      PS.clipToSel(m);
      drawOnLayer(L, m, 'Lata de tinta');
    },
  };
  let gr = null;
  T.gradient = {
    down(p) { gr = { a: p, b: p }; },
    move(p, e) {
      if (!gr) return;
      gr.b = e.shiftKey ? (Math.abs(p.x - gr.a.x) > Math.abs(p.y - gr.a.y) ? { x: p.x, y: gr.a.y } : { x: gr.a.x, y: p.y }) : p;
      PS.pvLine = gr; PS.render();
    },
    up() {
      if (!gr) return;
      const { a, b } = gr; gr = null; PS.pvLine = null;
      const d = PS.doc, len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 2) { PS.render(); return; }
      const L = PS.paintTarget(); if (!L) { PS.render(); return; }
      PS.expand(L);
      const t = PS.scratch(d.w, d.h), x = t.getContext('2d'), c = PS.hexToRgb(PS.fg);
      const g = PS.opt.gradType === 'radial' ? x.createRadialGradient(a.x, a.y, 0, a.x, a.y, len) : x.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, PS.fg); g.addColorStop(1, PS.opt.gradTransp ? `rgba(${c.r},${c.g},${c.b},0)` : PS.bg);
      x.fillStyle = g; x.fillRect(0, 0, d.w, d.h); PS.clipToSel(t);
      drawOnLayer(L, t, 'Degradê'); PS.release(t);
    },
  };

  // ---------- formas ----------
  function shapeTool(kind, base) {
    let s = null;
    return {
      down(p) { s = { a: p, b: null, p }; },
      move(p, e) {
        if (!s) return;
        if (kind === 'line') {
          s.p = e.shiftKey ? (Math.abs(p.x - s.a.x) > Math.abs(p.y - s.a.y) ? { x: p.x, y: s.a.y } : { x: s.a.x, y: p.y }) : p;
          const q = new Path2D(); q.moveTo(s.a.x, s.a.y); q.lineTo(s.p.x, s.p.y); PS.pv = q;
        } else { s.b = box(s.a, p, e.shiftKey); PS.pv = shapePath(kind, s.b); }
        PS.render();
      },
      up() {
        if (!s) return;
        PS.pv = null;
        const sw = Math.max(1, PS.opt.strokeW), pad = Math.ceil(sw / 2) + 2;
        const b = kind === 'line' ? box(s.a, s.p) : s.b;
        if (!b || (b.w < 1 && b.h < 1)) { s = null; PS.render(); return; }
        const c = PS.mk(b.w + pad * 2, b.h + pad * 2), x = c.getContext('2d');
        x.translate(pad - b.x, pad - b.y); x.fillStyle = x.strokeStyle = PS.fg; x.lineWidth = sw; x.lineCap = 'round';
        if (kind === 'line') { x.beginPath(); x.moveTo(s.a.x, s.a.y); x.lineTo(s.p.x, s.p.y); x.stroke(); }
        else if (PS.opt.shapeFill) x.fill(shapePath(kind, b)); else x.stroke(shapePath(kind, b));
        PS.insertAbove(PS.mkLayer({ name: PS.nameFor(base), canvas: c, x: b.x - pad, y: b.y - pad }));
        s = null; PS.commit(base);
      },
    };
  }
  T.rect = shapeTool('rect', 'Retângulo');
  T.oval = shapeTool('ellipse', 'Elipse');
  T.line = shapeTool('line', 'Linha');

  // ---------- texto ----------
  let ed = null;
  async function psdTextToOurs(L) {
    const t = L.src.text, st = t.style || {}, tr = t.transform || [1, 0, 0, 1, 0, 0], col = st.fillColor || { r: 0, g: 0, b: 0 };
    let font = (st.font && st.font.name) || 'Arial';
    try { const ff = new FontFace(font, `local("${font}")`); await ff.load(); document.fonts.add(ff); } catch (e) { font = 'Arial'; }
    return {
      value: (t.text || '').replace(/\r/g, '\n'), font, size: Math.max(1, Math.round((st.fontSize || 24) * Math.hypot(tr[2], tr[3]))),
      color: 'r' in col ? PS.rgbToHex(col.r, col.g, col.b) : '#000000', bold: !!st.fauxBold, italic: !!st.fauxItalic,
      align: ((t.paragraphStyle || {}).justification || 'left').replace('justify-', ''), ax: L.x, ay: L.y,
    };
  }
  PS.endText = cancel => {
    if (!ed) return;
    const { el, L, t, wasVisible } = ed; ed = null;
    const val = el.value.replace(/\s+$/, '');
    el.remove();
    if (L) L.visible = wasVisible;
    if (cancel || (!val && !L)) { PS.doc.compDirty = true; PS.render(); return; }
    if (!val && L) { PS.doc.active = L.id; PS.delLayer(); return; }
    Object.assign(t, { value: val, font: PS.opt.font, size: PS.opt.fontSize, bold: PS.opt.bold, italic: PS.opt.italic, align: PS.opt.align, color: PS.fg });
    if (L) { L.text = t; L.type = 'text'; L.stale = true; L.name = L.renamed ? L.name : val.split('\n')[0].slice(0, 30); PS.renderText(L); PS.doc.active = L.id; }
    else { const n = PS.mkLayer({ name: val.split('\n')[0].slice(0, 30), type: 'text', text: t }); PS.insertAbove(n); PS.renderText(n); }
    PS.commit('Texto');
  };
  PS.styleText = () => {
    if (!ed) return;
    const z = PS.doc.zoom, s = ed.el.style;
    s.font = PS.textFont({ font: PS.opt.font, size: PS.opt.fontSize * z, bold: PS.opt.bold, italic: PS.opt.italic });
    s.color = PS.fg; s.textAlign = PS.opt.align; s.lineHeight = '1.2';
  };
  T.text = {
    async down(p) {
      if (ed) { PS.endText(); return; }
      const d = PS.doc;
      let L = PS.flat().reverse().find(n => n.type === 'text' && n.visible && n.canvas && p.x >= n.x && p.y >= n.y && p.x < n.x + n.canvas.width && p.y < n.y + n.canvas.height) || null;
      let t;
      if (L && L.locked) { PS.toast('A camada está bloqueada.'); return; }
      if (L) {
        t = L.text ? Object.assign({}, L.text) : await psdTextToOurs(L);
        Object.assign(PS.opt, { font: t.font, fontSize: t.size, bold: t.bold, italic: t.italic, align: t.align });
        PS.fg = t.color; PS.emit('color'); PS.emit('tool');
      } else t = { value: '', ax: Math.round(p.x), ay: Math.round(p.y - PS.opt.fontSize * 0.6) };
      const el = document.createElement('textarea');
      el.className = 'textedit'; el.value = t.value; el.spellcheck = false;
      const pad = L ? Math.ceil(t.size * 0.25) : 0;
      el.style.left = `${d.panX + (L ? L.x + pad : t.ax) * d.zoom}px`; el.style.top = `${d.panY + (L ? L.y + pad : t.ay) * d.zoom}px`;
      view.parentElement.appendChild(el);
      ed = { el, L, t, wasVisible: L ? L.visible : true };
      if (L) { L.visible = false; d.compDirty = true; PS.render(); }
      PS.styleText();
      const grow = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; el.style.width = 'auto'; el.style.width = Math.max(60, el.scrollWidth + 20) + 'px'; };
      el.addEventListener('input', grow);
      el.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') PS.endText(true);
        else if (e.key === 'Enter' && e.ctrlKey) PS.endText();
      });
      setTimeout(() => { el.focus(); el.select(); grow(); }, 0);
    },
  };
  PS.textEditing = () => !!ed;

  // ---------- transformação livre ----------
  const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  function xfDraw() {
    const f = PS.xf, L = f.L, hw = f.w * f.sx / 2, hh = f.h * f.sy / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => rot(x, y, f.rot));
    const x0 = Math.floor(f.cx + Math.min(...pts.map(p => p.x))), y0 = Math.floor(f.cy + Math.min(...pts.map(p => p.y)));
    const x1 = Math.ceil(f.cx + Math.max(...pts.map(p => p.x))), y1 = Math.ceil(f.cy + Math.max(...pts.map(p => p.y)));
    const c = PS.mk(x1 - x0, y1 - y0), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.translate(f.cx - x0, f.cy - y0); x.rotate(f.rot); x.scale(f.sx, f.sy); x.drawImage(f.src, -f.w / 2, -f.h / 2);
    L.canvas = c; L.x = x0; L.y = y0;
    PS.doc.compDirty = true; PS.emit('xf'); PS.render();
  }
  PS.startXf = () => {
    const L = PS.active();
    if (PS.xf || !L) return;
    if (L.type === 'group' || L.type === 'adjust' || !L.canvas) { PS.toast('Transformação livre: escolha uma camada com conteúdo.'); return; }
    if (L.locked) { PS.toast('A camada está bloqueada.'); return; }
    PS.endText();
    // a caixa abraça o conteúdo visível, sem a sobra transparente; `o` guarda a camada como estava
    const b = PS.bounds(L) || { x: L.x, y: L.y, w: L.canvas.width, h: L.canvas.height };
    const src = PS.mk(b.w, b.h); src.getContext('2d').drawImage(L.canvas, L.x - b.x, L.y - b.y);
    PS.xf = { L, o: { canvas: L.canvas, x: L.x, y: L.y }, src, x0: b.x, y0: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2, sx: 1, sy: 1, rot: 0 };
    PS.emit('tool'); PS.render();
  };
  PS.setXf = v => { Object.assign(PS.xf, v); xfDraw(); };
  PS.endXf = apply => {
    const f = PS.xf; if (!f) return;
    PS.xf = null;
    const L = f.L, changed = f.sx !== 1 || f.sy !== 1 || f.rot !== 0;
    const dx = Math.round(f.cx - (f.x0 + f.w / 2)), dy = Math.round(f.cy - (f.y0 + f.h / 2));
    if (!apply || (!changed && !dx && !dy)) { L.canvas = f.o.canvas; L.x = f.o.x; L.y = f.o.y; PS.doc.compDirty = true; PS.emit('tool'); PS.render(); return; }
    if (!changed) { L.canvas = f.o.canvas; L.x = f.o.x + dx; L.y = f.o.y + dy; if (L.text) { L.text.ax += dx; L.text.ay += dy; } }
    else if (L.text && f.rot === 0) {
      const t = L.text, nx = f.cx - f.w * f.sx / 2, ny = f.cy - f.h * f.sy / 2;
      t.ax = nx + (t.ax - f.x0) * f.sx; t.ay = ny + (t.ay - f.y0) * f.sy; t.size = Math.max(1, Math.round(t.size * f.sy));
      PS.renderText(L);
    } else { if (L.type === 'text') { L.type = 'raster'; L.text = null; } PS.touch(L); }
    PS.emit('tool'); PS.commit('Transformação livre');
  };
  const xfHandlePos = (f, h) => { const r = rot(h[0] * f.w * f.sx / 2, h[1] * f.h * f.sy / 2, f.rot); return { x: f.cx + r.x, y: f.cy + r.y }; };
  const hitHandle = (f, p) => HANDLES.find(h => { const q = xfHandlePos(f, h); return Math.hypot(q.x - p.x, q.y - p.y) * PS.doc.zoom < 9; });
  const handleCursor = (f, h) => ['ew', 'nwse', 'ns', 'nesw'][(Math.round((Math.atan2(h[1], h[0]) + f.rot) / (Math.PI / 4)) % 4 + 4) % 4] + '-resize';
  // Mover: a camada ativa já aparece com a caixa e as alças; puxar uma alça entra na transformação livre.
  const mvFrame = () => {
    const d = PS.doc, L = PS.tool === 'move' && PS.opt.showXf && d && !d.sel && !PS.xf && PS.active();
    if (!L || L.locked || !L.visible || L.type === 'group' || L.type === 'adjust' || (d.multi || []).length) return null;
    const b = PS.bounds(L);
    return b && { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, sx: 1, sy: 1, rot: 0 };
  };
  let xd = null;
  function xfDown(p) {
    const f = PS.xf, hd = hitHandle(f, p);
    xd = { p, f0: Object.assign({}, f), mode: 'rotate' };
    if (hd) { xd.mode = 'scale'; xd.h = hd; return; }
    const l = rot(p.x - f.cx, p.y - f.cy, -f.rot);
    if (Math.abs(l.x) <= f.w * f.sx / 2 && Math.abs(l.y) <= f.h * f.sy / 2) xd.mode = 'move';
  }
  function xfMove(p, e) {
    const f = PS.xf, o = xd.f0;
    if (xd.mode === 'move') { f.cx = o.cx + p.x - xd.p.x; f.cy = o.cy + p.y - xd.p.y; }
    else if (xd.mode === 'rotate') {
      let a = o.rot + Math.atan2(p.y - o.cy, p.x - o.cx) - Math.atan2(xd.p.y - o.cy, xd.p.x - o.cx);
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      f.rot = a;
    } else {
      const [hx, hy] = xd.h, ow = o.w * o.sx, oh = o.h * o.sy;
      const an = rot(-hx * ow / 2, -hy * oh / 2, o.rot), ax = o.cx + an.x, ay = o.cy + an.y;
      const v = rot(p.x - ax, p.y - ay, -o.rot);
      let nw = hx ? Math.max(1, Math.abs(v.x)) : ow, nh = hy ? Math.max(1, Math.abs(v.y)) : oh;
      if (hx && hy && !e.shiftKey) { const k = Math.max(nw / ow, nh / oh); nw = ow * k; nh = oh * k; }
      const c = rot(hx * nw / 2, hy * nh / 2, o.rot);
      f.cx = ax + c.x; f.cy = ay + c.y; f.sx = nw / o.w; f.sy = nh / o.h;
    }
    xfDraw();
  }

  // ---------- teclas Enter / Esc ----------
  PS.confirm = () => {
    if (PS.closePoly()) return;
    if (PS.xf) PS.endXf(true);
    else if (PS.cropRect) { const r = PS.cropRect; PS.cropRect = null; PS.cropTo(r); PS.emit('tool'); }
  };
  PS.cancel = () => {
    if (PS.closePoly(true)) return;
    if (PS.xf) PS.endXf(false);
    else if (PS.cropRect) { PS.cropRect = null; PS.emit('tool'); PS.render(); }
    else if (PS.doc && PS.doc.sel) PS.deselect();
  };
  PS.setTool = name => {
    if (PS.xf) PS.endXf(true);
    PS.endText(); PS.closePoly(true);
    if (PS.cropRect) { PS.cropRect = null; }
    PS.tool = name; PS.pv = null;
    PS.emit('tool'); PS.render();
  };

  // ---------- desenho por cima da tela ----------
  PS.overlay = (ctx, d, px, py, z) => {
    ctx.save(); ctx.translate(px, py); ctx.scale(z, z); ctx.lineWidth = 1 / z;
    const ants = path => { ctx.strokeStyle = '#fff'; ctx.setLineDash([]); ctx.stroke(path); ctx.strokeStyle = '#000'; ctx.setLineDash([4 / z, 4 / z]); ctx.stroke(path); ctx.setLineDash([]); };
    if (PS.pv) ants(PS.pv);
    if (PS.pvLine) { const q = new Path2D(); q.moveTo(PS.pvLine.a.x, PS.pvLine.a.y); q.lineTo(PS.pvLine.b.x, PS.pvLine.b.y); ants(q); }
    if (PS.cropRect) {
      const r = PS.cropRect, q = new Path2D();
      q.rect(-px / z, -py / z, ctx.canvas.width / z, ctx.canvas.height / z); q.rect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill(q, 'evenodd');
      ctx.strokeStyle = '#fff'; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(r.x + r.w * i / 3, r.y); ctx.lineTo(r.x + r.w * i / 3, r.y + r.h); ctx.moveTo(r.x, r.y + r.h * i / 3); ctx.lineTo(r.x + r.w, r.y + r.h * i / 3); ctx.stroke(); }
    }
    const f = PS.xf || mvFrame();
    if (f) {
      const c = HANDLES.filter((h, i) => i % 2 === 0).map(h => xfHandlePos(f, h));
      ctx.strokeStyle = '#4c9ffe'; ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const h of HANDLES) { const q = xfHandlePos(f, h), s = 4 / z; ctx.fillRect(q.x - s, q.y - s, s * 2, s * 2); ctx.strokeRect(q.x - s, q.y - s, s * 2, s * 2); }
    }
    const t = T[PS.tool];
    if (PS.tool === 'clone' && PS.cloneSrc) {
      const s = PS.cloneSrc, k = 6 / z;
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(s.x - k, s.y); ctx.lineTo(s.x + k, s.y); ctx.moveTo(s.x, s.y - k); ctx.lineTo(s.x, s.y + k); ctx.stroke();
    }
    if (t && t.paint && mouse.inside && !PS.space && !PS.xf) {
      const r = Math.max(0.5, PS.opt.size / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r + 1 / z, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (PS.drawExtras) PS.drawExtras(ctx, d, px, py, z);
    if (PS.drawRulers) PS.drawRulers(ctx, d, px, py, z, mouse);
  };

  // ---------- ponteiro ----------
  PS.initTools = v => {
    view = v;
    const pos = e => {
      const r = v.getBoundingClientRect();
      mouse.sx = e.clientX - r.left; mouse.sy = e.clientY - r.top;
      const p = PS.toDoc(mouse.sx, mouse.sy); mouse.x = p.x; mouse.y = p.y;
      return p;
    };
    v.addEventListener('pointerdown', e => {
      const d = PS.doc; if (!d) return;
      const p = pos(e);
      v.setPointerCapture(e.pointerId);
      PS.stopMotion();
      if (e.button === 1 || PS.space || (PS.tool === 'hand' && e.button === 0)) { drag = { pan: true, sx: e.clientX, sy: e.clientY, px: d.panX, py: d.panY, rastro: [] }; v.style.cursor = 'grabbing'; return; }
      if (e.button !== 0) return;
      if (PS.guideDown(p, e, mouse)) { drag = { guide: true }; return; }
      if (PS.xf) { xfDown(p); drag = { xf: true }; return; }
      const mf = mvFrame();
      if (mf && hitHandle(mf, p)) { PS.startXf(); if (PS.xf) { xfDown(p); drag = { xf: true }; return; } }
      const t = T[PS.tool]; if (!t || !t.down) return;
      if (PS.tool !== 'text') PS.endText();
      drag = { t };
      t.down(p, e);
    });
    v.addEventListener('pointermove', e => {
      const d = PS.doc; if (!d) return;
      const p = pos(e); mouse.inside = true;
      if (drag && drag.pan) {
        d.panX = drag.px + e.clientX - drag.sx; d.panY = drag.py + e.clientY - drag.sy;
        drag.rastro.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (drag.rastro.length > 6) drag.rastro.shift();
      }
      else if (drag && drag.guide) PS.guideMove(p);
      else if (drag && drag.xf) xfMove(p, e);
      else if (drag && drag.t.move) drag.t.move(p, e);
      else if (!drag && !PS.xf && T[PS.tool] && T[PS.tool].hover) T[PS.tool].hover(p, e);
      if (!drag) { // em cima de uma alça o ponteiro vira a seta de redimensionar
        const hf = PS.xf || mvFrame(), hd = hf && hitHandle(hf, p), c = hd ? handleCursor(hf, hd) : null;
        if (c !== PS.hcur) { PS.hcur = c; PS.emit('cursor'); }
      }
      PS.emit('mouse', p); PS.render();
    });
    const up = e => {
      if (!drag) return;
      const g = drag; drag = null;
      if (g.guide) { pos(e); PS.guideUp(mouse); return; }
      if (g.pan) { // soltou a mão em movimento: a vista desliza e vai parando
        PS.emit('tool');
        const r = g.rastro, a = r[0], b = r[r.length - 1], agora = performance.now();
        if (a && b !== a && agora - b.t < 60 && b.t > a.t) PS.glide((b.x - a.x) / (b.t - a.t), (b.y - a.y) / (b.t - a.t));
        return;
      }
      if (g.t && g.t.up) g.t.up(pos(e), e);
    };
    v.addEventListener('pointerup', up);
    v.addEventListener('pointercancel', up);
    v.addEventListener('pointerleave', () => { mouse.inside = false; PS.render(); });
    v.addEventListener('dblclick', () => { if (PS.xf || PS.cropRect || PS.tool === 'polylasso') PS.confirm(); });
    v.addEventListener('wheel', e => {
      if (!PS.doc) return;
      e.preventDefault();
      const r = v.getBoundingClientRect();
      PS.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  };
})();
