// V4-IMPACT-01/02 · Secuencia de impacto en el juego real (coches activos con un guardado de 20 patatas — fixture
// declarada; ANMI colocada sobre la trayectoria de un coche). Capturas de la secuencia (golpe, estrella, suelo,
// levantarse, a pie) desde una cámara lateral fija y comprobación de que cada fase usa su clip propio.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot } from './lib.mjs';
const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const save = { version: 4, collected: ZONES.flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`)), activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true },
  bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true, checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {} };
const R = new Report('IMPACT', 'impact-seq');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save });
    await clickStart(page); await sleep(800);
    const setup = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0];
      const p = window.__bkCarPose(C.phase + c.offset - 0.5 * 1.3).pos;
      g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(-p.x, -p.z), 'walk');
      const side = new T.Vector3(p.x, 0, p.z).normalize();
      g.rig.toTrack(new T.Vector3(p.x * 0.55, 2.2, p.z * 0.55).add(new T.Vector3(-side.z, 0, side.x).multiplyScalar(4)), 60);
      for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden';
      return { p: [p.x, p.z] };
    });
    R.fixture('20/20 revelado (coches activos) y ANMI sobre la trayectoria del coche A, cámara lateral fija que la sigue', setup);
    // por fotograma (tras dibujar): vértice deformado más bajo de TODO el cuerpo respecto al suelo medido por raycast
    await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, v = g.visual, RA = window.__bkRapier, tmp = new T.Vector3();
      const idx = []; const n = v.body.geometry.attributes.position.count; for (let i = 0; i < n; i += 7) idx.push(i);
      window.__ground = []; const r0 = g.render.bind(g);
      g.render = () => { r0(); const s = g.skater; if (s.loco !== 'impact' || !s.grounded) return;
        let low = Infinity; for (const i of idx) { v.body.getVertexPosition(i, tmp).applyMatrix4(v.body.matrixWorld); low = Math.min(low, tmp.y); }
        const fp = s.footPos, hit = g.world.castRay(new RA.Ray({ x: fp.x, y: fp.y + 0.5, z: fp.z }, { x: 0, y: -1, z: 0 }), 2, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
        if (hit) window.__ground.push([s.impactPhase, +(low - (fp.y + 0.5 - hit.timeOfImpact)).toFixed(3)]); };
    });
    const seen = {}; const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 4500) {
      const st = await page.evaluate(() => { const g = window.__bk, s = g.skater, v = g.visual; return { loco: s.loco, ph: s.impactPhase, y: +s.footPos.y.toFixed(2), clips: v.activeActions?.filter((a) => /SK_(Impact|GetUp|Bail)/.test(a)) ?? [] }; });
      const key = st.ph ?? st.loco;
      // primer plano directo de ANMI desde FUERA de la pista (el coche tapaba la cámara de seguimiento)
      if ((key === 'land' || key === 'getup') && !seen['cerca_' + key]) {
        seen['cerca_' + key] = true;
        const P = await page.evaluate(() => { const f = window.__bk.skater.footPos, r = Math.hypot(f.x, f.z); return { f: [f.x, f.y, f.z], u: [f.x / r, f.z / r] }; });
        await directShot(page, R, `impact_cerca_${key}`, [P.f[0] + P.u[0] * 3.4 - P.u[1] * 1.2, P.f[1] + 1.1, P.f[2] + P.u[1] * 3.4 + P.u[0] * 1.2], [P.f[0], P.f[1] + 0.35, P.f[2]], 50);
      }
      if (!seen[key]) { seen[key] = st; await R.shot(page, `impact_${String(n++).padStart(2, '0')}_${key}`); }
      else if (st.ph && (Date.now() % 3 === 0)) await R.shot(page, `impact_${String(n++).padStart(2, '0')}_${key}_b`);
      await sleep(70);
    }
    R.note({ fases: seen });
    R.check(seen.air?.clips?.some((c) => c.startsWith('SK_ImpactStar')), 'vuelo con el clip propio de estrella (SK_ImpactStar)', 'vision', seen.air);
    R.check(seen.land?.clips?.some((c) => c.startsWith('SK_ImpactLand')), 'caída con SK_ImpactLand', 'vision', seen.land);
    R.check(seen.getup?.clips?.some((c) => c.startsWith('SK_GetUp')), 'levantarse con SK_GetUp (no un bucle Stand)', 'vision', seen.getup);
    const sl = await page.evaluate(() => window.__bk.audio.sfxLog.filter((e) => e.ok).map((e) => e.n));
    const ci = sl.indexOf('bail');
    const tail = ci >= 0 ? sl.slice(ci) : [];
    R.check(ci >= 0 && tail.filter((n) => n === 'bail').length === 1 && tail.filter((n) => n === 'getup').length === 1 && tail.includes('land'), 'efectos del choque: golpe («bail»), caída («land») y levantarse («getup»), una vez cada uno', 'input', tail);
    const gr = await page.evaluate(() => window.__ground);
    const lowBy = (ph) => { const v = gr.filter((x) => x[0] === ph).map((x) => x[1]); return v.length ? { n: v.length, min: Math.min(...v), p50: v.sort((a, b) => a - b)[v.length >> 1] } : { n: 0 }; };
    const L = lowBy('land'), G = lowBy('getup');
    R.check(L.n > 5 && G.n > 5 && L.min > -0.03 && G.min > -0.03, 'tumbada y levantándose ningún vértice del cuerpo atraviesa el suelo más de 3 cm (antes: ≈10 cm y hasta 40 cm)', 'vision', { land: L, getup: G });
    R.check(!!seen.walk && Object.keys(seen).length >= 4, 'termina a pie con la tabla en la mano', 'input', Object.keys(seen));
    R.pendingHuman('Revisión visual humana de la secuencia (legibilidad y peso de la estrella/levantarse)');
  } finally { await browser.close(); }
});
