// V10 R2 · ext-circulacion · E-08 / E-09 (Bola de Oro §08, §08-B, §16 Distribución; `planos-v2/pasos-libres.json`).
//  1. Anillo r 42,8–46,8: barrido de la cápsula del controlador (r 0,4, alto 1,7) cada 0,5° y 0,1 m de radio: en TODOS los ángulos hay al
//     menos una posición libre y las franjas libres de ángulos consecutivos se solapan (paso continuo, 0 bloqueos).
//  2. Piezas de la maqueta: para cada obstáculo de `pasos-libres.json`, el radio mínimo de su colisión en el juego no invade el anillo más
//     que en el dossier (± 2 cm).
//  3. Cortes transversales CL-*: el intervalo libre que contiene el eje del anillo, medido con la cápsula a lo largo del corte, es ≥ el del
//     dossier − 5 cm.
//  4. Cuerpos del runtime retenidos (§08-B, 19 según el dossier: troncos y núcleos de arbusto de NMG/YY): se listan con su ancho de paso a
//     cada lado (desviación MEDIDA del anillo de 4 m) y se exige que ANMI pase (lado más ancho ≥ 1,2 m: cápsula 0,8 + 0,4).
// Uso: node tools/v10/ext-circulacion.mjs --url v10 --task V10-R2 --label final
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('ext-circulacion');
const DOS = '/Users/TU_USUARIO/Desktop/Bellakaventuras/referencias/escenarios/BOLA DE ORO/dossier-definitivo-v1-2026-10-17';
const PL = JSON.parse(fs.readFileSync(`${DOS}/anexos/planos-v2/pasos-libres.json`, 'utf8'));
// referencia física: las mallas NATIVAS de cada collider (bounds-objetos.json, como ext-geo). El polígono simplificado de pasos-libres
// difiere de la malla nativa hasta 8 cm en 6 piezas (p. ej. TS-B01: plinto nativo a r 53,131; pasos-libres 53,209): se anota
const BOUNDS = new Map(JSON.parse(fs.readFileSync(`${DOS}/anexos/maqueta-v28/bounds-objetos.json`, 'utf8')).map((o) => [o.name, o]));
const PARTS = JSON.parse(fs.readFileSync('/Users/TU_USUARIO/Desktop/Bellakaventuras/game/public/assets/bola/bola_colliders.json', 'utf8')).parts;
const nativeMinR = (id) => { let m = Infinity; for (const p of PARTS) { if (p.id !== id) continue; const o = BOUNDS.get(p.m); if (!o) continue; const [x0, , z0] = o.min_three, [x1, , z1] = o.max_three;
  const nx = x0 > 0 ? x0 : x1 < 0 ? x1 : 0, nz = z0 > 0 ? z0 : z1 < 0 ? z1 : 0; m = Math.min(m, Math.hypot(nx, nz)); } return m; };
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    const out = await page.evaluate((PL) => {
      const g = window.__bk, RA = window.__bkRapier, W = g.world, cap = new RA.Capsule(0.45, 0.4), FL = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const skip = (c) => g.npcColliders.has(c.handle) || c === g.skater.collider;
      const free = (x, z) => { const h = W.castRay(new RA.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 8, true, FL, undefined, undefined, undefined, (c) => !skip(c)); const y = h ? 6 - h.timeOfImpact : 0;
        if (y > 0.12) return false; return !W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, cap, FL, undefined, undefined, undefined, (c) => !skip(c)); };
      // 1. barrido del anillo
      const R0 = PL.ring_inner_radius, R1 = PL.ring_outer_radius, blocked = [], gaps = []; let prev = null;
      for (let a = 0; a < 360; a += 0.5) { const t = a * Math.PI / 180, iv = []; let st = null;
        for (let r = R0 + 0.4; r <= R1 - 0.4 + 1e-6; r += 0.1) { const f = free(r * Math.sin(t), -r * Math.cos(t)); if (f && st === null) st = r; if (!f && st !== null) { iv.push([st, r - 0.1]); st = null; } }
        if (st !== null) iv.push([st, R1 - 0.4]);
        if (!iv.length) blocked.push(a);
        else if (prev && !iv.some(([a0, a1]) => prev.some(([b0, b1]) => a0 <= b1 + 1e-6 && b0 <= a1 + 1e-6))) gaps.push(a);
        prev = iv; }
      // 2. radio mínimo por pieza de la maqueta (vértices de sus colliders)
      const minR = {}; W.forEachCollider((c) => { const id = g.park.bolaPartOf?.get(c.handle); if (!id) return; const v = c.shape.vertices, t = c.translation(); let m = Infinity;
        if (v) for (let i = 0; i < v.length; i += 3) m = Math.min(m, Math.hypot(v[i] + t.x, v[i + 2] + t.z)); else if (c.shape.radius !== undefined) m = Math.hypot(t.x, t.z) - c.shape.radius;
        minR[id] = Math.min(minR[id] ?? Infinity, m); });
      // 3. cortes transversales: intervalo libre que contiene el eje (r 44,8)
      // los cortes del dossier son intervalos de una RECTA entre huellas: sonda fina (cápsula de 2 cm de radio, alto 0,12–1,84 m)
      const thin = new RA.Capsule(0.85, 0.02), freeL = (x, z) => { const h = W.castRay(new RA.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 8, true, FL, undefined, undefined, undefined, (c) => !skip(c)); const y = h ? 6 - h.timeOfImpact : 0;
        if (y > 0.12) return false; return !W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, thin, FL, undefined, undefined, undefined, (c) => !skip(c)); };
      const cuts = PL.transverse_sections.map((s) => { const [x0, z0] = s.start, [x1, z1] = s.end, L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        let k = -1, best = Infinity; for (let d = 0; d <= L; d += 0.05) { const rr = Math.hypot(x0 + ux * d, z0 + uz * d); if (Math.abs(rr - PL.ring_radius) < best) { best = Math.abs(rr - PL.ring_radius); k = d; } }
        let a0 = k, a1 = k; while (a0 > 0 && freeL(x0 + ux * (a0 - 0.05), z0 + uz * (a0 - 0.05))) a0 -= 0.05; while (a1 < L && freeL(x0 + ux * (a1 + 0.05), z0 + uz * (a1 + 0.05))) a1 += 0.05;
        const who = (d) => { const x = x0 + ux * d, z = z0 + uz * d, h = W.castRay(new RA.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 8, true, FL, undefined, undefined, undefined, (c) => !skip(c)); const y = h ? 6 - h.timeOfImpact : 0;
          const c = W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, cap, FL, undefined, undefined, undefined, (c) => !skip(c)); return c ? (g.park.bolaPartOf?.get(c.handle) ?? g.park.colliderName(c.handle)) : (y > 0.12 ? `suelo ${y.toFixed(2)}` : null); };
        return { id: s.id, dossier: +s.clear_width_m.toFixed(2), juego: +(a1 - a0 + 0.04).toFixed(2), eje: freeL(x0 + ux * k, z0 + uz * k), lim: [who(a0 - 0.05), who(a1 + 0.05)], limDossier: s.all_free_intervals_m?.find((q) => q[0] <= Math.hypot(x0 + ux * k, z0 + uz * k) + 30)?.slice(2) }; });
      // 4. cuerpos del runtime en el anillo (no son de la maqueta)
      const kept = []; W.forEachCollider((c) => { if (skip(c) || c.isSensor() || g.park.bolaPartOf?.has(c.handle)) return; const n = g.park.colliderName(c.handle); if (n === 'ground') return;
        const t = c.translation(), v = c.shape.vertices; let rmin = Infinity, rmax = -Infinity, cx = t.x, cz = t.z;
        if (v) { cx = 0; cz = 0; for (let i = 0; i < v.length; i += 3) { const rr = Math.hypot(v[i] + t.x, v[i + 2] + t.z); rmin = Math.min(rmin, rr); rmax = Math.max(rmax, rr); cx += v[i] + t.x; cz += v[i + 2] + t.z; } cx /= v.length / 3; cz /= v.length / 3; }
        else { const rad = c.shape.radius ?? Math.max(c.shape.halfExtents?.x ?? 0, c.shape.halfExtents?.z ?? 0); const rr = Math.hypot(t.x, t.z); rmin = rr - rad; rmax = rr + rad; }
        if (rmax < R0 || rmin > R1) return;
        kept.push({ n, c: [+cx.toFixed(2), +cz.toFixed(2)], dentro: +(rmin - R0).toFixed(2), fuera: +(R1 - rmax).toFixed(2) }); });
      return { blocked, gaps, minR, cuts, kept };
    }, PL);
    R.measure('anillo', { bloqueados: out.blocked.length, cortes: out.gaps.length });
    R.check(out.blocked.length === 0 && out.gaps.length === 0, `anillo r 42,8–46,8: la cápsula pasa en los 720 ángulos con paso continuo (bloqueados ${out.blocked.length}, sin continuidad ${out.gaps.length})`, 'static', { bloqueados: out.blocked.slice(0, 12), cortes: out.gaps.slice(0, 12) });
    // la caja nativa da un radio mínimo ≤ al real en piezas giradas: el collider no puede invadir más que su caja nativa (− 2 cm)
    const inv = PL.obstacles.filter((o) => out.minR[o.id] !== undefined && out.minR[o.id] < Math.min(o.min_radius_m, nativeMinR(o.id)) - 0.02).map((o) => ({ id: o.id, dossier: +o.min_radius_m.toFixed(3), nativo: +nativeMinR(o.id).toFixed(3), juego: +out.minR[o.id].toFixed(3) }));
    const dif = PL.obstacles.filter((o) => out.minR[o.id] !== undefined && out.minR[o.id] < o.min_radius_m - 0.02).map((o) => `${o.id} ${o.min_radius_m.toFixed(3)}→${out.minR[o.id].toFixed(3)} (nativo ${nativeMinR(o.id).toFixed(3)})`);
    R.note(`piezas cuyo radio mínimo en el juego (= malla nativa) es menor que el polígono de pasos-libres: ${dif.length ? dif.join(' · ') : 'ninguna'}`);
    const miss = PL.obstacles.filter((o) => out.minR[o.id] === undefined).map((o) => o.id);
    R.check(inv.length === 0 && miss.length === 0, `piezas de la maqueta junto al anillo (${PL.obstacles.length}): ninguna invade más que en el dossier (± 2 cm); invaden ${inv.length}, sin collider ${miss.length}`, 'static', { inv: inv.slice(0, 8), miss: miss.slice(0, 8) });
    R.measure('cortes', out.cuts);
    const cb = out.cuts.filter((c) => !c.eje || c.juego < c.dossier - 0.05);
    R.check(cb.length === 0, `cortes transversales (${out.cuts.length}): eje libre y ancho ≥ dossier − 5 cm`, 'static', cb);
    R.measure('retenidos', out.kept);
    R.note(`§08-B · cuerpos del runtime en el anillo: ${out.kept.length} (dossier: 19). Desviación medida del anillo de 4 m: ${out.kept.map((k) => `${k.n}@${k.c.join(',')} (${k.dentro}/${k.fuera} m)`).join(' · ')}`);
    const narrow = out.kept.filter((k) => Math.max(k.dentro, k.fuera) < 1.2);
    // IT8 paso 2 (cambio de diseño aprobado V10.3 V-02, copia previa en V10/backups/pruebas/IT8-paso2/): las 19 plantas de fuera de r 42 se quitaron
    // (plantas-sitio exige que no haya ninguna): ya no se exige que queden cuerpos; si los hubiera, cada uno deja paso ≥ 1,2 m
    R.check(narrow.length === 0, `cuerpos retenidos del runtime (${out.kept.length}; 0 desde V10.3): a un lado queda paso ≥ 1,2 m (ANMI 0,8 + 0,4)`, 'static', narrow);
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
