// V8 · yy-persist: guardados preparados (fixtures declaradas) contra la carga REAL del juego. Perfil nuevo · parcial V8 con error
// · parcial de la diana anterior (V3–V7, 160×100) · V7 completado con la patata recogida · V7 completado con premio pendiente ·
// checkpoint V7 dentro del antiguo descampado (ahora vaso) · checkpoint V8 en el fondo N3 · guardado dañado. Comprueba que solo se
// toca el intento YY, que nada más cambia y que los checkpoints acaban en apoyo seguro.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
import { W } from './yy-lib.mjs';
// V10 (preparación; copia previa en V10/backups/pruebas/): `W` da coordenadas de V10 (corona girada +9°). Un guardado versión 4 es de V9:
// sus coordenadas de mundo van SIN girar (el juego las gira al migrar 4 → 5). `V9` deshace el giro (rotación three +9°).
const V9 = (p) => { const a = 9 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
const R = new Report('yy-persist');
const ACT0 = { pantherTalk: true, skateTutorial: true, graffiti: false, bridgeTalk: true, danceCombo: false };
const base = (o = {}) => ({ version: 4, collected: ['no_me_guillo.visible', 'no_me_guillo.activity', 'tratratra.visible'], activities: { ...ACT0 }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: false,
  checkpoint: null, checkpointRevision: 5, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'],
  settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true }, ...o });
/** Máscara de bits base64 de n celdas puestas (las primeras `k`) en una rejilla w×h. */
const mask = (w, h, cells) => { const b = new Uint8Array(Math.ceil(w * h / 8)); for (const i of cells) b[i >> 3] |= 1 << (i & 7); return Buffer.from(b).toString('base64'); };
const state = (page) => page.evaluate(() => { const g = window.__bk, a = g.activities[2], s = g.skater.footPos;
  return { p: JSON.parse(JSON.stringify(g.state.p)), note: g.state.loadNote, reset: g.state.graffitiReset, foot: [s.x, s.y, s.z], log: g.log.slice(-6),
    fry: g.pickups.filter((q) => q.id === 'yinyang.activity').map((q) => ({ av: q.available, col: q.collected })), mural: g.park.muralMesh.material.map?.image?.src ?? (g.park.muralMesh.material.map?.isCanvasTexture ? 'canvas' : null), covered: a.covered ? a.covered.reduce((x, v) => x + v, 0) : null, errLen: a.errLen }; });
await runTest(R, async () => {
  const browser = await launch();
  const open = async (save, lab) => { const pg = await openGame(browser, R, { save }); await clickStart(pg); await sleep(1500); const s = await state(pg); await pg.close(); R.measure(lab, { note: s.note, partials: s.p.partials, acts: s.p.activities, col: s.p.collected, foot: s.foot, fry: s.fry, log: s.log }); return s; };
  try {
    let s = await open(null, 'nuevo');
    R.check(!s.p.activities.graffiti && !s.p.partials.graffitiIntro && s.p.partials.graffitiRev === 8 && s.p.partials.graffitiMask === null, 'perfil nuevo: grafiti sin empezar, diana rev 8, sin intro', 'fixture', s.p.partials);
    // parcial V8 válido con recorrido de error: se conserva y el error NO se pierde
    { const cells = [...Array(900).keys()].map((i) => 30 * 120 + 20 + (i % 60) + Math.floor(i / 60) * 120);
      const sv = base({ partials: { ...base().partials, graffitiMask: mask(120, 138, cells), graffitiCheck: cells.length, graffitiRev: 8, graffitiErrRun: 0.37, graffitiIntro: true }, checkpointRevision: 6 });
      s = await open(sv, 'parcial_v8');
      R.check(s.p.partials.graffitiCheck === 900 && Math.abs(s.p.partials.graffitiErrRun - 0.37) < 1e-6 && s.p.partials.graffitiIntro && s.covered === 900 && Math.abs(s.errLen - 0.37) < 1e-6, 'parcial V8 recargado con su máscara Y su recorrido de error (recargar no limpia solo el error)', 'fixture', { check: s.p.partials.graffitiCheck, err: s.p.partials.graffitiErrRun, covered: s.covered, errLen: s.errLen });
      R.check(JSON.stringify(s.p.collected) === JSON.stringify(sv.collected) && JSON.stringify(s.p.activities) === JSON.stringify(sv.activities), 'el resto del progreso intacto', 'fixture'); }
    // parcial de la diana anterior (160×100 bits, sin graffitiRev): se descarta SOLO ese intento, con aviso
    { const sv = base({ partials: { ...base().partials, graffitiMask: mask(160, 100, [1, 2, 3, 500, 501]), graffitiCheck: 5 } });
      s = await open(sv, 'parcial_v7');
      R.check(s.p.partials.graffitiMask === null && /YINYANG ha cambiado/.test(s.note) && JSON.stringify(s.p.collected) === JSON.stringify(sv.collected) && JSON.stringify(s.p.activities) === JSON.stringify(sv.activities) && s.p.partials.bridgeHeard.aissa, 'parcial de la diana V7 descartado con aviso; patatas, actividades y demás parciales intactos', 'fixture', { note: s.note, mask: s.p.partials.graffitiMask }); }
    // V7 completado y patata recogida
    { const sv = base({ activities: { ...ACT0, graffiti: true }, collected: [...base().collected, 'yinyang.visible', 'yinyang.activity'] });
      s = await open(sv, 'v7_completo');
      R.check(s.p.activities.graffiti && s.p.collected.includes('yinyang.activity') && s.p.partials.graffitiIntro && !s.fry.some((f) => f.av && !f.col) && /T_yy_final/.test(String(s.mural)), 'V7 completado: el éxito y la patata recogida se conservan; el frente de T1 sale pintado y no hay que repintar', 'fixture', { mural: s.mural, fry: s.fry, col: s.p.collected.length }); }
    // V7 completado con premio pendiente
    { const sv = base({ activities: { ...ACT0, graffiti: true } });
      s = await open(sv, 'v7_pendiente');
      R.check(s.fry.length === 1 && s.fry[0].av && !s.fry[0].col && !s.p.collected.includes('yinyang.activity'), 'V7 completado con premio pendiente: la patata está disponible en P1 (una) y sin recoger', 'fixture', s.fry); }
    // checkpoint V7 dentro del antiguo descampado (sobre el vaso nuevo)
    { const cp = V9(W(3.0, 28.5)); const sv = base({ checkpoint: { x: cp[0], y: 0, z: cp[2], heading: 0 }, checkpointRevision: 5 });
      s = await open(sv, 'cp_v7_yy');
      const yc = W(-9.6, 31.4); const d = Math.hypot(s.foot[0] - yc[0], s.foot[2] - yc[2]);
      R.check(d < 0.6 && Math.abs(s.foot[1]) < 0.1 && JSON.stringify(s.p.collected) === JSON.stringify(sv.collected), 'checkpoint V7 en el antiguo descampado → deck junto a E1 (no a NMG, no al fondo), progreso intacto', 'fixture', { foot: s.foot, d, log: s.log }); }
    // checkpoint V8 válido en el fondo N2 (−1,75; R2 usuario: ya no hay N3): se acepta tal cual
    { const cp = W(3.0, 28.0, -1.75), cp9 = V9(cp); const sv = base({ checkpoint: { x: cp9[0], y: -1.75, z: cp9[2], heading: 0 }, checkpointRevision: 6 });
      s = await open(sv, 'cp_v8_n3');
      R.check(Math.abs(s.foot[1] + 1.75) < 0.1 && Math.hypot(s.foot[0] - cp[0], s.foot[2] - cp[2]) < 0.3, 'checkpoint V8 en el fondo N2 (cota negativa) válido y respetado', 'fixture', { foot: s.foot }); }
    // dañado
    { s = await open('{"version":4,"collected":["yinyang.visible"', 'danado');
      R.check(/ilegible/.test(s.note) && s.p.collected.length === 0, 'guardado dañado: partida nueva con aviso (el anterior se conserva aparte)', 'fixture', { note: s.note }); }
  } finally { await browser.close(); }
}, { timeoutMs: 400000 });
