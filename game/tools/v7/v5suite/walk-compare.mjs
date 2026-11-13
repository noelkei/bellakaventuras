// R2-G8 (usuario, 12 oct) · Comparación de la MARCHA de ANMI: misma escena, misma cámara lateral que la sigue, entrada real
// (W sostenida) a la velocidad normal de andar (walkMax del juego) y lenta (walkMax forzado a 1,2 m/s por fixture declarada).
// Graba vídeo (screencast) y mide por fotograma, en el marco de ANMI: altura máxima de cada pie sobre el suelo, cuánto se
// adelanta el pie por delante de la cadera, alabeo y apertura del pie en apoyo, y qué clips suenan. Uso:
//   node tools/v5/walk-compare.mjs --url A|v5 --label <etiqueta>
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, recordClip, SAVE_20, r3, arg } from '../lib.mjs';
const R = new Report('walk-compare');
const CASES = { normal: null, lento: 1.2 };
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [cs, vmax] of Object.entries(CASES)) {
      const page = await openGame(b, R, { viewport: { width: 1100, height: 700 }, save: SAVE_20 });
      await clickStart(page); await sleep(800);
      await fixture(page, R, `${cs}: plaza abierta, rumbo +X, cámara lateral fija al cuerpo${vmax ? `, walkMax ${vmax}` : ''}`, (vmax) => {
        const g = window.__bk, T = window.__bkTHREE, s = g.skater;
        if (vmax) window.__bkTuning.walkMax = vmax;
        s.teleport(new T.Vector3(-30, 0, 30), Math.PI / 2, 'walk'); g.input.clear();
        for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
        const V = g.visual, bone = (re) => { let o = null; V.model.traverse((x) => { if (!o && x.isBone && re.test(x.name)) o = x; }); return o; };
        const B = { fL: bone(/LeftFoot$/), fR: bone(/RightFoot$/), tL: bone(/LeftToeBase$/), tR: bone(/RightToeBase$/), hips: bone(/Hips$/) };
        const orig = g.rig.update.bind(g.rig), cam = g.rig.cam;
        window.__wc = { rows: [] };
        g.rig.update = (...a) => {
          orig(...a);
          const p = V.root.position, h = s.headingVis ?? s.heading, fx = Math.sin(h), fz = Math.cos(h);
          cam.position.set(p.x - fz * 3.4 + fx * 0.3, 0.95, p.z + fx * 3.4 + fz * 0.3); cam.lookAt(p.x + fx * 0.3, 0.75, p.z + fz * 0.3);
          const v = new T.Vector3(), q = (o) => o.getWorldPosition(v.clone());
          const hp = q(B.hips), row = { t: +g.clock.toFixed(3), v: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), clip: V.currentName, hy: +hp.y.toFixed(3) };
          { let lo = Infinity; const tv = new T.Vector3(); for (const i of (V.soleIdx ?? [])) { V.body.getVertexPosition(i, tv).applyMatrix4(V.body.matrixWorld); if (tv.y < lo) lo = tv.y; } row.sole = Number.isFinite(lo) ? +lo.toFixed(3) : null; }
          for (const k of ['L', 'R']) { const f = q(B['f' + k]), t = q(B['t' + k]);
            row['y' + k] = +f.y.toFixed(3); row['x' + k] = +f.x.toFixed(4); row['z' + k] = +f.z.toFixed(4); row['fw' + k] = +((f.x - hp.x) * fx + (f.z - hp.z) * fz).toFixed(3);
            const d = t.clone().sub(f); row['yaw' + k] = +(Math.atan2(d.x * fz - d.z * fx, d.x * fx + d.z * fz) * 180 / Math.PI).toFixed(1); }
          window.__wc.rows.push(row);
        };
        return { ok: true, walkMax: window.__bkTuning.walkMax };
      }, vmax);
      await sleep(300);
      await recordClip(page, R, cs, async () => { await page.keyboard.down('KeyW'); await sleep(3200); await page.keyboard.up('KeyW'); await sleep(400); }, { maxWidth: 900 });
      const rows = await page.evaluate(() => window.__wc.rows);
      const st = rows.filter((r) => r.t > rows[0].t + 1.0 && r.v > 0.5);   // régimen
      const y0 = Math.min(...st.map((r) => Math.min(r.yL, r.yR)));
      const agg = { n: st.length, vMed: r3(st.reduce((a, r) => a + r.v, 0) / Math.max(1, st.length)), clips: [...new Set(st.map((r) => r.clip))],
        alturaPieMax_m: r3(Math.max(...st.map((r) => Math.max(r.yL, r.yR))) - y0), adelantoPieMax_m: r3(Math.max(...st.map((r) => Math.max(r.fwL, r.fwR)))),
        atrasPieMax_m: r3(-Math.min(...st.map((r) => Math.min(r.fwL, r.fwR)))),
        boteCadera_m: r3(Math.max(...st.map((r) => r.hy)) - Math.min(...st.map((r) => r.hy))), caderaMedia_m: r3(st.reduce((a, r) => a + r.hy, 0) / Math.max(1, st.length)),
        sueloMin_m: r3(Math.min(...st.filter((r) => r.sole != null).map((r) => r.sole))) };
      // patinaje robusto: velocidad horizontal del TOBILLO del pie de apoyo (el más bajo de los dos, a ≤ 3 cm de su mínimo)
      { const sp = [];
        for (let i = 1; i < st.length; i++) { const a0 = st[i - 1], a1 = st[i], dt = a1.t - a0.t; if (dt <= 0) continue;
          const k = a1.yL < a1.yR ? 'L' : 'R'; if (a1['y' + k] > y0 + 0.03) continue;
          sp.push(Math.hypot(a1['x' + k] - a0['x' + k], a1['z' + k] - a0['z' + k]) / dt); }
        sp.sort((x, y) => x - y); agg.tobilloApoyo_mps_mediana = r3(sp[Math.floor(sp.length / 2)] ?? NaN); agg.tobilloApoyo_n = sp.length; }
      R.measure(`${cs}: marcha`, agg); R.measure(`${cs}: filas`, rows.slice(0, 400));
      R.check(st.length > 20, `${cs}: régimen de marcha medido (${st.length} fotogramas)`, 'emulation', agg);
      // R2-G8: referencia V4 medida con esta misma prueba (walk-compare_A_b): adelanto 0,306, atraso 0,362, pie 0,185, bote 0,07
      if (arg('url', 'v5') !== 'A') {
        const V4 = { adelanto: 0.306, atras: 0.362, pie: 0.185, bote: 0.070 };
        R.check(Math.abs(agg.adelantoPieMax_m - V4.adelanto) <= 0.02 && Math.abs(agg.atrasPieMax_m - V4.atras) <= 0.02, `${cs}: zancada de V4 (adelanto ${agg.adelantoPieMax_m} / atraso ${agg.atrasPieMax_m} m; V4 ${V4.adelanto} / ${V4.atras})`, 'emulation', agg);
        R.check(agg.alturaPieMax_m <= V4.pie + 0.03 && agg.boteCadera_m <= V4.bote + 0.02, `${cs}: sin «patadas» ni rebote extra (pie ${agg.alturaPieMax_m} m ≤ V4 + 3 cm; bote ${agg.boteCadera_m} m ≤ V4 + 2 cm)`, 'emulation', agg);
        R.check(agg.sueloMin_m >= -0.02 && agg.clips.every((c) => c === 'SK_WalkBoard'), `${cs}: solo la marcha (sin trote) y suela sin hundirse > 2 cm`, 'emulation', agg);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
