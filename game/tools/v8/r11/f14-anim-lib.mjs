// R11 · F14 · copia de la sonda AUD-JUG/ANIM/anim-lib.mjs (mismas comprobaciones; solo cambian rutas y nombre del informe).
// AUD-JUG/ANIM · medidas de animación en página (solo lectura): suela de cada pie frente al suelo (rayos), deslizamiento del pie
// apoyado, tabla (vértices bajos del deck) frente al suelo, pies frente a la tabla, saltos de pose (cadera relativa a la raíz entre
// fotogramas) y giros bruscos de la raíz visible, clip actual, tablas visibles.
export * from './f14-lib-anim.mjs';
export async function installAnim(page) {
  await page.evaluate(() => {
    const g = window.__bk, V = g.visual, T = window.__bkTHREE, RA = window.__bkRapier, s = g.skater;
    const body = V.body, bones = body.skeleton.bones, pos = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    // suelas por pie: vértices de suela (V.soleIdx) cuyo hueso dominante es izquierdo o derecho
    const sole = { L: [], R: [] };
    for (const i of V.soleIdx) { let best = -1, bw = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } } const n = bones[best]?.name ?? ''; if (/Left/.test(n)) sole.L.push(i); else if (/Right/.test(n)) sole.R.push(i); }
    const hips = bones.find((b) => /Hips$/.test(b.name));
    const v = new T.Vector3();
    const groundPhys = (x, z, y0) => { const hit = g.world.castRay(new RA.Ray({ x, y: y0, z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); return hit ? y0 - hit.timeOfImpact : null; };
    // suelo VISIBLE: rayo contra las mallas opacas del parque (las escaleras se ven con peldaños aunque colisionen como rampa)
    const rc = new T.Raycaster(); rc.camera = g.rig.cam; const vis = [];
    const VEG = /plant|tree|palm|veg|shrub|flower|mata|leaf|hoja|grass/i;
    g.park.root.traverse((o) => { if (!o.isMesh || !o.material || o.material.transparent || o.material.depthWrite === false) return; let nm = '', q = o; while (q) { nm += '|' + (q.name || ''); q = q.parent; } if (VEG.test(nm)) return;
      o.updateMatrixWorld(true); let bs; if (o.isInstancedMesh) { o.computeBoundingSphere(); bs = o.boundingSphere; } else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); bs = o.geometry.boundingSphere; } const sp = bs.clone().applyMatrix4(o.matrixWorld); vis.push({ o, sp }); });
    window.__animVisCount = vis.length;
    const ground = (x, z, y0) => { rc.set(new T.Vector3(x, y0, z), new T.Vector3(0, -1, 0)); rc.far = 3; const cand = vis.filter(({ sp }) => Math.hypot(sp.center.x - x, sp.center.z - z) <= sp.radius + 0.05 && sp.center.y - sp.radius <= y0).map((v) => v.o);
      const h = rc.intersectObjects(cand, false)[0]; return h ? h.point.y : groundPhys(x, z, y0); };
    const toe = { L: bones.find((b) => /LeftToeBase$/.test(b.name)), R: bones.find((b) => /RightToeBase$/.test(b.name)) };
    let prev = null;
    window.__anim = {
      sole,
      sample() {
        V.root.updateMatrixWorld(true); body.skeleton.update();
        const out = { clip: V.currentName, ov: V.override ?? null, loco: s.loco, st: s.state, g: s.grounded ? 1 : 0, hv: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), tr: s.trick?.kind ?? null };
        const feet = {};
        for (const side of ['L', 'R']) { let lo = Infinity, cx = 0, cz = 0, n = 0, clr = Infinity;
          for (const i of sole[side]) { body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld); cx += v.x; cz += v.z; n++; if (v.y < lo) lo = v.y; }
          cx /= n; cz /= n; const gy = ground(cx, cz, lo + 0.6); const tp = toe[side].getWorldPosition(new T.Vector3()); feet[side] = { y: +lo.toFixed(3), gnd: gy == null ? null : +gy.toFixed(3), clr: gy == null ? null : +(lo - gy).toFixed(3), x: cx, z: cz, tx: tp.x, tz: tp.z }; }
        out.fL = feet.L.clr; out.fR = feet.R.clr;
        // tabla: vértices bajos del deck (si están calculados) frente al suelo
        if (V.deck?.visible && V.deckLow?.length) { let m = Infinity; for (const [mesh, i] of V.deckLow) { if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v); else v.fromBufferAttribute(mesh.geometry.attributes.position, i); v.applyMatrix4(mesh.matrixWorld); const gy = ground(v.x, v.z, v.y + 0.5); if (gy != null) m = Math.min(m, v.y - gy); } out.deck = m === Infinity ? null : +m.toFixed(3); }
        // pies frente al hueso de la tabla (montada)
        if (V.boardBone && s.riding) { V.boardBone.getWorldPosition(v); out.footOverBoard = +(Math.min(feet.L.y, feet.R.y) - v.y).toFixed(3); }
        // deslizamiento del pie apoyado (a pie, en el suelo): velocidad horizontal de la suela con holgura < 2 cm
        const hp = hips.getWorldPosition(new T.Vector3()); const rootP = V.root.position.clone(); const q = V.root.quaternion.clone();
        if (prev) { const dt = 1 / 60;
          for (const side of ['L', 'R']) { const f = feet[side], pf = prev.feet[side]; if (f.clr != null && pf.clr != null && f.clr < 0.015 && pf.clr < 0.015) out['slide' + side] = +(Math.hypot(f.tx - pf.tx, f.tz - pf.tz) / dt).toFixed(2); }
          out.hipJump = +(hp.clone().sub(rootP).distanceTo(prev.hp.clone().sub(prev.rootP))).toFixed(3);   // cambio de pose de la cadera relativa a la raíz por fotograma
          out.rootTurn = +(q.angleTo(prev.q) * 180 / Math.PI).toFixed(1); }
        out.hand = V.handBoard?.visible ?? null; out.deckVis = V.deck?.visible ?? null; out.back = V.backBoard?.visible ?? null;
        prev = { feet, hp, rootP, q };
        return out;
      },
      reset() { prev = null; },
    };
  });
}
/** Ejecuta `sec` de simulación con un guion de teclas [[t, code, down]] muestreando cada paso; devuelve las filas. */
export async function runScript(page, sec, events = [], hold = []) {
  return page.evaluate(async (sec, events, hold) => { const rows = []; window.__anim.reset(); for (const k of hold) window.__K(k, true);
    await window.__sim(sec, (t) => { for (const [at, k, dn] of events) if (t >= at && t < at + 1 / 60) window.__K(k, dn); rows.push({ t: +t.toFixed(3), ...window.__anim.sample() }); });
    for (const k of hold) window.__K(k, false); for (const e of events) window.__K(e[1], false); return rows; }, sec, events, hold);
}
/** Resumen: holguras mínimas/máximas de pies apoyados, tabla, deslizamiento, saltos de pose. */
export function summarize(rows, { footState = null } = {}) {
  const pick = (f) => rows.map(f).filter((x) => x != null && Number.isFinite(x));
  const minmax = (a) => a.length ? [Math.min(...a), Math.max(...a)] : null;
  const grounded = rows.filter((r) => r.g && (!footState || footState(r)));
  const footClr = pick((r) => (r.g && (!footState || footState(r)) ? Math.min(r.fL ?? 9, r.fR ?? 9) : null)).filter((x) => x < 9);
  return { n: rows.length, clips: [...new Set(rows.map((r) => r.ov ?? r.clip))], locos: [...new Set(rows.map((r) => r.loco))],
    pieApoyadoMinMax: minmax(footClr), tablaMin: pick((r) => r.deck).length ? Math.min(...pick((r) => r.deck)) : null,
    deslizMax: pick((r) => Math.max(r.slideL ?? 0, r.slideR ?? 0)).length ? Math.max(...pick((r) => Math.max(r.slideL ?? 0, r.slideR ?? 0))) : null,
    saltoPoseMax: pick((r) => r.hipJump).length ? Math.max(...pick((r) => r.hipJump)) : null, giroRaizMax: pick((r) => r.rootTurn).length ? Math.max(...pick((r) => r.rootTurn)) : null,
    dosTablas: rows.filter((r) => (r.hand && r.back) || (r.deckVis && r.back) || (r.hand && r.deckVis)).length, nGround: grounded.length };
}
