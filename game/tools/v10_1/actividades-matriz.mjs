// V10.1 · P06 (D08 a, D1-02) · Matriz de actividades: cada actividad se EMPIEZA con su botón real y se TERMINA (con su propia salida o con
// «Salir de la actividad» de la pausa) con teclado, táctil y mando; además pausar en medio y seguir, recargar en medio y recolocar en
// medio. Tras cada caso el estado tiene que quedar LIMPIO: explorando, sin pausa, cámara de seguimiento, controles visibles, sin capas de
// actividad (grind, actividad, reto-sn, cine, puntero libre, grafiti, baile, diálogo), ANMI sin congelar, sin clip forzado (P11), tabla
// visible, ninguna actividad ocupada, y ANMI ANDA al pulsar adelante.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, VIEWPORTS, arg } from '../v8/lib.mjs';
const R = new Report('actividades-matriz');
const ONLY = arg('only') ? arg('only').split(',') : null;
const S20 = { ...SAVE_20, hints: ['basic', 'nv-fennec-intro', 'nv-grind-help', 'fg-ladder'] };
/** Partida a 0 con la presentación de la rana ya oída (para PINTAR directamente). */
const S_YY = { version: 4, collected: [], activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false }, bridgeReached: false, finalDone: false, finalProof: null, revealSeen: false, checkpoint: null, checkpointRevision: 4,
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0, graffitiIntro: true }, hints: ['basic'], settings: {} };
// actividades: zona donde se ofrece, cómo se sale por su cuenta ('dialog' = Vale, 'action' = mismo botón, 'move' = moverse, selector de botón) y
// si se puede salir desde la pausa
const ACTS = [
  { id: 'pantera', zone: 'act.pantherTalk', busy: 'pantherTalk', own: 'dialog', pause: false },
  { id: 'banco', zone: 'act.benchSit', busy: 'benchSit', own: 'action', pause: true, seated: true },
  { id: 'escalera', ladder: 'fg', busy: 'ladderClimb', own: null, pause: true, climb: true },
  { id: 'grind', zone: 'act.skateTutorial', busy: 'skateTutorial', own: null, pause: true },
  { id: 'tt', zone: 'act.bridgeTalk.aissa', busy: 'bridgeTalk', own: 'dialog', pause: false, wait: 3500 },
  { id: 'fg', zone: 'act.danceCombo', busy: 'danceCombo', own: '#dance-exit', pause: true },
  { id: 'sn', zone: 'sn.drop', busy: 'secretJump', own: null, pause: true },
  { id: 'baile', free: true, busy: null, own: 'move', pause: false },
  { id: 'grafiti', zone: 'act.graffiti', busy: 'graffiti', own: '#graffiti-exit', pause: true, save: 'yy' },
];
const DEVS = arg('devs') ? arg('devs').split(',') : ['teclado', 'tactil', 'mando'];
async function setPad(page, idx, on) { await page.evaluate((idx, on) => { const I = window.__bk.input; if (!I.fakePad) I.fakePad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true };
  I.fakePad.buttons[idx] = { pressed: on, value: on ? 1 : 0 }; }, idx, on); }
async function padPress(page, idx) { await setPad(page, idx, true); await sleep(120); await setPad(page, idx, false); await sleep(120); }
/** Toque (táctil) solo si el elemento se ve; si no, se anota (la comprobación del estado dirá si faltaba algo). */
async function tapSel(page, sel) {
  const box = await page.evaluate((q) => { const e = document.querySelector(q); if (!e || e.offsetParent === null || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, sel);
  if (!box) { R.note(`táctil: ${sel} no visible`); return false; }
  await page.touchscreen.tap(box.x, box.y); return true;
}
async function press(page, dev, what) {
  // what: 'accion' | 'pausa' | 'vale' | 'adelante'
  if (dev === 'teclado') { if (what === 'accion' || what === 'vale') await page.keyboard.press('KeyE'); else if (what === 'pausa') await page.keyboard.press('Escape'); }
  else if (dev === 'tactil') { const sel = what === 'accion' ? '#btn-action' : what === 'vale' ? '#dialog-ok' : what === 'pausa' ? '#btn-pause' : null;
    if (sel) await tapSel(page, sel); }
  else { if (what === 'accion') await padPress(page, 3); else if (what === 'vale') await padPress(page, 0); else if (what === 'pausa') await padPress(page, 9); }
  await sleep(350);
}
/** En la pausa, «Salir de la actividad» con el dispositivo: clic/toque, o con el mando moviendo el foco con la cruceta hasta el botón y A. */
async function pauseExit(page, dev) {
  const vis = await page.evaluate(() => !document.getElementById('btn-exit-act').hidden && document.getElementById('btn-exit-act').textContent);
  if (!vis) return false;
  if (dev === 'teclado') await page.click('#btn-exit-act');
  else if (dev === 'tactil') await tapSel(page, '#btn-exit-act');
  else { for (let i = 0; i < 12; i++) { if (await page.evaluate(() => document.activeElement?.id === 'btn-exit-act')) break; await padPress(page, 13); } await padPress(page, 0); }
  await sleep(600); return vis;
}
async function enter(page, a, dev) {
  await page.evaluate(() => { const g = window.__bk; for (const x of g.activities) if (x.busy || x.dancing >= 0 || x.seated) x.cancel?.(); g.setPaused(false); if (g.mode !== 'explore') g.setMode('explore'); g.input.clear(); });
  if (a.free) {
    await fixture(page, R, `${a.id}: ANMI a pie en llano (plaza de NMG)`, () => { const g = window.__bk, an = g.manifest.get('nmg.llegada') ?? g.manifest.spawn; g.skater.teleport(an.pos.clone(), an.heading, 'walk'); g.rig.snapBehind(g.skater); });
    await sleep(500);
    if (dev === 'teclado') { await page.keyboard.press('Digit1'); }
    else if (dev === 'tactil') { await tapSel(page, '#btn-dance'); await sleep(300); if (await page.evaluate(() => !!document.querySelector('.skill-root'))) { await tapSel(page, '.skill-root[data-l="dance"]'); await sleep(250); } await tapSel(page, '.dance-opt[data-n="1"]'); }
    else { const rb = await page.evaluate(() => !!document.querySelector('.skill-root'));
      if (rb) { await padPress(page, 5); await sleep(250); await padPress(page, 14); await sleep(250); await padPress(page, 12); }   // V10.1 P09: RB → ← BAILAR → ↑ baile 1
      else { await page.evaluate(() => window.__bk.activities.find((x) => x.id === 'freeDance').request(1)); R.note('baile libre con mando: sin botón de mando antes de V10.1 R4 (SKILLS = RB); se pide por código'); } }
    await sleep(600); return page.evaluate(() => window.__bk.activities.find((x) => x.id === 'freeDance').dancing >= 0);
  }
  const ok = await fixture(page, R, `${a.id}: ANMI a pie en su zona`, (a) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
    let p, h = s.heading;
    if (a.ladder) { const L = g.manifest.ladders.find((l) => l.id === a.ladder), z = g.park.zones.get(L.footZone); p = z.pos.clone(); p.y = L.bottom; h = L.heading; }
    else { const z = g.park.zones.get(a.zone); if (!z) return { ok: false }; p = z.pos.clone();
      // suelo de verdad dentro de la ventana de altura de la zona (techo de la limo, puente…): rayo hacia abajo desde su techo
      const RA = window.__bkRapier, h = g.world.castRay(new RA.Ray({ x: p.x, y: z.yMax + 0.3, z: p.z }, { x: 0, y: -1, z: 0 }), z.yMax - z.yMin + 1.5, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (c) => !g.npcColliders.has(c.handle));
      if (h) p.y = z.yMax + 0.3 - h.timeOfImpact; }
    s.teleport(new T.Vector3(p.x, p.y, p.z), h, 'walk'); g.rig.snapBehind(s); return { ok: true, p: [p.x, p.y, p.z] }; }, a);
  if (!ok?.ok) return false;
  if (a.id === 'grafiti') await page.evaluate(async () => { await window.__bk.loadNpc('rana'); });
  await sleep(a.id === 'grafiti' ? 1500 : 700);
  await press(page, dev, 'accion');
  await sleep(a.wait ?? 900);
  if (a.climb) { if (dev === 'teclado') { await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); } else if (dev === 'mando') { await page.evaluate(() => { window.__bk.input.fakePad.axes[1] = -1; }); await sleep(900); await page.evaluate(() => { window.__bk.input.fakePad.axes[1] = 0; }); } else { await page.evaluate(() => { window.__bk.input.move = { x: 0, y: 1 }; }); await sleep(900); await page.evaluate(() => { window.__bk.input.move = { x: 0, y: 0 }; }); } }
  return page.evaluate((a) => { const g = window.__bk, x = g.activities.find((q) => q.id === a.busy); return !!(x && (x.busy || x.seated || x.inAttempt || x.inRun)); }, a);
}
async function ownExit(page, a, dev) {
  if (a.own === 'dialog') { for (let i = 0; i < 4 && await page.evaluate(() => !document.getElementById('dialog').hidden); i++) await press(page, dev, 'vale'); }
  else if (a.own === 'action') await press(page, dev, 'accion');
  else if (a.own === 'move') { if (dev === 'teclado') { await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW'); } else await page.evaluate(() => { window.__bk.activities.find((x) => x.id === 'freeDance').stop(); }); }
  else if (a.own) { if (dev === 'tactil') await tapSel(page, a.own); else if (dev === 'mando') await page.evaluate((sel) => document.querySelector(sel).click(), a.own); else await page.click(a.own); }
  await sleep(900);
}
async function clean(page) {
  return page.evaluate(() => { const g = window.__bk, s = g.skater, v = g.visual, B = document.body.classList, hid = (id) => document.getElementById(id)?.hidden !== false;
    const busy = g.activities.filter((a) => a.busy || a.seated || a.inAttempt || a.inRun || a.dancing >= 0).map((a) => a.id);
    const r = { mode: g.mode, paused: g.paused, cam: g.rig.mode, touch: !document.getElementById('touch').hidden, capas: ['grind', 'actividad', 'reto-sn', 'cine', 'puntero-libre'].filter((c) => B.contains(c)),
      overlays: ['graffiti', 'dance', 'dialog', 'grind-hud', 'pause'].filter((id) => !hid(id)), frozen: s.frozen, override: v.override ?? null, tabla: !v.boardHidden, busy, loco: s.loco };
    r.ok = r.mode === 'explore' && !r.paused && r.cam === 'follow' && r.touch && !r.capas.length && !r.overlays.length && !r.frozen && !r.override && r.tabla && !r.busy.length;
    return r; });
}
async function walks(page) {
  // se mueve con el control (adelante y, si delante hay pared —escalera, muro pintado—, atrás): lo que cuenta es responder
  const at = () => page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z]);
  const ok0 = await page.evaluate(() => { const s = window.__bk.skater; return s.loco === 'walk' || s.loco === 'ride'; }); if (!ok0) return null;
  let best = 0;
  for (const k of ['KeyW', 'KeyS']) { const p0 = await at(); await page.keyboard.down(k); await sleep(800); await page.keyboard.up(k); await sleep(200); const p1 = await at(); best = Math.max(best, Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); if (best > 0.5) break; }
  return +best.toFixed(2);
}
await runTest(R, async () => {
  const b = await launch();
  const rows = [];
  try {
    for (const dev of DEVS) for (const save of ['20', 'yy']) {
      const acts = ACTS.filter((a) => (a.save ?? '20') === save && (!ONLY || ONLY.includes(a.id)));
      if (!acts.length) continue;
      const page = await openGame(b, R, { save: save === 'yy' ? S_YY : S20, viewport: dev === 'tactil' ? VIEWPORTS.phoneLand : VIEWPORTS.desktop });
      await clickStart(page); await sleep(1500);
      if (dev === 'mando') await setPad(page, 0, false);
      for (const a of acts) {
        const variants = dev === 'teclado' ? ['salida', ...(a.pause ? ['pausa-salir'] : []), 'pausa-seguir', ...(a.pause && !a.free ? ['recolocar'] : [])] : [a.pause ? 'pausa-salir' : 'salida'];
        for (const vnt of variants) {
          const inA = await enter(page, a, dev);
          if (!inA) { R.check(false, `${a.id} · ${dev} · ${vnt}: la actividad empieza con su botón`, 'input', await clean(page)); rows.push({ a: a.id, dev, vnt, empieza: false }); continue; }
          let how = vnt;
          if (vnt === 'salida') { if (a.own) await ownExit(page, a, dev); else { await press(page, dev, 'pausa'); how += (await pauseExit(page, dev)) ? ' (pausa)' : ' (sin salida)'; } }
          else if (vnt === 'pausa-salir') { await press(page, dev, 'pausa'); const lab = await pauseExit(page, dev); how += ` «${lab}»`; if (!lab) { await press(page, dev, 'pausa'); if (a.own) await ownExit(page, a, dev); } }
          else if (vnt === 'pausa-seguir') { await press(page, dev, 'pausa'); await sleep(500); await press(page, dev, 'pausa'); await sleep(400);
            const still = await page.evaluate((a) => { const g = window.__bk, x = a.busy ? g.activities.find((q) => q.id === a.busy) : g.activities.find((q) => q.id === 'freeDance'); return !g.paused && !!(x && (x.busy || x.seated || x.inAttempt || x.inRun || x.dancing >= 0)); }, a);
            R.check(still, `${a.id} · ${dev}: pausar y seguir no rompe la actividad (sigue en marcha)`, 'input');
            if (a.own) await ownExit(page, a, dev); else { await press(page, dev, 'pausa'); await pauseExit(page, dev); } }
          else if (vnt === 'recolocar') { await page.evaluate(() => { const g = window.__bk; g.setPaused(true); }); await sleep(200); await pauseExit(page, dev);
            await page.evaluate(() => { const g = window.__bk; if (g.mode === 'explore') g.recover(); }); await sleep(800); }
          await sleep(500);
          const c = await clean(page), w = c.ok ? await walks(page) : null;
          rows.push({ a: a.id, dev, vnt: how, ...c, anda: w });
          R.check(c.ok && w !== null && w > 0.5, `${a.id} · ${dev} · ${how}: estado limpio y ANMI se mueve (${w} m)`, 'input', c);
        }
      }
      // recargar en medio (teclado): al volver, explorando y limpia
      if (dev === 'teclado') for (const a of acts.filter((x) => x.pause)) {
        if (!(await enter(page, a, dev))) continue;
        await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(1500);
        const c = await clean(page), w = c.ok ? await walks(page) : null; rows.push({ a: a.id, dev, vnt: 'recargar', ...c, anda: w });
        R.check(c.ok && w > 0.5, `${a.id} · recargar en medio: la partida vuelve limpia y ANMI se mueve (${w} m)`, 'input', c);
      }
      await page.close();
    }
    R.measure('matriz', rows);
  } finally { await b.close(); }
}, { timeoutMs: 1500000 });
