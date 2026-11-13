// V10 IT2 · sn-mando · reto de SECRETNOVIO con MANDO (mando simulado del juego `input.fakePad`, sin teclado ni táctil). Encargo V10: «toda
// interacción nueva con teclado, táctil y mando»; teclado = `sn-reto`, táctil = `sn-touch`. Fixtures declaradas (como `sn-touch`): partida
// 20/20 con la revelación vista; ANMI al pie de la escalera de A mirando a ella; tras desembarcar, ANMI en el carril de bajada.
// Comprueba: TREPAR con Y; subir con el stick ARRIBA hasta la coronación; ¡BAJAR! con Y; el aviso de salto dice «(A)» (no Espacio) y, con A
// en la ventana, el reto se completa (logro `secretnovio_v10`).
// Emulación ≠ mando físico (pendiente humano).
// Uso: node tools/v10/sn-mando.mjs --url v10 --task V10-IT2 --label final
import { Report, runTest, launch, openGame, clickStart, sleep, fixture } from '../v8/lib.mjs';
import { snState } from './sn-lib.mjs';
const R = new Report('sn-mando');
const ALL = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'].flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
const SAVE = { version: 5, migV10: 99, collected: ALL, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true,
  checkpoint: null, checkpointRevision: 7, saveEpoch: 'sn-mando', hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 } };
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
    await page.evaluate(() => { window.__bk.input.fakePad = { id: 'sn-mando', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; });
    const btn = (i, on) => page.evaluate((i, on) => { const p = window.__bk.input.fakePad; p.buttons[i].pressed = on; p.buttons[i].value = on ? 1 : 0; }, i, on);
    const press = async (i) => { await btn(i, true); await sleep(120); await btn(i, false); await sleep(200); };
    const axisY = (y) => page.evaluate((y) => { window.__bk.input.fakePad.axes[1] = y; }, y);
    await fixture(page, R, 'ANMI al pie de la escalera de A, mirando a ella', () => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const th = g.park.sn.group.rotation.y; g.skater.teleport(new T.Vector3(5.65, 0, -12.7).applyAxisAngle(new T.Vector3(0, 1, 0), th), -Math.PI / 2 + th, 'walk');   /* V10.1: marco girado del reto */ g.rig.snapBehind(g.skater); });
    await sleep(800);
    let s = await snState(page); for (let i = 0; i < 10 && !(s.action && /TREPAR/.test(s.action)); i++) { await sleep(200); s = await snState(page); }
    const climbOffer = !!(s.action && /TREPAR/.test(s.action)); await press(3); await axisY(-1);
    const t0 = Date.now(); let maxY = 0; while (Date.now() - t0 < 30000) { s = await snState(page); maxY = Math.max(maxY, s.foot[1]); if (s.ladder === 'off' && s.foot[1] > 6.5) break; await sleep(80); }
    await axisY(0); await sleep(500);
    await fixture(page, R, 'ANMI en el carril de bajada de la coronación', () => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const th = g.park.sn.group.rotation.y; g.skater.teleport(new T.Vector3(0, 7, -12.5).applyAxisAngle(new T.Vector3(0, 1, 0), th), th, 'walk');   /* V10.1: marco girado del reto */ g.rig.snapBehind(g.skater); });
    await sleep(700); s = await snState(page); const dropOffer = !!(s.action && /BAJAR/.test(s.action)); await press(3);
    let hot = false, pressed = false, aviso = null; const t1 = Date.now();
    while (Date.now() - t1 < 15000) { s = await snState(page); if (s.hot) hot = true;
      if (s.hot && !aviso) aviso = await page.evaluate(() => { const h = document.getElementById('hint'); return h && !h.hidden ? h.textContent.trim() : null; });
      if (s.hot && !pressed) { await btn(0, true); await sleep(80); await btn(0, false); pressed = true; }
      if (s.mode === 'preview' || s.done || (s.phase === 'idle' && Date.now() - t1 > 2500)) break; await sleep(25); }
    await sleep(1500); s = await snState(page);
    const row = { climbOffer, maxY: +maxY.toFixed(2), dropOffer, hot, pressed, aviso, done: s.done, proof: s.proof };
    R.measure('mando', row);
    R.check(climbOffer && maxY > 6.5, 'mando: TREPAR con Y y subida con el stick hasta la coronación', 'input', row);
    R.check(dropOffer, 'mando: ¡BAJAR! con Y en el carril', 'input', row);
    R.check(hot && pressed && s.done && s.proof === 'secretnovio_v10', 'mando: en la ventana, A completa el reto (logro)', 'input', row);
    R.check(!!aviso && /\(A\)/.test(aviso) && !/Espacio/.test(aviso), `mando: el aviso de salto nombra el botón del mando («${aviso}»)`, 'input', row);
    await page.evaluate(() => { window.__bk.input.fakePad = null; });
    R.pendingHuman('Reto de SECRETNOVIO con un mando físico');
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
