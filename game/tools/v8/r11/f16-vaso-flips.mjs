// R12 · flips en el vaso de YINYANG jugados «como se juega»: W mantenida desde la aproximación para subir la pared y SALTO en el aire.
// (R11 MOV-01 dejaba ↑/↓ ya pulsados como neutros → sin frontflip/backflip; YY-02 obligaba a soltar ↑ para salir.)
//  A  SALTO con ↑ mantenida: frontflip completo y SALE hacia delante al deck.
//  B  SALTO con ↑ y soltar ↑ enseguida: frontflip completo y VUELVE a entrar (se reengancha).
//  C  ↓ + SALTO (soltando W): backflip completo y vuelve a entrar.
//  D  No empeorar (YY-02): solo W mantenida, sin saltar: no sale del vaso.
// Tres paredes (N2#540, N2#645, N1#840), 2 repeticiones. Base de comparación: la build publicada antes de R12 (`--url v8`).
//   node tools/v8/r11/f16-vaso-flips.mjs --url v8 --task R12 --label base
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, paredes, salida } from './f5-lib.mjs';
const R = new Report('r12-f16-vaso-flips');
const AIRE = (cuerpo) => `if (pool.active && pool.phase === 'air' && pool.airT > 0.12 && !M.hecho) { M.hecho = st; ${cuerpo} }`;
const DECK = "if (st > 6 && s.grounded && !(pool && pool.active) && s.footPos.y > -0.1) M.fuera = (M.fuera || 0) + 1;";
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const P = await paredes(page);
    for (let k = 1; k <= 2; k++) {
      for (const [tag, w] of [['N2#540', P[540]], ['N2#645', P[645]], ['N1#840', P[840]]]) {
        const o = salida(w, 3.0);
        const flip = (r, kind) => r.tricks.some((t) => t.kind === kind && t.ok);
        { const r = await run(page, { ...o, v: 6.5, sec: 3.5, pre: "key('KeyW', true)", script: AIRE("key('Space', true);") + "if (M.hecho && st === M.hecho + 3) key('Space', false);" + DECK });
          R.check(flip(r, 'frontflip') && r.pool.airOuts === 1 && r.bails === 0 && !!r.fuera, `#${k} A ${tag}: W mantenida + SALTO en el aire → frontflip y sale al deck (flip ${flip(r, 'frontflip')}, salidas ${r.pool.airOuts})`, 'input', { tricks: r.tricks, log: r.log.slice(0, 6), end: r.end }); }
        { const r = await run(page, { ...o, v: 6.5, sec: 3.5, pre: "key('KeyW', true)", script: AIRE("key('Space', true);") + "if (M.hecho && st === M.hecho + 3) { key('Space', false); key('KeyW', false); }" + DECK });
          R.check(flip(r, 'frontflip') && r.pool.airOuts === 0 && r.pool.rehooks >= 1 && r.bails === 0 && !r.fuera, `#${k} B ${tag}: W + SALTO y soltar W → frontflip y vuelve a entrar (flip ${flip(r, 'frontflip')}, reenganches ${r.pool.rehooks})`, 'input', { tricks: r.tricks, log: r.log.slice(0, 6) }); }
        { const r = await run(page, { ...o, v: 6.5, sec: 3.5, pre: "key('KeyW', true)", script: AIRE("key('KeyW', false); key('KeyS', true); key('Space', true);") + "if (M.hecho && st === M.hecho + 3) { key('Space', false); key('KeyS', false); }" + DECK });
          R.check(flip(r, 'backflip') && r.pool.airOuts === 0 && r.pool.rehooks >= 1 && r.bails === 0 && !r.fuera, `#${k} C ${tag}: ↓ + SALTO → backflip y vuelve a entrar (flip ${flip(r, 'backflip')}, reenganches ${r.pool.rehooks})`, 'input', { tricks: r.tricks, log: r.log.slice(0, 6) }); }
        { const r = await run(page, { ...o, v: 6.5, sec: 4, pre: "key('KeyW', true)", script: DECK });
          R.check(r.pool.hooks >= 1 && r.pool.airOuts === 0 && !r.fuera, `#${k} D ${tag}: solo W mantenida (sin saltar) no saca del vaso (salidas ${r.pool.airOuts})`, 'input', { log: r.log.slice(0, 5) }); }
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
