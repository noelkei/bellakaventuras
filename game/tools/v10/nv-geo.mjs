// V10 R4 · nv-geo · geometría de NOSVAMOSDEAQUÍ contra su contrato (`assets/derived/v10/nvda/nvda_kit.json`, del dossier v4; plan 20
// N-01…N-10, N-22…N-25, N-27, N-34). Marco local x tangencial (horario), y radial, h altura, con el eje del sector que da el JUEGO
// (`SECTOR_BY_ID.nosvamosdeaqui.axis`: 333° en V10). Todo por rayos verticales y sondas de forma contra los colliders reales:
//  · P1, M1, M2 a +3,40 (± 2 cm) lejos de bordes; E1: 19 huellas a k·0,17895 (± 2 cm); B1: perfil H(t)=1,7·(1−cos πt) (± 3 cm);
//  · C1 macizo; T1: techo a 1,49 y gálibo (de pie no cabe, agachada sí); R1: perfil del funbox (± 3 cm); G1: cota 0,9 en la herradura y
//    abierta en su boca; RG1: el tubo existe a lo largo de su eje (40 muestras, ± 6 cm);
//  · palmeras en sus anclas (tronco con colisión), cassette en (−12,5; 25,2) y las tres patatas fijas en sus superficies (± 0,3 m).
// Uso: node tools/v10/nv-geo.mjs --url v10 --task V10-R4 --label final
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('nv-geo');
const K = JSON.parse(fs.readFileSync('/Users/TU_USUARIO/Desktop/Bellakaventuras/assets/derived/v10/nvda/nvda_kit.json', 'utf8'));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    const M = await page.evaluate((K) => {
      const g = window.__bk, RA = window.__bkRapier, W0 = g.world, FL = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const A = window.__bkSectors.find((q) => q.id === 'nosvamosdeaqui').axis * Math.PI / 180, c = Math.cos(A), s = Math.sin(A);
      const W = (x, y, h = 0) => ({ x: x * c + y * s, y: h, z: x * s - y * c });
      const skip = (cc) => g.npcColliders.has(cc.handle) || cc === g.skater.collider;
      const top = (x, y, from = 8) => { const p = W(x, y); const h = W0.castRay(new RA.Ray({ x: p.x, y: from, z: p.z }, { x: 0, y: -1, z: 0 }), from + 2, true, FL, undefined, undefined, undefined, (cc) => !skip(cc)); return h ? +(from - h.timeOfImpact).toFixed(3) : null; };
      const solid = (x, y, h, r = 0.1) => { const p = W(x, y, h); return !!W0.intersectionWithShape({ x: p.x, y: h, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(r), FL, undefined, undefined, undefined, (cc) => !skip(cc)); };
      const capFree = (x, y, half, r = 0.4) => { const p = W(x, y); return !W0.intersectionWithShape({ x: p.x, y: half + r + 0.02, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Capsule(half, r), FL, undefined, undefined, undefined, (cc) => !skip(cc)); };
      const out = { axisDeg: +(A * 180 / Math.PI).toFixed(2) };
      // plataformas a +3,40 (rejilla interior a 0,35 m de los bordes)
      const flat = (box, lvl) => { let n = 0, worst = 0; const [x0, x1, y0, y1] = box; for (let x = x0 + 0.35; x <= x1 - 0.35; x += 0.5) for (let y = y0 + 0.35; y <= y1 - 0.35; y += 0.4) { const t = top(x, y, lvl + 1.0); if (t === null) { worst = 99; continue; } worst = Math.max(worst, Math.abs(t - lvl)); n++; } return { n, worst: +worst.toFixed(3) }; };
      out.P1 = flat(K.P1.box, 3.4); out.M1 = flat(K.M1.box, 3.4); out.M2 = flat(K.M2.box, 3.4);
      // E1: huella k (1…19) a k·contrahuella
      { const [x0, x1, y0] = K.E1.box, xc = (x0 + x1) / 2; let worst = 0; const bad = [];
        for (let k = 1; k <= K.E1.risers; k++) { const y = y0 + (k - 0.5) * K.E1.tread, t = top(xc, y, 5), e = k * K.E1.riser; const d = t === null ? 99 : Math.abs(t - e); worst = Math.max(worst, d); if (d > 0.02) bad.push({ k, t, e: +e.toFixed(3) }); }
        out.E1 = { worst: +worst.toFixed(3), bad: bad.slice(0, 5) }; }
      // B1: H(t) = 1,7·(1 − cos πt), t = (y − 28)/4,35
      { const [x0, x1, y0, y1] = K.B1.box, xc = (x0 + x1) / 2; let worst = 0; const bad = [];
        for (let i = 1; i < 20; i++) { const y = y0 + (y1 - y0) * i / 20, t = (y - y0) / (y1 - y0), e = 1.7 * (1 - Math.cos(Math.PI * t)), h = top(xc, y, 5); const d = h === null ? 99 : Math.abs(h - e); worst = Math.max(worst, d); if (d > 0.03) bad.push({ y: +y.toFixed(2), h, e: +e.toFixed(3) }); }
        out.B1 = { worst: +worst.toFixed(3), bad: bad.slice(0, 5) }; }
      // C1 macizo bajo el tablero
      { const [x0, x1, y0, y1] = K.C1.box; out.C1 = { solid: solid((x0 + x1) / 2, (y0 + y1) / 2, 1.5) && solid((x0 + x1) / 2, (y0 + y1) / 2, 3.0) }; }
      // T1: techo y gálibo
      { const [x0, x1, y0, y1] = K.T1.box, xc = (x0 + x1) / 2, yc = (y0 + y1) / 2; out.T1 = { roof: top(xc, yc, 4), floorUnder: top(xc, yc, 1.2), standFree: capFree(xc, yc, 0.45), crouchFree: capFree(xc, yc, 0.15, 0.35) }; }
      // R1: perfil a lo largo de x (local), en el centro radial
      { const [x0, , y0, y1] = K.R1.box, yc = (y0 + y1) / 2, P = K.R1.profile; let worst = 0; const bad = [];
        for (let i = 1; i < P.length - 1; i++) { const [u, e] = P[i], h = top(x0 + u, yc, 3); const d = h === null ? 99 : Math.abs(h - e); worst = Math.max(worst, d); if (d > 0.03) bad.push({ u, h, e }); }
        out.R1 = { worst: +worst.toFixed(3), bad }; }
      // G1: cota 0,9 en el anillo y boca abierta
      // ángulo del contrato: x = cx + r·cos a, y = cy + r·sin a, a ∈ [−142°, 142°] (abierta 76° hacia −x); perfil radial (r, h) curvo
      { const G = K.G1, [cx, cy] = G.center, prof = G.profile, hAt = (r) => { for (let i = 1; i < prof.length; i++) if (r <= prof[i][0]) { const [r0, h0] = prof[i - 1], [r1, h1] = prof[i]; return h0 + (h1 - h0) * (r - r0) / (r1 - r0); } return prof.at(-1)[1]; };
        const ring = []; let worst = 0;
        for (const ang of [-120, -60, 0, 60, 120]) for (const r of [1.8, 2.05, 2.3, 2.5]) { const t = ang * Math.PI / 180, h = top(cx + r * Math.cos(t), cy + r * Math.sin(t), 2), e = hAt(r); const d = h === null ? 99 : Math.abs(h - e); worst = Math.max(worst, d); if (d > 0.03) ring.push({ ang, r, h, e: +e.toFixed(3) }); }
        const mouth = []; for (const ang of [170, 180, 190]) { const t = ang * Math.PI / 180; mouth.push(top(cx + 2.05 * Math.cos(t), cy + 2.05 * Math.sin(t), 2)); }
        out.G1 = { worst: +worst.toFixed(3), ring: ring.slice(0, 6), mouth }; }
      // RG1: tubo a lo largo del eje
      { const P = K.rail.pts, miss = []; for (let i = 0; i < 40; i++) { const q = P[Math.round(i * (P.length - 1) / 39)]; if (!solid(q[0], q[1], q[2], 0.06)) miss.push(i); } out.RG1 = { miss }; }
      // palmeras: tronco con colisión cerca del ancla
      // V10.3 R4 (V-01/V-04, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_3-R4): las 3 palmeras de NVDA van en islas
      // (world/islas.ts): se comprueban en su sitio nuevo (palmeras del sector de NVDA), con su tronco sólido
      { const RA = window.__bkRapier, pl = g.park.propSlots.filter((s) => { const th = ((Math.atan2(s.x, -s.z) * 180 / Math.PI) + 360) % 360; return /palm/.test(s.kind) && Math.hypot(s.x, s.z) < 42 && (th >= 297 || th < 9); });   // (las palmeras de NVDA en el sector 297°–9°)
        out.palms = pl.length === 3 ? pl.map((s) => { let hit = false; g.world.intersectionsWithShape({ x: s.x, y: 1.0, z: s.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.35), (c) => { if (/trunk/.test(g.park.colliderNames.get(c.handle) ?? '')) hit = true; return true; }); return hit; }) : [false]; }
      // cassette y patatas fijas
      const cas = g.manifest.cassettes.find((k) => k.zone === 'nosvamosdeaqui'), cw = W(K.cassette[0], K.cassette[1]);
      out.cassette = cas ? +Math.hypot(cas.pos.x - cw.x, cas.pos.z - cw.z).toFixed(3) : null;
      out.fries = {}; for (const k of ['hidden', 'medium', 'visible']) { const f = g.manifest.fries.find((q) => q.id === `nosvamosdeaqui.${k}`), sf = K.fries[k].surface, w = W(sf[0], sf[1], sf[2]);
        out.fries[k] = f ? { d: +Math.hypot(f.pos.x - w.x, f.pos.z - w.z).toFixed(3), dy: +(f.pos.y - sf[2]).toFixed(3) } : null; }
      return out;
    }, K);
    R.measure('nv', M);
    R.check(Math.abs(M.axisDeg - 333) < 0.01, `eje de NVDA en el juego a 333° (giro de corona aplicado): ${M.axisDeg}`, 'static');
    for (const k of ['P1', 'M1', 'M2']) R.check(M[k].n > 4 && M[k].worst <= 0.02, `${k} a +3,40 (± 2 cm; ${M[k].n} rayos, peor ${M[k].worst})`, 'static', M[k]);
    R.check(M.E1.worst <= 0.02, `E1: 19 huellas a k·0,179 (± 2 cm; peor ${M.E1.worst})`, 'static', M.E1);
    R.check(M.B1.worst <= 0.03, `B1: perfil H(t) = 1,7·(1 − cos πt) (± 3 cm; peor ${M.B1.worst})`, 'static', M.B1);
    R.check(M.C1.solid, 'C1 macizo bajo el tablero', 'static', M.C1);
    R.check(Math.abs((M.T1.roof ?? 0) - 1.49) <= 0.02 && Math.abs(M.T1.floorUnder ?? 9) <= 0.02 && !M.T1.standFree && M.T1.crouchFree, `T1: techo a 1,49, suelo bajo él, de pie no cabe y agachada sí`, 'static', M.T1);
    R.check(M.R1.worst <= 0.03, `R1: perfil del funbox (± 3 cm; peor ${M.R1.worst})`, 'static', M.R1);
    R.check(M.G1.worst <= 0.03 && M.G1.mouth.every((h) => h === null || h < 0.05), `G1: perfil radial de la herradura (± 3 cm; peor ${M.G1.worst}) y boca abierta hacia −x`, 'static', M.G1);
    R.check(M.RG1.miss.length === 0, `RG1: el tubo existe a lo largo de su eje (40 muestras; faltan ${M.RG1.miss.length})`, 'static', M.RG1);
    R.check(M.palms.every(Boolean), `palmeras de NVDA (3) en sus islas con tronco sólido`, 'static', M.palms);
    R.check(M.cassette !== null && M.cassette <= 0.3, `cassette de NVDA en (−12,5; 25,2) (a ${M.cassette} m)`, 'static');
    for (const k of ['hidden', 'medium', 'visible']) { const f = M.fries[k]; R.check(!!f && f.d <= 0.3 && Math.abs(f.dy) <= 0.6, `patata ${k} en su superficie del dossier (${f ? f.d + ' m' : 'falta'})`, 'static', f); }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
