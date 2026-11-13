// EXT-03: manual, grab y caídas suaves con TECLADO REAL. Fixtures declaradas: posición de salida; partida con 20/20 y centro abierto
// (para comprobar que una caída no las quita); en M4 una caja de prueba de 2,0 m (desde 3,2 m del labio) en la zona de aterrizaje de la lanzadera
// (el controlador solo acepta trucos que caben hasta el suelo de debajo: un truco incompleto exige aterrizar antes, sobre
// algo más alto).
//   M1 manual: EXTRA mantenido rodando → manual con la tabla inclinada sobre el eje trasero → soltar → rodar
//   M2 grab: lanzadera, SALTO en el labio, EXTRA mantenido neutro → grab con la mano en el canto → soltar → aterrizar
//   M3 caída «cruzado»: lanzadera, girar la tabla en el aire (A mantenida) → aterriza cruzada → caída suave → recupera
//   M4 caída por truco incompleto: frontflip desde la lanzadera hacia la caja → aterriza antes → caída → recupera
//   node tools/v3/ext03.mjs → captures/v3/P5/EXT-03/ext03.json + M*.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P5/EXT-03', 'ext03', { method: 'teclado real; fixtures declaradas: posición de salida, 20/20 en la partida, caja de prueba en M4' });
const browser = await launch();
const save = await (async () => { // fixture v4: 20/20 y centro ya revelado
  const p = await import('node:fs').then((fs) => JSON.parse(fs.readFileSync(new URL('../fixtures/v4-20-centro-abierto.json', import.meta.url))));
  return p;
})();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save });
const down = (k) => page.keyboard.down(k), up = (k) => page.keyboard.up(k), press = (k) => page.keyboard.press(k);
const S = () => page.evaluate(() => { const g = window.__bk, s = g.skater; return { loco: s.loco, state: s.state, speed: +s.speed.toFixed(2), grab: +s.grab.toFixed(2), ev: s.events.slice(window.__e0 ?? -12).map((e) => e.e), log: s.trickLog.slice(-1)[0] ?? null, fries: g.state.p.collected?.length ?? Object.keys(g.state.p.fries ?? {}).length, frozen: s.frozen, decks: (() => { let n = 0; g.scene.traverse((o) => { if (o.name === 'DECK' && o.visible) n++; }); return n; })() }; });
const mark = () => page.evaluate(() => { window.__e0 = window.__bk.skater.events.length; });
async function film(name, ms) {
  const shots = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { shots.push(await page.screenshot({ type: 'jpeg', quality: 70 })); await sleep(80); }
  const W = 300, H = 207, tiles = await Promise.all(shots.slice(0, 16).map((b) => sharp(b).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * 8, height: H * Math.ceil(tiles.length / 8), channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 8) * W, top: Math.floor(i / 8) * H }))).jpeg({ quality: 78 }).toFile(path.join(R.dir, `${name}.jpg`));
}
const placeFlat = () => page.evaluate(() => { const g = window.__bk, S = g.park.sector('no_me_guillo'); g.skater.teleport(S.P(44, -10), S.ccw(-10) + Math.PI, 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
const placeKicker = () => page.evaluate(() => { const g = window.__bk, a = g.manifest.get('trick.approach'); g.skater.teleport(a.pos.clone().addScaledVector(new window.__bkTHREE.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)), -5), a.heading, 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
const toLip = async () => { await down('KeyW'); const t0 = Date.now(); while (Date.now() - t0 < 7000) { const d = await page.evaluate(() => { const g = window.__bk, l = g.manifest.get('trick.lip').pos, p = g.skater.footPos; return Math.hypot(p.x - l.x, p.z - l.z); }); if (d < 0.9) break; await sleep(10); } };

try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  const fries0 = (await S()).fries;

  // M1 manual
  await placeFlat(); await sleep(300); await mark();
  await down('KeyW'); await sleep(2000); await up('KeyW');
  const boardRel = () => page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; let b = null; g.visual.model.traverse((o) => { if (o.isBone && o.name === 'Board') b = o; }); const q = b.getWorldQuaternion(new T.Quaternion()); return g.visual.root.getWorldQuaternion(new T.Quaternion()).invert().multiply(q).toArray(); });
  const qRide = await boardRel();
  await down('KeyF'); await sleep(400);
  const qMan = await boardRel();
  const pitch = await page.evaluate(({ a, b }) => { const T = window.__bkTHREE; return +(new T.Quaternion(...a).angleTo(new T.Quaternion(...b)) * 180 / Math.PI).toFixed(1); }, { a: qRide, b: qMan });
  const _unused = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; let b = null; g.visual.model.traverse((o) => { if (o.isBone && o.name === 'Board') b = o; }); const q = b.getWorldQuaternion(new T.Quaternion()), r = g.visual.root.getWorldQuaternion(new T.Quaternion()).invert().multiply(q); const e = new T.Euler().setFromQuaternion(r, 'YXZ'); return +(Math.max(Math.abs(e.x), Math.abs(e.z)) * 180 / Math.PI).toFixed(1); });
  let s = await S(); await sleep(500);
  const held = await S(); await up('KeyF'); await sleep(400); const after = await S();
  R.check(s.loco === 'manual' && held.loco === 'manual' && pitch >= 6 && pitch <= 20, 'M1: EXTRA mantenido rodando = manual sostenido con la tabla inclinada (6–20°)', 'input', { loco: s.loco, held: held.loco, pitch });
  R.check(after.loco === 'ride' && after.ev.some((e) => e.startsWith('manual-end')), 'M1: soltar EXTRA termina el manual y sigue rodando', 'input', after);

  // M2 grab
  await placeKicker(); await sleep(300); await mark();
  await toLip(); await press('Space'); await up('KeyW'); await sleep(120);
  await down('KeyF');
  let grabMax = 0, handGap = 9;
  for (let i = 0; i < 10; i++) {
    const r = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; let h = null, d = null; g.visual.model.traverse((o) => { if (o.isBone && /LeftHand$/.test(o.name)) h = o; if (o.name === 'DECK') d = o; }); const hp = h.getWorldPosition(new T.Vector3()); // distancia de la mano a la CAJA de la tabla en el espacio del hueso Board (la tabla reducida tiene cantos largos con
    // pocos vértices: «vértice más cercano» daba 17 cm con la mano pegada al canto)
    let bb = null; g.visual.model.traverse((o) => { if (o.isBone && o.name === 'Board') bb = o; });
    const inv = bb.matrixWorld.clone().invert(), P = new T.Vector3(), box = new T.Box3();
    d.traverse((m) => { if (!m.isSkinnedMesh) return; m.skeleton.update(); for (let i = 0; i < m.geometry.attributes.position.count; i++) { m.getVertexPosition(i, P); P.applyMatrix4(m.matrixWorld).applyMatrix4(inv); box.expandByPoint(P); } });
    const gap = box.distanceToPoint(hp.clone().applyMatrix4(inv)); return { grab: g.visual.actions.get('SK_Grab')?.getEffectiveWeight() ?? 0, ctrl: g.skater.grab, gap }; });
    if (r.grab > grabMax) { grabMax = r.grab; handGap = r.gap; }
    await sleep(35);
  }
  await up('KeyF');
  s = await page.waitForFunction(() => window.__bk.skater.grounded, { timeout: 3000 }).then(() => S());
  await sleep(500); s = await S();
  R.check(grabMax >= 0.6 && handGap <= 0.12 && s.ev.includes('grab'), 'M2: EXTRA neutro en el aire = grab con la mano en la tabla (≤12 cm)', 'input', { grabMax: +grabMax.toFixed(2), handGapM: +handGap.toFixed(3) });
  R.check(s.loco !== 'bail' && !s.ev.some((e) => e.startsWith('bail')), 'M2: soltar el grab antes de tocar → aterriza sin caída', 'input', s);

  // M3 caída por aterrizar cruzado
  await placeKicker(); await sleep(300); await mark();
  await toLip(); await press('Space'); await up('KeyW'); await sleep(60); await down('KeyA');
  const filming = film('M3_cruzado', 2600);
  await sleep(1100); await up('KeyA');
  await filming; await sleep(400);
  s = await S();
  R.check(s.ev.some((e) => e.startsWith('bail')), 'M3: aterrizar con la tabla muy girada respecto a la marcha = caída suave', 'input', s);
  await sleep(1400); s = await S();
  R.check(['ride', 'walk'].includes(s.loco) && !s.frozen && s.fries === fries0 && s.decks <= 1, 'M3: recupera control, conserva patatas y no duplica tabla', 'input', { ...s, fries0 });

  // M4 caída por truco incompleto (caja de prueba en el aterrizaje)
  await placeKicker(); await sleep(300); await mark();
  await page.evaluate(() => {
    const g = window.__bk, RAPIER = window.__bkRapier, T = window.__bkTHREE, l = g.manifest.get('trick.lip');
    const f = new T.Vector3(Math.sin(l.heading), 0, Math.cos(l.heading)), c = l.pos.clone().addScaledVector(f, 5.8);   // empieza a 3,2 m del labio: al pulsar, debajo hay suelo
    const desc = RAPIER.ColliderDesc.cuboid(1.5, 1.0, 2.6).setTranslation(c.x, 1.0, c.z).setRotation({ x: 0, y: Math.sin(l.heading / 2), z: 0, w: Math.cos(l.heading / 2) });
    window.__testBox = g.world.createCollider(desc);
    const mesh = new T.Mesh(new T.BoxGeometry(3, 0.9, 5.2), new T.MeshStandardMaterial({ color: '#ff8800' })); mesh.position.set(c.x, 0.45, c.z); mesh.rotation.y = l.heading; g.scene.add(mesh); window.__testBoxMesh = mesh;
  });
  // frontflip pedido tarde (cerca del ápice): el controlador lo dimensiona contra el suelo de debajo y aterriza antes, sobre la caja
  await toLip(); await press('Space'); await sleep(300); await press('Space'); await sleep(80); await up('KeyW');
  const landAt = page.evaluate(() => new Promise((res) => { const g = window.__bk, l = g.manifest.get('trick.lip').pos, s = g.skater; const iv = setInterval(() => { if (s.grounded && s.airTime === 0 && window.__lifted) { clearInterval(iv); res({ d: +Math.hypot(s.footPos.x - l.x, s.footPos.z - l.z).toFixed(2), y: +s.footPos.y.toFixed(2) }); } if (!s.grounded) window.__lifted = true; }, 5); setTimeout(() => res(null), 4000); }));
  const filming4 = film('M4_incompleto', 2400);
  await filming4; s = await S(); R.note({ M4_landing: await landAt });
  R.check(s.ev.some((e) => e.startsWith('trick:frontflip')) && s.ev.some((e) => /^bail/.test(e)) && s.log && !s.log.ok, 'M4: frontflip interrumpido al tocar antes la caja = truco incompleto y caída', 'input', s);
  await sleep(1500); s = await S();
  await page.evaluate(() => { const g = window.__bk; g.world.removeCollider(window.__testBox, false); window.__testBoxMesh.removeFromParent(); });
  R.check(['ride', 'walk'].includes(s.loco) && !s.frozen && s.fries === fries0 && s.decks <= 1, 'M4: recupera control, conserva patatas y no duplica tabla', 'input', { ...s, fries0 });
  await down('KeyW'); await sleep(900); await up('KeyW'); const mv = await S();
  R.check(mv.speed > 0.5 || mv.loco === 'walk', 'M4: tras recuperar responde al control', 'input', mv);
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
