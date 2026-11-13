// V10.1 R0 (R2 del análisis) · Sonda de CARAS de todo el mapa (mallas cargadas en la escena, sin NPC ni ANMI ni cielo):
//  A · orientación incoherente: en cada malla (vértices soldados a 1 mm), una arista recorrida DOS veces en el mismo sentido por dos
//      triángulos = una cara dada la vuelta respecto a sus vecinas (con FrontSide no se ve desde donde debería: G1 de NVDA).
//  B · caras COPLANARES que se solapan (mismo plano ±3 mm, misma orientación visible, área común > 50 cm²) en mallas o triángulos distintos y
//      sin polygonOffset: parpadean (z-fighting). Vigas del puente de NVDA, M1/M2, suelos 1 mm encima…
//  C · tiras sueltas que solo miran hacia abajo a poca altura (FrontSide): invisibles desde arriba (remate de G1).
// Guardián: en las zonas de V10 (NVDA, SECRETNOVIO, exterior r ≥ 42) no queda ningún hallazgo salvo los de la lista de excepciones
// justificadas (EXC, abajo). Lo de las zonas V4–V9 se lista como nota (heredado) para decidir aparte.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20, flag } from '../v8/lib.mjs';
const R = new Report('caras-v10-1');
/** Excepciones justificadas (vacía: cada una con su motivo cuando la haya). */
const EXC = [];
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(6000);   // reto de SN a la vista (20/20) y exterior cargado
    const res = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, out = { meshes: 0, tris: 0, A: [], B: [], C: [] };
      g.scene.updateMatrixWorld(true);
      const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const skip = (o) => /^(SKY|ANMI)/.test(o.name) || o.isSkinnedMesh || o.isInstancedMesh || o.isSprite || o.isPoints || o.isLine;
      const npcRoots = new Set(); for (const l of g.npcs.values()) for (const n of l) npcRoots.add(n.root);
      const underNpc = (o) => { for (let p = o; p; p = p.parent) if (npcRoots.has(p) || p === g.visual.root || p === g.cars.group) return true; return false; };
      const meshes = []; g.scene.traverse((o) => { if (o.isMesh && !skip(o) && vis(o) && !underNpc(o) && o.geometry?.attributes?.position) meshes.push(o); });
      out.meshes = meshes.length;
      const chain = (o) => { const c = []; for (let p = o; p && c.length < 3; p = p.parent) c.push(p.name || p.type); return c.join('<'); };
      const va = new T.Vector3(), vb = new T.Vector3(), vc = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3(), nn = new T.Vector3();
      const buckets = new Map();
      for (const m of meshes) {
        const G = m.geometry, P = G.attributes.position, I = G.index, n = I ? I.count : P.count, mats = [m.material].flat();
        const groups = G.groups.length ? G.groups : [{ start: 0, count: n, materialIndex: 0 }];
        const keyOf = new Map(); let nk = 0; const vid = (x, y, z) => { const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`; let v = keyOf.get(k); if (v === undefined) { v = nk++; keyOf.set(k, v); } return v; };
        const edges = new Map(), triW = []; let down = 0, tot = 0, maxY = -1e9;
        for (const gr of groups) {
          const mat = mats[gr.materialIndex ?? 0] ?? mats[0]; if (!mat) continue;
          const decal = mat.polygonOffset || (mat.transparent && mat.depthWrite === false) || mat.colorWrite === false;
          const side = mat.side;   // 0 Front, 1 Back, 2 Double
          for (let t = gr.start; t < Math.min(n, gr.start + gr.count); t += 3) {
            const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2;
            va.fromBufferAttribute(P, ia).applyMatrix4(m.matrixWorld); vb.fromBufferAttribute(P, ib).applyMatrix4(m.matrixWorld); vc.fromBufferAttribute(P, ic).applyMatrix4(m.matrixWorld);
            nn.crossVectors(e1.subVectors(vb, va), e2.subVectors(vc, va)); const A2 = nn.length(); if (A2 < 2e-5) continue; nn.divideScalar(A2);
            out.tris++; tot += A2 / 2; if (nn.y < -0.5) down += A2 / 2; maxY = Math.max(maxY, va.y, vb.y, vc.y);
            // A: aristas dirigidas (vértices soldados)
            const a = vid(va.x, va.y, va.z), bb = vid(vb.x, vb.y, vb.z), c = vid(vc.x, vc.y, vc.z);
            const ti = triW.length; triW.push([va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z, nn.x, nn.y, nn.z]);
            if (side === 0) for (const [u, w] of [[a, bb], [bb, c], [c, a]]) { if (u === w) continue; const k = u + ':' + w; const e = edges.get(k); if (e) { e.n++; e.t.push(ti); } else edges.set(k, { n: 1, t: [ti] }); }
            const UV = G.attributes.uv, CO = G.attributes.color;
            var uvs = UV ? [ia, ib, ic].map((q) => [UV.getX(q), UV.getY(q)]) : null, cols = CO ? [ia, ib, ic].map((q) => [CO.getX(q), CO.getY(q), CO.getZ(q)]) : null;
            // B: plano
            if (decal || side === 1) continue;
            // DoubleSide: las dos caras se ven, salvo el DORSO de una cara que mira hacia abajo (fondo de un sólido: lo tapa el propio sólido)
            for (const s of side === 2 ? (nn.y < -0.7 ? [1] : [1, -1]) : [1]) {
              const nx = nn.x * s, ny = nn.y * s, nz = nn.z * s, d = nx * va.x + ny * va.y + nz * va.z;
              const kn = `${Math.round(nx * 40)},${Math.round(ny * 40)},${Math.round(nz * 40)}`, kd = Math.round(d / 0.003);
              const k = kn + '|' + kd; let L = buckets.get(k); if (!L) { L = { n: [nx, ny, nz], tris: [] }; buckets.set(k, L); }
              L.tris.push({ m: m.name || chain(m), mat: mat.name || mat.type, matId: mat.id, map: !!mat.map, id: m.id + ':' + (gr.materialIndex ?? 0), p: [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z], tri: t, d, uvs, cols });
            }
          }
        }
        // candidatas = triángulos de aristas incoherentes; se confirma lanzando un rayo desde su centro por su normal contra la MISMA malla:
        // si lo primero que toca es una cara vista por DETRÁS (normal en el sentido del rayo), la cara mira hacia dentro del sólido
        const cand = new Set(); for (const e of edges.values()) if (e.n > 1) for (const t of e.t) { if (cand.size < 600) cand.add(t); }
        if (cand.size) {
          const hitT = (o, dv, q) => { const ax = q[0], ay = q[1], az = q[2], e1x = q[3] - ax, e1y = q[4] - ay, e1z = q[5] - az, e2x = q[6] - ax, e2y = q[7] - ay, e2z = q[8] - az;
            const px = dv[1] * e2z - dv[2] * e2y, py = dv[2] * e2x - dv[0] * e2z, pz = dv[0] * e2y - dv[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) return -1;
            const inv = 1 / det, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az, uu = (tx * px + ty * py + tz * pz) * inv; if (uu < 0 || uu > 1) return -1;
            const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, vv = (dv[0] * qx + dv[1] * qy + dv[2] * qz) * inv; if (vv < 0 || uu + vv > 1) return -1;
            return (e2x * qx + e2y * qy + e2z * qz) * inv; };
          const cl = new Map();
          for (const ti of cand) { const q = triW[ti], dv = [q[9], q[10], q[11]], o = [(q[0] + q[3] + q[6]) / 3 + dv[0] * 0.003, (q[1] + q[4] + q[7]) / 3 + dv[1] * 0.003, (q[2] + q[5] + q[8]) / 3 + dv[2] * 0.003];
            // cara interior: otra cara del mismo plano con la normal opuesta pegada a ella (cajas que se tocan): no se ve, no cuenta
            const ob = [o[0] - dv[0] * 0.006, o[1] - dv[1] * 0.006, o[2] - dv[2] * 0.006]; let inner = false;
            for (let j = 0; j < triW.length && !inner; j++) { if (j === ti) continue; const q2 = triW[j]; if (q2[9] * dv[0] + q2[10] * dv[1] + q2[11] * dv[2] > -0.9) continue; const t = hitT(ob, dv, q2); if (t >= 0 && t < 0.012) inner = true; }
            if (inner) continue;
            let best = 3, bn = null; for (let j = 0; j < triW.length; j++) { if (j === ti) continue; const t = hitT(o, dv, triW[j]); if (t > 1e-4 && t < best) { best = t; bn = triW[j]; } }
            if (!bn || bn[9] * dv[0] + bn[10] * dv[1] + bn[11] * dv[2] < 0.2) continue;   // sale al aire o toca una cara de frente: bien orientada
            const cx = o[0], cy = o[1], cz = o[2], k = `${Math.round(cx / 1.5)},${Math.round(cy / 1.5)},${Math.round(cz / 1.5)}`, c = cl.get(k) ?? { n: 0, x: 0, y: 0, z: 0, ny: 0 }; c.n++; c.x += cx; c.y += cy; c.z += cz; c.ny += dv[1]; cl.set(k, c); }
          for (const c of cl.values()) out.A.push({ mesh: chain(m), mat: mats.map((x) => x.name).join(','), caras: c.n, en: [+(c.x / c.n).toFixed(2), +(c.y / c.n).toFixed(2), +(c.z / c.n).toFixed(2)], normalY: +(c.ny / c.n).toFixed(2) });
        }
        if (tot > 0.02 && down / tot > 0.98 && maxY < 3.5 && mats.every((x) => x.side === 0)) { const bb3 = new T.Box3().setFromObject(m); const c = bb3.getCenter(new T.Vector3()); out.C.push({ mesh: chain(m), mat: mats.map((x) => x.name).join(','), area: +tot.toFixed(3), en: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] }); }
      }
      // B: solapes en cada plano (barrido por x en la base del plano); se fusionan los cubos de d vecinos (±3 mm)
      const area2 = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
      const clip = (subj, cl) => { let o = subj; for (let i = 0; i < cl.length && o.length; i++) { const A = cl[i], B = cl[(i + 1) % cl.length], inp = o; o = [];
          const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
          for (let j = 0; j < inp.length; j++) { const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
            if (sp >= 0) o.push(P); if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); o.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } } } return o; };
      const pairs = new Map(); const seen = new Set();
      for (const [k, L] of buckets) {
        const [kn, kd] = k.split('|'), nb = buckets.get(kn + '|' + (+kd + 1)); const tris = nb ? L.tris.concat(nb.tris) : L.tris;
        if (tris.length < 2) continue;
        const n = new T.Vector3(...L.n), u = new T.Vector3(1, 0, 0); if (Math.abs(n.x) > 0.9) u.set(0, 1, 0); u.sub(n.clone().multiplyScalar(u.dot(n))).normalize(); const v = new T.Vector3().crossVectors(n, u);
        const pr = tris.map((t) => { const q0 = [0, 3, 6].map((i) => [t.p[i] * u.x + t.p[i + 1] * u.y + t.p[i + 2] * u.z, t.p[i] * v.x + t.p[i + 1] * v.y + t.p[i + 2] * v.z]), q = q0.slice(); if (area2(q) < 0) q.reverse();
          return { t, q, q0, x0: Math.min(...q.map((p) => p[0])), x1: Math.max(...q.map((p) => p[0])), y0: Math.min(...q.map((p) => p[1])), y1: Math.max(...q.map((p) => p[1])) }; }).sort((a, b) => a.x0 - b.x0);
        for (let i = 0; i < pr.length; i++) for (let j = i + 1; j < pr.length && pr[j].x0 < pr[i].x1; j++) {
          const A = pr[i], B = pr[j]; if (A.y1 <= B.y0 || B.y1 <= A.y0) continue;
          if (A.t.id === B.t.id && Math.abs(A.t.tri - B.t.tri) < 1) continue;
          const sk = A.t.id + '#' + A.t.tri + '/' + B.t.id + '#' + B.t.tri; if (seen.has(sk)) continue; seen.add(sk);
          if (Math.abs(A.t.d - B.t.d) > 0.002) continue;   // > 2 mm: separación suficiente a la distancia de juego (resolución de profundidad ≈ 1,5 mm a 60 m)
          const poly = clip(A.q, B.q); if (poly.length < 3) continue; const ar = Math.abs(area2(poly)); if (ar < 1e-4) continue;
          if (A.t.matId === B.t.matId) {   // mismo material: solo parpadea si en el punto común la textura o el color de vértice difieren
            const cx0 = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy0 = poly.reduce((s, p) => s + p[1], 0) / poly.length;
            const bary = (q) => { const [a, b, c] = q, den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); const l1 = ((b[1] - c[1]) * (cx0 - c[0]) + (c[0] - b[0]) * (cy0 - c[1])) / den, l2 = ((c[1] - a[1]) * (cx0 - c[0]) + (a[0] - c[0]) * (cy0 - c[1])) / den; return [l1, l2, 1 - l1 - l2]; };
            const at = (P, L, k) => L[0] * P[0][k] + L[1] * P[1][k] + L[2] * P[2][k];
            const ba = bary(A.q0), bb2 = bary(B.q0); let diff = 0;
            if (A.t.map && A.t.uvs && B.t.uvs) diff = Math.max(diff, Math.abs(at(A.t.uvs, ba, 0) - at(B.t.uvs, bb2, 0)), Math.abs(at(A.t.uvs, ba, 1) - at(B.t.uvs, bb2, 1)));
            if (A.t.cols && B.t.cols) for (let k = 0; k < 3; k++) diff = Math.max(diff, Math.abs(at(A.t.cols, ba, k) - at(B.t.cols, bb2, k)) * 4);
            if (diff < 0.01) continue; }
          const key = [A.t.m + ' [' + A.t.mat + ']', B.t.m + ' [' + B.t.mat + ']'].sort().join(' ⟷ ');
          const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length, w = n.clone().multiplyScalar(A.t.d).addScaledVector(u, cx).addScaledVector(v, cy);
          const e = pairs.get(key) ?? { par: key, area: 0, en: null, n: L.n.map((x) => +x.toFixed(2)), dd: +Math.abs(A.t.d - B.t.d).toFixed(4) }; e.area += ar; if (!e.en || ar > (e.big ?? 0)) { e.en = [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)]; e.big = ar; } pairs.set(key, e);
        }
      }
      out.B = [...pairs.values()].filter((e) => e.area > 0.005).map((e) => ({ ...e, area: +e.area.toFixed(3), big: undefined })).sort((a, b) => b.area - a.area);
      return out;
    });
    const zona = (p) => { const r = Math.hypot(p[0], p[2]); if (r >= 42) return 'exterior'; if (r < 16) return 'secretnovio'; const th = ((Math.atan2(p[0], -p[2]) * 180 / Math.PI) + 360) % 360; return th > 296 && th < 360 ? 'nvda?' : 'v4-v9'; };
    // NVDA: eje del sector 333° (corona +9°): ±36° alrededor; se clasifica con el ángulo del juego
    const th = await page.evaluate(() => window.__bkSectors.find((s) => s.id === 'nosvamosdeaqui').axis);
    const zon = (p) => { const r = Math.hypot(p[0], p[2]); if (r >= 42) return 'exterior'; if (r < 16) return 'secretnovio'; const a = Math.atan2(p[0], -p[2]) * 180 / Math.PI; const d = ((a - th + 540) % 360) - 180; return Math.abs(d) < 36 ? 'nvda' : 'v4-v9'; };
    void zona;
    for (const k of ['A', 'B', 'C']) for (const e of res[k]) e.zona = zon(e.en);
    R.measure('mallas', res.meshes); R.measure('triangulos', res.tris);
    R.measure('A', res.A); R.measure('B', res.B.slice(0, 200)); R.measure('C', res.C);
    // guardián: geometría HECHA POR CÓDIGO (STATIC_*, NV_*, SN_*) en las zonas V10, o cualquier pareja con una de esas piezas. Las mallas de
    // la maqueta aprobada del exterior (capas GLB) se listan como nota para revisarlas en capturas (no se tocan sin decidirlo).
    const code = (t) => /^(STATIC_|NV_|SN_)/.test(t ?? '');
    const v10 = (e) => e.zona !== 'v4-v9' && !EXC.some((x) => e.par?.includes(x) || e.mesh?.includes(x)) && (e.mesh ? code(e.mesh) : e.par.split(' ⟷ ').some(code)) || (e.par && e.par.includes('bola_azulado'));
    for (const k of ['A', 'B', 'C']) { const L = res[k].filter(v10), H = res[k].filter((e) => !v10(e)); R.note({ [k + '_v10']: L.slice(0, 30) }); if (H.length) R.note({ [k + '_heredado_v4v9']: H.slice(0, 30), total: H.length }); }
    R.check(res.A.filter(v10).length === 0, `A · geometría de código en zonas V10 sin caras dadas la vuelta (${res.A.filter(v10).length}; mallas ${res.meshes}, triángulos ${res.tris})`, 'static', res.A.filter(v10).slice(0, 12));
    R.check(res.B.filter(v10).length === 0, `B · geometría de código en zonas V10 sin caras coplanares que parpadean (${res.B.filter(v10).length})`, 'static', res.B.filter(v10).slice(0, 12));
    R.check(res.C.filter(v10).length === 0, `C · geometría de código en zonas V10 sin tiras que solo miran hacia abajo (${res.C.filter(v10).length})`, 'static', res.C.filter(v10).slice(0, 12));
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
