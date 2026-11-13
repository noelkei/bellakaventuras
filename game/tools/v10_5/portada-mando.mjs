// V10.5 ronda PORTADA · guardián del mando en la portada (PROMPT_V10_5_PORTADA §5.9, §12): con un mando simulado (Gamepad API de pruebas,
// input.fakePad) en ordenador y en tele:
//  · la cruceta recorre los botones de la portada en orden: JUGAR → Sonido → Pantalla completa → Ajustes → Empezar de cero → radio (y vuelve);
//  · el botón con el foco se ve (contorno o sombra de foco con `body.pad`);
//  · A sobre JUGAR empieza la partida; en otra pestaña, Start también la empieza (si JUGAR está activo).
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { padPress } from '../v10_2/lib102.mjs';
import { dev, open7 } from './lib105.mjs';
const R = new Report('portada-mando');
const S20 = { ...SAVE_20, settings: { iosAppAsked: true } };
// V10.6 (B6 §6.2, cambio aprobado por el usuario; copia previa en V10/backups/pruebas/V10_6-R1/): «Créditos» del pie entra en el recorrido tras Ajustes
const ORDEN = ['btn-start', 'btn-sound-start', 'btn-fs-start', 'btn-settings-start', 'btn-creditos-start', 'btn-reset-start', 'btn-radio'];
const foco = (page) => page.evaluate(() => { const a = document.activeElement, cs = a ? getComputedStyle(a) : null;
  return { id: a?.id ?? null, pad: document.body.classList.contains('pad'), visible: !!cs && ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none' && /0px 0px 0px/.test(cs.boxShadow))) }; });

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const [id, vp] of [['pc720', null], ['tele', { width: 960, height: 540, deviceScaleFactor: 2 }]]) {
      const page = await open7(b, R, dev('pc720'), 'h', { save: S20, query: '?bktest=1&narr=off', errors });
      if (vp) { await page.setViewport(vp); await sleep(500); }
      await padPress(page, 16); /* conecta el mando de prueba con un botón sin uso (16): el juego pasa a mando (body.pad) sin pulsar nada */
      await page.evaluate(() => document.getElementById('btn-start').focus());
      const vistos = [], focos = [];
      for (let i = 0; i < ORDEN.length + 1; i++) { const f = await foco(page); vistos.push(f.id); focos.push(f); await padPress(page, 13); await sleep(150); }
      const esperado = ORDEN.concat(ORDEN[0]);
      R.check(JSON.stringify(vistos) === JSON.stringify(esperado), `${id}: la cruceta recorre la portada en orden (JUGAR → Sonido → Pantalla completa → Ajustes → Empezar de cero → radio → JUGAR)`, 'input', { vistos, esperado });
      R.check(focos.every((f) => f.pad && f.visible), `${id}: con mando el foco se ve en cada botón`, 'input', focos);
      await page.evaluate(() => document.getElementById('btn-start').focus()); await padPress(page, 0); await sleep(700);
      R.check(await page.evaluate(() => window.__bk.started && document.getElementById('start').hidden), `${id}: A sobre JUGAR empieza la partida`, 'input');
      await page.close();
    }
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S20, query: '?bktest=1&narr=off', errors });
      await page.evaluate(() => document.getElementById('btn-sound-start').focus());   // el foco NO está en JUGAR: Start debe empezar igualmente
      await padPress(page, 9); await sleep(800);
      R.check(await page.evaluate(() => window.__bk.started && document.getElementById('start').hidden), 'Start del mando en la portada empieza la partida', 'input');
      await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
