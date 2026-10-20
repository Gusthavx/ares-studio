'use strict';
// Uso diário: várias camadas selecionadas, alinhar/distribuir, guias com encaixe, corte com alças, arquivos recentes.
(function () {
  const PS = window.PS, T = PS.tools;
  const leaves = L => L.children ? PS.flat(L.children).filter(n => n.type !== 'group') : [L];

  // ---------- várias camadas selecionadas ----------
  PS.selected = () => {
    const d = PS.doc, out = []; if (!d) return out;
    for (const id of [d.active].concat(d.multi || [])) { const r = PS.locate(id); if (r && !out.includes(r.node)) out.push(r.node); }
    return out;
  };
  PS.pickLayer = (id, mode) => {
    const d = PS.doc; d.multi = (d.multi || []).filter(x => PS.locate(x));
    if (mode === 'toggle') {
      if (id === d.active) { if (d.multi.length) d.active = d.multi.pop(); }
      else if (d.multi.includes(id)) d.multi = d.multi.filter(x => x !== id);
      else { d.multi.push(d.active); d.active = id; }
    } else if (mode === 'range') {
      const order = PS.flat().map(n => n.id), a = order.indexOf(d.active), b = order.indexOf(id);
      d.multi = a < 0 || b < 0 ? [] : order.slice(Math.min(a, b), Math.max(a, b) + 1).filter(x => x !== id);
      d.active = id;
    } else { d.active = id; d.multi = []; }
    d.maskEdit = false; PS.emit('layers');
  };
  PS.moveSet = () => { const out = []; for (const L of PS.selected()) if (!L.locked) for (const n of leaves(L)) if (!out.includes(n)) out.push(n); return out; };
  PS.shift = (nodes, dx, dy) => nodes.forEach(n => { n.x += dx; n.y += dy; if (n.text) { n.text.ax += dx; n.text.ay += dy; } });
  PS.nudge = (dx, dy) => { const ns = PS.moveSet(); if (!ns.length) return; PS.shift(ns, dx, dy); PS.commit('Mover'); };

  // Caixa do conteúdo visível (sem a sobra transparente), em coordenadas do documento.
  PS.bounds = n => {
    if (!n.canvas) return null;
    if (!n._bb || n._bb.rev !== n.rev) {
      const w = n.canvas.width, h = n.canvas.height, a = n.canvas.getContext('2d').getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0, i = 3; y < h; y++) for (let x = 0; x < w; x++, i += 4) if (a[i] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      n._bb = { rev: n.rev, b: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
    }
    const b = n._bb.b;
    return b && { x: n.x + b.x, y: n.y + b.y, w: b.w, h: b.h };
  };
  const union = list => {
    const bs = list.filter(Boolean); if (!bs.length) return null;
    const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
    return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y };
  };
  PS.boundsOf = L => union(leaves(L).map(PS.bounds));

  PS.align = how => {
    const d = PS.doc, items = PS.selected().filter(l => !l.locked).map(L => ({ L, b: PS.boundsOf(L) })).filter(i => i.b);
    if (!items.length) { PS.toast('Nada para alinhar nas camadas escolhidas.'); return; }
    // Uma camada: alinha à seleção (se houver) ou à tela. Várias: alinham entre si.
    const ref = items.length > 1 ? union(items.map(i => i.b)) : (PS.selBounds() || { x: 0, y: 0, w: d.w, h: d.h });
    for (const { L, b } of items) {
      const dx = how === 'l' ? ref.x - b.x : how === 'hc' ? ref.x + ref.w / 2 - (b.x + b.w / 2) : how === 'r' ? ref.x + ref.w - (b.x + b.w) : 0;
      const dy = how === 't' ? ref.y - b.y : how === 'vc' ? ref.y + ref.h / 2 - (b.y + b.h / 2) : how === 'b' ? ref.y + ref.h - (b.y + b.h) : 0;
      PS.shift(leaves(L), Math.round(dx), Math.round(dy));
    }
    PS.commit('Alinhar camadas');
  };
  PS.distribute = axis => {
    const items = PS.selected().filter(l => !l.locked).map(L => ({ L, b: PS.boundsOf(L) })).filter(i => i.b);
    if (items.length < 3) { PS.toast('Distribuir precisa de 3 ou mais camadas selecionadas (Ctrl+clique no painel).'); return; }
    const c = i => axis === 'h' ? i.b.x + i.b.w / 2 : i.b.y + i.b.h / 2;
    items.sort((p, q) => c(p) - c(q));
    const a = c(items[0]), step = (c(items[items.length - 1]) - a) / (items.length - 1);
    items.forEach((it, k) => { const dlt = Math.round(a + step * k - c(it)); PS.shift(leaves(it.L), axis === 'h' ? dlt : 0, axis === 'h' ? 0 : dlt); });
    PS.commit('Distribuir camadas');
  };
  PS.delLayer = () => {
    const d = PS.doc, sel = PS.selected(); if (!sel.length) return;
    if (!d.layers.some(l => !sel.includes(l))) { PS.toast('O documento precisa de pelo menos uma camada.'); return; }
    let viz = null;
    for (const L of sel) { const r = PS.locate(L.id); if (!r) continue; r.list.splice(r.idx, 1); viz = viz || r.list[Math.min(r.idx, r.list.length - 1)] || r.parent; }
    d.active = (viz && PS.locate(viz.id) ? viz : d.layers[d.layers.length - 1]).id; d.multi = [];
    PS.commit(sel.length > 1 ? 'Excluir camadas' : 'Excluir camada');
  };
  PS.groupLayer = () => {
    const d = PS.doc; let rs = PS.selected().map(L => PS.locate(L.id));
    if (!rs.length) return;
    if (rs.some(r => r.list !== rs[0].list)) rs = [rs[0]]; // camadas em pastas diferentes: agrupa só a ativa
    const list = rs[0].list, nodes = rs.map(r => r.node).sort((a, b) => list.indexOf(a) - list.indexOf(b)), at = list.indexOf(nodes[0]);
    const g = PS.mkLayer({ name: PS.nameFor('Grupo'), type: 'group', blend: 'pass through', children: nodes });
    for (const n of nodes) list.splice(list.indexOf(n), 1);
    list.splice(at, 0, g); d.active = g.id; d.multi = [];
    PS.commit('Agrupar camadas');
  };

  // ---------- guias e encaixe ----------
  const S = 18; // largura das réguas
  PS.showGuides = true; PS.snap = true; PS.snapLines = [];
  let gd = null;
  PS.guideDown = (p, e, m) => {
    const d = PS.doc; d.guides = d.guides || [];
    if (PS.rulers && (m.sy < S || m.sx < S)) {
      if (!(m.sy < S && m.sx < S)) gd = { g: { o: m.sy < S ? 'h' : 'v', p: 0 } }; // arrastar da régua cria guia
      else gd = { g: null };
      return true; // clique na régua nunca chega à ferramenta
    }
    if (PS.showGuides && PS.tool === 'move' && !e.ctrlKey) {
      const t = 5 / d.zoom, g = d.guides.find(k => Math.abs((k.o === 'h' ? p.y : p.x) - k.p) < t);
      if (g) { gd = { g }; return true; }
    }
    return false;
  };
  PS.guideMove = p => {
    const d = PS.doc, g = gd && gd.g; if (!g) return;
    g.p = Math.round(g.o === 'h' ? p.y : p.x);
    if (!d.guides.includes(g)) { d.guides.push(g); PS.showGuides = true; }
  };
  PS.guideUp = m => {
    const d = PS.doc, g = gd && gd.g; gd = null; if (!g) return;
    const i = d.guides.indexOf(g); if (i < 0) return;
    if ((g.o === 'h' && m.sy < S) || (g.o === 'v' && m.sx < S)) d.guides.splice(i, 1); // devolvida à régua = apagada
    d.dirty = true; PS.emit('doc'); PS.render();
  };
  PS.clearGuides = () => { const d = PS.doc; if (!d.guides || !d.guides.length) return; d.guides = []; d.dirty = true; PS.emit('doc'); PS.render(); };
  // Ajusta o deslocamento para as bordas/centro do que se move encaixarem em guias, bordas e centro da tela.
  PS.snapMove = (b, dx, dy) => {
    PS.snapLines = [];
    const d = PS.doc; if (!PS.snap || !b) return [dx, dy];
    const th = 6 / d.zoom, gs = PS.showGuides ? (d.guides || []) : [];
    const eixo = (pos, size, delta, alvos, o) => {
      let best = null;
      for (const f of [0, 0.5, 1]) for (const t of alvos) { const df = t - (pos + size * f + delta); if (Math.abs(df) < th && (!best || Math.abs(df) < Math.abs(best.df))) best = { df, t }; }
      if (!best) return delta;
      PS.snapLines.push({ o, p: best.t });
      return Math.round(delta + best.df);
    };
    return [eixo(b.x, b.w, dx, [0, d.w / 2, d.w].concat(gs.filter(g => g.o === 'v').map(g => g.p)), 'v'),
      eixo(b.y, b.h, dy, [0, d.h / 2, d.h].concat(gs.filter(g => g.o === 'h').map(g => g.p)), 'h')];
  };
  PS.moveBounds = () => union(PS.moveSet().map(PS.bounds));
  // guias acompanham mudanças no tamanho do documento
  const reframe0 = PS.reframe, resize0 = PS.resizeImage, turn0 = PS.turnDoc;
  PS.reframe = (nw, nh, dx, dy, name) => { (PS.doc.guides || []).forEach(g => { g.p += g.o === 'h' ? dy : dx; }); reframe0(nw, nh, dx, dy, name); };
  PS.resizeImage = (nw, nh) => { const d = PS.doc, sx = nw / d.w, sy = nh / d.h; (d.guides || []).forEach(g => { g.p = Math.round(g.p * (g.o === 'h' ? sy : sx)); }); resize0(nw, nh); };
  PS.turnDoc = kind => { PS.doc.guides = []; turn0(kind); };

  // ---------- corte com alças ----------
  const HS = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
  const norm = (x0, y0, x1, y1) => ({ x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), w: Math.round(Math.abs(x1 - x0)), h: Math.round(Math.abs(y1 - y0)) });
  let cs = null;
  T.crop = {
    down(p) {
      const r = PS.cropRect, z = PS.doc.zoom;
      cs = { p, mode: 'new' };
      if (!r) return;
      for (const h of HS) if (Math.hypot(r.x + r.w * h[0] - p.x, r.y + r.h * h[1] - p.y) * z < 9) { cs = { p, mode: 'size', h, r0: Object.assign({}, r) }; return; }
      if (p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) cs = { p, mode: 'move', r0: Object.assign({}, r) };
    },
    move(p, e) {
      if (!cs) return;
      const dx = p.x - cs.p.x, dy = p.y - cs.p.y, r = cs.r0;
      if (cs.mode === 'new') {
        if (Math.hypot(dx, dy) * PS.doc.zoom < 3) return;
        let w = dx, h = dy;
        if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        PS.cropRect = norm(cs.p.x, cs.p.y, cs.p.x + w, cs.p.y + h);
      } else if (cs.mode === 'move') PS.cropRect = { x: Math.round(r.x + dx), y: Math.round(r.y + dy), w: r.w, h: r.h };
      else {
        const [hx, hy] = cs.h;
        PS.cropRect = norm(r.x + (hx === 0 ? dx : 0), r.y + (hy === 0 ? dy : 0), r.x + r.w + (hx === 1 ? dx : 0), r.y + r.h + (hy === 1 ? dy : 0));
      }
      PS.render();
    },
    up() { cs = null; if (PS.cropRect && (PS.cropRect.w < 2 || PS.cropRect.h < 2)) PS.cropRect = null; PS.emit('tool'); PS.render(); },
  };

  // ---------- desenho por cima: guias, linhas de encaixe e alças do corte ----------
  PS.drawExtras = (ctx, d, px, py, z) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const linha = (g, cor) => {
      ctx.strokeStyle = cor; ctx.beginPath();
      if (g.o === 'h') { const y = Math.round(py + g.p * z) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); } else { const x = Math.round(px + g.p * z) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      ctx.stroke();
    };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 1;
    if (PS.showGuides) (d.guides || []).forEach(g => linha(g, '#3fd0ff'));
    (PS.snapLines || []).forEach(g => linha(g, '#ff3fd0'));
    if (PS.cropRect && PS.tool === 'crop') {
      const r = PS.cropRect; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
      for (const h of HS) { const x = Math.round(px + (r.x + r.w * h[0]) * z), y = Math.round(py + (r.y + r.h * h[1]) * z); ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); }
    }
    ctx.restore();
  };

  // ---------- arquivos recentes ----------
  const KEY = 'ares.recentes';
  PS.recents = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  PS.addRecent = p => { if (!p) return; try { localStorage.setItem(KEY, JSON.stringify([p].concat(PS.recents().filter(x => x !== p)).slice(0, 12))); } catch (e) { /* sem armazenamento */ } };
})();
