// V10.2 · Q07 + R-07a/b/c + R-16 (usuario: «revisar que no haya grafitis que sobresalgan de las paredes»): ningún grafiti del parque ni de
// SKILLS asoma fuera de la superficie que lo lleva. Sonda: desde la parte VISIBLE de cada dibujo (alfa > 0,1 de su textura, rejilla
// baricéntrica por triángulo) se lanza un rayo a lo largo de su normal (en los dos sentidos: hay mallas de doble cara) contra las mallas
// VISIBLES cercanas (no las colisiones: la escalinata de NVDA tiene colisión en rampa); la superficie tiene que estar a ≤ 3 cm. Un punto
// a < 3 cm del borde de su cara que falla se acepta si 3 cm hacia dentro está bien (toca el borde, no asoma).
// SKILLS (R-07b): con ANMI en el centro de todas las zonas y anclas de bancos, mirando en 8 rumbos, cada sitio que `findSpot` acepta se
// prueba con la misma sonda (sin pintar).
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
const R = new Report('grafitis-pared');
export const PROBE = `window.__t102Probe = (() => {
  const g = window.__bk, T = window.__bkTHREE, THREE_clamp = (x) => Math.max(0, Math.min(1, x));
  let solids = null; const rc = new T.Raycaster();
  const getSolids = () => { if (solids) return solids; solids = []; g.scene.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isSprite || /GRAF+ITI|GRAFITI|MURAL|SKID|PAINT|SHADOW|SKY|CLOUD|NUBE|LOGO|ANMI|NPC/i.test(o.name)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m?.transparent && m.opacity < 0.9) return; let vis = o.visible; o.traverseAncestors((a) => { if (!a.visible) vis = false; }); if (vis) solids.push({ o, box: new T.Box3().setFromObject(o) }); }); return solids; };
  const alphaOf = (tex) => { const im = tex?.image, fy = tex?.flipY !== false; if (!im || !im.width) return null; const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data;
    return (u, v) => { u = Math.min(0.999, Math.max(0, u - Math.floor(u))); v = Math.min(0.999, Math.max(0, v - Math.floor(v))); return d[(Math.min(63, Math.floor((fy ? 1 - v : v) * 64)) * 64 + Math.min(63, Math.floor(u * 64))) * 4 + 3] / 255; }; };
  return (m, NB = 8) => {
    m.updateWorldMatrix(true, false); const bx = new T.Box3().setFromObject(m).expandByScalar(0.6), near = getSolids().filter((s) => s.box.intersectsBox(bx)).map((s) => s.o);
    // distancia del dibujo a la superficie que tiene DETRÁS: el rayo sale 5 cm por delante (lo que haya más lejos delante, como las placas de
    // una escalera atornillada a la pared, no cuenta) y busca la superficie hasta 10 cm; en los dos sentidos (mallas de doble cara)
    const gap = (p, n) => { let best = 9; for (const sg of [1, -1]) { rc.set(p.clone().addScaledVector(n, 0.05 * sg), n.clone().multiplyScalar(-sg)); rc.far = 0.15; const h = rc.intersectObjects(near, false)[0]; if (h) best = Math.min(best, Math.abs(h.distance - 0.05)); } return best; };
    const geo = m.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index, mat = Array.isArray(m.material) ? m.material[0] : m.material, A = alphaOf(mat?.map), nT = idx ? idx.count / 3 : pos.count / 3;
    let bad = 0, tot = 0, worst = 0; const pts = [], V = (i) => new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    for (let t = 0; t < Math.min(nT, 4000); t++) { const ii = [0, 1, 2].map((k) => idx ? idx.getX(t * 3 + k) : t * 3 + k), P = ii.map(V);
      const n = new T.Vector3().crossVectors(P[1].clone().sub(P[0]), P[2].clone().sub(P[0])); if (n.length() < 1e-9) continue; n.normalize();
      
      for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB - a; b++) { const w0 = a / NB, w1 = b / NB, w2 = 1 - w0 - w1;
        const p = P[0].clone().multiplyScalar(w0).addScaledVector(P[1], w1).addScaledVector(P[2], w2);
        if (A && uv && A(uv.getX(ii[0]) * w0 + uv.getX(ii[1]) * w1 + uv.getX(ii[2]) * w2, uv.getY(ii[0]) * w0 + uv.getY(ii[1]) * w1 + uv.getY(ii[2]) * w2) < 0.1) continue;
        tot++; let gp = gap(p, n);
        // toca el borde de su cara (la cara acaba ahí, a < 3 cm)
        // (o cae justo en la junta entre dos piezas: el rayo pasa por la rendija). Solo a < 3 cm de una arista de su triángulo y solo si 3 cm hacia
        // dentro sí hay superficie; un trozo de dibujo que asoma (SN 06/08) tiene puntos lejos de toda arista y no se salva así
        if (gp > 0.03) { const de = Math.min(...[[0, 1], [1, 2], [2, 0]].map(([i, j]) => { const ab = P[j].clone().sub(P[i]), t = THREE_clamp(p.clone().sub(P[i]).dot(ab) / ab.lengthSq()); return P[i].clone().addScaledVector(ab, t).distanceTo(p); }));
          if (de < 0.03) { const c = P[0].clone().add(P[1]).add(P[2]).divideScalar(3), [i, j] = [[0, 1], [1, 2], [2, 0]].reduce((m, e) => { const ab = P[e[1]].clone().sub(P[e[0]]), t = THREE_clamp(p.clone().sub(P[e[0]]).dot(ab) / ab.lengthSq()), d = P[e[0]].clone().addScaledVector(ab, t).distanceTo(p); return d < m.d ? { d, e } : m; }, { d: 9, e: [0, 1] }).e;
            // 3 cm hacia dentro, en perpendicular a la arista más cercana (hacia el centro del triángulo)
            const ab = P[j].clone().sub(P[i]), cp = P[i].clone().addScaledVector(ab, THREE_clamp(c.clone().sub(P[i]).dot(ab) / ab.lengthSq())), inw = c.clone().sub(cp);
            if (inw.length() > 1e-6) { const q = p.clone().addScaledVector(inw.normalize(), 0.03); if (gap(q, n) <= 0.03) gp = 0; } } }
        if (gp > 0.03) { bad++; worst = Math.max(worst, gp); if (pts.length < 4) pts.push([p.x, p.y, p.z, n.x, n.y, n.z].map((v) => +v.toFixed(4))); } } }
    return { name: m.name, tot, bad, worst: +worst.toFixed(2), pts, alpha: !!A };
  };
})();`;
await runTest(R, async () => {
  const b = await launch();
  const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(2500);
  await page.evaluate(PROBE);
  // 1 · los del parque
  const park = await page.evaluate(async () => {
    const g = window.__bk, ms = []; g.scene.traverse((o) => { if (o.isMesh && /GRAF+ITI|GRAFITI/i.test(o.name) && !/^SKILL_GRAFFITI/.test(o.name) && !/_WALL$/.test(o.name)) { let vis = o.visible; o.traverseAncestors((a) => { if (!a.visible) vis = false; }); if (vis) ms.push(o); } });
    for (let k = 0; k < 40 && !ms.every((m) => { const mt = Array.isArray(m.material) ? m.material[0] : m.material; return !mt.map || mt.map.image?.width; }); k++) await new Promise((r) => setTimeout(r, 250));
    return ms.map((m) => window.__t102Probe(m)); });
  R.measure('parque', park);
  R.nonEmpty(park, 'grafitis del parque');
  for (const r of park) R.check(r.bad === 0 && (r.tot > 0), `${r.name}: ${r.tot} puntos visibles, ${r.bad} fuera de su superficie${r.bad ? ` (hasta ${r.worst} m: ${JSON.stringify(r.pts)})` : ''}`, 'fixture', r.bad ? r : undefined);
  R.check(!park.some((r) => /SN_GRAFFITI_0[68]/.test(r.name)) && park.filter((r) => /^SN_GRAFFITI/.test(r.name)).length === 8, `SN: 8 grafitis, sin el 06 y el 08 (D-SN-05 → 8): ${park.filter((r) => /^SN_GRAFFITI/.test(r.name)).map((r) => r.name.slice(-2)).join(',')}`, 'fixture');
  // 2 · SKILLS: todos los sitios que el juego aceptaría
  const spots = await page.evaluate(async () => {
    const g = window.__bk, f = g.activities.find((a) => a.id === 'freeDance'); const mats = [0, 1, 2, 3].map((i) => f.gMat(i)); for (let k = 0; k < 40 && !mats.every((m) => m.map?.image?.width); k++) await new Promise((r) => setTimeout(r, 250));
    return [...g.park.zones.values()].map((z) => z.pos.toArray()).concat([...g.manifest.anchors.entries()].filter(([k]) => /bench\.sit|spawn|llegada/.test(k)).map(([, a]) => a.pos.toArray())); });
  const sk = { tried: 0, out: [] };
  for (const p0 of spots) {
    const r = await page.evaluate((p0) => {
      const g = window.__bk, T = window.__bkTHREE, f = g.activities.find((a) => a.id === 'freeDance'), s = g.skater, out = []; let tried = 0, seen = new Set();
      for (let h8 = 0; h8 < 8; h8++) { const h = h8 * Math.PI / 4; s.teleport(new T.Vector3(...p0), h, 'walk'); s.heading = h;
        for (const i of [0, 3]) { tried++; const sp = f.findSpot(i); if (typeof sp === 'string') continue; const key = sp.p.map((v) => v.toFixed(1)).join(',') + i; if (seen.has(key)) continue; seen.add(key);
          const A = [0.6855, 1.0354, 0.8809, 2.3011][i], m = new T.Mesh(new T.PlaneGeometry(sp.s * A, sp.s), f.gMat(i));
          const n = new T.Vector3(...sp.n).normalize(), u = new T.Vector3(...sp.u).normalize(), rr = new T.Vector3().crossVectors(u, n).normalize(), u2 = new T.Vector3().crossVectors(n, rr);
          m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(rr, u2, n)); m.position.set(...sp.p); m.name = `SKILL_${i + 1}@${sp.p.map((v) => v.toFixed(1)).join(',')}`; m.updateMatrixWorld(true);
          const res = window.__t102Probe(m, 6); res.wall = Math.abs(n.y) < 0.5; out.push(res); m.geometry.dispose(); } }
      return { tried, out }; }, p0);
    sk.tried += r.tried; sk.out.push(...r.out); }
  const bad = sk.out.filter((r) => r.bad > 0);
  R.measure('skills', { tried: sk.tried, ok: sk.out.length, bad });
  R.check(sk.out.length >= 20, `SKILLS: ${sk.out.length} sitios aceptados de ${sk.tried} pruebas (pared ${sk.out.filter((r) => r.wall).length}, suelo ${sk.out.filter((r) => !r.wall).length})`, 'fixture');
  R.check(bad.length === 0, `SKILLS: ningún grafiti aceptado asoma (${bad.length} asoman${bad.length ? ': ' + bad.slice(0, 6).map((r) => `${r.name} ${r.bad}/${r.tot} ${r.worst} m`).join(' · ') : ''})`, 'fixture');
  await page.close(); await b.close();
}, { timeoutMs: 900000 });
