// V4-NMG-04 · Secreto de la U y premios NMG: la patata `no_me_guillo.hidden` NO se ve desde la llegada (ojos de ANMI a 1,5 m
// y cámara de seguimiento a ~2,4 m, por todo el tramo spawn→corazón, contra la geometría REAL de colisión y la malla del kit),
// SÍ se ve desde el lado de la boca (+X del marco) o mirando desde el bank, y se recoge entrando por la boca con teclado real.
// Negativo sensible: si la U no tapa (pared quitada en la medición) el mismo rayo debe dar «visible».
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('NMG-04', 'nmg-secret');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    const res = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, m = g.manifest;
      const f = m.fries.find((x) => x.id === 'no_me_guillo.hidden'), sp = m.spawn.pos, heart = m.get('nmg.heart').pos;
      const target = f.pos.clone().add(new T.Vector3(0, 0.35, 0));
      // malla visible del mundo (kit incluido), sin el propio premio, NPC, ANMI ni marcas/áreas
      const meshes = []; g.scene.traverse((o) => { if (o.isMesh && o.visible && !/^AREA_|fry|FRY|SKATER|ANMI/i.test(o.name) && !o.userData?.npc) { let p = o, skip = false; while (p) { if (p === g.skater?.group || /fry|cassette|ANMI|npc/i.test(p.name)) skip = true; p = p.parent; } if (!skip) meshes.push(o); } });
      const rc = new T.Raycaster();
      const seen = (eye, objs = meshes) => { const d = target.clone().sub(eye); const L = d.length(); rc.set(eye, d.normalize()); rc.far = L - 0.25; const h = rc.intersectObjects(objs, false); return { vis: h.length === 0, by: h[0]?.object.name ?? null }; };
      const arrival = []; for (let k = 0; k <= 10; k++) { const p = sp.clone().lerp(heart, k / 10 * 0.8); for (const y of [1.5, 2.4]) arrival.push({ k, y, ...seen(new T.Vector3(p.x, y, p.z)) }); }
      // boca de la U: +X del marco (tangente) desde el centro de la U
      const ua = m.get('nmg.u'); const X = new T.Vector3(Math.sin(ua.heading), 0, Math.cos(ua.heading));
      const mouth = []; for (const d of [3, 5, 7]) { const p = f.pos.clone().addScaledVector(X, d); mouth.push({ d, ...seen(new T.Vector3(p.x, 1.5, p.z)) }); }
      const blocker = arrival.find((a) => !a.vis)?.by;
      const withoutU = arrival.filter((a) => !a.vis).map((a) => { const p = sp.clone().lerp(heart, a.k / 10 * 0.8); return seen(new T.Vector3(p.x, a.y, p.z), meshes.filter((o) => !/^nmg_u(_|$)|uWall|alcove/i.test(o.name) && !/^nmg_u(_|$)|uWall/i.test(o.parent?.name ?? ''))); });
      // positivo de lectura: la patata «visible» y el radiocasete SÍ se ven desde el spawn (sin oclusión accidental)
      const seeFrom = (pos) => { const t0 = target.clone(); target.copy(pos); const r = [1.5, 2.4].map((y) => seen(new T.Vector3(sp.x, y, sp.z))); target.copy(t0); return r; };
      const vis = seeFrom(m.fries.find((x) => x.id === 'no_me_guillo.visible').pos.clone().add(new T.Vector3(0, 0.35, 0)));
      const cas = seeFrom(m.cassettes.find((c) => c.zone === 'no_me_guillo').pos.clone().add(new T.Vector3(0, 0.45, 0)));
      return { vis, cas, fry: f.pos.toArray().map((v) => +v.toFixed(2)), arrival, mouth, blocker, withoutU: withoutU.filter((x) => x.vis).length, nBlocked: arrival.filter((a) => !a.vis).length, mouthDir: X.toArray().map((v) => +v.toFixed(3)) };
    });
    R.check(res.arrival.every((a) => !a.vis), `desde la llegada (11 puntos × ojos 1,5 m y cámara 2,4 m) la patata secreta queda tapada (por ${res.blocker})`, 'vision', res.arrival.filter((a) => a.vis));
    R.check(res.vis.every((a) => a.vis) && res.cas.every((a) => a.vis), 'desde el spawn se ven la patata «visible» y el radiocasete (sin oclusión accidental)', 'vision', { vis: res.vis, cas: res.cas });
    R.check(res.mouth.some((a) => a.vis), 'desde el lado de la boca de la U la patata se ve', 'vision', res.mouth);
    R.check(res.withoutU === res.nBlocked && res.nBlocked > 0, 'negativo: quitando la U de la medición los mismos rayos pasan a «visible» (lo que tapa es la U)', 'vision', { withoutU: res.withoutU, of: res.nBlocked });
    // recogida por entrada real: a pie desde 5 m en la boca, de cara a la patata, W hasta recoger
    const startP = res.fry.map((v, i) => v + (i === 1 ? 0 : res.mouthDir[i] * 5));
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; const f = g.manifest.fries.find((x) => x.id === 'no_me_guillo.hidden'); const s = new T.Vector3(p[0], 0, p[2]); g.skater.teleport(s, Math.atan2(f.pos.x - s.x, f.pos.z - s.z), 'walk'); g.input.clear(); }, startP);   // fixture: colocación declarada a 5 m de la boca
    await page.keyboard.down('KeyW');
    let got = false; for (let i = 0; i < 60 && !got; i++) { got = await page.evaluate(() => window.__bk.state.p.collected.includes('no_me_guillo.hidden')); await sleep(100); }
    await page.keyboard.up('KeyW');
    R.check(got, 'entrando a pie por la boca con W la patata secreta se recoge', 'input', { startP });
  } finally { await browser.close(); }
});
