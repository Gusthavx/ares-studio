'use strict';
// Operações de camada, edição, seleção e imagem (o que os menus chamam).
(function () {
  const PS = window.PS;
  const toast = m => PS.emit('toast', m);
  PS.toast = toast;

  PS.nameFor = base => {
    let n = 0;
    PS.walk(PS.doc.layers, l => { const m = new RegExp('^' + base + ' (\\d+)$').exec(l.name); if (m) n = Math.max(n, +m[1]); });
    return `${base} ${n + 1}`;
  };
  PS.insertAbove = node => {
    const d = PS.doc, r = PS.locate(d.active);
    if (r) r.list.splice(r.idx + 1, 0, node); else d.layers.push(node);
    d.active = node.id; d.multi = [];
    return node;
  };
  // Camada onde dá para pintar; avisa quando não dá.
  PS.paintTarget = allowMask => {
    const L = PS.active();
    if (!L) return null;
    if (allowMask && PS.doc.maskEdit && L.mask && !L.locked) return L;
    if (L.type === 'group' || L.type === 'adjust') { toast('Escolha uma camada de pixels (não um grupo/ajuste).'); return null; }
    if (L.type === 'text') { toast('Camada de texto: use Camada › Rasterizar antes de pintar.'); return null; }
    if (L.locked) { toast('A camada está bloqueada.'); return null; }
    if (!L.visible) { toast('A camada está oculta.'); return null; }
    return L;
  };

  // ---------- camadas ----------
  PS.newLayer = () => { PS.insertAbove(PS.mkLayer({ name: PS.nameFor('Camada') })); PS.commit('Nova camada'); };
  function dup(n) {
    const c = Object.assign({}, n, { id: PS.uid(), rev: PS.nextRev() });
    delete c._snap; delete c._msnap;
    if (n.canvas) c.canvas = PS.clone(n.canvas);
    if (n.mask) c.mask = Object.assign({}, n.mask, { canvas: PS.clone(n.mask.canvas), rev: PS.nextRev() });
    if (n.text) c.text = Object.assign({}, n.text);
    if (n.src) { c.src = Object.assign({}, n.src); delete c.src.id; }
    if (n.children) c.children = n.children.map(dup);
    return c;
  }
  PS.dupLayer = () => {
    const L = PS.active(); if (!L) return;
    const c = dup(L); c.name = L.name + ' cópia';
    PS.insertAbove(c); PS.commit('Duplicar camada');
  };
  PS.delLayer = () => {
    const d = PS.doc, r = PS.locate(d.active); if (!r) return;
    if (d.layers.length === 1 && r.list === d.layers) { toast('O documento precisa de pelo menos uma camada.'); return; }
    r.list.splice(r.idx, 1);
    const nb = r.list[Math.min(r.idx, r.list.length - 1)] || r.parent || d.layers[d.layers.length - 1];
    d.active = nb.id;
    PS.commit('Excluir camada');
  };
  PS.groupLayer = () => {
    const d = PS.doc, r = PS.locate(d.active); if (!r) return;
    const g = PS.mkLayer({ name: PS.nameFor('Grupo'), type: 'group', blend: 'pass through', children: [r.node] });
    r.list[r.idx] = g; d.active = g.id;
    PS.commit('Agrupar camadas');
  };
  PS.newGroup = () => {
    PS.insertAbove(PS.mkLayer({ name: PS.nameFor('Grupo'), type: 'group', blend: 'pass through', children: [] }));
    PS.commit('Novo grupo');
  };
  PS.ungroup = () => {
    const d = PS.doc, r = PS.locate(d.active); if (!r || r.node.type !== 'group') return;
    r.list.splice(r.idx, 1, ...r.node.children);
    d.active = (r.node.children[r.node.children.length - 1] || r.list[0] || {}).id;
    PS.commit('Desagrupar');
  };
  PS.moveLayer = (id, targetId, where) => {
    if (id === targetId) return;
    const a = PS.locate(id), t0 = PS.locate(targetId); if (!a || !t0) return;
    if (a.node.children && PS.locate(targetId, a.node.children)) return;
    a.list.splice(a.idx, 1);
    const t = PS.locate(targetId);
    if (where === 'into' && t.node.type === 'group') { t.node.children.push(a.node); t.node.open = true; }
    else t.list.splice(where === 'below' ? t.idx : t.idx + 1, 0, a.node);
    PS.commit('Reordenar camadas');
  };
  PS.orderLayer = dir => {
    const r = PS.locate(PS.doc.active); if (!r) return;
    const j = r.idx + dir; if (j < 0 || j >= r.list.length) return;
    [r.list[r.idx], r.list[j]] = [r.list[j], r.list[r.idx]];
    PS.commit('Reordenar camadas');
  };
  function renderNodes(nodes) {
    const d = PS.doc, c = PS.mk(d.w, d.h);
    PS.renderList(nodes, c.getContext('2d'), d);
    return c;
  }
  PS.mergeDown = () => {
    const d = PS.doc, r = PS.locate(d.active); if (!r) return;
    if (r.node.type === 'group') {
      const m = PS.mkLayer({ name: r.node.name, canvas: renderNodes([Object.assign({}, r.node, { visible: true, clipping: false })]) });
      r.list[r.idx] = m; d.active = m.id; PS.commit('Mesclar grupo'); return;
    }
    if (r.idx === 0) { toast('Não há camada abaixo para mesclar.'); return; }
    const below = r.list[r.idx - 1];
    if (below.type === 'adjust') { toast('A camada de baixo é um ajuste.'); return; }
    const m = PS.mkLayer({ name: below.name, canvas: renderNodes([Object.assign({}, below, { visible: true, clipping: false }), Object.assign({}, r.node, { visible: true })]) });
    r.list.splice(r.idx - 1, 2, m); d.active = m.id;
    PS.commit('Mesclar para baixo');
  };
  PS.flatten = () => {
    const d = PS.doc;
    PS.renderDoc(d);
    const m = PS.mkLayer({ name: 'Plano de fundo', canvas: PS.clone(d.comp) });
    d.layers = [m]; d.active = m.id;
    PS.commit('Achatar imagem');
  };
  PS.mergeVisible = () => {
    const d = PS.doc;
    PS.renderDoc(d);
    const m = PS.mkLayer({ name: PS.nameFor('Camada'), canvas: PS.clone(d.comp) });
    d.layers = d.layers.filter(l => !l.visible).concat([m]); d.active = m.id;
    PS.commit('Mesclar visíveis');
  };
  PS.rasterize = () => {
    const L = PS.active(); if (!L || L.type === 'group' || L.type === 'adjust') return;
    L.type = 'raster'; L.text = null; PS.touch(L);
    PS.commit('Rasterizar camada');
  };
  PS.toggleClip = () => { const L = PS.active(); if (!L) return; L.clipping = !L.clipping; PS.commit(L.clipping ? 'Criar máscara de corte' : 'Soltar máscara de corte'); };
  PS.setProp = (L, k, v, name) => { if (L[k] === v) return; L[k] = v; PS.commit(name); };

  // ---------- máscaras ----------
  PS.addMask = () => {
    const d = PS.doc, L = PS.active(); if (!L) return;
    if (L.mask) { toast('A camada já tem máscara.'); return; }
    const c = PS.mk(d.w, d.h), x = c.getContext('2d');
    if (d.sel) x.drawImage(d.sel, 0, 0); else { x.fillStyle = '#fff'; x.fillRect(0, 0, d.w, d.h); }
    L.mask = { canvas: c, enabled: true, def: d.sel ? 0 : 255, rev: PS.nextRev() };
    if (d.sel) PS.setSel(null);
    PS.commit('Adicionar máscara');
  };
  PS.delMask = () => { const L = PS.active(); if (!L || !L.mask) return; L.mask = null; PS.doc.maskEdit = false; PS.commit('Excluir máscara'); };
  PS.toggleMask = () => { const L = PS.active(); if (!L || !L.mask) return; L.mask.enabled = !L.mask.enabled; PS.commit(L.mask.enabled ? 'Ativar máscara' : 'Desativar máscara'); };
  PS.invertMask = () => {
    const d = PS.doc, L = PS.active(); if (!L || !L.mask) return;
    const c = PS.mk(d.w, d.h), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, d.w, d.h); x.globalCompositeOperation = 'destination-out'; x.drawImage(L.mask.canvas, 0, 0);
    L.mask.canvas = c; L.mask.def = 255 - L.mask.def; PS.touchMask(L);
    PS.commit('Inverter máscara');
  };
  PS.applyMask = () => {
    const L = PS.active(); if (!L || !L.mask || L.type !== 'raster' || !L.canvas) { toast('Aplicar máscara vale só para camada de pixels.'); return; }
    const x = L.canvas.getContext('2d');
    x.globalCompositeOperation = 'destination-in'; x.drawImage(L.mask.canvas, -L.x, -L.y); x.globalCompositeOperation = 'source-over';
    L.mask = null; PS.doc.maskEdit = false; PS.touch(L);
    PS.commit('Aplicar máscara');
  };

  // ---------- seleção ----------
  PS.selectAll = () => { const d = PS.doc, p = new Path2D(); p.rect(0, 0, d.w, d.h); const f = PS.opt.feather; PS.opt.feather = 0; PS.selFromPath(p); PS.opt.feather = f; PS.commit('Selecionar tudo'); };
  PS.deselect = () => { if (!PS.doc.sel) return; PS.setSel(null); PS.commit('Desfazer seleção'); };
  PS.invertSel = () => {
    const d = PS.doc; if (!d.sel) return PS.selectAll();
    const c = PS.mk(d.w, d.h), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, d.w, d.h); x.globalCompositeOperation = 'destination-out'; x.drawImage(d.sel, 0, 0);
    PS.setSel(c); PS.commit('Inverter seleção');
  };
  PS.featherSel = r => {
    const d = PS.doc; if (!d.sel || !(r > 0)) return;
    const c = PS.mk(d.w, d.h), x = c.getContext('2d');
    x.filter = `blur(${r}px)`; x.drawImage(d.sel, 0, 0);
    PS.setSel(c); PS.commit('Difusão da seleção');
  };
  PS.selFromLayer = L => {
    const d = PS.doc; if (!L || !L.canvas) return;
    const c = PS.mk(d.w, d.h), x = c.getContext('2d');
    x.drawImage(L.canvas, L.x, L.y); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, d.w, d.h);
    PS.setSel(c); PS.commit('Carregar seleção');
  };

  // ---------- editar ----------
  PS.copy = merged => {
    const d = PS.doc, L = PS.active(); if (!d) return false;
    if (!merged && (!L || !L.canvas)) { toast('Nada para copiar nesta camada.'); return false; }
    const s = PS.scratch(d.w, d.h), x = s.getContext('2d');
    if (merged) { PS.renderDoc(d); x.drawImage(d.comp, 0, 0); } else x.drawImage(L.canvas, L.x, L.y);
    PS.clipToSel(s);
    const b = PS.selBounds() || { x: 0, y: 0, w: d.w, h: d.h };
    const out = PS.mk(b.w, b.h); out.getContext('2d').drawImage(s, -b.x, -b.y);
    PS.release(s);
    PS.clip = { canvas: out, x: b.x, y: b.y };
    try { out.toBlob(bl => navigator.clipboard.write([new ClipboardItem({ 'image/png': bl })]).catch(() => { })); } catch (e) { /* sem área de transferência do sistema */ }
    return true;
  };
  PS.clearSel = name => {
    const d = PS.doc, L = PS.paintTarget(); if (!L || !L.canvas) return;
    if (!d.sel) { toast('Faça uma seleção primeiro.'); return; }
    const x = L.canvas.getContext('2d');
    x.globalCompositeOperation = 'destination-out'; x.drawImage(d.sel, -L.x, -L.y); x.globalCompositeOperation = 'source-over';
    PS.touch(L); PS.commit(name || 'Apagar');
  };
  PS.cut = () => { if (PS.copy(false)) PS.clearSel('Recortar'); };
  PS.pasteCanvas = (canvas, x, y, name) => {
    const d = PS.doc; if (!d) return;
    if (x == null) { x = Math.round((d.w - canvas.width) / 2); y = Math.round((d.h - canvas.height) / 2); }
    PS.insertAbove(PS.mkLayer({ name: name || PS.nameFor('Camada'), canvas: PS.clone(canvas), x, y }));
    if (d.sel) PS.setSel(null);
    PS.commit('Colar');
  };
  PS.paste = () => { if (PS.clip) PS.pasteCanvas(PS.clip.canvas, PS.clip.x, PS.clip.y); };
  PS.fill = color => {
    const d = PS.doc, L = PS.paintTarget(); if (!L) return;
    PS.expand(L);
    const t = PS.scratch(d.w, d.h), tx = t.getContext('2d');
    tx.fillStyle = color; tx.fillRect(0, 0, d.w, d.h); PS.clipToSel(t);
    const x = L.canvas.getContext('2d');
    x.globalCompositeOperation = L.lockAlpha ? 'source-atop' : 'source-over';
    x.drawImage(t, -L.x, -L.y); x.globalCompositeOperation = 'source-over';
    PS.release(t); PS.touch(L); PS.commit('Preencher');
  };

  // ---------- texto ----------
  PS.FONTS = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Georgia', 'Impact', 'Segoe UI', 'Segoe Print', 'Segoe Script', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  const meas = PS.mk(4, 4).getContext('2d');
  PS.textFont = t => `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size}px "${t.font}"`;
  PS.renderText = L => {
    const t = L.text, lines = t.value.split('\n'), pad = Math.ceil(t.size * 0.25), lh = Math.round(t.size * 1.2);
    meas.font = PS.textFont(t);
    const m = meas.measureText('Hg'), asc = Math.ceil(m.fontBoundingBoxAscent || t.size * 0.9);
    const tw = Math.ceil(Math.max(1, ...lines.map(s => meas.measureText(s).width)));
    const c = PS.mk(tw + pad * 2, lh * lines.length + pad * 2), x = c.getContext('2d');
    x.font = PS.textFont(t); x.fillStyle = t.color; x.textBaseline = 'alphabetic'; x.textAlign = t.align;
    const ox = t.align === 'center' ? pad + tw / 2 : t.align === 'right' ? pad + tw : pad;
    lines.forEach((s, i) => x.fillText(s, ox, pad + asc + i * lh));
    t.asc = asc;
    L.canvas = c; L.x = Math.round(t.ax - ox); L.y = Math.round(t.ay - pad);
    L.rev = PS.nextRev(); PS.doc.compDirty = true;
  };

  // ---------- imagem ----------
  function scaled(c, w, h) {
    const n = PS.mk(w, h), x = n.getContext('2d');
    x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height);
    return n;
  }
  PS.resizeImage = (nw, nh) => {
    const d = PS.doc, sx = nw / d.w, sy = nh / d.h;
    PS.walk(d.layers, L => {
      if (L.text) { L.text.size = Math.max(1, Math.round(L.text.size * sy)); L.text.ax *= sx; L.text.ay *= sy; PS.renderText(L); }
      else if (L.canvas) { L.canvas = scaled(L.canvas, L.canvas.width * sx, L.canvas.height * sy); L.x = Math.round(L.x * sx); L.y = Math.round(L.y * sy); PS.touch(L); }
      if (L.mask) { L.mask.canvas = scaled(L.mask.canvas, nw, nh); PS.touchMask(L); }
    });
    d.w = nw; d.h = nh; PS.setSel(null);
    PS.commit('Tamanho da imagem'); PS.fit();
  };
  // Muda a área do documento: novo tamanho + deslocamento do conteúdo (corte e tamanho da tela de pintura).
  PS.reframe = (nw, nh, dx, dy, name) => {
    const d = PS.doc;
    PS.walk(d.layers, L => {
      if (L.type !== 'group') { L.x += dx; L.y += dy; }
      if (L.text) { L.text.ax += dx; L.text.ay += dy; }
      if (L.mask) {
        const c = PS.mk(nw, nh), x = c.getContext('2d');
        if (L.mask.def === 255) { x.fillStyle = '#fff'; x.fillRect(0, 0, nw, nh); x.clearRect(dx, dy, d.w, d.h); }
        x.drawImage(L.mask.canvas, dx, dy);
        L.mask.canvas = c; PS.touchMask(L);
      }
    });
    d.w = nw; d.h = nh; PS.setSel(null);
    PS.commit(name); PS.fit();
  };
  PS.cropTo = b => {
    const d = PS.doc;
    const x0 = Math.max(0, Math.round(b.x)), y0 = Math.max(0, Math.round(b.y));
    const x1 = Math.min(d.w, Math.round(b.x + b.w)), y1 = Math.min(d.h, Math.round(b.y + b.h));
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    PS.reframe(x1 - x0, y1 - y0, -x0, -y0, 'Cortar');
  };
  function turn(c, kind) {
    const w = c.width, h = c.height, q = kind === 'cw' || kind === 'ccw';
    const n = PS.mk(q ? h : w, q ? w : h), x = n.getContext('2d');
    if (kind === 'cw') { x.translate(h, 0); x.rotate(Math.PI / 2); }
    else if (kind === 'ccw') { x.translate(0, w); x.rotate(-Math.PI / 2); }
    else if (kind === '180') { x.translate(w, h); x.rotate(Math.PI); }
    else if (kind === 'h') { x.translate(w, 0); x.scale(-1, 1); }
    else { x.translate(0, h); x.scale(1, -1); }
    x.drawImage(c, 0, 0);
    return n;
  }
  function turnPos(x, y, w, h, W, H, kind) {
    if (kind === 'cw') return [H - (y + h), x];
    if (kind === 'ccw') return [y, W - (x + w)];
    if (kind === '180') return [W - (x + w), H - (y + h)];
    if (kind === 'h') return [W - (x + w), y];
    return [x, H - (y + h)];
  }
  PS.turnDoc = kind => {
    const d = PS.doc, W = d.w, H = d.h, q = kind === 'cw' || kind === 'ccw';
    PS.walk(d.layers, L => {
      if (L.canvas) {
        const [nx, ny] = turnPos(L.x, L.y, L.canvas.width, L.canvas.height, W, H, kind);
        L.canvas = turn(L.canvas, kind); L.x = nx; L.y = ny;
        if (L.type === 'text') { L.type = 'raster'; L.text = null; }
        PS.touch(L);
      }
      if (L.mask) { L.mask.canvas = turn(L.mask.canvas, kind); PS.touchMask(L); }
    });
    if (q) { d.w = H; d.h = W; }
    PS.setSel(null);
    PS.commit({ cw: 'Girar 90° horário', ccw: 'Girar 90° anti-horário', 180: 'Girar 180°', h: 'Virar horizontalmente', v: 'Virar verticalmente' }[kind]);
    PS.fit();
  };
  PS.flipLayer = kind => {
    const L = PS.active(); if (!L || !L.canvas) return;
    L.canvas = turn(L.canvas, kind);
    if (L.type === 'text') { L.type = 'raster'; L.text = null; }
    PS.touch(L); PS.commit(kind === 'h' ? 'Virar camada na horizontal' : 'Virar camada na vertical');
  };
})();
