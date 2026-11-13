// R11 · F8 · trucos (simulación determinista, teclas reales en el paso exacto, 2 repeticiones).
//  MOV-01  en llano con W (o S) MANTENIDA desde el suelo para empujar, «Espacio, Espacio» hace kickflip (W mantenida = neutra), no un
//          flip de cuerpo denegado. Y si ↑ se pulsa (flanco) con el 2.º SALTO en llano, el aviso habla de rampa («desde una rampa»).
//  MOV-06  tras un heelflip (D), «W + A» en el aire con el 2.º SALTO hace kickflip (gana el eje horizontal), no repite el heelflip.
//  TRK-01  frontflip pulsado sobre el corte R1 y el agujero H de TRA TRA TRA: o se deniega o se completa; nunca termina en caída.
//  MOV-07  revert en fakie a 6 y 10 m/s: solo se ANOTA (plan R11 v3: MOV-07 → §6, decisión pendiente).
//  TRK-03  el grab y el revert dan respuesta (sonido o mensaje), como el resto de trucos.
//  TRK-04  en grind la tabla va sobre el raíl: el pie ≥ techo del raíl − 1,5 cm (base: −5 cm).
//  SIS-20  Q en el aire no dice «Sin aire suficiente para ese truco».
//  No empeorar (verdes en la base): kickflip sin dirección y heelflip con D en llano salen; revert en fakie a 2 m/s; F en el aire hace grab.
//   node tools/v8/r11/f8-trucos.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, corona, giro } from './f5-lib.mjs';
import { W as TW, HD as THD } from '../tt-lib.mjs';
const R = new Report('r11-f8-trucos');
const FLAT0 = { p: [-6, 0.02, -40], h: Math.PI / 2 };
// V10 (preparación): x local de TRA TRA TRA calculada con el marco de tt-lib (ya girado +9°) en vez de suponer el eje x del mundo
const TO = TW(0, 0), TE = TW(1, 0), TCR = TE[0] - TO[0], TSR = -(TE[2] - TO[2]);
const LX = `((s.footPos.x - ${TO[0]}) * ${TCR} + (${TO[2]} - s.footPos.z) * ${TSR})`;
// ollie en el paso 5; 2.º SALTO en el paso `t2`, con `dir` pulsada como flanco (o mantenida desde el principio si `held`)
const DOS = ({ t2 = 17, dir = null, held = null, extra = '' } = {}) => `if (st === 5) key('Space', true); if (st === 8) key('Space', false);
  if (st === ${t2}) { ${dir ? dir.map((d) => `key('${d}', true);`).join(' ') : ''} key('Space', true); } if (st === ${t2} + 4) { key('Space', false); ${dir ? dir.map((d) => `key('${d}', false);`).join(' ') : ''} } ${extra}`;
const ULT = (r) => r.tricks.at(-1)?.kind ?? (r.ev.find((e) => /trick-denied/.test(e)) ?? 'nada');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    // V10 (preparación): el llano de referencia y los literales de V9 giran con la corona (+9°). Cambio de diseño aprobado: el raíl de la
    // plaza de esquina (TRK-04) desaparece con el parque exterior → raíl `bola_rail` del exterior (mismo carril de llegada que f7-impactos)
    const G = giro(await corona(page)), FLAT = { p: G.P(FLAT0.p), h: G.H(FLAT0.h) };
    const RAIL = G.rot ? { A: [-31.94, -38.59], B: [-29.33, -41.35] } : { A: [-38.47, -31.96], B: [-41.3, -34.79] };
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- MOV-01
      for (const kk of ['KeyW', 'KeyS']) {
        const r = await run(page, { ...FLAT, v: 8, sec: 1.6, pre: `key('${kk}', true)`, script: DOS() });
        R.check(r.tricks.some((t) => t.kind === 'kickflip'), `#${k} MOV-01 ${kk} mantenida desde el suelo + Espacio, Espacio en llano: kickflip (salió: ${ULT(r)})`, 'input', { ev: r.ev.filter((e) => /trick/.test(e)) });
      }
      { const r = await run(page, { ...FLAT, v: 8, sec: 1.6, script: DOS({ dir: ['ArrowUp'] }) });
        R.check(/rampa/i.test(r.toast ?? ''), `#${k} MOV-01 ↑ pulsada con el 2.º SALTO en llano: el aviso pide una rampa (aviso: «${r.toast}»)`, 'input', { ev: r.ev.filter((e) => /trick/.test(e)) }); }
      { const r = await run(page, { ...FLAT, v: 8, sec: 1.6, script: DOS() });
        R.check(r.tricks.some((t) => t.kind === 'kickflip' && t.ok), `#${k} no empeorar: Espacio, Espacio sin dirección en llano = kickflip`, 'input', { tricks: r.tricks }); }
      { const r = await run(page, { ...FLAT, v: 8, sec: 1.6, script: DOS({ dir: ['KeyD'] }) });
        R.check(r.tricks.some((t) => t.kind === 'heelflip' && t.ok), `#${k} no empeorar: D con el 2.º SALTO en llano = heelflip`, 'input', { tricks: r.tricks }); }
      // ---------------------------------------------------------------- MOV-06 (tras un heelflip, W+A + SALTO)
      { const pre = await run(page, { ...FLAT, v: 8, sec: 1.6, script: DOS({ dir: ['KeyD'] }) });
        const r = await run(page, { ...FLAT, v: 8, sec: 1.6, script: DOS({ dir: ['KeyW', 'KeyA'] }) });
        R.check(pre.tricks.some((t) => t.kind === 'heelflip') && r.tricks.some((t) => t.kind === 'kickflip'), `#${k} MOV-06 tras un heelflip, W+A con el 2.º SALTO = kickflip (gana el eje horizontal; salió: ${ULT(r)})`, 'input', { tricks: r.tricks }); }
      // ---------------------------------------------------------------- TRK-01 (TT R1 y agujero H)
      for (const [tag, p, o] of [['R1', TW(7.0, 2.6, 5.6), 'lx <= 0.75'], ['agujero H', TW(11.5, 5.67, 4.4), 'lx <= 9.07']]) {
        const r = await run(page, { p: [p[0], p[1] + 0.02, p[2]], h: THD(-1, 0), v: 0, sec: 4.5, pre: "key('KeyW', true)",
          script: `const lx = ${LX}; if (!M.j && ${o}) { M.j = st; key('Space', true); } if (M.j && st === M.j + 5) key('Space', false);
            if (M.j && !M.t && st > M.j + 5 && !s.grounded && s.airTime >= 0.12) { M.t = st; key('KeyW', false); key('ArrowUp', true); key('Space', true); } if (M.t && st === M.t + 6) { key('ArrowUp', false); key('Space', false); } if (s.loco === 'bail') M.bail = 1;` });
        if (!r.t) R.invalid(`#${k} TRK-01 ${tag}: no llegó a saltar el hueco`, { end: r.end });
        else R.check(!r.bail && r.bails === 0, `#${k} TRK-01 frontflip sobre ${tag}: denegado o completado, sin caída (${r.ev.filter((e) => /trick|bail/.test(e)).join(',')})`, 'input', { end: r.end });
      }
      // ---------------------------------------------------------------- MOV-07 / TRK-03 (revert en fakie: doble toque de F)
      for (const v of [2, 6, 10]) {
        const r = await run(page, { ...FLAT, h: FLAT.h + Math.PI, vdir: FLAT.h, v, vLong: -v, sec: 1.2, script: "if (st === 6 || st === 14) key('KeyF', true); if (st === 9 || st === 17) key('KeyF', false); if (s.loco === 'revert') M.rev = 1;" });
        const rev = r.rev === 1 || r.ev.some((e) => /revert/.test(e));
        if (v === 2) { R.check(rev, `#${k} no empeorar: revert en fakie a 2 m/s`, 'input', { ev: r.ev.slice(0, 6) });
          R.check(rev && (r.sfx.some((n) => !/push|land|scoot/.test(n)) || !!r.toast), `#${k} TRK-03 el revert da respuesta (sonido ${r.sfx.join(',') || 'ninguno'}; mensaje ${r.toast ?? 'ninguno'})`, 'listen', {}); }
        else R.note(`#${k} §6 MOV-07 (pendiente de decisión del usuario: revert en fakie a más velocidad) revert en fakie a ${v} m/s: ${rev ? 'sí' : 'no'} (eventos ${r.ev.slice(0, 4).join(',')})`);
      }
      // ---------------------------------------------------------------- TRK-03 (grab)
      { const r = await run(page, { ...FLAT, v: 8, sec: 1.6, script: "if (st === 5) key('Space', true); if (st === 8) key('Space', false); if (st === 14) key('KeyF', true); if (st === 45) key('KeyF', false);" });
        const grab = r.ev.includes('grab');
        R.check(grab, `#${k} no empeorar: F en el aire hace grab`, 'input', { ev: r.ev.slice(0, 6) });
        R.check(grab && (r.sfx.includes('trick') || /grab/i.test(r.toast ?? '')), `#${k} TRK-03 el grab da respuesta como los demás trucos (sonidos ${r.sfx.join(',')}; mensaje ${r.toast ?? 'ninguno'})`, 'listen', {}); }
      // ---------------------------------------------------------------- TRK-04 (altura en grind, raíl de esquina)
      { const A0 = RAIL.A, B0 = RAIL.B, L = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]), u = [(B0[0] - A0[0]) / L, (B0[1] - A0[1]) / L];
        const r = await run(page, { p: [A0[0] - u[0] * 4, 0.02, A0[1] - u[1] * 4], h: Math.atan2(u[0], u[1]), v: 8, sec: 1.6,
          script: `{ const al = (${A0[0]} - s.footPos.x) * ${u[0]} + (${A0[1]} - s.footPos.z) * ${u[1]}; if (!M.j && al <= 1.6) { M.j = st; key('Space', true); } if (M.j && st === M.j + 3) { key('Space', false); key('KeyF', true); }
            if (s.loco === 'grind' && s.rail) { const d = s.footPos.y - s.rail.top; M.dmin = Math.min(M.dmin ?? 9, d); M.n = (M.n || 0) + 1; } }` });
        if (!r.n) R.invalid(`#${k} TRK-04: no llegó a hacer grind`, {});
        else R.check(r.dmin >= -0.015, `#${k} TRK-04 en grind el pie va sobre el raíl (mín. ${(r.dmin * 100).toFixed(1)} cm respecto al techo, ≥ −1,5)`, 'vision', { pasos: r.n }); }
      // ---------------------------------------------------------------- SIS-20 (Q en el aire)
      { const r = await run(page, { ...FLAT, v: 7, sec: 1.2, script: "if (st === 5) key('Space', true); if (st === 8) key('Space', false); if (st === 20) key('KeyQ', true); if (st === 23) key('KeyQ', false); if (st > 20 && !M.msg) { const t = document.getElementById('toast'); if (!t.hidden) M.msg = t.textContent.trim(); }" });
        R.check(!!r.msg && !/truco/i.test(r.msg), `#${k} SIS-20 Q en el aire da un aviso de tabla, no de truco (aviso: «${r.msg ?? 'ninguno'}»)`, 'input', {}); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
