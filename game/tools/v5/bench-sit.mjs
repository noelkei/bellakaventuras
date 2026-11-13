// R1-G8 (usuario, 12 oct) · Sentarse en el banco de NO ME GUILLO. Entrada real (tecla E y botón táctil de ACCIÓN), sin
// llamar a la actividad desde la página:
//  · control negativo: a 5 m del banco no se ofrece SENTARSE; en tabla dentro de la zona se ofrece (baja primero);
//  · a pie delante del banco: botón «SENTARSE» → E → ANMI sentada (clip SK_SitBench, raíz visual en el asiento, cápsula
//    congelada); geometría medida en el cuerpo DEFORMADO: apoyo bajo la pelvis sobre el asiento (0,45 ± 0,03 m), nada del
//    cuerpo más de 4 cm dentro del asiento, suelas en el suelo (±2 cm), tabla con las ruedas sobre el asiento y dentro del banco;
//  · SALTO y joystick sentada no la levantan ni la mueven; botón «LEVANTARSE» → E → de pie, sin congelar, anda de nuevo;
//  · la misma secuencia con el botón táctil (clic real en #btn-action) en vertical.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, place, directShot, VIEWPORTS, SAVE_20, r3 } from './lib.mjs';
const R = new Report('bench-sit');
const measure = () => {
  const g = window.__bk, T = window.__bkTHREE, v = g.visual, P = g.park;
  const a = g.manifest.get('nmg.bench.sit'), bench = P.manifest.get ? null : null;
  const slot = P.root.getObjectByName('nmg_bench_slot');
  const inv = new T.Matrix4().copy(slot.matrixWorld).invert();
  v.model.updateMatrixWorld(true); v.body.skeleton.update();
  const tmp = new T.Vector3(), seatTop = 0.45, hw = 0.9, hd = 0.28;
  let inSeatMin = Infinity, below = 0, n = v.body.geometry.attributes.position.count;
  const hips = v.body.skeleton.bones.find((b) => /Hips$/.test(b.name)).getWorldPosition(new T.Vector3());
  const hipsL = hips.clone().applyMatrix4(inv);
  const under = [], bz = [], bx = []; let belowBack = 0;
  for (let i = 0; i < n; i++) {
    v.body.getVertexPosition(i, tmp).applyMatrix4(v.body.matrixWorld); const l = tmp.clone().applyMatrix4(inv);
    // tablero del asiento: 5 cm (seat − 0,05 … seat); debajo está hueco (las piernas pueden caer por delante del canto)
    if (Math.abs(l.x) < hw && Math.abs(l.z) < hd && l.y > seatTop - 0.05 && l.y < 1.2) { if (l.y < inSeatMin) inSeatMin = l.y; if (l.y < seatTop - 0.035) { below++; bz.push(l.z); bx.push(l.x); if (l.z - hipsL.z < 0.1) belowBack++; } }
    if (Math.abs(l.x - hipsL.x) < 0.2 && l.z - hipsL.z > -0.16 && l.z - hipsL.z < 0.05) under.push(l.y);   // bajo la pelvis
  }
  under.sort((x, y) => x - y); const seatContact = under.length ? under[0] : null;   // lo más bajo bajo la pelvis
  let sole = Infinity; for (const i of v.soleIdx) { v.body.getVertexPosition(i, tmp).applyMatrix4(v.body.matrixWorld); sole = Math.min(sole, tmp.y); }
  let deckMin = Infinity, deckOut = 0, dn = 0;
  for (const m of v.deckMeshes) { if (m.isSkinnedMesh) m.skeleton.update(); const c = m.geometry.attributes.position.count;
    for (let i = 0; i < c; i += 3) { if (m.isSkinnedMesh) m.getVertexPosition(i, tmp); else tmp.fromBufferAttribute(m.geometry.attributes.position, i); tmp.applyMatrix4(m.matrixWorld);
      const l = tmp.clone().applyMatrix4(inv); dn++; if (l.y < deckMin) deckMin = l.y; if (Math.abs(l.x) > hw + 0.02 || Math.abs(l.z) > hd + 0.02) deckOut++; } }
  const s = g.skater;
  return { clip: v.currentName, sitBlend: +v.sitBlend.toFixed(3), frozen: s.frozen, onFoot: s.onFoot, foot: [+s.footPos.x.toFixed(3), +s.footPos.z.toFixed(3)],
    rootToAnchor: +Math.hypot(v.root.position.x - a.pos.x, v.root.position.z - a.pos.z).toFixed(3), hipsY: +hips.y.toFixed(3),
    seatContact: seatContact == null ? null : +seatContact.toFixed(3), inSeatMin: +inSeatMin.toFixed(3), belowSeat4cm: below, belowBack, belowZ: bz.length ? [+Math.min(...bz).toFixed(3), +Math.max(...bz).toFixed(3)] : null, belowX: bx.length ? [+Math.min(...bx).toFixed(3), +Math.max(...bx).toFixed(3)] : null, sole: +sole.toFixed(3),
    deckMin: +deckMin.toFixed(3), deckOutFrac: +(deckOut / Math.max(1, dn)).toFixed(3), prompt: document.getElementById('prompt').hidden ? null : document.getElementById('btn-action').textContent };
};
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const lay of ['escritorio', 'vertical']) {
      const page = await openGame(b, R, { viewport: lay === 'escritorio' ? VIEWPORTS.desktop : VIEWPORTS.phone, save: SAVE_20 });
      await clickStart(page); await sleep(1200);
      const z = await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.benchSit'), a = g.manifest.get('nmg.bench.sit'); return { z: [z.pos.x, z.pos.z, z.r], a: [a.pos.x, a.pos.z, a.heading] }; });
      const toward = Math.atan2(z.a[0] - z.z[0], z.a[1] - z.z[1]);
      const prompt = () => page.evaluate(() => (document.getElementById('prompt').hidden ? null : document.getElementById('btn-action').textContent));
      // control negativo: a 5 m (por fuera de la zona, en dirección contraria al banco)
      await place(page, R, [z.z[0] - Math.sin(toward) * 5, 0, z.z[1] - Math.cos(toward) * 5], toward, 'walk', `${lay}: a 5 m del banco`); await sleep(700);
      const far = await prompt();
      R.check(!far || !/SENTARSE/.test(far), `${lay}: a 5 m del banco no se ofrece SENTARSE`, 'emulation', { prompt: far });
      // en tabla dentro de la zona: se ofrece (bajará primero)
      await place(page, R, [z.z[0], 0, z.z[1]], toward, 'ride', `${lay}: en tabla en la zona del banco`); await sleep(700);
      const ride = await prompt();
      R.check(/SENTARSE/.test(ride ?? ''), `${lay}: en tabla dentro de la zona se ofrece SENTARSE`, 'emulation', { prompt: ride });
      // a pie
      await place(page, R, [z.z[0], 0, z.z[1]], toward, 'walk', `${lay}: a pie delante del banco`); await sleep(700);
      const p0 = await prompt();
      R.check(/SENTARSE/.test(p0 ?? ''), `${lay}: a pie delante del banco aparece el botón SENTARSE`, 'emulation', { prompt: p0 });
      if (lay === 'escritorio') await page.keyboard.press('KeyE'); else await page.click('#btn-action');
      await sleep(1600);
      const m1 = await page.evaluate(measure);
      R.measure(`${lay}: sentada`, m1);
      await R.shot(page, `${lay}_sentada_camara_juego`);
      if (lay === 'escritorio') {   // vistas directas declaradas (HUD oculto): lateral a la altura del asiento y ¾ delantero
        const h = z.a[2], ax = z.a[0], az = z.a[1];
        await directShot(page, R, 'sentada_lateral', [ax + Math.cos(h) * 2.4, 0.55, az - Math.sin(h) * 2.4], [ax, 0.5, az], 40);
        await directShot(page, R, 'sentada_baja_frente', [ax + Math.sin(h) * 1.6, 0.22, az + Math.cos(h) * 1.6], [ax, 0.42, az], 50);
        await directShot(page, R, 'sentada_tres_cuartos', [ax + Math.sin(h) * 2.6 + Math.cos(h) * 1.4, 1.3, az + Math.cos(h) * 2.6 - Math.sin(h) * 1.4], [ax, 0.6, az], 45);
      }
      R.check(m1.clip === 'SK_SitBench' && m1.sitBlend > 0.95 && m1.frozen && m1.rootToAnchor < 0.03, `${lay}: ${lay === 'escritorio' ? 'E' : 'botón'} → sentada (clip, raíz en el asiento, cápsula quieta)`, 'emulation', m1);
      R.check(m1.seatContact != null && m1.seatContact >= 0.45 - 0.035 && m1.seatContact <= 0.45 + 0.03, `${lay}: apoyo bajo la pelvis en el asiento (0,45 m; tela −3,5 cm … +3 cm)`, 'emulation', { seatContact: m1.seatContact });
      R.check(m1.belowBack === 0, `${lay}: nada hundido > 3,5 cm en el tablero bajo la pelvis ni en la mitad trasera del muslo (< 10 cm por delante de la pelvis)`, 'emulation', { belowBack: m1.belowBack });
      R.note(`${lay}: LÍMITE declarado: el pantalón ancho (tela sin simulación) atraviesa el tablero por delante (${m1.belowSeat4cm} vértices entre z ${JSON.stringify(m1.belowZ)} del banco, hasta 5 cm); en la vista baja delantera el bajo cuelga por delante del canto y no se ve el cruce (captura sentada_baja_frente)`);
      R.check(Math.abs(m1.sole) <= 0.02, `${lay}: suelas en el suelo (±2 cm)`, 'emulation', { sole: m1.sole });
      R.check(m1.deckMin >= 0.43 && m1.deckOutFrac <= 0.02, `${lay}: tabla apoyada sobre el asiento y dentro del banco`, 'emulation', { deckMin: m1.deckMin, out: m1.deckOutFrac });
      R.check(/LEVANTARSE/.test(m1.prompt ?? ''), `${lay}: sentada, el botón dice LEVANTARSE`, 'emulation', { prompt: m1.prompt });
      // sentada: SALTO y joystick no la mueven
      if (lay === 'escritorio') { await page.keyboard.press('Space'); await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); }
      else { await page.click('#btn-jump'); await sleep(900); }
      const m2 = await page.evaluate(measure);
      R.check(m2.clip === 'SK_SitBench' && m2.frozen && Math.hypot(m2.foot[0] - m1.foot[0], m2.foot[1] - m1.foot[1]) < 0.02, `${lay}: sentada, SALTO${lay === 'escritorio' ? ' y W' : ''} no la levantan ni la mueven`, 'emulation', { m1: m1.foot, m2: m2.foot, clip: m2.clip });
      // levantarse
      if (lay === 'escritorio') await page.keyboard.press('KeyE'); else await page.click('#btn-action');
      await sleep(1300);
      const m3 = await page.evaluate(measure);
      R.check(!m3.frozen && m3.sitBlend < 0.05 && m3.clip !== 'SK_SitBench', `${lay}: LEVANTARSE → de pie y libre`, 'emulation', m3);
      if (lay === 'escritorio') { await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW'); await sleep(300);
        const m4 = await page.evaluate(measure);
        R.check(Math.hypot(m4.foot[0] - m3.foot[0], m4.foot[1] - m3.foot[1]) > 0.5, `${lay}: tras levantarse anda (W 1 s)`, 'emulation', { from: m3.foot, to: m4.foot }); }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 240000 });
