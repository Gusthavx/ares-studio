'use strict';
// Camadas de ajuste (não destrutivas), estilos de camada, modificar seleção e réguas.
(function () {
  const PS = window.PS, F = PS.FILTERS;
  const mkLut = f => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = f(i); return l; };
  const R = (k, label, min, max, val, step = 1) => ({ k, label, type: 'range', min, max, val, step });

  // ---------- camadas de ajuste: do formato do PSD para uma função que altera os pixels ----------
  const levelLut = c => {
    const g = c.midtoneInput > 10 ? c.midtoneInput / 100 : (c.midtoneInput || 1), ib = c.shadowInput || 0, iw = Math.max(ib + 1, c.highlightInput ?? 255);
    const ob = c.shadowOutput || 0, ow = c.highlightOutput ?? 255;
    return mkLut(i => ob + Math.pow(Math.min(1, Math.max(0, (i - ib) / (iw - ib))), 1 / g) * (ow - ob));
  };
  const curveLut = c => c && c.length > 1 ? PS.curveLUT(c.map(p => ({ x: p.input, y: p.output }))) : null;
  const chanLut = (all, r, g, b) => d => {
    for (let i = 0; i < d.length; i += 4) {
      let x = d[i], y = d[i + 1], z = d[i + 2];
      if (r) x = r[x]; if (g) y = g[y]; if (b) z = b[z];
      if (all) { x = all[x]; y = all[y]; z = all[z]; }
      d[i] = x; d[i + 1] = y; d[i + 2] = z;
    }
  };
  PS.adjustFn = a => {
    if (!a) return null;
    switch (a.type) {
      case 'brightness/contrast': return d => F.brightness.px(d, { b: a.brightness || 0, c: a.contrast || 0 });
      case 'levels': return chanLut(a.rgb && levelLut(a.rgb), a.red && levelLut(a.red), a.green && levelLut(a.green), a.blue && levelLut(a.blue));
      case 'curves': return chanLut(curveLut(a.rgb), curveLut(a.red), curveLut(a.green), curveLut(a.blue));
      case 'exposure': { const m = Math.pow(2, a.exposure || 0), o = a.offset || 0, g = a.gamma || 1; const l = mkLut(i => 255 * Math.pow(Math.min(1, Math.max(0, i / 255 * m + o)), 1 / g)); return d => chanLut(l)(d); }
      case 'vibrance': return d => { if (a.vibrance) F.vibrance.px(d, { v: a.vibrance }); if (a.saturation) F.huesat.px(d, { h: 0, s: a.saturation, l: 0 }); };
      case 'hue/saturation': { const m = a.master || {}; return d => F.huesat.px(d, { h: m.hue || 0, s: m.saturation || 0, l: m.lightness || 0 }); }
      case 'color balance': { const m = a.midtones || {}; return d => F.balance.px(d, { r: m.cyanRed || 0, g: m.magentaGreen || 0, b: m.yellowBlue || 0 }); }
      case 'black & white': {
        const w = [a.reds ?? 40, a.yellows ?? 60, a.greens ?? 40, a.cyans ?? 60, a.blues ?? 20, a.magentas ?? 80].map(v => v / 100);
        return d => {
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), md = r + g + b - mx - mn;
            // cor primária (o canal mais forte) e secundária (entre o mais forte e o do meio)
            const prim = mx === r ? w[0] : mx === g ? w[2] : w[4];
            const sec = (mx === r && md === g) || (mx === g && md === r) ? w[1] : (mx === g && md === b) || (mx === b && md === g) ? w[3] : w[5];
            d[i] = d[i + 1] = d[i + 2] = mn + (mx - md) * prim + (md - mn) * sec;
          }
        };
      }
      case 'photo filter': {
        const c = a.color && 'r' in a.color ? a.color : { r: 236, g: 138, b: 0 }, k = (a.density > 1 ? a.density / 100 : (a.density ?? 0.25));
        return d => {
          for (let i = 0; i < d.length; i += 4) {
            const l0 = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            let r = d[i] * (1 - k + k * c.r / 255), g = d[i + 1] * (1 - k + k * c.g / 255), b = d[i + 2] * (1 - k + k * c.b / 255);
            if (a.preserveLuminosity !== false) { const s = l0 / Math.max(1, r * 0.299 + g * 0.587 + b * 0.114); r *= s; g *= s; b *= s; }
            d[i] = r; d[i + 1] = g; d[i + 2] = b;
          }
        };
      }
      case 'channel mixer': {
        const row = (c, def) => c ? [c.red / 100, c.green / 100, c.blue / 100, (c.constant || 0) * 2.55] : def;
        const mono = a.monochrome && a.gray ? row(a.gray) : null;
        const rr = row(a.red, [1, 0, 0, 0]), gg = row(a.green, [0, 1, 0, 0]), bb = row(a.blue, [0, 0, 1, 0]);
        return d => {
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], m = (q) => r * q[0] + g * q[1] + b * q[2] + q[3];
            if (mono) d[i] = d[i + 1] = d[i + 2] = m(mono); else { d[i] = m(rr); d[i + 1] = m(gg); d[i + 2] = m(bb); }
          }
        };
      }
      case 'invert': return d => F.invert.px(d);
      case 'posterize': return d => F.posterize.px(d, { n: Math.max(2, a.levels || 4) });
      case 'threshold': return d => F.threshold.px(d, { t: a.level || 128 });
      default: return null; // mapa de degradê, cor seletiva, consulta de cores: sem prévia
    }
  };
  PS.applyAdjust = (L, ctx, d) => {
    const fn = PS.adjustFn(L.adj);
    if (!fn) return;
    const im = ctx.getImageData(0, 0, d.w, d.h);
    fn(im.data, d.w, d.h);
    const t = PS.scratch(d.w, d.h), tx = t.getContext('2d');
    tx.putImageData(im, 0, 0);
    if (L.mask && L.mask.enabled) { tx.globalCompositeOperation = 'destination-in'; tx.drawImage(L.mask.canvas, 0, 0); }
    ctx.save(); ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend === 'normal' ? 'source-atop' : PS.gco(L.blend);
    ctx.drawImage(t, 0, 0); ctx.restore();
    PS.release(t);
  };

  // ---------- criar e editar camadas de ajuste ----------
  const lv = (c = {}) => ({ ib: c.shadowInput || 0, g: c.midtoneInput > 10 ? c.midtoneInput / 100 : (c.midtoneInput || 1), iw: c.highlightInput ?? 255, ob: c.shadowOutput || 0, ow: c.highlightOutput ?? 255 });
  PS.ADJ = {
    'brightness/contrast': { name: 'Brilho/Contraste', fields: [R('b', 'Brilho', -150, 150, 0), R('c', 'Contraste', -100, 100, 0)],
      to: v => ({ type: 'brightness/contrast', brightness: v.b, contrast: v.c, meanValue: 127, useLegacy: false }), from: a => ({ b: a.brightness || 0, c: a.contrast || 0 }) },
    'levels': { name: 'Níveis', fields: F.levels.fields,
      to: v => ({ type: 'levels', rgb: { shadowInput: v.ib, highlightInput: Math.max(v.ib + 1, v.iw), shadowOutput: v.ob, highlightOutput: v.ow, midtoneInput: v.g } }), from: a => lv(a.rgb) },
    'curves': { name: 'Curvas', fields: F.curves.fields,
      to: v => ({ type: 'curves', rgb: v.pts.slice().sort((p, q) => p.x - q.x).map(p => ({ input: p.x, output: p.y })) }),
      from: a => ({ pts: (a.rgb && a.rgb.length > 1 ? a.rgb : [{ input: 0, output: 0 }, { input: 255, output: 255 }]).map(p => ({ x: p.input, y: p.output })) }) },
    'exposure': { name: 'Exposição', fields: [R('e', 'Exposição', -5, 5, 0, 0.01), R('o', 'Deslocamento', -0.5, 0.5, 0, 0.001), R('g', 'Gama', 0.2, 5, 1, 0.01)],
      to: v => ({ type: 'exposure', exposure: v.e, offset: v.o, gamma: v.g }), from: a => ({ e: a.exposure || 0, o: a.offset || 0, g: a.gamma || 1 }) },
    'vibrance': { name: 'Vibratilidade', fields: [R('v', 'Vibratilidade', -100, 100, 0), R('s', 'Saturação', -100, 100, 0)],
      to: v => ({ type: 'vibrance', vibrance: v.v, saturation: v.s }), from: a => ({ v: a.vibrance || 0, s: a.saturation || 0 }) },
    'hue/saturation': { name: 'Matiz/Saturação', fields: F.huesat.fields,
      to: v => ({ type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: v.h, saturation: v.s, lightness: v.l } }),
      from: a => ({ h: (a.master || {}).hue || 0, s: (a.master || {}).saturation || 0, l: (a.master || {}).lightness || 0 }) },
    'color balance': { name: 'Equilíbrio de cores', fields: F.balance.fields,
      to: v => ({ type: 'color balance', shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, midtones: { cyanRed: v.r, magentaGreen: v.g, yellowBlue: v.b }, highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, preserveLuminosity: true }),
      from: a => ({ r: (a.midtones || {}).cyanRed || 0, g: (a.midtones || {}).magentaGreen || 0, b: (a.midtones || {}).yellowBlue || 0 }) },
    'black & white': { name: 'Preto e branco', fields: [R('r', 'Vermelhos', -200, 300, 40), R('y', 'Amarelos', -200, 300, 60), R('g', 'Verdes', -200, 300, 40), R('c', 'Cianos', -200, 300, 60), R('b', 'Azuis', -200, 300, 20), R('m', 'Magentas', -200, 300, 80)],
      to: v => ({ type: 'black & white', reds: v.r, yellows: v.y, greens: v.g, cyans: v.c, blues: v.b, magentas: v.m, useTint: false }),
      from: a => ({ r: a.reds ?? 40, y: a.yellows ?? 60, g: a.greens ?? 40, c: a.cyans ?? 60, b: a.blues ?? 20, m: a.magentas ?? 80 }) },
    'invert': { name: 'Inverter', to: () => ({ type: 'invert' }) },
    'posterize': { name: 'Posterizar', fields: [R('n', 'Níveis', 2, 255, 4)], to: v => ({ type: 'posterize', levels: v.n }), from: a => ({ n: a.levels || 4 }) },
    'threshold': { name: 'Limiar', fields: [R('t', 'Nível', 1, 255, 128)], to: v => ({ type: 'threshold', level: v.t }), from: a => ({ t: a.level || 128 }) },
  };
  PS.editAdjust = (L, isNew) => {
    const d = PS.doc, def = L.adj && PS.ADJ[L.adj.type];
    if (!def || !def.fields) { PS.toast(def ? 'Este ajuste não tem controles.' : 'Este tipo de ajuste ainda não dá para editar aqui (fica guardado no arquivo).'); return; }
    const old = L.adj, cur = def.from(old);
    PS.dialog({
      title: `${def.name} (camada de ajuste)`, side: true,
      fields: def.fields.map(f => Object.assign({}, f, { val: cur[f.k] })),
      onChange: v => { L.adj = def.to(v); d.compDirty = true; PS.render(); },
      onOk: v => { L.adj = def.to(v); PS.commit(isNew ? `Nova camada de ajuste: ${def.name}` : `Alterar ${def.name}`); },
      onCancel: () => {
        if (isNew) { const r = PS.locate(L.id); r.list.splice(r.idx, 1); d.active = (r.list[r.idx - 1] || r.list[0] || r.parent || {}).id; PS.emit('layers'); }
        else L.adj = old;
        d.compDirty = true; PS.render();
      },
    });
  };
  PS.newAdjust = key => {
    const def = PS.ADJ[key], v = Object.fromEntries((def.fields || []).map(f => [f.k, f.type === 'curve' ? f.val.map(p => ({ x: p.x, y: p.y })) : f.val]));
    const L = PS.insertAbove(PS.mkLayer({ name: PS.nameFor(def.name), type: 'adjust', adj: def.to(v) }));
    if (def.fields) { PS.emit('layers'); PS.doc.compDirty = true; PS.render(); PS.editAdjust(L, true); }
    else PS.commit(`Nova camada de ajuste: ${def.name}`);
  };

  // ---------- estilos de camada ----------
  const px = v => ({ units: 'Pixels', value: v });
  const val = (v, d) => v == null ? d : typeof v === 'number' ? v : (v.value ?? d);
  const hex = (c, d) => c && 'r' in c ? PS.rgbToHex(c.r, c.g, c.b) : d;
  PS.styleDlg = () => {
    const d = PS.doc, L = PS.active();
    if (!L || L.type === 'group' || L.type === 'adjust') { PS.toast('Estilo de camada: escolha uma camada de pixels ou de texto.'); return; }
    const oldSrc = L.src, fx = (oldSrc && oldSrc.effects) || {}, first = v => [].concat(v || [])[0] || {};
    const ds = first(fx.dropShadow), st = first(fx.stroke), sf = first(fx.solidFill), og = first(fx.outerGlow);
    const is = first(fx.innerShadow), ig = first(fx.innerGlow), go = first(fx.gradientOverlay), sn = first(fx.satin);
    const gs = ((go.gradient && go.gradient.colorStops) || []).slice().sort((p, q) => p.location - q.location);
    const stop = (c, loc) => ({ color: PS.hexToRgb(c), location: loc, midpoint: 0.5 });
    const on = (e, arr) => [].concat(arr || []).length > 0 && e.enabled !== false;
    const build = v => {
      const e = Object.assign({}, fx, { disabled: false, scale: fx.scale ?? 1 });
      e.dropShadow = [Object.assign({ blendMode: 'multiply', useGlobalLight: false, choke: px(0), layerConceals: true, antialiased: false }, ds, { enabled: v.dsOn, color: PS.hexToRgb(v.dsC), opacity: v.dsO / 100, angle: v.dsA, distance: px(v.dsD), size: px(v.dsS) })];
      e.stroke = [Object.assign({ blendMode: 'normal', fillType: 'color', overprint: false }, st, { enabled: v.stOn, size: px(v.stS), position: v.stP, color: PS.hexToRgb(v.stC), opacity: v.stO / 100 })];
      e.solidFill = [Object.assign({ blendMode: 'normal' }, sf, { enabled: v.sfOn, color: PS.hexToRgb(v.sfC), opacity: v.sfO / 100 })];
      e.outerGlow = Object.assign({ blendMode: 'screen', source: 'edge', choke: px(0), range: 0.5, noise: 0, jitter: 0, antialiased: false }, og, { enabled: v.ogOn, color: PS.hexToRgb(v.ogC), opacity: v.ogO / 100, size: px(v.ogS) });
      for (const k of ['dropShadow', 'stroke', 'solidFill']) if (!e[k][0].enabled && ![].concat(fx[k] || []).length) delete e[k];
      if (!e.outerGlow.enabled && !fx.outerGlow) delete e.outerGlow;
      // só grava no arquivo os efeitos novos que foram ligados (ou que já existiam nele)
      if (v.isOn || fx.innerShadow) e.innerShadow = [Object.assign({ blendMode: 'multiply', useGlobalLight: false, choke: px(0), antialiased: false }, is, { enabled: v.isOn, color: PS.hexToRgb(v.isC), opacity: v.isO / 100, angle: v.isA, distance: px(v.isD), size: px(v.isS) })];
      if (v.igOn || fx.innerGlow) e.innerGlow = Object.assign({ blendMode: 'screen', source: 'edge', choke: px(0), range: 0.5, noise: 0, jitter: 0, antialiased: false }, ig, { enabled: v.igOn, color: PS.hexToRgb(v.igC), opacity: v.igO / 100, size: px(v.igS) });
      if (v.snOn || fx.satin) e.satin = Object.assign({ blendMode: 'multiply', antialiased: false, invert: true }, sn, { enabled: v.snOn, color: PS.hexToRgb(v.snC), opacity: v.snO / 100, angle: v.snA, distance: px(v.snD), size: px(v.snS) });
      if (v.goOn || fx.gradientOverlay) e.gradientOverlay = [Object.assign({ blendMode: 'normal', align: true, scale: 1, dither: false, offset: { x: 0, y: 0 } }, go, {
        enabled: v.goOn, opacity: v.goO / 100, angle: v.goA, type: v.goT, reverse: v.goR,
        gradient: Object.assign({ name: 'Personalizado', type: 'solid', smoothness: 1, opacityStops: [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }] }, go.gradient, { colorStops: [stop(v.goC1, 0), stop(v.goC2, 1)] }),
      })];
      return e;
    };
    const set = v => { L.src = Object.assign({}, oldSrc, { effects: build(v) }); d.compDirty = true; PS.render(); };
    const H = label => ({ type: 'head', label }), C = (k, label, v) => ({ k, label, type: 'check', val: v }), K = (k, label, v) => ({ k, label, type: 'color', val: v });
    PS.dialog({
      title: `Estilo de camada: ${L.name}`, side: true,
      fields: [
        H('Sombra projetada'), C('dsOn', 'Ativar', on(ds, fx.dropShadow)), K('dsC', 'Cor', hex(ds.color, '#000000')), R('dsO', 'Opacidade %', 0, 100, Math.round((ds.opacity ?? 0.5) * 100)), R('dsA', 'Ângulo °', -180, 180, ds.angle ?? 120), R('dsD', 'Distância', 0, 300, val(ds.distance, 8)), R('dsS', 'Tamanho', 0, 250, val(ds.size, 10)),
        H('Traçado'), C('stOn', 'Ativar', on(st, fx.stroke)), K('stC', 'Cor', hex(st.color, '#ffffff')), R('stS', 'Tamanho', 1, 250, val(st.size, 4)), { k: 'stP', label: 'Posição', type: 'select', val: st.position === 'center' ? 'center' : 'outside', options: [['outside', 'Externa'], ['center', 'Centro']] }, R('stO', 'Opacidade %', 0, 100, Math.round((st.opacity ?? 1) * 100)),
        H('Sobreposição de cor'), C('sfOn', 'Ativar', on(sf, fx.solidFill)), K('sfC', 'Cor', hex(sf.color, '#ff0000')), R('sfO', 'Opacidade %', 0, 100, Math.round((sf.opacity ?? 1) * 100)),
        H('Brilho externo'), C('ogOn', 'Ativar', on(og, fx.outerGlow)), K('ogC', 'Cor', hex(og.color, '#ffffbe')), R('ogO', 'Opacidade %', 0, 100, Math.round((og.opacity ?? 0.75) * 100)), R('ogS', 'Tamanho', 0, 250, val(og.size, 12)),
        H('Sombra interna'), C('isOn', 'Ativar', on(is, fx.innerShadow)), K('isC', 'Cor', hex(is.color, '#000000')), R('isO', 'Opacidade %', 0, 100, Math.round((is.opacity ?? 0.5) * 100)), R('isA', 'Ângulo °', -180, 180, is.angle ?? 120), R('isD', 'Distância', 0, 300, val(is.distance, 6)), R('isS', 'Tamanho', 0, 250, val(is.size, 8)),
        H('Brilho interno'), C('igOn', 'Ativar', on(ig, fx.innerGlow)), K('igC', 'Cor', hex(ig.color, '#ffffbe')), R('igO', 'Opacidade %', 0, 100, Math.round((ig.opacity ?? 0.75) * 100)), R('igS', 'Tamanho', 0, 250, val(ig.size, 10)),
        H('Acetinado'), C('snOn', 'Ativar', on(sn, fx.satin)), K('snC', 'Cor', hex(sn.color, '#000000')), R('snO', 'Opacidade %', 0, 100, Math.round((sn.opacity ?? 0.5) * 100)), R('snA', 'Ângulo °', -180, 180, sn.angle ?? 19), R('snD', 'Distância', 1, 250, val(sn.distance, 11)), R('snS', 'Tamanho', 0, 250, val(sn.size, 14)),
        H('Sobreposição de degradê'), C('goOn', 'Ativar', on(go, fx.gradientOverlay)), K('goC1', 'Cor inicial', hex(gs[0] && gs[0].color, '#ffe14d')), K('goC2', 'Cor final', hex(gs.length && gs[gs.length - 1].color, '#ff5a1f')),
        { k: 'goT', label: 'Tipo', type: 'select', val: go.type === 'radial' ? 'radial' : 'linear', options: [['linear', 'Linear'], ['radial', 'Radial']] }, R('goA', 'Ângulo °', -180, 180, go.angle ?? 90), R('goO', 'Opacidade %', 0, 100, Math.round((go.opacity ?? 1) * 100)), C('goR', 'Inverter', !!go.reverse),
      ],
      onChange: set,
      onOk: v => { set(v); PS.commit('Estilo de camada'); },
      onCancel: () => { L.src = oldSrc; d.compDirty = true; PS.render(); },
    });
  };
  PS.clearStyle = () => {
    const L = PS.active(); if (!L || !L.src || !L.src.effects) return;
    L.src = Object.assign({}, L.src); delete L.src.effects;
    PS.commit('Limpar estilo de camada');
  };

  // ---------- modificar seleção ----------
  function dilate(c, n) {
    const o = PS.mk(c.width, c.height), x = o.getContext('2d');
    for (const r of [n, n * 0.66, n * 0.33]) { const k = Math.max(16, Math.ceil(r * 3)); for (let i = 0; i < k; i++) { const a = i * 2 * Math.PI / k; x.drawImage(c, Math.cos(a) * r, Math.sin(a) * r); } }
    x.drawImage(c, 0, 0);
    return o;
  }
  const inverse = c => { const o = PS.mk(c.width, c.height), x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.globalCompositeOperation = 'destination-out'; x.drawImage(c, 0, 0); return o; };
  PS.growSel = n => {
    const d = PS.doc; if (!d.sel || !n) return;
    PS.setSel(n > 0 ? dilate(d.sel, n) : inverse(dilate(inverse(d.sel), -n)));
    PS.commit(n > 0 ? 'Expandir seleção' : 'Contrair seleção');
  };
  PS.borderSel = n => {
    const d = PS.doc; if (!d.sel || !(n > 0)) return;
    const o = dilate(d.sel, n / 2), x = o.getContext('2d');
    x.globalCompositeOperation = 'destination-out'; x.drawImage(inverse(dilate(inverse(d.sel), n / 2)), 0, 0);
    PS.setSel(o); PS.commit('Borda da seleção');
  };
  PS.strokeSel = (w, pos) => {
    const d = PS.doc, L = PS.paintTarget(); if (!L) return;
    if (!d.sel) { PS.toast('Faça uma seleção primeiro.'); return; }
    const out = pos === 'inside' ? 0 : pos === 'center' ? w / 2 : w, inn = w - out;
    const ring = out ? dilate(d.sel, out) : PS.clone(d.sel), x = ring.getContext('2d');
    x.globalCompositeOperation = 'destination-out'; x.drawImage(inn ? inverse(dilate(inverse(d.sel), inn)) : d.sel, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = PS.fg; x.fillRect(0, 0, d.w, d.h);
    PS.expand(L);
    L.canvas.getContext('2d').drawImage(ring, -L.x, -L.y);
    PS.touch(L); PS.commit('Traçar seleção');
  };

  // ---------- réguas ----------
  PS.rulers = true;
  try { PS.rulers = localStorage.getItem('ares.reguas') !== '0'; } catch (e) { /* sem armazenamento */ }
  PS.toggleRulers = () => { PS.rulers = !PS.rulers; try { localStorage.setItem('ares.reguas', PS.rulers ? '1' : '0'); } catch (e) { /* idem */ } PS.render(); };
  PS.drawRulers = (ctx, d, px0, py0, z, mouse) => {
    if (!PS.rulers) return;
    const S = 18, W = ctx.canvas.width, H = ctx.canvas.height;
    let step = 1; for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) { step = s; if (s * z >= 56) break; }
    const sub = step >= 10 ? step / 10 : step >= 5 ? step / 5 : step;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#262626'; ctx.fillRect(0, 0, W, S); ctx.fillRect(0, 0, S, H);
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, S + 0.5); ctx.lineTo(W, S + 0.5); ctx.moveTo(S + 0.5, 0); ctx.lineTo(S + 0.5, H); ctx.stroke();
    ctx.fillStyle = '#9a9a9a'; ctx.strokeStyle = '#6a6a6a'; ctx.font = '9px "Segoe UI", sans-serif'; ctx.textBaseline = 'top';
    ctx.beginPath();
    for (let v = Math.floor(-px0 / z / sub) * sub; v * z + px0 < W; v += sub) {
      const x = Math.round(v * z + px0) + 0.5; if (x < S) continue;
      const major = Math.abs(v % step) < 1e-6;
      ctx.moveTo(x, major ? 0 : S - (Math.abs(v % (step / 2)) < 1e-6 ? 8 : 4)); ctx.lineTo(x, S);
      if (major) ctx.fillText(String(Math.round(v)), x + 3, 1);
    }
    for (let v = Math.floor(-py0 / z / sub) * sub; v * z + py0 < H; v += sub) {
      const y = Math.round(v * z + py0) + 0.5; if (y < S) continue;
      const major = Math.abs(v % step) < 1e-6;
      ctx.moveTo(major ? 0 : S - (Math.abs(v % (step / 2)) < 1e-6 ? 8 : 4), y); ctx.lineTo(S, y);
      if (major) [...String(Math.round(v))].forEach((c, i) => ctx.fillText(c, 3, y + 2 + i * 9)); // algarismos empilhados, como no Photoshop
    }
    ctx.stroke();
    if (mouse && mouse.inside) { // marca do cursor nas réguas
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(mouse.sx + 0.5, 0); ctx.lineTo(mouse.sx + 0.5, S); ctx.moveTo(0, mouse.sy + 0.5); ctx.lineTo(S, mouse.sy + 0.5); ctx.stroke();
    }
    ctx.fillStyle = '#262626'; ctx.fillRect(0, 0, S, S);
    ctx.restore();
  };
})();
