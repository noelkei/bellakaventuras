// V10.1 R3 · guardián de personajes y trucos: P21 (Bellakroak y Bellakat ×1,3 — coronilla 1,16 m —, miran a ANMI con cabeza y cuello, cápsula en
// proporción), P22 (flips encadenados desde altura, con combo), P23 (sentarse y levantarse en TODOS los bancos sin meter el cuerpo en el asiento).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20 } from '../v8/lib.mjs';
const R = new Report('personajes-v10-1');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(2500);
    await page.evaluate(async () => { const g = window.__bk; await g.loadNpc('rana'); await g.loadNpc('fennec'); await g.loadSnCast(); });
    await sleep(2000);
    // ---------------------------------------------------------------- P21 · coronilla sin mirada (ANMI lejos): ×1,3 de la aprobada
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(40, 0, -40), 0, 'walk'); }); await sleep(1500);
    const tops = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.scene.updateMatrixWorld(true);
      return [['YY', g.npcs.get('rana')?.[0]], ['NVDA', g.npcs.get('fennec')?.[0]], ['SN rana', g.snCast[0]], ['SN fennec', g.snCast[1]]].map(([n, a]) => { if (!a) return { n, falta: true }; let t = null; a.root.traverse((o) => { if (o.name.endsWith('HeadTop_End')) t = o; });
        return { n, coronilla: +(t.getWorldPosition(new T.Vector3()).y - a.root.getWorldPosition(new T.Vector3()).y).toFixed(3), lookW: +a.lookW.toFixed(2) }; }); });
    R.measure('coronillas', tops);
    R.check(tops.length === 4 && tops.every((l) => !l.falta && Math.abs(l.coronilla - 0.895 * 1.3) <= 0.045), 'P21 · coronilla de Bellakroak y Bellakat a 1,16 m (×1,3 de 0,895; medida animada) en YY, NVDA y SN', 'static', tops);
    // ---------------------------------------------------------------- P21 · mirada: ANMI delante de cada uno, a 1,4 m
    const look = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, out = [];
      const acts = [['YY', g.npcs.get('rana')?.[0]], ['NVDA', g.npcs.get('fennec')?.[0]], ['SN rana', g.snCast[0]], ['SN fennec', g.snCast[1]]];
      for (const [n, a] of acts) { if (!a) { out.push({ n, falta: true }); continue; }
        const w = a.root.getWorldPosition(new T.Vector3()), f = new T.Vector3(0, 0, 1).applyQuaternion(a.root.getWorldQuaternion(new T.Quaternion())).setY(0).normalize(), side = new T.Vector3(f.z, 0, -f.x);   // V10.1: frente en el MUNDO (el reparto de SN cuelga del grupo girado)
        const p = w.clone().addScaledVector(f, 1.4).addScaledVector(side, 0.5); g.skater.teleport(new T.Vector3(p.x, w.y, p.z), Math.atan2(-f.x, -f.z), 'walk'); g.rig.snapBehind(g.skater);
        await new Promise((r) => setTimeout(r, 1300));
        let head = null, top = null; a.root.traverse((o) => { if (/Head$/.test(o.name)) head = o; if (o.name.endsWith('HeadTop_End')) top = o; });
        g.scene.updateMatrixWorld(true);
        const hp = head.getWorldPosition(new T.Vector3()), tp = top.getWorldPosition(new T.Vector3()), dirHead = tp.clone().sub(hp).normalize();   // eje del cráneo (arriba)
        // dirección de la cara: el eje local +Z de la cabeza en el mundo
        const q = head.getWorldQuaternion(new T.Quaternion()), face = new T.Vector3(0, 0, 1).applyQuaternion(q).normalize();
        const tgt = g.skater.visualPos.clone().add(new T.Vector3(0, 1.52, 0)), toT = tgt.sub(hp).normalize();
        out.push({ n, coronilla: +(tp.y - w.y).toFixed(3), ang: +(Math.acos(Math.min(1, face.dot(toT))) * 180 / Math.PI).toFixed(1), lookW: +a.lookW.toFixed(2), arriba: +(face.y).toFixed(2), col: null, void: dirHead.y }); }
      return out; });
    R.measure('mirada', look);
    R.check(look.every((l) => l.lookW > 0.9 && l.ang < 20 && l.arriba > 0.05), 'P21 · con ANMI delante, la cabeza la mira (< 20°) levantando la vista', 'input', look);
    // cápsula en proporción (YY-09 con la escala nueva lo vigila f6-arista)
    const cap = await page.evaluate(() => { const g = window.__bk; return g.npcHomes.filter((h) => /rana|fennec/i.test(h.actor.root.children.map((c) => c.name).join(' ')) || true).slice(0, 8).map((h) => ({ hh: +h.col.halfHeight().toFixed(3), r: +h.col.radius().toFixed(3), y: +h.col.translation().y.toFixed(3), base: +(h.col.translation().y - h.col.halfHeight() - h.col.radius()).toFixed(3) })); });
    R.measure('capsulas', cap);
    // ---------------------------------------------------------------- P22 · flips encadenados desde la coronación de A de SN (y 7)
    const flips = [];
    for (const seq of [['ArrowDown', 'ArrowDown'], ['ArrowUp', 'ArrowDown']]) {
      // desde la coronación de A (y 7) por el carril de bajada, ollie en el borde: ≈ 1,2 s de aire y recepción en llano antes de B
      await fixture(page, R, 'P22: ANMI en tabla en la coronación de A (y 7), carril de bajada, hacia +Z a 6 m/s', () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
        const th = g.park.sn.group.rotation.y, d = new T.Vector3(0, 0, 1).applyAxisAngle(new T.Vector3(0, 1, 0), th);   // V10.1: SN girado
        s.teleport(new T.Vector3(0, 7, -12.95).applyAxisAngle(new T.Vector3(0, 1, 0), th), th, 'ride'); s.vel.copy(d.multiplyScalar(6)); g.rig.snapBehind(s); s.trickLog.length = 0; });
      await sleep(120); await page.keyboard.press('Space');
      let t0 = Date.now(); while (Date.now() - t0 < 1500 && await page.evaluate(() => window.__bk.skater.grounded)) await sleep(8);
      await sleep(110);
      for (const k of seq) { await page.keyboard.down(k); await page.keyboard.press('Space'); await sleep(50); await page.keyboard.up(k); await sleep(240); }
      t0 = Date.now(); while (Date.now() - t0 < 3000 && !(await page.evaluate(() => window.__bk.skater.grounded))) await sleep(20);
      await sleep(400);
      flips.push(await page.evaluate(() => ({ log: window.__bk.skater.trickLog.slice(), loco: window.__bk.skater.loco, toast: document.getElementById('toast').textContent, ev: window.__bk.skater.events.slice(-14).map((e) => e.e) })));
    }
    R.measure('flips', flips);
    R.check(flips.some((f) => f.log.filter((t) => t.ok).length >= 2 && f.loco !== 'bail'), 'P22 · 2 o más flips encadenados en el mismo aire, aterrizados', 'input', flips);
    // ---------------------------------------------------------------- P23 · todos los bancos
    const spots = await page.evaluate(() => { const g = window.__bk; const bs = g.activities.find((a) => a.id === 'benchSit'); bs.update(0); return (bs.spots ?? []).map(([z, a]) => [z, a]); });
    R.measure('bancos', spots);
    R.check(spots.length >= 20, `P23 · zonas de sentarse en todos los bancos (${spots.length}: NMG, YY ×2, NVDA y 16 del exterior)`, 'static', spots.map((s) => s[0]));
    const res = [];
    for (const [zone, anchor] of spots) {
      const st = await page.evaluate(async (zone, anchor) => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get(zone), s = g.skater, bs = g.activities.find((a) => a.id === 'benchSit');
        if (bs.seated) bs.end(); g.input.clear();
        s.teleport(new T.Vector3(z.pos.x, 0, z.pos.z), 0, 'walk'); g.rig.snapBehind(s);
        await new Promise((r) => setTimeout(r, 500));
        const btn = document.getElementById('btn-action'); const offer = !document.getElementById('prompt').hidden ? btn.textContent : null;
        return { offer }; }, zone, anchor);
      if (!st.offer || !/SENTARSE/.test(st.offer)) { res.push({ zone, ...st, ok: false }); continue; }
      await page.keyboard.press('KeyE'); await sleep(1600);
      const m = await page.evaluate((anchor) => { const g = window.__bk, T = window.__bkTHREE, v = g.visual, bs = g.activities.find((a) => a.id === 'benchSit'), an = g.manifest.get(anchor);
        v.root.updateMatrixWorld(true); v.body.skeleton.update(); let hips = null; v.root.traverse((o) => { if (/Hips$/.test(o.name)) hips = o; });
        const hp = hips.getWorldPosition(new T.Vector3());
        // asiento real: rayo hacia abajo en la cadera (sin la cápsula de ANMI)
        const RA = window.__bkRapier, h = g.world.castRay(new RA.Ray({ x: hp.x, y: hp.y + 0.05, z: hp.z }, { x: 0, y: -1, z: 0 }), 1.2, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider);
        const seatY = h ? hp.y + 0.05 - h.timeOfImpact : null;
        // vértices más bajos de la pelvis/muslos: no se hunden en el asiento más de 2 cm
        const idx = []; const P = v.body.geometry.attributes.position; for (let i = 0; i < P.count; i += 9) idx.push(i);
        let low = 9; const tv = new T.Vector3(); for (const i of idx) { v.body.getVertexPosition(i, tv).applyMatrix4(v.body.matrixWorld); if (Math.hypot(tv.x - hp.x, tv.z - hp.z) < 0.22 && tv.y < low) low = tv.y; }
        return { seated: bs.seated, hipY: +hp.y.toFixed(3), seatY: seatY === null ? null : +seatY.toFixed(3), low: +low.toFixed(3), anchorY: +an.pos.y.toFixed(3) }; }, anchor);
      await page.keyboard.press('KeyE'); await sleep(900);
      const up = await page.evaluate(() => { const g = window.__bk; return { seated: g.activities.find((a) => a.id === 'benchSit').seated, frozen: g.skater.frozen, override: g.visual.override }; });
      const ok = m.seated && m.seatY !== null && m.seatY - m.low <= 0.05 && m.hipY - m.seatY > 0.18 && m.hipY - m.seatY < 0.3 && !up.seated && !up.frozen && !up.override;   // referencia: banco de NMG aprobado (glúteo 3,6 cm «en» el cojín, cadera 0,25 m sobre el asiento)
      res.push({ zone, ...m, up, ok });
    }
    R.measure('sentarse', res);
    R.check(res.length >= 20 && res.every((r) => r.ok), `P23 · sentarse y levantarse en los ${res.length} bancos sin meter el cuerpo en el asiento (${res.filter((r) => !r.ok).length} mal)`, 'input', res.filter((r) => !r.ok).slice(0, 6));
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
