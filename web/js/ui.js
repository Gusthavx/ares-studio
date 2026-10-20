'use strict';
// Interface: menus, atalhos, barra de ferramentas e de opções, painéis, diálogos, arrastar-e-soltar.
(function () {
  const PS = window.PS, $ = s => document.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const [t, ...cls] = tag.split('.'), el = document.createElement(t || 'div');
    if (cls.length) el.className = cls.join(' ');
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el) el[k] = v; else el.setAttribute(k, v);
    }
    kids.flat().forEach(c => c != null && el.append(c));
    return el;
  };
  const ICONS = {
    move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    marquee: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6.5" stroke-dasharray="3 2"/>',
    lasso: '<path d="M4 10c0-3.5 3.6-6 8-6s8 2.5 8 6-3.6 6-8 6c-1.2 0-2.3-.2-3.3-.5M8.7 15.5c-1.5 0-2.7 1-2.7 2.3S7 20 8.2 20c1.5 0 2-1.2 1.5-2.6"/>',
    object: '<rect x="3" y="4" width="14" height="12" stroke-dasharray="3 2"/><path d="M12 11l8.5 3.2-3.6 1.3-1.3 3.6z" fill="currentColor"/>',
    polylasso: '<path d="M5 6l9-2 6 7-5 8-9-3z" stroke-dasharray="3 2"/>',
    blur: '<path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 01-12 0c0-3.4 2.5-6.5 6-11z"/>',
    sharpen: '<path d="M12 3l6 17H6z"/>',
    dodge: '<circle cx="10" cy="9" r="5.5"/><path d="M14 13l6 7"/>',
    burn: '<path d="M7 20c-2-4 0-6 2-8l3-3 3 3c2 2 3 5 1 8M12 9V4"/>',
    sponge: '<rect x="4" y="8" width="16" height="10" rx="3"/><path d="M8 12h.01M12 14h.01M16 11h.01M10 16h.01"/>',
    aL: '<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>', aHC: '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', aR: '<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>',
    aT: '<path d="M3 4h18M7 8h4v10H7zM14 8h4v6h-4z"/>', aVC: '<path d="M3 12h18M7 6h4v12H7zM14 8h4v8h-4z"/>', aB: '<path d="M3 20h18M7 6h4v10H7zM14 10h4v6h-4z"/>',
    dH: '<path d="M4 3v18M20 3v18M10 7h4v10h-4z"/>', dV: '<path d="M3 4h18M3 20h18M7 10h10v4H7z"/>',
    wand: '<path d="M5 19L15 9M13 4v3M19 10h-3M17.5 5.5l-2 2M18 14l-1.5-1.5M9 5l1.5 1.5"/>',
    crop: '<path d="M7 2v15h15M2 7h15v15"/>',
    eyedropper: '<path d="M14 6l4 4M16 4a2.1 2.1 0 013 3l-2.5 2.5-3-3zM13.5 6.5L5 15v4h4l8.5-8.5"/>',
    brush: '<path d="M18 3l3 3-9 9-3-3zM9 12c-3 0-4 2-4 4s-1 3-2 3c2 2 8 2 9-4"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    eraser: '<path d="M8 20h12M5 15l9-9 6 6-7 7H8z"/>',
    clone: '<path d="M9 3h6v5l2 4H7l2-4zM5 15h14v3H5zM4 21h16"/>',
    bucket: '<path d="M4 13l8-8 7 7-7 7zM12 5L9 2M20 16c1 1.5 1.5 2.5 1.5 3.3a1.5 1.5 0 01-3 0c0-.8.5-1.8 1.5-3.3"/>',
    gradient: '<rect x="3" y="5" width="18" height="14"/><path d="M8 5v14M12 5v14M15 5v14M17.5 5v14M19.5 5v14" stroke-width="1"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    rect: '<rect x="4" y="6" width="16" height="12"/>',
    oval: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    line: '<path d="M5 19L19 5"/>',
    hand: '<path d="M8 12V5.5a1.5 1.5 0 013 0V11M11 10V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v8c0 4-2.5 7-6 7s-5-2-6.5-5L3 13.5c-.6-1.2 1-2.4 2-1.3L8 15"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    mask: '<rect x="3" y="5" width="18" height="14"/><circle cx="12" cy="12" r="4"/>',
    dup: '<rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/>',
    clip: '<path d="M8 5v9h9M14 11l3 3-3 3"/>',
    adjust: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 8h6.9M12 12h8M12 16h6.9" stroke-width="1"/>',
  };
  const ic = n => `<svg class="ic" viewBox="0 0 24 24">${ICONS[n]}</svg>`;
  const typing = t => t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

  // ---------- avisos ----------
  PS.on('toast', m => {
    const el = h('div.toast', {}, m);
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 4200);
  });

  // ---------- diálogos ----------
  let dlg = null;
  PS.dialog = o => {
    if (dlg) dlg.cancel();
    const v = {}, inputs = {};
    const rows = h('div.rows');
    if (o.text) rows.append(h('p', { html: o.text }));
    const changed = k => o.onChange && o.onChange(v, k, set);
    function set(k, val) { v[k] = val; (inputs[k] || []).forEach(i => { i.value = val; }); }
    for (const f of o.fields || []) {
      if (f.k) v[f.k] = f.val;
      if (f.type === 'range') {
        const r = h('input', { type: 'range', min: f.min, max: f.max, step: f.step || 1, value: f.val }), n = h('input', { type: 'number', min: f.min, max: f.max, step: f.step || 1, value: f.val });
        inputs[f.k] = [r, n];
        const on = src => () => { const x = Math.min(f.max, Math.max(f.min, +src.value || 0)); v[f.k] = x; (src === r ? n : r).value = x; changed(f.k); };
        r.addEventListener('input', on(r)); n.addEventListener('input', on(n));
        rows.append(h('div.row', {}, h('span', {}, f.label), r, n));
      } else if (f.type === 'number' || f.type === 'text') {
        const i = h('input', { type: f.type, value: f.val, min: f.min, max: f.max, step: f.step });
        inputs[f.k] = [i];
        i.addEventListener('input', () => { v[f.k] = f.type === 'number' ? +i.value : i.value; changed(f.k); });
        rows.append(h('div.row.wide', {}, h('span', {}, f.label), i));
      } else if (f.type === 'select') {
        const s = h('select', {}, f.options.map(([val, lab]) => h('option', { value: val }, lab)));
        s.value = f.val; inputs[f.k] = [s];
        s.addEventListener('change', () => { v[f.k] = s.value; changed(f.k); });
        rows.append(h('div.row.wide', {}, h('span', {}, f.label), s));
      } else if (f.type === 'check') {
        const c = h('input', { type: 'checkbox', checked: !!f.val });
        c.addEventListener('change', () => { v[f.k] = c.checked; changed(f.k); });
        rows.append(h('div.row.wide', {}, h('span', {}, f.label), h('label', {}, c)));
      } else if (f.type === 'head') {
        rows.append(h('div', { style: 'font-weight:600;border-top:1px solid var(--line);padding-top:8px;margin-top:2px' }, f.label));
      } else if (f.type === 'color') {
        const c = h('input', { type: 'color', value: f.val, style: 'width:60px;height:22px;padding:0;border:1px solid var(--line);background:none' });
        inputs[f.k] = [c];
        c.addEventListener('input', () => { v[f.k] = c.value; changed(f.k); });
        rows.append(h('div.row.wide', {}, h('span', {}, f.label), c));
      } else if (f.type === 'curve') {
        v[f.k] = f.val.map(p => ({ x: p.x, y: p.y }));
        rows.append(curveWidget(v[f.k], () => changed(f.k)));
        rows.append(h('p.dim', {}, 'Clique para criar ponto, arraste para mover, botão direito remove.'));
      }
    }
    const close = () => { back.remove(); dlg = null; };
    const ok = () => { close(); o.onOk && o.onOk(v); }, cancel = () => { close(); o.onCancel && o.onCancel(); };
    const foot = h('div.foot', {}, o.onOk || o.fields ? h('button.btn', { onclick: cancel }, 'Cancelar') : null, h('button.btn.primary', { onclick: ok }, o.okLabel || 'OK'));
    if ((o.fields || []).length > 9) rows.style.cssText = 'max-height:62vh;overflow:auto';
    const box = h('div.dialog', {}, h('h2', {}, o.title), rows, o.extra || null, foot);
    const back = h('div.backdrop' + (o.side ? '.side' : ''), {}, box);
    back.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') cancel();
    });
    document.body.append(back);
    dlg = { ok, cancel };
    const first = box.querySelector('input[type=text], input[type=number]') || box.querySelector('.primary');
    first.focus(); if (first.select) first.select();
  };
  function curveWidget(pts, onChange) {
    const S = 256, c = h('canvas.curve', { width: S, height: S }), x = c.getContext('2d');
    let cur = -1;
    const draw = () => {
      x.clearRect(0, 0, S, S);
      x.strokeStyle = '#333'; x.lineWidth = 1;
      for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, S); x.moveTo(0, i * 64); x.lineTo(S, i * 64); x.stroke(); }
      const lut = PS.curveLUT(pts);
      x.strokeStyle = '#ddd'; x.beginPath();
      for (let i = 0; i < 256; i++) { const y = 255 - lut[i]; i ? x.lineTo(i, y) : x.moveTo(i, y); }
      x.stroke();
      x.fillStyle = '#fff'; pts.forEach(p => x.fillRect(p.x - 3, 252 - p.y, 6, 6));
    };
    const at = e => { const r = c.getBoundingClientRect(); return { x: Math.round(Math.min(255, Math.max(0, e.clientX - r.left))), y: Math.round(Math.min(255, Math.max(0, 255 - (e.clientY - r.top)))) }; };
    const near = p => pts.findIndex(q => Math.abs(q.x - p.x) < 9 && Math.abs(q.y - p.y) < 9);
    c.addEventListener('pointerdown', e => {
      const p = at(e); cur = near(p);
      if (e.button === 2) { if (cur > -1 && pts.length > 2) { pts.splice(cur, 1); draw(); onChange(); } cur = -1; return; }
      if (cur < 0) { pts.push(p); cur = pts.length - 1; }
      c.setPointerCapture(e.pointerId); draw(); onChange();
    });
    c.addEventListener('pointermove', e => { if (cur < 0 || !e.buttons) return; Object.assign(pts[cur], at(e)); draw(); onChange(); });
    c.addEventListener('pointerup', () => { cur = -1; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    draw();
    return c;
  }

  // ---------- diálogos de documento ----------
  const newDocDlg = () => PS.dialog({
    title: 'Novo documento', fields: [
      { k: 'name', label: 'Nome', type: 'text', val: 'Sem título' },
      { k: 'preset', label: 'Predefinição', type: 'select', val: '', options: [['', 'Personalizado'], ['1920x1080', 'Full HD · 1920 × 1080'], ['1280x720', 'Thumb YouTube · 1280 × 720'], ['1080x1080', 'Post quadrado · 1080 × 1080'], ['1080x1350', 'Post retrato · 1080 × 1350'], ['1080x1920', 'Story/Shorts · 1080 × 1920'], ['2480x3508', 'A4 300 dpi · 2480 × 3508'], ['3840x2160', '4K · 3840 × 2160']] },
      { k: 'w', label: 'Largura (px)', type: 'number', val: 1920, min: 1, max: 16000 },
      { k: 'h', label: 'Altura (px)', type: 'number', val: 1080, min: 1, max: 16000 },
      { k: 'bg', label: 'Fundo', type: 'select', val: '#ffffff', options: [['#ffffff', 'Branco'], ['#000000', 'Preto'], ['bgcolor', 'Cor de fundo atual'], ['transparent', 'Transparente']] },
    ],
    onChange: (v, k, set) => { if (k === 'preset' && v.preset) { const [w, hh] = v.preset.split('x'); set('w', +w); set('h', +hh); } },
    onOk: v => {
      const w = Math.round(v.w), hh = Math.round(v.h);
      if (!(w > 0 && hh > 0 && w <= 16000 && hh <= 16000)) { PS.toast('Tamanho inválido (1 a 16000 px).'); return; }
      PS.newDoc({ name: v.name || 'Sem título', w, h: hh, bg: v.bg === 'bgcolor' ? PS.bg : v.bg });
    },
  });
  const imageSizeDlg = () => {
    const d = PS.doc, ratio = d.w / d.h;
    PS.dialog({
      title: 'Tamanho da imagem', fields: [
        { k: 'w', label: 'Largura (px)', type: 'number', val: d.w, min: 1 }, { k: 'h', label: 'Altura (px)', type: 'number', val: d.h, min: 1 },
        { k: 'keep', label: 'Manter proporção', type: 'check', val: true },
      ],
      onChange: (v, k, set) => { if (!v.keep) return; if (k === 'w') set('h', Math.max(1, Math.round(v.w / ratio))); if (k === 'h') set('w', Math.max(1, Math.round(v.h * ratio))); },
      onOk: v => { const w = Math.round(v.w), hh = Math.round(v.h); if (w > 0 && hh > 0 && w <= 16000 && hh <= 16000) PS.resizeImage(w, hh); else PS.toast('Tamanho inválido (1 a 16000 px).'); },
    });
  };
  const canvasSizeDlg = () => {
    const d = PS.doc;
    PS.dialog({
      title: 'Tamanho da tela de pintura', fields: [
        { k: 'w', label: 'Largura (px)', type: 'number', val: d.w, min: 1 }, { k: 'h', label: 'Altura (px)', type: 'number', val: d.h, min: 1 },
        { k: 'a', label: 'Âncora', type: 'select', val: '0.5,0.5', options: [['0,0', 'Canto superior esquerdo'], ['0.5,0', 'Topo'], ['1,0', 'Canto superior direito'], ['0,0.5', 'Esquerda'], ['0.5,0.5', 'Centro'], ['1,0.5', 'Direita'], ['0,1', 'Canto inferior esquerdo'], ['0.5,1', 'Base'], ['1,1', 'Canto inferior direito']] },
      ],
      onOk: v => {
        const w = Math.round(v.w), hh = Math.round(v.h), [ax, ay] = v.a.split(',').map(Number);
        if (!(w > 0 && hh > 0 && w <= 16000 && hh <= 16000)) { PS.toast('Tamanho inválido (1 a 16000 px).'); return; }
        PS.reframe(w, hh, Math.round((w - d.w) * ax), Math.round((hh - d.h) * ay), 'Tamanho da tela de pintura');
      },
    });
  };
  const renameDlg = L => PS.dialog({
    title: 'Renomear camada', fields: [{ k: 'n', label: 'Nome', type: 'text', val: L.name }],
    onOk: v => { if (v.n && v.n !== L.name) { L.name = v.n; L.renamed = true; PS.commit('Renomear camada'); } },
  });
  const askClose = d => {
    if (!d.dirty) return PS.closeDoc(d);
    PS.dialog({ title: 'Fechar documento', text: `"${d.name}" tem alterações não salvas. Fechar mesmo assim?`, okLabel: 'Fechar sem salvar', onOk: () => PS.closeDoc(d) });
  };
  const selNum = (title, label, val, fn) => PS.doc.sel ? PS.dialog({ title, fields: [{ k: 'n', label, type: 'number', val, min: 1, max: 500 }], onOk: v => v.n > 0 && fn(Math.round(v.n)) }) : PS.toast('Faça uma seleção primeiro.');
  const recentDlg = () => {
    const list = PS.recents();
    if (!PS.io.native()) { PS.toast('Abrir recente funciona no app de mesa.'); return; }
    if (!list.length) { PS.toast('Nenhum arquivo recente ainda.'); return; }
    PS.dialog({ title: 'Abrir recente', fields: [{ k: 'p', label: 'Arquivo', type: 'select', val: list[0], options: list.map(p => [p, p.split(/[\\/]/).slice(-2).join(' › ')]) }], okLabel: 'Abrir', onOk: v => PS.io.openPath(v.p) });
  };
  const cropSel = () => { const b = PS.selBounds(); if (!b) { PS.toast('Faça uma seleção para cortar.'); return; } PS.cropTo(b); };
  async function pasteBitmap(bmp) {
    if (PS.clip && PS.doc && PS.clip.canvas.width === bmp.width && PS.clip.canvas.height === bmp.height) return PS.paste();
    const c = PS.mk(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
    if (!PS.doc) PS.newDoc({ name: 'Colado', w: c.width, h: c.height, layers: [PS.mkLayer({ name: 'Camada 1', canvas: c })] });
    else PS.pasteCanvas(c);
  }
  async function pasteMenu() {
    try {
      for (const it of await navigator.clipboard.read()) {
        const t = it.types.find(x => x.startsWith('image/'));
        if (t) return pasteBitmap(await createImageBitmap(await it.getType(t)));
      }
    } catch (e) { /* sem permissão: usa a cópia interna */ }
    if (PS.clip && PS.doc) PS.paste(); else PS.toast('Nada para colar.');
  }

  // ---------- menus e atalhos ----------
  const F = k => [PS.FILTERS[k].name + (PS.FILTERS[k].fields ? '…' : ''), '', () => PS.runFilter(k)];
  const FG = g => (PS.CRAFT || []).filter(k => PS.FILTERS[k].group === g).map(F); // filtros do pacote PhotoCraft, por grupo
  const MENUS = [
    ['Arquivo', [
      ['Novo…', 'Ctrl+N', newDocDlg, { free: 1 }], ['Abrir…', 'Ctrl+O', () => PS.io.openDialog(), { free: 1 }], ['Abrir recente…', '', () => recentDlg(), { free: 1 }],
      ['Inserir imagem como camada…', '', () => $('#placein').click()], null,
      ['Salvar (PSD)', 'Ctrl+S', () => PS.io.save(false)], ['Salvar como…', 'Ctrl+Shift+S', () => PS.io.save(true)], null,
      ['Exportar PNG', 'Ctrl+Shift+E', () => PS.io.exportAs('png')],
      ['Exportar JPG…', '', () => PS.dialog({ title: 'Exportar JPG', fields: [{ k: 'q', label: 'Qualidade', type: 'range', min: 10, max: 100, val: 92 }], onOk: v => PS.io.exportAs('jpg', v.q / 100) })],
      ['Exportar WebP', '', () => PS.io.exportAs('webp', 0.92)], null,
      ['Fechar', 'Ctrl+W', () => askClose(PS.doc)],
    ]],
    ['Editar', [
      ['Desfazer', 'Ctrl+Z', PS.undo], ['Refazer', 'Ctrl+Shift+Z', PS.redo, { alias: ['Ctrl+Y'] }], null,
      ['Recortar', 'Ctrl+X', PS.cut], ['Copiar', 'Ctrl+C', () => PS.copy(false)], ['Copiar mesclado', 'Ctrl+Shift+C', () => PS.copy(true)],
      ['Colar', 'Ctrl+V', pasteMenu, { free: 1, noKey: 1 }], ['Apagar', 'Delete', () => PS.clearSel(), { alias: ['Backspace'] }], null,
      ['Preencher com a cor frontal', 'Alt+Backspace', () => PS.fill(PS.fg), { alias: ['Alt+Delete'] }],
      ['Preencher com a cor de fundo', 'Ctrl+Backspace', () => PS.fill(PS.bg), { alias: ['Ctrl+Delete'] }], null,
      ['Traçar seleção…', '', () => PS.doc.sel ? PS.dialog({ title: 'Traçar seleção (cor frontal)', fields: [{ k: 'w', label: 'Largura (px)', type: 'number', val: 4, min: 1, max: 250 }, { k: 'p', label: 'Posição', type: 'select', val: 'center', options: [['inside', 'Interna'], ['center', 'Centro'], ['outside', 'Externa']] }], onOk: v => PS.strokeSel(Math.max(1, v.w), v.p) }) : PS.toast('Faça uma seleção primeiro.')], null,
      ['Transformação livre', 'Ctrl+T', PS.startXf, { keepXf: 1 }],
      ['Virar camada na horizontal', '', () => PS.flipLayer('h')], ['Virar camada na vertical', '', () => PS.flipLayer('v')],
    ]],
    ['Imagem', [
      ['Tamanho da imagem…', 'Ctrl+Alt+I', imageSizeDlg], ['Tamanho da tela de pintura…', 'Ctrl+Alt+C', canvasSizeDlg], ['Cortar na seleção', '', cropSel], null,
      ['Girar 90° horário', '', () => PS.turnDoc('cw')], ['Girar 90° anti-horário', '', () => PS.turnDoc('ccw')], ['Girar 180°', '', () => PS.turnDoc('180')],
      ['Virar tela na horizontal', '', () => PS.turnDoc('h')], ['Virar tela na vertical', '', () => PS.turnDoc('v')],
    ]],
    ['Ajustes', [
      ['Brilho/Contraste…', '', () => PS.runFilter('brightness')], ['Níveis…', 'Ctrl+L', () => PS.runFilter('levels')], ['Curvas…', 'Ctrl+M', () => PS.runFilter('curves')],
      ['Exposição…', '', () => PS.runFilter('exposure')], null,
      ['Vibratilidade…', '', () => PS.runFilter('vibrance')], ['Matiz/Saturação…', 'Ctrl+U', () => PS.runFilter('huesat')], ['Equilíbrio de cores…', 'Ctrl+B', () => PS.runFilter('balance')], null,
      ['Tom automático', 'Ctrl+Shift+L', () => PS.runFilter('autotone')], ['Inverter', 'Ctrl+I', () => PS.runFilter('invert')], ['Remover saturação', 'Ctrl+Shift+U', () => PS.runFilter('desaturate')],
      ['Sépia', '', () => PS.runFilter('sepia')], ['Limiar…', '', () => PS.runFilter('threshold')], ['Posterizar…', '', () => PS.runFilter('posterize')],
      null, ...FG('Ajuste'),
    ]],
    ['Camada', [
      ['Nova camada', 'Ctrl+Shift+N', PS.newLayer], ['Duplicar camada', 'Ctrl+J', PS.dupLayer], ['Excluir camada', '', PS.delLayer],
      ['Renomear…', '', () => PS.active() && renameDlg(PS.active())], null,
      ['Novo grupo', '', PS.newGroup], ['Agrupar camada', 'Ctrl+G', PS.groupLayer], ['Desagrupar', 'Ctrl+Shift+G', PS.ungroup], null,
      ['Trazer para frente', 'Ctrl+]', () => PS.orderLayer(1)], ['Enviar para trás', 'Ctrl+[', () => PS.orderLayer(-1)], null,
      ['Mesclar para baixo', 'Ctrl+E', PS.mergeDown], ['Mesclar visíveis', '', PS.mergeVisible], ['Achatar imagem', '', PS.flatten], ['Rasterizar', '', PS.rasterize], null,
      ['Estilo de camada…', '', PS.styleDlg], ['Limpar estilo de camada', '', PS.clearStyle], null,
      ...Object.keys(PS.ADJ).map(k => ['Novo ajuste: ' + PS.ADJ[k].name + (PS.ADJ[k].fields ? '…' : ''), '', () => PS.newAdjust(k)]), null,
      ['Adicionar máscara', '', PS.addMask], ['Inverter máscara', '', PS.invertMask], ['Ativar/desativar máscara', '', PS.toggleMask], ['Aplicar máscara', '', PS.applyMask], ['Excluir máscara', '', PS.delMask], null,
      ['Criar/soltar máscara de corte', 'Ctrl+Alt+G', PS.toggleClip],
    ]],
    ['Selecionar', [
      ['Tudo', 'Ctrl+A', PS.selectAll], ['Desfazer seleção', 'Ctrl+D', PS.deselect], ['Inverter', 'Ctrl+Shift+I', PS.invertSel], null,
      ['Difusão…', 'Shift+F6', () => PS.doc.sel ? PS.dialog({ title: 'Difusão da seleção', fields: [{ k: 'r', label: 'Raio (px)', type: 'number', val: 5, min: 0.1, max: 250, step: 0.1 }], onOk: v => PS.featherSel(v.r) }) : PS.toast('Faça uma seleção primeiro.')],
      ['Expandir…', '', () => selNum('Expandir seleção', 'Pixels', 5, v => PS.growSel(v))], ['Contrair…', '', () => selNum('Contrair seleção', 'Pixels', 5, v => PS.growSel(-v))], ['Borda…', '', () => selNum('Borda da seleção', 'Largura (px)', 6, v => PS.borderSel(v))], null,
      ['Carregar pixels da camada', '', () => PS.selFromLayer(PS.active())],
    ]],
    ['Filtro', [
      ['Desfoque'], F('blur'), ...FG('Desfoque'), ['Nitidez'], F('sharpen'), ...FG('Nitidez'), ['Ruído'], F('noise'), ...FG('Ruído'),
      ['Distorção'], ...FG('Distorção'), ['Pixelização'], F('mosaic'), ...FG('Pixelização'), ['Estilização'], F('edges'), ...FG('Estilização'),
      ['Acabamento'], ...FG('Acabamento'), ['Outros'], ...FG('Outros'),
    ]],
    ['Visualizar', [
      ['Mais zoom', 'Ctrl+=', () => PS.zoomBy(1.5), { alias: ['Ctrl++', 'Ctrl+Shift++'], keepXf: 1 }], ['Menos zoom', 'Ctrl+-', () => PS.zoomBy(1 / 1.5), { keepXf: 1 }],
      ['Réguas', 'Ctrl+R', PS.toggleRulers, { keepXf: 1 }],
      ['Mostrar/ocultar guias', 'Ctrl+;', () => { PS.showGuides = !PS.showGuides; PS.render(); }, { keepXf: 1 }],
      ['Ajustar (encaixe) ligado/desligado', 'Ctrl+Shift+;', () => { PS.snap = !PS.snap; PS.toast(PS.snap ? 'Encaixe ligado.' : 'Encaixe desligado.'); }, { alias: ['Ctrl+Shift+:'], keepXf: 1 }],
      ['Limpar guias', '', PS.clearGuides], null,
      ['Ajustar à tela', 'Ctrl+0', () => PS.fit(true), { keepXf: 1 }], ['100%', 'Ctrl+1', () => PS.setZoom(1), { keepXf: 1 }],
    ]],
    ['Ajuda', [
      ['Atalhos…', 'F1', () => shortcutsDlg(), { free: 1 }],
      ['Sobre', '', () => PS.dialog({ title: 'Ares Studio', text: 'Editor de imagens pessoal, compatível com PSD.<br>Roda só nesta máquina; nada é enviado para a internet.<br><span class="dim">Leitura e escrita de PSD: biblioteca ag-psd (licença MIT).<br>Filtros e ajustes recriados a partir do PhotoCraft (licença MIT/Apache-2.0).</span>' }), { free: 1 }],
    ]],
  ];
  const SHORT = {};
  function run(it) {
    const o = it[3] || {};
    if (!o.free && !PS.doc) return;
    if (PS.xf && !o.keepXf) PS.endXf(true);
    PS.endText();
    it[2]();
  }
  function buildMenus() {
    const bar = $('#menubar');
    const closeAll = () => bar.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    for (const [name, items] of MENUS) {
      const drop = h('div.drop' + (items.length > 34 ? '.cols' : ''));
      for (const it of items) {
        if (!it) { drop.append(h('hr')); continue; }
        if (!it[2]) { drop.append(h('div.mhead', {}, it[0])); continue; }
        const o = it[3] || {};
        if (it[1] && !o.noKey) [it[1], ...(o.alias || [])].forEach(k => { SHORT[k] = it; });
        drop.append(h('button', { onclick: () => { closeAll(); run(it); }, 'data-free': o.free ? '1' : '' }, h('span', {}, it[0]), h('span', {}, it[1])));
      }
      const m = h('div.menu', {}, h('button', {
        onclick: e => { const was = m.classList.contains('open'); closeAll(); if (!was) open(m); e.stopPropagation(); },
        onmouseenter: () => { if (bar.querySelector('.menu.open')) { closeAll(); open(m); } },
      }, name), drop);
      bar.append(m);
    }
    function open(m) {
      m.classList.add('open');
      m.querySelectorAll('.drop button').forEach(b => { b.disabled = !PS.doc && !b.dataset.free; });
      const dr = m.querySelector('.drop'); dr.style.left = '0px'; // menu largo não pode sair pela direita da janela
      const over = dr.getBoundingClientRect().right - (innerWidth - 4); if (over > 0) dr.style.left = -over + 'px';
    }
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu')) closeAll(); });
  }
  const TOOLS = [
    ['move', 'Mover', 'V'], ['marquee', 'Letreiro retangular', 'M'], ['ellipse', 'Letreiro elíptico', 'M'], ['lasso', 'Laço', 'L'], ['polylasso', 'Laço poligonal', 'L'], ['object', 'Seleção de objeto', 'W'], ['wand', 'Varinha mágica', 'W'], ['crop', 'Corte', 'C'], ['eyedropper', 'Conta-gotas', 'I'], null,
    ['brush', 'Pincel', 'B'], ['pencil', 'Lápis', 'N'], ['eraser', 'Borracha', 'E'], ['clone', 'Carimbo', 'S'], ['bucket', 'Lata de tinta', 'G'], ['gradient', 'Degradê', 'G'],
    ['blur', 'Desfoque', 'R'], ['sharpen', 'Nitidez', 'R'], ['dodge', 'Subexposição (clarear)', 'O'], ['burn', 'Superexposição (escurecer)', 'O'], ['sponge', 'Esponja (tirar saturação)', 'O'], null,
    ['text', 'Texto', 'T'], ['rect', 'Retângulo', 'U'], ['oval', 'Elipse', 'U'], ['line', 'Linha', 'U'], null,
    ['hand', 'Mão', 'H'], ['zoom', 'Zoom', 'Z'],
  ];
  function shortcutsDlg() {
    const rows = [];
    MENUS.forEach(([, items]) => items.forEach(it => it && it[1] && rows.push([it[0].replace('…', ''), it[1]])));
    TOOLS.forEach(t => t && rows.push([t[1], t[2]]));
    rows.push(['Mão temporária', 'Espaço'], ['Tamanho do pincel', '[ e ]'], ['Trocar cores / padrão', 'X / D'], ['Confirmar / cancelar', 'Enter / Esc'], ['Mover 1 px / 10 px', 'Setas / Shift+Setas'], ['Somar / subtrair seleção', 'Shift / Alt + arrastar'], ['Zoom', 'Roda do mouse']);
    const half = Math.ceil(rows.length / 2), tb = a => h('table', {}, a.map(r => h('tr', {}, h('td', {}, r[0]), h('td', {}, r[1]))));
    PS.dialog({ title: 'Atalhos', extra: h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:12px 14px;max-height:60vh;overflow:auto;width:500px' }, tb(rows.slice(0, half)), tb(rows.slice(half))) });
  }
  function combo(e) {
    let k = /^Key|^Digit/.test(e.code) ? e.code.slice(-1) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (e.code === 'NumpadAdd') k = '+'; if (e.code === 'NumpadSubtract') k = '-';
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '') + k;
  }
  function keys() {
    document.addEventListener('keydown', e => {
      if (typing(e.target) || dlg) return;
      if (e.code === 'Space') { PS.space = true; $('#view').style.cursor = 'grab'; e.preventDefault(); return; }
      const c = combo(e), it = SHORT[c];
      if (c === 'Ctrl+V') return; // tratado no evento "paste"
      if (it) { e.preventDefault(); run(it); return; }
      if (e.ctrlKey || e.altKey || e.metaKey) { if (e.ctrlKey && !['Control', 'Shift', 'Alt'].includes(e.key)) e.preventDefault(); return; }
      if (!PS.doc) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (k === 'Enter') { PS.confirm(); e.preventDefault(); }
      else if (k === 'Escape') PS.cancel();
      else if (k === '[' || k === ']') { PS.opt.size = Math.max(1, Math.min(2000, Math.round(PS.opt.size * (k === ']' ? 1.2 : 1 / 1.2) + (k === ']' ? 1 : -1)))); buildOpt(); PS.render(); }
      else if (/^[0-9]$/.test(k) && PS.tools[PS.tool] && PS.tools[PS.tool].paint) { PS.opt.opacity = k === '0' ? 100 : +k * 10; buildOpt(); }
      else if (k === 'X') { [PS.fg, PS.bg] = [PS.bg, PS.fg]; PS.emit('color'); }
      else if (k === 'D') { PS.fg = '#000000'; PS.bg = '#ffffff'; PS.emit('color'); }
      else if (k.startsWith('Arrow') && !PS.xf) {
        const s = e.shiftKey ? 10 : 1;
        PS.nudge(k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0); e.preventDefault();
      } else {
        const list = TOOLS.filter(t => t && t[2] === k).map(t => t[0]);
        if (list.length) PS.setTool(list[(list.indexOf(PS.tool) + 1) % list.length]);
      }
    });
    document.addEventListener('keyup', e => { if (e.code === 'Space') { PS.space = false; setCursor(); } });
    document.addEventListener('paste', async e => {
      if (typing(e.target) || dlg) return;
      e.preventDefault();
      const it = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
      if (PS.xf) PS.endXf(true);
      if (it) pasteBitmap(await createImageBitmap(it.getAsFile()));
      else if (PS.clip && PS.doc) PS.paste();
    });
  }

  // ---------- barra de ferramentas ----------
  function buildTools() {
    const bar = $('#toolbar');
    for (const t of TOOLS) {
      if (!t) { bar.append(h('hr')); continue; }
      bar.append(h('button.tool', { html: ic(t[0]), title: `${t[1]} (${t[2]})` + (t[0] === 'hand' ? ' · duplo clique ajusta à tela' : t[0] === 'zoom' ? ' · duplo clique vai a 100%' : ''), 'data-tool': t[0], onclick: () => PS.setTool(t[0]),
        ondblclick: () => { if (!PS.doc) return; if (t[0] === 'hand') PS.fit(true); else if (t[0] === 'zoom') PS.setZoom(1); } }));
    }
    const fg = h('div.sw.fg', { title: 'Cor frontal', onclick: () => pickColor('fg') }), bg = h('div.sw.bg', { title: 'Cor de fundo', onclick: () => pickColor('bg') });
    bar.append(h('div', { id: 'fgbg' }, bg, fg),
      h('button.mini', { title: 'Trocar cores (X)', onclick: () => { [PS.fg, PS.bg] = [PS.bg, PS.fg]; PS.emit('color'); } }, '⇄'),
      h('button.mini', { title: 'Preto e branco (D)', onclick: () => { PS.fg = '#000000'; PS.bg = '#ffffff'; PS.emit('color'); } }, '◩'));
    const paint = () => { fg.style.background = PS.fg; bg.style.background = PS.bg; PS.styleText(); };
    PS.on('color', paint); paint();
    const cols = [];
    for (let i = 0; i < 12; i++) cols.push(`hsl(0 0% ${Math.round(i * 100 / 11)}%)`);
    for (const l of [45, 65]) for (let i = 0; i < 12; i++) cols.push(`hsl(${i * 30} 85% ${l}%)`);
    const probe = PS.mk(1, 1).getContext('2d');
    const toHex = css => { probe.fillStyle = css; probe.fillRect(0, 0, 1, 1); const d = probe.getImageData(0, 0, 1, 1).data; return PS.rgbToHex(d[0], d[1], d[2]); };
    cols.forEach(c => $('#swatches').append(h('i', {
      style: `background:${c}`, title: 'Clique: cor frontal · Alt+clique: cor de fundo',
      onclick: e => { PS[e.altKey ? 'bg' : 'fg'] = toHex(c); PS.emit('color'); },
    })));
  }
  function pickColor(which) {
    const old = PS[which], W = 240, H = 170;
    const toHsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; let hh = 0; if (dd) hh = mx === r ? ((g - b) / dd + 6) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; return [hh * 60, mx ? dd / mx : 0, mx]; };
    const toRgb = (hh, s, v) => { const f = n => { const k = (n + hh / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; };
    const c0 = PS.hexToRgb(old); let [hu, sa, va] = toHsv(c0.r, c0.g, c0.b);
    const sv = h('canvas', { width: W, height: H, style: 'cursor:crosshair;border:1px solid var(--line)' }), hue = h('canvas', { width: 22, height: H, style: 'cursor:ns-resize;border:1px solid var(--line)' });
    const novo = h('div', { style: 'height:30px;border:1px solid #000', title: 'Cor nova' }), antes = h('div', { style: `height:30px;border:1px solid #000;border-top:0;cursor:pointer;background:${old}`, title: 'Cor anterior (clique para voltar)' });
    const campo = (label, max) => { const i = h('input', { type: 'number', min: 0, max, style: 'width:54px' }); return { i, row: h('label', { style: 'display:flex;gap:6px;align-items:center;justify-content:space-between' }, label, i) }; };
    const F = { h: campo('H °', 360), s: campo('S %', 100), v: campo('B %', 100), r: campo('R', 255), g: campo('G', 255), b: campo('B', 255) };
    const hexIn = h('input', { type: 'text', maxLength: 7, style: 'width:74px' });
    const paint = () => {
      const [r, g, b] = toRgb(hu, sa, va), hex = PS.rgbToHex(r, g, b), x = sv.getContext('2d'), y = hue.getContext('2d');
      const [pr, pg, pb] = toRgb(hu, 1, 1);
      x.fillStyle = `rgb(${pr},${pg},${pb})`; x.fillRect(0, 0, W, H);
      let gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
      gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
      x.strokeStyle = va > 0.5 ? '#000' : '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc(sa * W, (1 - va) * H, 5, 0, 7); x.stroke();
      gr = y.createLinearGradient(0, 0, 0, H); for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${i * 60} 100% 50%)`); y.fillStyle = gr; y.fillRect(0, 0, 22, H);
      y.fillStyle = '#fff'; y.strokeStyle = '#000'; const yy = hu / 360 * H; y.fillRect(0, yy - 2, 22, 4); y.strokeRect(0.5, yy - 2, 21, 4);
      const vals = { h: Math.round(hu), s: Math.round(sa * 100), v: Math.round(va * 100), r, g, b };
      for (const k in F) if (document.activeElement !== F[k].i) F[k].i.value = vals[k];
      if (document.activeElement !== hexIn) hexIn.value = hex;
      novo.style.background = hex; PS[which] = hex; PS.emit('color');
    };
    const fromRgb = (r, g, b) => { [hu, sa, va] = toHsv(r, g, b); paint(); };
    const arrasto = (el, fn) => { const go = e => { const b = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))); paint(); }; el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); go(e); }); el.addEventListener('pointermove', e => { if (e.buttons) go(e); }); };
    arrasto(sv, (fx, fy) => { sa = fx; va = 1 - fy; });
    arrasto(hue, (fx, fy) => { hu = Math.min(359.9, fy * 360); });
    const num = k => Math.min(+F[k].i.max, Math.max(0, +F[k].i.value || 0));
    ['h', 's', 'v'].forEach(k => F[k].i.addEventListener('input', () => { hu = Math.min(359.9, num('h')); sa = num('s') / 100; va = num('v') / 100; paint(); }));
    ['r', 'g', 'b'].forEach(k => F[k].i.addEventListener('input', () => fromRgb(num('r'), num('g'), num('b'))));
    hexIn.addEventListener('input', () => { const m = /^#?([0-9a-f]{6})$/i.exec(hexIn.value.trim()); if (m) { const c = PS.hexToRgb('#' + m[1]); fromRgb(c.r, c.g, c.b); } });
    antes.addEventListener('click', () => fromRgb(c0.r, c0.g, c0.b));
    const lado = h('div', { style: 'display:grid;gap:6px;width:112px;align-content:start' }, h('div', {}, novo, antes), ...Object.values(F).map(f => f.row), h('label', { style: 'display:flex;gap:6px;align-items:center;justify-content:space-between' }, '#', hexIn));
    PS.dialog({
      title: which === 'fg' ? 'Seletor de cores (cor frontal)' : 'Seletor de cores (cor de fundo)',
      extra: h('div', { style: 'display:flex;gap:10px;padding:0 14px 12px' }, sv, hue, lado),
      onOk: () => { }, onCancel: () => { PS[which] = old; PS.emit('color'); },
    });
    paint();
  }
  function setCursor() {
    const t = PS.tool, cur = { move: 'default', hand: 'grab', zoom: 'zoom-in', text: 'text' }[t] || 'crosshair';
    $('#view').style.cursor = PS.hcur || (PS.xf ? 'default' : cur);
  }

  // ---------- barra de opções ----------
  function buildOpt() {
    const bar = $('#optbar'); bar.textContent = '';
    const num = (label, k, min, max, step = 1) => h('label', {}, label, h('input', {
      type: 'number', min, max, step, value: PS.opt[k],
      oninput: e => { const v = +e.target.value; if (v >= min && v <= max) { PS.opt[k] = v; PS.styleText(); PS.render(); } },
    }));
    const chk = (label, k) => h('label', {}, h('input', { type: 'checkbox', checked: PS.opt[k], onchange: e => { PS.opt[k] = e.target.checked; PS.styleText(); } }), label);
    const sel = (label, k, options) => { const s = h('select', { onchange: e => { PS.opt[k] = e.target.value; PS.styleText(); } }, options.map(([v, l]) => h('option', { value: v }, l))); s.value = PS.opt[k]; return h('label', {}, label, s); };
    const hint = t => h('span.dim', {}, t);
    if (PS.xf) {
      const f = PS.xf, deg = () => Math.round(f.rot * 1800 / Math.PI) / 10;
      const inp = (label, val, on) => h('label', {}, label, h('input', { type: 'number', step: 0.1, value: val, onchange: e => { on(+e.target.value); } }));
      bar.append(h('span.name', {}, 'Transformação livre'),
        inp('L %', Math.round(f.sx * 1000) / 10, v => v > 0 && PS.setXf({ sx: v / 100 })), inp('A %', Math.round(f.sy * 1000) / 10, v => v > 0 && PS.setXf({ sy: v / 100 })), inp('Ângulo °', deg(), v => PS.setXf({ rot: v * Math.PI / 180 })),
        h('button.btn.primary', { onclick: () => PS.endXf(true) }, 'Aplicar (Enter)'), h('button.btn', { onclick: () => PS.endXf(false) }, 'Cancelar (Esc)'),
        hint('Cantos redimensionam (Shift solta a proporção) · fora da caixa gira · dentro move'));
      return;
    }
    const t = PS.tool, T = TOOLS.find(x => x && x[0] === t);
    bar.append(h('span.name', {}, T ? T[1] : ''));
    const paint = [num('Tamanho', 'size', 1, 2000), num('Dureza %', 'hardness', 0, 100), num('Opacidade %', 'opacity', 1, 100)];
    if (t === 'move') {
      const ab = (icon, title, fn) => h('button.btn.ib', { html: ic(icon), title, onclick: fn });
      bar.append(chk('Seleção automática', 'autoSelect'),
        h('label', {}, h('input', { type: 'checkbox', checked: PS.opt.showXf, onchange: e => { PS.opt.showXf = e.target.checked; PS.render(); } }), 'Controles de transformação'),
        h('span', { style: 'display:flex;gap:2px' }, ab('aL', 'Alinhar à esquerda', () => PS.align('l')), ab('aHC', 'Centralizar na horizontal', () => PS.align('hc')), ab('aR', 'Alinhar à direita', () => PS.align('r')),
          ab('aT', 'Alinhar ao topo', () => PS.align('t')), ab('aVC', 'Centralizar na vertical', () => PS.align('vc')), ab('aB', 'Alinhar à base', () => PS.align('b')),
          ab('dH', 'Distribuir na horizontal (3+ camadas)', () => PS.distribute('h')), ab('dV', 'Distribuir na vertical (3+ camadas)', () => PS.distribute('v'))),
        hint('Pontinhos da caixa redimensionam · Uma camada alinha à tela (ou à seleção); várias alinham entre si · Shift+clique soma camadas · Ctrl solta o encaixe'));
    }
    else if (t === 'marquee' || t === 'ellipse' || t === 'lasso') bar.append(num('Difusão px', 'feather', 0, 250), hint('Shift soma · Alt subtrai'));
    else if (t === 'object') bar.append(num('Tolerância', 'tolerance', 0, 255), hint('Clique no que quer mexer: ativa a camada e seleciona a peça · em foto/fundo separa pela cor (ajuste a tolerância) · Shift soma · Alt subtrai'));
    else if (t === 'wand') bar.append(num('Tolerância', 'tolerance', 0, 255), chk('Contíguo', 'contiguous'), hint('Shift soma · Alt subtrai'));
    else if (t === 'crop') {
      if (PS.cropRect) bar.append(h('span', {}, `${PS.cropRect.w} × ${PS.cropRect.h} px`), h('button.btn.primary', { onclick: PS.confirm }, 'Cortar (Enter)'), h('button.btn', { onclick: PS.cancel }, 'Cancelar (Esc)'));
      else bar.append(hint('Arraste a área do corte e confirme com Enter'));
    } else if (t === 'brush' || t === 'eraser') bar.append(...paint, hint('[ ] muda o tamanho · Shift+clique traça reta' + (t === 'brush' ? ' · Alt pega a cor' : '')));
    else if (t === 'pencil') bar.append(paint[0], paint[2]);
    else if (['blur', 'sharpen', 'dodge', 'burn', 'sponge'].includes(t)) bar.append(...paint.slice(0, 2), num('Intensidade %', 'opacity', 1, 100), hint('Passe de novo no mesmo lugar para reforçar'));
    else if (t === 'polylasso') bar.append(num('Difusão px', 'feather', 0, 250), hint('Clique ponto a ponto · duplo clique ou Enter fecha · Esc cancela'));
    else if (t === 'clone') bar.append(paint[0], paint[2], hint('Alt+clique define de onde copiar'));
    else if (t === 'bucket') bar.append(num('Tolerância', 'tolerance', 0, 255), chk('Contíguo', 'contiguous'), paint[2]);
    else if (t === 'gradient') bar.append(sel('Tipo', 'gradType', [['linear', 'Linear'], ['radial', 'Radial']]), chk('Frontal → transparente', 'gradTransp'), paint[2]);
    else if (t === 'rect' || t === 'oval') bar.append(chk('Preencher', 'shapeFill'), num('Traço px', 'strokeW', 1, 500), hint('Shift mantém proporção · cria camada nova'));
    else if (t === 'line') bar.append(num('Traço px', 'strokeW', 1, 500), hint('Shift trava em reta'));
    else if (t === 'text') {
      const fonts = PS.FONTS.includes(PS.opt.font) ? PS.FONTS : [PS.opt.font, ...PS.FONTS];
      bar.append(sel('Fonte', 'font', fonts.map(f => [f, f])), num('Tamanho', 'fontSize', 1, 2000), chk('Negrito', 'bold'), chk('Itálico', 'italic'),
        sel('Alinhar', 'align', [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]), hint('Cor = cor frontal · Ctrl+Enter confirma · Esc cancela'));
    } else if (t === 'eyedropper') bar.append(hint('Clique pega a cor frontal · Alt+clique a de fundo'));
    else if (t === 'zoom') bar.append(hint('Clique aproxima · Alt+clique afasta · arraste para os lados para zoom contínuo · roda do mouse também'));
    else if (t === 'hand') bar.append(hint('Arraste para mover a vista · Espaço faz o mesmo com qualquer ferramenta'));
    if (PS.doc && PS.doc.maskEdit) bar.append(h('span', { style: 'color:#fff' }, '● Pintando na MÁSCARA (branco mostra, preto esconde)'));
  }
  async function moreFonts() {
    try { if (window.queryLocalFonts) { const s = new Set(PS.FONTS); (await window.queryLocalFonts()).forEach(f => s.add(f.family)); PS.FONTS = [...s].sort(); } } catch (e) { /* sem permissão: fica a lista básica */ }
  }

  // ---------- abas, status, título ----------
  function buildTabs() {
    const el = $('#tabs'); el.textContent = '';
    document.body.classList.toggle('has-doc', !!PS.doc);
    for (const d of PS.docs) {
      el.append(h('div.tab' + (d === PS.doc ? '.on' : ''), { onclick: () => { if (d !== PS.doc) { PS.endText(); if (PS.xf) PS.endXf(true); PS.setDoc(d); } }, title: d.path || d.name },
        h('span', {}, d.name + (d.dirty ? ' *' : '')), h('button', { onclick: e => { e.stopPropagation(); askClose(d); } }, '×')));
    }
    const title = PS.doc ? `${PS.doc.name}${PS.doc.dirty ? ' *' : ''} — Ares Studio` : 'Ares Studio';
    if (document.title !== title) { document.title = title; if (PS.io.native()) pywebview.api.set_title(title); }
    buildStatus();
  }
  let lastMouse = null;
  function buildStatus() {
    const el = $('#status'), d = PS.doc; el.textContent = '';
    if (!d) return;
    const L = PS.active();
    el.append(h('span', {}, `${Math.round(d.zoom * 1000) / 10}%`), h('span', {}, `${d.w} × ${d.h} px`),
      h('span', {}, lastMouse ? `x ${Math.floor(lastMouse.x)}  y ${Math.floor(lastMouse.y)}` : ''), h('span', {}, L ? `Camada: ${L.name}` : ''));
  }

  // ---------- histórico ----------
  function buildHistory() {
    const el = $('#history'), d = PS.doc; el.textContent = '';
    if (!d) return;
    d.history.forEach((s, i) => el.append(h('div' + (i === d.hidx ? '.on' : i > d.hidx ? '.future' : ''), { onclick: () => { if (PS.xf) PS.endXf(false); PS.endText(true); PS.gotoState(i); } }, s.name)));
    const on = el.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  // ---------- camadas ----------
  function thumb(c, x, y, d, cls) {
    const t = h('canvas' + (cls || ''), { width: 30, height: 30 });
    if (c) {
      const s = 30 / Math.max(d.w, d.h), ox = (30 - d.w * s) / 2, oy = (30 - d.h * s) / 2;
      t.getContext('2d').drawImage(c, ox + x * s, oy + y * s, Math.max(1, c.width * s), Math.max(1, c.height * s));
    }
    return t;
  }
  function buildLayers() {
    const el = $('#layers'), d = PS.doc, ctl = $('#layerctl');
    el.textContent = ''; ctl.textContent = '';
    if (!d) return;
    const A = PS.active();
    if (A) {
      const opts = (A.type === 'group' ? [['pass through', 'Atravessar'], null] : []).concat(PS.BLENDS);
      const bs = h('select', { title: 'Modo de mesclagem', onchange: e => PS.setProp(A, 'blend', e.target.value, 'Modo de mesclagem') }, opts.map(o => o ? h('option', { value: o[0] }, o[1]) : h('option', { disabled: true }, '──────────')));
      bs.value = A.blend;
      const op = h('input', { type: 'number', min: 0, max: 100, value: Math.round(A.opacity * 100), title: 'Opacidade',
        oninput: e => { A.opacity = Math.min(100, Math.max(0, +e.target.value || 0)) / 100; d.compDirty = true; PS.render(); },
        onchange: () => PS.commit('Opacidade') });
      ctl.append(bs, h('label', {}, 'Opac.', op),
        h('button.btn' + (A.locked ? '.on' : ''), { title: 'Bloquear camada', html: ic('lock'), style: 'display:grid;place-items:center;width:26px;height:22px;border:1px solid var(--line);border-radius:3px', onclick: () => PS.setProp(A, 'locked', !A.locked, 'Bloquear camada') }),
        h('button.btn' + (A.lockAlpha ? '.on' : ''), { title: 'Bloquear pixels transparentes', style: 'width:26px;height:22px;border:1px solid var(--line);border-radius:3px', onclick: () => PS.setProp(A, 'lockAlpha', !A.lockAlpha, 'Bloquear transparência') }, '▦'));
    }
    const row = (L, depth) => {
      const r = h('div.lrow' + (L.id === d.active ? '.on' : (d.multi || []).includes(L.id) ? '.on.multi' : ''), { draggable: true, 'data-id': L.id, style: `padding-left:${depth * 14}px` });
      r.append(h('button.eye' + (L.visible ? '' : '.off'), { html: ic('eye'), title: 'Mostrar/ocultar', onclick: e => { e.stopPropagation(); L.visible = !L.visible; PS.commit(L.visible ? 'Mostrar camada' : 'Ocultar camada'); } }));
      if (L.clipping) r.append(h('span.tag', { html: ic('clip'), title: 'Máscara de corte' }));
      if (L.type === 'group') {
        r.append(h('button.caret', { onclick: e => { e.stopPropagation(); L.open = !L.open; buildLayers(); } }, L.open ? '▾' : '▸'), h('div.glyph', { html: ic('folder') }));
      } else if (L.type === 'adjust') r.append(h('div.glyph', { html: ic('adjust'), title: 'Camada de ajuste (mantida no arquivo, sem prévia)' }));
      else {
        const t = thumb(L.canvas, L.x, L.y, d, L.mask && !d.maskEdit && L.id === d.active ? '.target' : '');
        t.addEventListener('click', e => { if (e.ctrlKey) { e.stopPropagation(); PS.selFromLayer(L); } });
        r.append(L.type === 'text' ? h('div.glyph', { title: 'Camada de texto' }, 'T') : t);
      }
      if (L.mask) {
        const m = thumb(L.mask.canvas, 0, 0, d, '.mk' + (d.maskEdit && L.id === d.active ? '.target' : ''));
        m.title = 'Máscara: clique para pintar nela'; m.style.opacity = L.mask.enabled ? 1 : 0.35;
        m.addEventListener('click', e => { e.stopPropagation(); d.active = L.id; d.maskEdit = true; buildLayers(); buildOpt(); });
        r.append(m);
      }
      r.append(h('span.lname', { title: L.name }, L.name));
      if (L.src && L.src.effects && !L.src.effects.disabled) r.append(h('span.tag', { title: 'Tem efeitos de camada (mantidos no arquivo)' }, 'fx'));
      if (L.src && L.src.placedLayer && !L.stale) r.append(h('span.tag', { title: 'Objeto inteligente (mantido enquanto não for pintado)' }, 'SO'));
      if (L.locked) r.append(h('span.tag', { html: ic('lock') }));
      r.addEventListener('click', e => { PS.endText(); if (PS.xf) PS.endXf(true); PS.pickLayer(L.id, e.ctrlKey ? 'toggle' : e.shiftKey ? 'range' : null); buildOpt(); buildStatus(); });
      r.addEventListener('dblclick', e => { if (L.type === 'adjust' && !e.target.closest('.lname')) PS.editAdjust(L); else if (e.target.closest('.tag')) PS.styleDlg(); else renameDlg(L); });
      r.addEventListener('contextmenu', e => {
        e.preventDefault(); if (!PS.selected().includes(L)) PS.pickLayer(L.id);
        popup(e.clientX, e.clientY, [
          L.type === 'adjust' ? ['Editar ajuste…', () => PS.editAdjust(L)] : ['Estilo de camada…', PS.styleDlg],
          ['Duplicar camada', PS.dupLayer], ['Excluir camada', PS.delLayer], ['Renomear…', () => renameDlg(L)], null,
          ['Criar/soltar máscara de corte', PS.toggleClip], [L.mask ? 'Excluir máscara' : 'Adicionar máscara', L.mask ? PS.delMask : PS.addMask], null,
          ['Mesclar para baixo', PS.mergeDown], ['Rasterizar', PS.rasterize], ['Selecionar pixels', () => PS.selFromLayer(L)],
        ]);
      });
      r.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-layer', String(L.id)); e.dataTransfer.effectAllowed = 'move'; });
      const zone = e => { const b = r.getBoundingClientRect(), f = (e.clientY - b.top) / b.height; return L.type === 'group' && f > 0.3 && f < 0.7 ? 'in' : f < 0.5 ? 'top' : 'bot'; };
      const clear = () => r.classList.remove('over-top', 'over-bot', 'over-in');
      r.addEventListener('dragover', e => { if (![...e.dataTransfer.types].includes('text/x-layer')) return; e.preventDefault(); clear(); r.classList.add('over-' + zone(e)); });
      r.addEventListener('dragleave', clear);
      r.addEventListener('drop', e => {
        const id = +e.dataTransfer.getData('text/x-layer'); if (!id) return;
        e.preventDefault(); clear();
        const z = zone(e);
        PS.moveLayer(id, L.id, z === 'in' ? 'into' : z === 'top' ? 'above' : 'below');
      });
      el.append(r);
      if (L.children && L.open) for (let i = L.children.length - 1; i >= 0; i--) row(L.children[i], depth + 1);
    };
    for (let i = d.layers.length - 1; i >= 0; i--) row(d.layers[i], 0);
  }
  function popup(x, y, items) {
    document.querySelectorAll('.popup').forEach(p => p.remove());
    const el = h('div.drop.popup');
    for (const it of items) el.append(it ? h('button', { onclick: () => { el.remove(); if (PS.xf) PS.endXf(true); PS.endText(); it[1](); } }, h('span', {}, it[0])) : h('hr'));
    document.body.append(el);
    const b = el.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(x, innerWidth - b.width - 4)) + 'px'; el.style.top = Math.max(4, Math.min(y, innerHeight - b.height - 4)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  }
  function buildLayerButtons() {
    const b = (icon, title, fn) => h('button', { html: ic(icon), title, onclick: () => { if (!PS.doc) return; if (PS.xf) PS.endXf(true); PS.endText(); fn(); } });
    $('#layerbtn').append(h('button', { title: 'Estilo de camada', style: 'font-style:italic;font-weight:600', onclick: () => PS.doc && PS.styleDlg() }, 'fx'), h('button', { html: ic('adjust'), title: 'Nova camada de ajuste', onclick: e => PS.doc && popup(e.clientX, e.clientY - 290, Object.keys(PS.ADJ).map(k => [PS.ADJ[k].name, () => PS.newAdjust(k)])) }), b('mask', 'Adicionar máscara (usa a seleção, se houver)', PS.addMask), b('folder', 'Novo grupo', PS.newGroup), b('plus', 'Nova camada (Ctrl+Shift+N)', PS.newLayer), b('dup', 'Duplicar camada (Ctrl+J)', PS.dupLayer), b('trash', 'Excluir camada', PS.delLayer));
  }

  // ---------- arquivos soltos na janela ----------
  function dnd() {
    const st = $('#stage');
    const files = e => [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragover', e => { if (files(e)) { e.preventDefault(); st.classList.add('drop'); } });
    window.addEventListener('dragleave', e => { if (!e.relatedTarget) st.classList.remove('drop'); });
    window.addEventListener('drop', e => {
      if (!files(e)) return;
      e.preventDefault(); st.classList.remove('drop');
      PS.io.openFiles([...e.dataTransfer.files]);
    });
    $('#filein').addEventListener('change', e => { PS.io.openFiles([...e.target.files]); e.target.value = ''; });
    $('#placein').addEventListener('change', e => { PS.io.placeFiles([...e.target.files]); e.target.value = ''; });
  }

  // Botão direito na tela: menu com o que mais se usa, conforme a situação.
  function viewMenu(e) {
    e.preventDefault();
    const d = PS.doc; if (!d || PS.xf) return;
    const L = PS.active(), sel = !!d.sel, items = [];
    if (sel) items.push(['Desfazer seleção', PS.deselect], ['Inverter seleção', PS.invertSel], ['Camada a partir da cópia', () => { if (PS.copy(false)) PS.paste(); }], ['Preencher com a cor frontal', () => PS.fill(PS.fg)], ['Traçar seleção (4 px)', () => PS.strokeSel(4, 'center')], ['Apagar', () => PS.clearSel()], null);
    else items.push(['Selecionar tudo', PS.selectAll], ['Selecionar pixels da camada', () => PS.selFromLayer(PS.active())], null);
    items.push(['Copiar', () => PS.copy(false)], ['Colar', pasteMenu], ['Transformação livre', PS.startXf], null,
      L && L.type === 'adjust' ? ['Editar ajuste…', () => PS.editAdjust(L)] : ['Estilo de camada…', PS.styleDlg],
      ['Duplicar camada', PS.dupLayer], ['Excluir camada', PS.delLayer], null, ['Desfazer', PS.undo], ['Refazer', PS.redo]);
    popup(e.clientX, e.clientY, items);
  }

  // ---------- início ----------
  PS.initView($('#view')); PS.initTools($('#view'));
  $('#view').addEventListener('contextmenu', viewMenu);
  buildMenus(); buildTools(); buildLayerButtons(); keys(); dnd();
  const markTool = () => { document.querySelectorAll('#toolbar .tool').forEach(b => b.classList.toggle('on', b.dataset.tool === PS.tool)); setCursor(); buildOpt(); };
  PS.on('tool', markTool);
  PS.on('cursor', setCursor);
  PS.on('xf', () => { if (!document.activeElement || !$('#optbar').contains(document.activeElement)) buildOpt(); });
  PS.on('doc', () => { buildTabs(); buildOpt(); });
  PS.on('layers', () => { buildLayers(); buildStatus(); });
  PS.on('history', buildHistory);
  PS.on('zoom', buildStatus);
  PS.on('mouse', p => { lastMouse = p; buildStatus(); });
  markTool(); buildTabs();
  moreFonts();
  window.addEventListener('contextmenu', e => { if (!typing(e.target)) e.preventDefault(); });
  window.addEventListener('beforeunload', e => { if (!PS.io.native() && PS.docs.some(d => d.dirty)) { e.preventDefault(); e.returnValue = ''; } });
  if (window.pywebview && window.pywebview.api) PS.io.boot(); else window.addEventListener('pywebviewready', () => PS.io.boot());
})();
