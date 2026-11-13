// R11 · F5 · pared del vaso YINYANG (simulación determinista, teclas reales en el paso exacto, 2 repeticiones).
//  YY-02  W (o el stick) mantenido DESDE ANTES del enganche no saca a ANMI del vaso; ↑ pulsado EN EL AIRE sí (decisión R3).
//  YY-01  en fakie no hay latigazo de rumbo al reengancharse (≤ 20° por paso).
//  YY-03/TRK-02  EXTRA en el aire de pared hace grab (F); F+A avisa en vez de girar (plan R11 v3).
//  YY-04  Q en la pared / su aire avisa (cuenta como denegación).
//  YY-14  manual hasta la pared: engancha (sin choque).
//  YY-10  tallando hacia E1, el final del tramo no rebota (sin inversión de la velocidad a lo largo de la pared, ≤ 15° por paso).
//  YY-18  salida por arriba en diagonal (#130, −30°, 7 m/s, ↑ en el aire): aterriza rodando, sin caída.
//  No empeorar (verdes ya en la base): de frente sin tocar nada engancha, sale al aire y vuelve al vaso sin caída; con ↑ pulsado en el
//  aire sale al deck; kickflip en el aire de pared; por debajo del umbral no engancha.
//   node tools/v8/r11/f5-pared.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, paredes, salida } from './f5-lib.mjs';
const R = new Report('r11-f5-pared');
// script: W/stick pulsado desde el principio; ↑ en el aire (flanco tras el despegue); trucos/EXTRA/Q en el aire de pared
const AIRE = (cuerpo) => `if (pool.active && pool.phase === 'air' && pool.airT > 0.12 && !M.hecho) { M.hecho = st; ${cuerpo} }`;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const P = await paredes(page), W540 = P[540], W645 = P[645], W840 = P[840], W130 = P[130];
    const muros = [['N2#540', W540], ['N2#645', W645], ['N1#840', W840]];
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- YY-02
      for (const [tag, w] of muros) {
        const o = salida(w, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 4, pre: "key('KeyW', true)", script: "if (st > 6 && s.grounded && !(pool && pool.active) && s.footPos.y > -0.1) M.fuera = (M.fuera || 0) + 1;" });
        // R11: «no sale» = sin salida por arriba y sin apoyarse nunca en el deck (con W 4 s cruza el vaso y puede acabar en el aire de otra pared)
        R.check(r.pool.hooks >= 1 && r.pool.airOuts === 0 && !r.fuera, `#${k} YY-02 ${tag}: W mantenida desde antes del enganche NO saca del vaso (sale-arriba ${r.pool.airOuts}, pasos en el deck ${r.fuera ?? 0}, fin y ${r.end[1]})`, 'input', { log: r.log.slice(0, 5), end: r.end });
      }
      { const o = salida(W540, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 4, pre: "g.input.fakePad = { id: 'r11', connected: true, axes: [0, -1, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };", script: "if (st > 6 && s.grounded && !(pool && pool.active) && s.footPos.y > -0.1) M.fuera = (M.fuera || 0) + 1;" });
        R.check(r.pool.hooks >= 1 && r.pool.airOuts === 0 && !r.fuera, `#${k} YY-02 N2#540: stick del mando al 100 % desde antes del enganche NO saca del vaso (sale-arriba ${r.pool.airOuts}, pasos en el deck ${r.fuera ?? 0})`, 'input', { log: r.log.slice(0, 5), end: r.end }); }
      // no empeorar: ↑ pulsado en el aire (flanco) → sale al deck; sin tocar nada → vuelve al vaso
      for (const [tag, w] of muros.slice(0, 2)) {
        const o = salida(w, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 3, script: AIRE("key('KeyW', true);") + "if (M.hecho && !pool.active && s.grounded && s.footPos.y > -0.1 && !M.deck) { M.deck = st; key('KeyW', false); }" });
        R.check(r.pool.airOuts >= 1 && r.deck && r.bails === 0, `#${k} no empeorar ${tag}: ↑ pulsado en el aire de pared sale al deck sin caída (sale-arriba ${r.pool.airOuts}, en el deck ${!!r.deck})`, 'input', { log: r.log.slice(0, 5), end: r.end });
        const r2 = await run(page, { ...o, v: 6.5, sec: 4 });
        R.check(r2.pool.hooks >= 1 && r2.pool.airs >= 1 && r2.pool.airOuts === 0 && r2.bails === 0 && r2.end[1] < -0.5, `#${k} no empeorar ${tag}: de frente sin tocar nada engancha, sale al aire y vuelve al vaso sin caída`, 'input', { log: r2.log.slice(0, 6), end: r2.end });
      }
      { const o = salida(W540, 3.0); const r = await run(page, { ...o, v: 4.5, sec: 2.5 });
        R.check(r.pool.hooks === 0, `#${k} no empeorar N2#540: a 4,5 m/s (bajo el umbral) no engancha`, 'input', { log: r.log }); }
      { const o = salida(W540, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 4, script: AIRE("key('Space', true);") + "if (M.hecho && st === M.hecho + 3) key('Space', false);" });
        R.check(r.tricks.some((t) => t.kind === 'kickflip' && t.ok) && r.bails === 0, `#${k} no empeorar N2#540: kickflip (SALTO) en el aire de pared sale bien`, 'input', { tricks: r.tricks }); }
      // ---------------------------------------------------------------- YY-01 (fakie: de espaldas a la pared, rodando hacia ella)
      for (const [tag, w] of muros.slice(0, 2)) {
        const o = salida(w, 3.0); const r = await run(page, { p: o.p, h: o.h + Math.PI, vdir: o.h, v: 6.5, vLong: -6.5, sec: 3.5, loco: 'ride',
          script: "if (pool.active) M.enPared = 1; if (M.enPared) { const d = Math.abs(R.angd(s.heading, M.hp ?? s.heading)); if (pool.log.some((e) => /reengancha/.test(e.e))) M.dhRe = Math.max(M.dhRe || 0, d); } M.hp = s.heading;" });
        const deg = +((r.dhRe ?? 0) * 180 / Math.PI).toFixed(1);
        R.check(r.pool.hooks >= 1 && r.log.some((e) => /reengancha/.test(e)) && deg <= 20, `#${k} YY-01 ${tag}: en fakie el reenganche no da latigazo (máx. ${deg}° por paso tras reengancharse, ≤ 20°)`, 'input', { log: r.log.slice(0, 6), deg });
      }
      // ---------------------------------------------------------------- YY-03 / TRK-02 (EXTRA en el aire de pared)
      { const o = salida(W540, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 3.5, script: AIRE("key('KeyF', true);") + "if (M.hecho && st === M.hecho + 25) key('KeyF', false); if (s.grab > 0.3) M.grab = 1;" });
        R.check(r.ev.includes('grab') || r.grab === 1, `#${k} YY-03/TRK-02: F en el aire de pared hace grab`, 'input', { ev: r.ev.slice(0, 8), log: r.log.slice(0, 4) }); }
      { const o = salida(W540, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 3.5, script: AIRE("key('KeyA', true); key('KeyF', true);") + "if (M.hecho && st === M.hecho + 4) { key('KeyF', false); key('KeyA', false); }" });
        // plan R11 v3 (§0b F5): en el aire de pared los giros chocan con su giro de 180° → se avisa en vez de girar (sin latigazo)
        R.check(!r.tricks.some((t) => /180|360/.test(t.kind)) && r.ev.some((e) => /giro-pared-denegado/.test(e)), `#${k} YY-03/TRK-02: F+A en el aire de pared avisa (los giros van con SALTO + dirección) en vez de girar`, 'input', { tricks: r.tricks, ev: r.ev.slice(0, 8) }); }
      // ---------------------------------------------------------------- YY-04 (Q en la pared / en el aire de pared)
      for (const fase of ['wall', 'air']) {
        const o = salida(W540, 3.0); const r = await run(page, { ...o, v: 6.5, sec: 2.5, script: `if (pool.active && pool.phase === '${fase}' && ${fase === 'air' ? 'pool.airT > 0.12' : 'pool.q > 0.3'} && !M.hecho) { M.hecho = st; key('KeyQ', true); } if (M.hecho && st === M.hecho + 2) key('KeyQ', false);` });
        R.check(r.hecho && (r.boardDenied >= 1 || r.sfx.includes('deny')), `#${k} YY-04: Q en ${fase === 'air' ? 'el aire de pared' : 'la pared'} avisa (denegación ${r.boardDenied}, sonidos ${r.sfx.join(',')})`, 'input', { hecho: r.hecho, log: r.log.slice(0, 4) });
      }
      // ---------------------------------------------------------------- YY-14 (manual hasta la pared)
      for (const [tag, w, v] of [['N2#540', W540, 9], ['N2#540', W540, 6.5], ['N1#840', W840, 9]]) {
        const o = salida(w, 3.7); const r = await run(page, { ...o, v, sec: 3.5, pre: "key('KeyF', true)", script: "if (st === 1) M.loco0 = s.loco; if (s.loco === 'manual') M.manual = 1;" });
        R.check(r.manual === 1 && r.pool.hooks >= 1 && r.impacts.length === 0 && r.bails === 0, `#${k} YY-14 ${tag} ${v} m/s: en manual hasta la pared engancha sin choque (manual ${r.manual === 1 ? "sí" : "NO"}, enganches ${r.pool.hooks}, impactos ${r.impacts.length}, caídas ${r.bails})`, 'input', { log: r.log.slice(0, 4), imp: r.impacts.map((i) => i.why) });
      }
      // ---------------------------------------------------------------- YY-10 (tallando hacia E1)
      { const w = P[866], w2 = P[871], tl = Math.hypot(w2[0] - w[0], w2[1] - w[1]), t = [(w2[0] - w[0]) / tl, (w2[1] - w[1]) / tl];
        for (const [ang, v] of [[60, 6.5], [55, 9]]) {
          const a = ang * Math.PI / 180, dx = -w[2] * Math.cos(a) + t[0] * Math.sin(a), dz = -w[3] * Math.cos(a) + t[1] * Math.sin(a);
          const p = [w[0] + w[2] * 1.15 - t[0] * 1.0, w[4] + 0.02, w[1] + w[3] * 1.15 - t[1] * 1.0];
          const r = await run(page, { p, h: Math.atan2(dx, dz), v, sec: 3, script: `if (pool.active && pool.phase === 'wall') { const vt = s.vel.x * ${t[0]} + s.vel.z * ${t[1]}; if (M.vt !== undefined && M.vt > 1 && vt < -0.5) M.inv = (M.inv || 0) + 1; M.vt = vt; M.carve = 1; const d = Math.abs(R.angd(s.heading, M.hp ?? s.heading)); M.dhW = Math.max(M.dhW || 0, d); } M.hp = s.heading;` });
          const deg = +((r.dhW ?? 0) * 180 / Math.PI).toFixed(1);
          R.check(r.carve === 1 && !r.inv && deg <= 15, `#${k} YY-10 N1#866 ${ang}° ${v} m/s: al final del tramo junto a E1 no rebota (inversiones ${r.inv ?? 0}, giro máx. ${deg}°/paso)`, 'input', { log: r.log.slice(0, 6) });
        } }
      // ---------------------------------------------------------------- YY-18 (salida en diagonal)
      for (const [i, ang, v] of [[130, -30, 7], [130, -30, 10], [340, -30, 7]]) {
        const w = P[i], p = [w[0] + w[2] * (w[6] + 1.6), w[4] + 0.02, w[1] + w[3] * (w[6] + 1.6)];
        const r = await run(page, { p, h: Math.atan2(-w[2], -w[3]) + ang * Math.PI / 180, v, sec: 3, script: "if (pool.active && pool.phase === 'air' && !M.w) { M.w = 1; key('KeyW', true); } if (M.w && !pool.active && !M.o) M.o = 1; if (M.o && s.grounded && !M.l) { M.l = 1; key('KeyW', false); } if (s.loco === 'bail') M.bail = 1;" });
        R.check(r.pool.airOuts >= 1 && !r.bail && r.bails === 0, `#${k} YY-18 #${i} ${ang}° ${v} m/s: sale por arriba con ↑ en el aire y aterriza rodando sin caída (salidas ${r.pool.airOuts}, ${r.ev.filter((e) => /bail/.test(e)).join(',') || 'sin caída'})`, 'input', { log: r.log.slice(0, 5), end: r.end });
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
