// V10.1 · P09 (D10, D11) guardián de SKILLS: el botón abre BAILAR / GRAFITEAR; 4 bailes; 4 grafitis del usuario (espray) que se pintan en una
// pared lisa delante o en el suelo, en teclado, táctil y mando; se quedan pintados, se guardan (los 12 últimos) y vuelven al recargar; nunca
// encima de un cartel o de un personaje; la actividad de la rana (grafiti de YY) no cambia.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
const R = new Report('skills-v10-1');
const st = (page) => page.evaluate(() => { const g = window.__bk, f = g.activities.find((a) => a.id === 'freeDance');
  return { menu: f.menu, level: f.level, dancing: f.dancing, painting: !!f.painting, paints: f.paints, decals: f.decals.length, saved: (g.state.p.skillGraffiti ?? []).length, denies: f.denies.slice(-2),
    vis: [...document.querySelectorAll('#dance-ring > button.lvl')].map((b) => b.className.split(' ')[0]) }; });
async function placeWall(page, label) {
  // costado oeste de A de SN (cara lisa; su grafiti 02 va más arriba): ANMI a 1,3 m mirándolo
  return fixture(page, R, `${label}: ANMI a pie a 1,3 m de una pared lisa (lateral de A de SN, oeste)`, () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
    const th = g.park.sn.group.rotation.y, P0 = new T.Vector3(-5.8, 0, -12.8).applyAxisAngle(new T.Vector3(0, 1, 0), th);   // V10.1: marco girado del reto
    s.teleport(P0, Math.PI / 2 + th, 'walk'); g.rig.snapBehind(s);
    const RA = window.__bkRapier, h = g.world.castRayAndGetNormal(new RA.Ray({ x: P0.x, y: 1.15, z: P0.z }, { x: Math.sin(s.heading), y: 0, z: Math.cos(s.heading) }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
    return { hit: h ? +h.timeOfImpact.toFixed(2) : null, n: h ? [h.normal.x, h.normal.y, h.normal.z].map((v) => +v.toFixed(2)) : null }; });
}
await runTest(R, async () => {
  const b = await launch();
  try {
    // ---------------------------------------------------------------- teclado
    { const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1500);
      await fixture(page, R, 'ANMI a pie en la plaza de NMG', () => { const g = window.__bk, an = g.manifest.get('nmg.llegada'); g.skater.teleport(an.pos.clone(), an.heading, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(500);
      const btn = await page.evaluate(() => { const e = document.getElementById('btn-dance'); return { hidden: e.hidden, t: e.innerText.replace(/\s+/g, ' ') }; });
      R.check(!btn.hidden && /SKILLS/.test(btn.t), 'botón SKILLS a pie (en lugar de BAILAR)', 'static', btn);
      await page.keyboard.press('KeyB'); await sleep(300); const root = await st(page);
      R.check(root.menu && root.level === 'root' && root.vis.join() === 'skill-root,skill-root', 'B abre SKILLS con BAILAR y GRAFITEAR', 'input', root);
      await page.keyboard.press('Digit1'); await sleep(300); const dl = await st(page);
      R.check(dl.level === 'dance' && dl.vis.length === 4 && dl.vis.every((c) => c === 'dance-opt'), 'BAILAR muestra 4 bailes', 'input', dl);
      const names = await page.evaluate(async () => { const f = window.__bk.activities.find((a) => a.id === 'freeDance'), out = [];
        for (let n = 1; n <= 4; n++) { f.request(n); await new Promise((r) => setTimeout(r, 400)); out.push(window.__bk.visual.override); f.stop(); await new Promise((r) => setTimeout(r, 200)); } return out; });
      R.check(names.join() === 'Breakdance_1990,Hip_Hop_Dance_1,FunnyDancing_03,Step_Hip_Hop_Dance', 'los 4 bailes: Breakdance 1990, Hip Hop 1, Funny 03, Step Hip Hop', 'input', names);
      // grafiti en pared con teclado: B → 2 → 1
      const w = await placeWall(page, 'teclado'); await sleep(400);
      await page.keyboard.press('KeyB'); await sleep(200); await page.keyboard.press('Digit2'); await sleep(200);
      const gl = await st(page); R.check(gl.level === 'graffiti' && gl.vis.length === 4 && gl.vis.every((c) => c === 'graf-opt'), 'GRAFITEAR muestra los 4 grafitis', 'input', gl);
      await page.keyboard.press('Digit1'); await sleep(400); const p0 = await st(page);
      R.check(p0.painting, `pinta en la pared que tiene delante (${JSON.stringify(w)})`, 'input', { p0, w });
      await sleep(2800); const p1 = await st(page);
      const pose = await page.evaluate(() => { const g = window.__bk; let can = null; g.visual.root.traverse((o) => { if (o.name === 'ANMI_SPRAY_CAN') can = o.visible; }); return { can }; });
      R.check(!p1.painting && p1.paints === 1 && p1.saved === 1 && p1.decals >= 1, 'en ~2,5 s queda pintado y guardado', 'input', { p1, pose });
      // suelo: 5–8 directos, mirando a suelo libre
      await fixture(page, R, 'ANMI a pie en la plaza de salida mirando a suelo libre', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(40, 0, -40), -Math.PI / 4, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(500);
      await page.keyboard.press('Digit7'); await sleep(3100); const fl = await st(page);
      const fd = await page.evaluate(() => { const f = window.__bk.activities.find((a) => a.id === 'freeDance'), m = f.decals.at(-1); const n = new window.__bkTHREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion); return { name: m.name, ny: +n.y.toFixed(2), y: +m.position.y.toFixed(3) }; });
      R.check(fl.paints === 2 && fd.name === 'SKILL_GRAFFITI_3' && fd.ny > 0.9, 'directo con 7: el grafiti 3 en el SUELO (también en la plaza)', 'input', { fl, fd });
      // letras BELLAKACIONES: no se pinta encima (las letras no son pared de pintar)
      const lt = await fixture(page, R, 'ANMI a pie a 1,2 m de una letra de BELLAKACIONES', () => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier; let best = null;
        g.world.forEachCollider((c) => { const n = g.park.colliderName(c.handle) ?? ''; if (!/letr|letter/i.test(n) || best) return; const t = c.translation(); best = { x: t.x, z: t.z, n }; });
        if (!best) { let L = null; g.scene.traverse((o) => { if (o.name === 'BOLA_LETRAS') L = o; }); const bb = new T.Box3().setFromObject(L), c = bb.getCenter(new T.Vector3()); best = { x: c.x, z: c.z, n: 'malla' }; }
        const dir = new T.Vector3(best.x, 0, best.z).normalize(), p = new T.Vector3(best.x, 0, best.z).addScaledVector(dir, -1.6);
        g.skater.teleport(p, Math.atan2(dir.x, dir.z), 'walk'); g.rig.snapBehind(g.skater); return best; }); await sleep(400);
      const before = (await st(page)).paints; await page.keyboard.press('Digit5'); await sleep(2900); const sg = await st(page);
      const inLet = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, f = g.activities.find((a) => a.id === 'freeDance'); let L = null; g.scene.traverse((o) => { if (o.name === 'BOLA_LETRAS') L = o; });
        const bb = new T.Box3().setFromObject(L, true).expandByScalar(0.3); return f.decals.filter((m) => bb.containsPoint(m.position)).length; });
      R.check(inLet === 0, `junto a las letras BELLAKACIONES ningún grafiti queda encima de ellas (${sg.paints === before ? 'no pinta: ' + (sg.denies.at(-1) ?? '') : 'pinta fuera, en el suelo'})`, 'input', { sg, inLet });
      // R5 (QA B2/B3): ni encima del mural de la rana (diana YY_T1_GraffitiTarget, firma ANMI) ni bajo los pies de Bellakat
      const art = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, f = g.activities.find((a) => a.id === 'freeDance'); const out = {};
        let tg = null; g.scene.traverse((o) => { if (!tg && /GraffitiTarget/.test(o.name)) tg = o; });
        const bb = new T.Box3().setFromObject(tg, true), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
        const nrm = sz.x < sz.z ? new T.Vector3(Math.sign(-c.x) || 1, 0, 0) : new T.Vector3(0, 0, Math.sign(-c.z) || 1);   // la cara que mira al parque
        const p = c.clone().addScaledVector(nrm, 1.15); p.y = bb.min.y;
        const RA = window.__bkRapier, h = g.world.castRay(new RA.Ray({ x: p.x, y: p.y + 2, z: p.z }, { x: 0, y: -1, z: 0 }), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (h) p.y = p.y + 2 - h.timeOfImpact;
        g.skater.teleport(p, Math.atan2(-nrm.x, -nrm.z), 'walk'); g.rig.snapBehind(g.skater); await new Promise((r) => setTimeout(r, 500));
        const n0 = f.paints; f.paint(0); await new Promise((r) => setTimeout(r, 3200));
        out.mural = { pinto: f.paints > n0, encima: f.decals.filter((m) => new T.Box3().setFromObject(m).intersectsBox(bb)).length, deny: f.denies.at(-1) ?? '' };
        await g.loadNpc('fennec'); const fen = g.npcs.get('fennec')?.[0]; const fp = fen.root.getWorldPosition(new T.Vector3());
        let best = null; for (let k = 0; k < 16 && !best; k++) { const a = k / 16 * Math.PI * 2, q = fp.clone().add(new T.Vector3(Math.sin(a) * 1.6, 0, Math.cos(a) * 1.6));
          const hh = g.world.castRay(new RA.Ray({ x: q.x, y: fp.y + 1.5, z: q.z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (hh && Math.abs(fp.y + 1.5 - hh.timeOfImpact - fp.y) < 0.15) best = { q, a }; }
        if (best) { best.q.y = fp.y; g.skater.teleport(best.q, Math.atan2(fp.x - best.q.x, fp.z - best.q.z), 'walk'); await new Promise((r) => setTimeout(r, 500));
          const n1 = f.paints; f.paint(2); await new Promise((r) => setTimeout(r, 3200)); const m = f.paints > n1 ? f.decals.at(-1) : null;
          out.npc = { pinto: !!m, d: m ? +Math.hypot(m.position.x - fp.x, m.position.z - fp.z).toFixed(2) : null, deny: f.denies.at(-1) ?? '' }; } else out.npc = { sinSitio: true };
        return out; });
      R.check(art.mural.encima === 0, `R5 · delante del mural de la rana no se pinta encima (${art.mural.pinto ? 'pinta fuera' : 'no pinta: ' + art.mural.deny})`, 'input', art.mural);
      R.check(!art.npc.sinSitio && (!art.npc.pinto || art.npc.d > 0.9), `R5 · junto a Bellakat el grafiti no queda bajo sus pies (${art.npc.pinto ? 'a ' + art.npc.d + ' m' : 'no pinta: ' + art.npc.deny})`, 'input', art.npc);
      // 12 últimos: se pintan 12 más (por código, misma función) y el total guardado se queda en 12; recarga: vuelven
      await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, f = g.activities.find((a) => a.id === 'freeDance');
        for (let k = 0; k < 12; k++) { g.skater.teleport(new T.Vector3(36 + (k % 4) * 2.2, 0, -46 + Math.floor(k / 4) * 2.2), 0, 'walk'); await new Promise((r) => setTimeout(r, 120)); f.paint(k % 4); await new Promise((r) => setTimeout(r, 3200)); } });   // V10.2 Q13 (D-13): grafitear dura ~3 s (antes 2,4)
      const s12 = await st(page);
      R.check(s12.saved === 12 && s12.decals === 12, 'se guardan los 12 últimos (el más viejo sale)', 'input', s12);
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(1500);
      const rl = await st(page); R.check(rl.decals === 12 && rl.saved === 12, 'al recargar, los 12 grafitis siguen pintados', 'input', rl);
      await page.close(); }
    // ---------------------------------------------------------------- táctil y mando
    for (const dev of ['tactil', 'mando']) {
      const page = await openGame(b, R, { save: SAVE_20, viewport: dev === 'tactil' ? VIEWPORTS.phoneLand : VIEWPORTS.desktop }); await clickStart(page); await sleep(1500);
      await placeWall(page, dev); await sleep(500);
      if (dev === 'tactil') { await page.tap('#btn-dance'); await sleep(300); await page.tap('.skill-root[data-l="graffiti"]'); await sleep(300); await page.tap('.graf-opt[data-g="2"]'); }
      else { await page.evaluate(() => { const I = window.__bk.input; I.fakePad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true }; });
        const tap = async (i) => { await page.evaluate((i) => { window.__bk.input.fakePad.buttons[i] = { pressed: true, value: 1 }; }, i); await sleep(120); await page.evaluate((i) => { window.__bk.input.fakePad.buttons[i] = { pressed: false, value: 0 }; }, i); await sleep(150); };
        await tap(5); await tap(15); await tap(15); }   // RB → → GRAFITEAR → (→ = 2.º grafiti)
      await sleep(400); const p = await st(page);
      await sleep(2800); const q = await st(page);
      R.check(p.painting && q.paints === 1, `${dev}: SKILLS → GRAFITEAR → un grafiti, pintado en la pared`, 'input', { p, q });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
