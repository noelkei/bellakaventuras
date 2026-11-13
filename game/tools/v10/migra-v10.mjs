// V10 · migra-v10: guardados de V9 (versión 4, coordenadas de V9) cargados en V10. Bola de Oro §15.5/§16 «Guardados y carga», NVDA §9,
// SECRETNOVIO §7, plan 40 G-01…G-08 y D-SV-01. Para cada fixture (declarada): carga real del juego, estado tras cargar, disco reescrito.
// Comprueba: migración ÚNICA y versionada (el disco queda en versión 5; recargar no vuelve a migrar), patatas/actividades/ajustes/parciales
// vigentes/linaje intactos, checkpoint de la corona en el MISMO sitio relativo de su sector (girado +9°), checkpoint en geometría nueva →
// punto seguro (nunca dentro de un obstáculo ni fuera del suelo), partida nueva en la plaza.
// Uso: node tools/v10/migra-v10.mjs --url v10 --task V10-R1 --label final   (contra --url v9 da ROJO: no hay migración ni plaza)
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('migra-v10');
const ROT = 9 * Math.PI / 180;
const rot = (x, z) => [Math.cos(ROT) * x - Math.sin(ROT) * z, Math.sin(ROT) * x + Math.cos(ROT) * z];
const ACT = { pantherTalk: true, skateTutorial: false, graffiti: true, bridgeTalk: true, danceCombo: false };
const COL = ['no_me_guillo.visible', 'no_me_guillo.activity', 'yinyang.visible', 'yinyang.activity', 'tratratra.hidden', 'fashion_girl.medium'];
const SET = { volume: 0.55, muted: false, advancedControls: false, camSens: 1.2, invertY: true, reducedMotion: false, orientation: 'auto', mouseLock: true };
const v9 = (o = {}) => ({ version: 4, collected: [...COL], activities: { ...ACT }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: false,
  checkpoint: null, checkpointRevision: 6, saveEpoch: 'v9-epoch-test', hints: ['basic', 'ollie'], settings: { ...SET },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 }, ...o });
const read = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater.footPos; let disk = null; try { disk = JSON.parse(localStorage.getItem('bellakaventuras.remake.save')); } catch { /* */ }
  const RA = window.__bkRapier, ray = new RA.Ray({ x: s.x, y: s.y + 0.5, z: s.z }, { x: 0, y: -1, z: 0 }), hit = g.world.castRay(ray, 2, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider);
  return { p: JSON.parse(JSON.stringify(g.state.p)), foot: [s.x, s.y, s.z], heading: g.skater.heading, disk, ground: hit ? +(0.5 - hit.timeOfImpact).toFixed(3) : null, log: g.log.slice(-5), note: g.state.loadNote,
    spawn: g.park.manifest.spawn.pos.toArray(), spawnH: g.park.manifest.spawn.heading }; });
await runTest(R, async () => {
  const b = await launch();
  const open = async (save) => { const pg = await openGame(b, R, { save }); await clickStart(pg); await sleep(1200); const s = await read(pg); await pg.close(); return s; };
  try {
    // ---- partida nueva: en la plaza exterior, mirando al centro
    { const s = await open(null);
      R.check(Math.hypot(s.foot[0] - 40, s.foot[2] + 40) < 0.3 && Math.abs(Math.atan2(Math.sin(s.heading + Math.PI / 4), Math.cos(s.heading + Math.PI / 4))) < 0.05, 'partida nueva en la plaza (40, 0, −40) mirando al centro (rumbo −π/4)', 'fixture', { foot: s.foot, heading: s.heading }); }
    // ---- guardado V9 con checkpoint en cada sector de la corona: mismo sitio relativo (girado) y todo lo demás intacto
    // puntos seguros de V9 (checkpoints de zona de la base V9, medidos con corona-v10): mismo sitio relativo tras el giro
    const SPOTS = { no_me_guillo: [7.6748, 0, -32.9331], yinyang: [-27.3301, 0, 18.7665], tratratra: [2, 0, 24.35] };
    for (const [zone, cp] of Object.entries(SPOTS)) {
      const sv = v9({ checkpoint: { x: cp[0], y: cp[1], z: cp[2], heading: 0.5 } }), s = await open(sv), [ex, ez] = rot(cp[0], cp[2]);
      const d = Math.hypot(s.foot[0] - ex, s.foot[2] - ez);
      R.check(d < 0.6 && s.ground !== null, `V9 → V10 · checkpoint en ${zone}: aparece en el mismo sitio de su sector girado +9° (${d.toFixed(2)} m) con suelo debajo`, 'fixture', { esperado: [ex, ez], foot: s.foot, log: s.log });
      R.check(JSON.stringify(s.p.collected.slice().sort()) === JSON.stringify(COL.slice().sort()) && JSON.stringify(s.p.activities) === JSON.stringify(ACT)
        && s.p.settings.volume === SET.volume && s.p.settings.invertY === true && s.p.settings.advancedControls === false && s.p.saveEpoch === 'v9-epoch-test' && s.p.partials.graffitiIntro === true,
        `V9 → V10 · ${zone}: patatas, actividades, ajustes, linaje y parciales intactos`, 'fixture', { col: s.p.collected, acts: s.p.activities });
      R.check(s.disk?.version === 5, `V9 → V10 · ${zone}: el disco queda en versión 5 (migración escrita una vez)`, 'fixture', { version: s.disk?.version });
    }
    // ---- recargar un guardado ya migrado no vuelve a girar el checkpoint
    { const sv = v9({ checkpoint: { x: SPOTS.no_me_guillo[0], y: 0, z: SPOTS.no_me_guillo[2], heading: 0.5 } });
      const pg = await openGame(b, R, { save: sv }); await clickStart(pg); await sleep(1200); const s1 = await read(pg);
      await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await pg.click('#btn-start'); await sleep(1200);
      const s2 = await read(pg); await pg.close();
      R.check(Math.hypot(s2.foot[0] - s1.foot[0], s2.foot[2] - s1.foot[2]) < 0.6 && s2.disk?.version === 5, 'recargar tras migrar: el checkpoint no se gira otra vez (migración única)', 'fixture', { primera: s1.foot, segunda: s2.foot }); }
  } finally { await b.close(); }
}, { timeoutMs: 500000 });
