// V8 · yy-contract + yy-ground: lo construido contra el contrato (planta v24, T1 v2, yy_kit.json) MEDIDO en la build servida con
// rayos físicos (Rapier) y visuales (three), sin teletransportes que lo condicionen. Rotación única y encaje · niveles N1/N2/N3 y
// ninguna otra meseta (sin N1b/R4) · E1 (5 × 0,20 / 4 × 0,28) · desarrollo de R1/R3 (0,30) y R2 (0,45) · borde vertical ≥ 0,80 a
// 90° con pie curvo · P1 Ø4,60 a 0 y T1 Ø2 / 7,60 con remate a 45° · sin tapa a 0 ni plano a −0,035 sobre el vaso (física y vista)
// · deck a 0 alrededor · K del rótulo sobre el eje de T1.
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
import { W, KIT, loc } from './yy-lib.mjs';
const R = new Report('yy-contract');
const LAYOUT = JSON.parse(fs.readFileSync(new URL('../../../referencias/escenarios/YINYANG/arquitectura-definitiva-2026-10-15/planta-v24/layout.json', import.meta.url)));
const HDR = JSON.parse(fs.readFileSync(new URL('../../public/assets/yy/yy_pool.json', import.meta.url)));
/** rayo vertical (física): cota y collider del primer apoyo bajo (x, v) local */
const down = (page, pts) => page.evaluate((pts) => { const g = window.__bk, RA = window.__bkRapier;
  return pts.map(([x, z]) => { const h = g.world.castRayAndGetNormal(new RA.Ray({ x, y: 3, z }, { x: 0, y: -1, z: 0 }), 8, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
    return h ? { y: +(3 - h.timeOfImpact).toFixed(4), ny: +h.normal.y.toFixed(3), n: g.park.colliderName(h.collider.handle) } : null; }); }, pts.map(([x, v]) => { const w = W(x, v); return [w[0], w[2]]; }));
/** rayo vertical VISUAL: primer objeto de la escena bajo (x, v) */
const downVis = (page, pts) => page.evaluate((pts) => { const g = window.__bk, T = window.__bkTHREE, rc = new T.Raycaster(); rc.far = 8; rc.camera = g.rig.cam;
  return pts.map(([x, z]) => { rc.set(new T.Vector3(x, 3, z), new T.Vector3(0, -1, 0)); const hit = rc.intersectObject(g.park.root, true).find((h) => h.object.visible && !/AREA_|FRY|blob/i.test(h.object.name)); return hit ? { y: +hit.point.y.toFixed(3), o: hit.object.name.slice(0, 30) } : null; }); }, pts.map(([x, v]) => { const w = W(x, v); return [w[0], w[2]]; }));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1200);
    // --- rotación única, marco y encaje
    const su = LAYOUT.sampled_outline_unrotated, so = LAYOUT.sampled_outline;
    const probeErr = await page.evaluate(() => window.__bk.log.filter((l) => /YY|sonda/.test(l)));
    // «una sola vez»: W(contorno SIN rotar) debe caer exactamente donde el marco SOLO (sin rotar otra vez) lleva `sampled_outline`, que el plano ya giró
    const th0 = KIT.frame.axis_deg * Math.PI / 180, sn = Math.sin(th0), cs = Math.cos(th0);
    const OV = KIT.frame.offsetV ?? 0, frameOnly = (x, v0) => { const v = v0 + OV; return frameOnlyR(x, v); }, frameOnlyR = (x, v) => KIT.frame.handedness === 'plan_top_view' ? [v * sn + x * cs, -v * cs + x * sn] : [v * sn - x * cs, -v * cs - x * sn];
    let maxE = 0; for (let i = 0; i < su.length; i += 7) { const w = W(su[i][0], su[i][1]), f = frameOnly(so[i][0], so[i][1]); maxE = Math.max(maxE, Math.hypot(w[0] - f[0], w[2] - f[1])); }
    const ws = su.filter((_, i) => i % 5 === 0).map(([x, v]) => W(x, v)), rr = ws.map((w) => Math.hypot(w[0], w[2])), th = ws.map((w) => ((Math.atan2(w[0], -w[2]) * 180 / Math.PI) + 360) % 360);
    R.check(maxE < 2e-3 && probeErr.length === 0 && Math.min(...rr) > 25 && Math.max(...rr) < 38 && Math.max(...th.map((t) => Math.abs(t - 252))) < 36, 'rotación de 4° aplicada una sola vez (ida y vuelta exacta), sondas de la receta = runtime, vaso dentro de la banda r 25–38 y del sector', 'static', { maxE, rmin: Math.min(...rr).toFixed(3), rmax: Math.max(...rr).toFixed(3), dTheta: Math.max(...th.map((t) => Math.abs(t - 252))).toFixed(2), probeErr });
    // el desplazamiento de 1 m es en v de la planta (≈ radial): en los puntos fuera del eje suma algo menos de 1 m de radio
    R.check(Math.abs(Math.min(...rr) - (LAYOUT.fit.r_min + OV)) < 0.05 && Math.abs(Math.max(...rr) - (LAYOUT.fit.r_max + OV)) < 0.05, `encaje medido = el del plano desplazado ${OV} m hacia fuera (R1 usuario): r ${(LAYOUT.fit.r_min + OV).toFixed(2)}–${(LAYOUT.fit.r_max + OV).toFixed(2)}`, 'static', { rmin: Math.min(...rr), rmax: Math.max(...rr) });
    // --- niveles
    const lv = await down(page, [[-6.0, 31.0], [-2.5, 33.8], [6.0, 33.3], [3.0, 28.0], [-2.0, 28.5], [6.5, 29.0]]);
    R.check(near(lv[0].y, -1) && near(lv[1].y, -1.75) && near(lv[2].y, -1) && [3, 4, 5].every((i) => near(lv[i].y, -1.75)) && lv.every((h) => h.n === 'yy_shell'), 'dos niveles (R1/R2 usuario): N1 −1,00 junto a E1 y a la derecha de T1; N2 −1,75 en el resto del fondo (rayos físicos sobre la colisión del vaso)', 'static', lv);
    // ninguna otra meseta: rejilla de 0,25 m dentro del vaso; las mesetas planas solo a {0, −0,2, −0,4, −0,6, −0,8, −1, −1,75, −2,5}
    const grid = []; for (let x = -8.9; x < 9.2; x += 0.25) for (let v = 26.0; v < 35.2; v += 0.25) grid.push([x, v]);
    const gh = await down(page, grid); const allowed = [0, -0.2, -0.4, -0.6, -0.8, -1, -1.75];
    // meseta = punto horizontal cuyos vecinos de la rejilla (±0,25 m en x y en v) están a la MISMA cota (±2 mm): las colas tangentes
    // de las curvas (pie de rampa, pie de pared) no son mesetas
    const NV = Math.round((35.2 - 26.0) / 0.25 + 0.5), at = (i, j) => gh[i * NV + j];
    const flats = []; gh.forEach((h, k) => { if (!h || h.ny <= 0.9995 || !(h.n === 'yy_shell' || h.n === 'yy_stairs')) return; const i = Math.floor(k / NV), j = k % NV;
      const nb = [at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)].filter(Boolean); if (nb.length === 4 && nb.every((q) => Math.abs(q.y - h.y) < 0.002)) flats.push(h.y); });
    const odd = flats.filter((y) => !allowed.some((a) => Math.abs(a - y) < 0.012));
    R.check(odd.length <= flats.length * 0.004, 'sin otras mesetas (no hay N1b ni R4): toda superficie horizontal del vaso está en una cota del contrato', 'static', { horizontales: flats.length, fuera: odd.length, ejemplos: [...new Set(odd.map((y) => y.toFixed(2)))].slice(0, 8) });
    // --- E1
    const line = []; for (let x = -8.95; x <= -7.55; x += 0.01) line.push([x, 31.45]);
    // R1 usuario: la COLISIÓN de E1 es una rampa (subida a ritmo normal): los peldaños se miden en la malla visible y la rampa física
    // debe enrasar con el deck arriba y con N1 abajo
    const eh = await downVis(page, line); const ephys = await down(page, [[-8.97, 31.45], [-7.6, 31.45]]); const steps = []; let last = null;
    eh.forEach((h, i) => { if (!h) return; const y = Math.round(h.y * 100) / 100; if (last === null || Math.abs(y - last) > 0.05) steps.push({ x: +line[i][0].toFixed(2), y }); last = y; });
    const ys = steps.map((s) => s.y), xs = steps.slice(1).map((s) => s.x), goings = xs.slice(1).map((x, i) => +(x - xs[i]).toFixed(2));
    R.check(ys.length === 6 && [0, -0.2, -0.4, -0.6, -0.8, -1].every((y, i) => Math.abs(ys[i] - y) <= 0.015) && goings.slice(0, 4).every((g) => Math.abs(g - 0.28) <= 0.02) && ephys[0] && Math.abs(ephys[0].y) < 0.07 && ephys[1] && Math.abs(ephys[1].y + 1) < 0.03, 'E1: cinco contrahuellas de 0,20 y cuatro huellas de 0,28 a la vista (paralelas al eje de T1); colisión en rampa enrasada con el deck y con N1', 'static', { steps, goings, fisica: ephys });
    // --- perfiles de rampa: desarrollo horizontal entre el 3 % y el 97 % de la caída, perpendicular a la frontera
    const prof = async (id) => { const t = LAYOUT.architectural_transitions.find((q) => q.id === id), b0 = t.boundary;
      const bd = b0.length >= 5 ? b0 : Array.from({ length: 21 }, (_, i) => [b0[0][0] + (b0[1][0] - b0[0][0]) * i / 20, b0[0][1] + (b0[1][1] - b0[0][1]) * i / 20]);
      const m = bd[Math.floor(bd.length / 2)], m2 = bd[Math.floor(bd.length / 2) + 2];
      const tg = [m2[0] - m[0], m2[1] - m[1]], L = Math.hypot(...tg), n = [-tg[1] / L, tg[0] / L]; const pts = []; for (let s = -0.6; s <= 0.8; s += 0.005) pts.push([m[0] + n[0] * s, m[1] + n[1] * s]);
      const hs = (await down(page, pts)).map((h) => h?.y ?? NaN); const hi = Math.max(...hs), lo = Math.min(...hs), dz = hi - lo;
      const sOf = (frac) => { const target = hi - dz * frac; let best = 0; hs.forEach((y, i) => { if (Math.abs(y - target) < Math.abs(hs[best] - target)) best = i; }); return best * 0.005; };
      return { id, drop: +dz.toFixed(3), run: +Math.abs(sOf(0.97) - sOf(0.03)).toFixed(3) }; };
    const rp = [await prof('R1'), await prof('R2'), await prof('R3b')];
    R.check(rp.every((r) => near(r.drop, 0.75, 0.02) && r.run > 0.5 && r.run < 0.8), 'rampas R1, R2 y R3b (R1 usuario): caen 0,75 (N1 → N2) en ≈ 0,70 m de desarrollo (perfil «walk», subible a pie); R3a no existe', 'static', rp);
    // --- borde: tramo vertical ≥ 0,80 a 90° (rayos horizontales hacia la pared a distintas alturas) y pie curvo
    const wall = await page.evaluate((cases) => { const g = window.__bk, RA = window.__bkRapier;
      return cases.map(([o, d]) => { const out = []; for (const y of [-0.05, -0.2, -0.4, -0.6, -0.78]) { const h = g.world.castRay(new RA.Ray({ x: o[0], y, z: o[2] }, { x: d[0], y: 0, z: d[1] }), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); out.push(h ? +h.timeOfImpact.toFixed(3) : null); } return out; }); },
      [[[1.5, 27.6], [0, -1]], [[7.5, 30.2], [1, 0]], [[-2.5, 33.4], [0, 1]], [[1.4, 29.0], [0, 1]]].map(([p, d]) => { const o = W(p[0], p[1]), q = W(p[0] + d[0], p[1] + d[1]); return [o, [q[0] - o[0], q[2] - o[2]]]; }));
    R.check(wall.every((row) => row.every((t) => t !== null) && Math.max(...row) - Math.min(...row) < 0.02), 'borde: pared vertical continua de 0 a −0,80 (las cinco alturas tocan a la misma distancia ±2 cm) en el fondo N2, los lóbulos y P1', 'static', wall);
    // --- P1 y T1
    const c = KIT.p1.center, pr = KIT.p1.r; const p1 = await down(page, [[c[0], c[1] - (pr - 0.08)], [c[0], c[1] - (pr + 0.1)], [c[0] + 1.2, c[1]], [c[0] - (pr - 0.08), c[1]], [c[0] - (pr + 0.1), c[1]]]);
    R.check(near(p1[0].y, 0) && p1[1].y < -0.79 && near(p1[2].y, 0) && near(p1[3].y, 0) && p1[4].y < -0.79, `P1 a cota 0 hasta r ${pr} (R1 usuario: +0,50) y vaso al otro lado del borde`, 'static', p1);
    const t1 = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, t = g.park.root.getObjectByName('YY_T1'); const bb = new T.Box3().setFromObject(t.getObjectByName('YY_T1_Shaft'), true).union(new T.Box3().setFromObject(t.getObjectByName('YY_T1_HeadShell'), true)); const cap = t.getObjectByName('YY_T1_InclinedCap').geometry.attributes.position; let zMin = 9, zMax = -9, front = null, back = null;
      for (let i = 1; i < cap.count; i++) { const y = cap.getY(i), z = cap.getZ(i); if (y < zMin) { zMin = y; back = z; } if (y > zMax) { zMax = y; front = z; } }
      let col = null; g.world.forEachCollider((cl) => { if (g.park.colliderName(cl.handle) === 'yy_t1') col = { r: cl.shape.radius, hh: cl.shape.halfHeight }; });
      return { h: +(bb.max.y - bb.min.y).toFixed(3), w: +Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z).toFixed(3), capHi: +zMax.toFixed(3), capLo: +zMin.toFixed(3), frontZ: +front.toFixed(3), backZ: +back.toFixed(3), col }; });
    const TH = KIT.t1.height;
    R.check(near(t1.h, TH, 0.03) && t1.w < 2.06 && t1.w > 1.98 && near(t1.capHi, TH - 0.015, 0.01) && near(t1.capLo, TH - 1.985, 0.01) && t1.frontZ > 0.9 && t1.backZ < -0.9 && t1.col && near(t1.col.r, 1, 0.001) && near(t1.col.hh * 2, TH, 0.001), `T1 (R1–R2 usuario): Ø2, alto ${TH} sin tramo blanco, remate entero a 45° y colisión cilíndrica Ø2 × ${TH}`, 'static', t1);
    // --- sin tapa: ni física ni visual sobre el vaso; deck a 0 alrededor
    // muestras sobre el borde CONSTRUIDO (tabla del borde de yy_pool.json: punto, normal hacia dentro, pie de la curva; solo tramos de pared)
    const WR = HDR.wallRide.pts.filter((q, k) => q[7] > 0.5 && k % 9 === 0);
    const downW = (pts) => page.evaluate((pts) => { const g = window.__bk, RA = window.__bkRapier;
      return pts.map(([x, z]) => { const h = g.world.castRayAndGetNormal(new RA.Ray({ x, y: 3, z }, { x: 0, y: -1, z: 0 }), 8, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
        return h ? { y: +(3 - h.timeOfImpact).toFixed(4), n: g.park.colliderName(h.collider.handle) } : null; }); }, pts);
    const downWVis = (pts) => page.evaluate((pts) => { const g = window.__bk, T = window.__bkTHREE, rc = new T.Raycaster(); rc.far = 8; rc.camera = g.rig.cam;
      return pts.map(([x, z]) => { rc.set(new T.Vector3(x, 3, z), new T.Vector3(0, -1, 0)); const hit = rc.intersectObject(g.park.root, true).find((h) => h.object.visible && !/AREA_|FRY|blob/i.test(h.object.name)); return hit ? { y: +hit.point.y.toFixed(3), o: hit.object.name.slice(0, 30) } : null; }); }, pts);
    const inner = WR.map((q) => [q[0] + q[2] * (q[6] + 0.35), q[1] + q[3] * (q[6] + 0.35)]);
    const ip = (await downW(inner)).filter(Boolean), iv = (await downWVis(inner)).filter(Boolean);
    const lidP = ip.filter((h) => h.y > -0.5 && h.n !== 'yy_t1'), lidV = iv.filter((h) => h.y > -0.5 && !/YY_T1|P1/.test(h.o));
    R.check(lidP.length === 0 && lidV.length === 0, 'sin tapa: ningún apoyo físico ni superficie visible a 0 o −0,035 dentro del vaso (junto a cada tramo de pared construido)', 'static', { muestras: inner.length, fisico: lidP.slice(0, 4), visual: lidV.slice(0, 4) });
    const outer = WR.map((q) => [q[0] - q[2] * 0.6, q[1] - q[3] * 0.6]);
    const op = (await downW(outer)).filter(Boolean);
    R.check(op.length === outer.length && op.every((h) => Math.abs(h.y) < 0.003), 'deck a cota 0 alrededor del vaso (apoyo real, sin huecos), a 0,6 m por fuera de cada tramo de pared', 'static', { n: op.length, malos: op.filter((h) => Math.abs(h.y) >= 0.003).slice(0, 5) });
    // --- logo: K sobre el eje de T1 y ancho visible 6,00
    const L = KIT.logo, mpp = L.visibleWidth / (L.visiblePx[2] - L.visiblePx[0]), kx = (L.K_axis_x - L.K_px * mpp) + L.K_px * mpp;
    R.check(near(kx, KIT.p1.center[0], 1e-9) && near((L.visiblePx[2] - L.visiblePx[0]) * mpp, 6.0, 1e-9) && near(L.png[0] / L.png[1], 1991 / 790, 1e-9), 'rótulo: la K (tallo medido en el PNG nuevo, x 925 px) cruza el eje de T1; ancho visible 6,00 m con la proporción del PNG original', 'static', { kx, alto_m: +(L.png[1] * mpp).toFixed(3) });
    R.measure('cabecera_yy_pool', { stats: HDR.stats, removed: HDR.removedTiles, version: HDR.version, frame: HDR.frame });
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
function near(a, b, t = 0.012) { return Math.abs(a - b) <= t; }
