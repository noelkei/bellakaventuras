// ANIM-01/03: contacto SUELA–LIJA/SUELO medido en el GLB FINAL (public/assets/character/anmi.glb) cargado por el juego.
// Suela = vértices del mesh deformado con peso de pie/dedos > 0,65 y dentro de los 12 mm inferiores en reposo (fijos).
// Lija = triángulos del material de lija de la tabla skinned (DECK) en ese mismo instante. Holgura = distancia de cada
// vértice de suela a la lija a lo largo de la normal del deck (rayo); solo cuentan suelas que caen sobre la tabla.
// Fases de apoyo por clip declaradas abajo; pie libre: se comprueba que NO penetra la lija (holgura ≥ −5 mm).
//   node tools/v3/anmi-contact.mjs [--url …] → captures/v3/P2/ANIM-03/contact.json
import { Report, launch, openGame } from './lib.mjs';

const R = new Report('P2/ANIM-03', 'contact', { method: 'Three.js en el navegador: SkinnedMesh.getVertexPosition del GLB comprimido, 120 muestras/s, rayos contra la lija skinned; mínimo sobre vértices de suela ≥4 mm dentro del contorno de la lija (criterio común con la calibración)', tol: { onBoardMin: -5, onBoardMax: 8, freeMin: -5, groundMin: -5, groundMax: 8, unit: 'mm' } });
const browser = await launch();
const page = await openGame(browser, R, { save: null });
try {
  const res = await page.evaluate(() => {
    const T = window.__bkTHREE, v = window.__bk.visual;
    const meshes = []; v.model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const body = meshes.find((m) => m.name.startsWith('ANMI_BODY')), deck = meshes.find((m) => /grip/i.test(m.material?.name ?? ''));
    const bones = body.skeleton.bones.map((b) => b.name);
    const want = (side) => new Set(bones.map((n, i) => (n.includes(side + 'Foot') || n.includes(side + 'ToeBase') || n.includes(side + 'Toe_End') ? i : -1)).filter((i) => i >= 0));
    const sk = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, pos = body.geometry.attributes.position;
    const sole = {};
    for (const side of ['Left', 'Right']) {
      const set = want(side), ids = [];
      for (let i = 0; i < pos.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (set.has(sk.getComponent(i, k))) w += sw.getComponent(i, k); if (w > 0.65) ids.push(i); }
      // altura REAL en reposo (las posiciones del GLB están cuantizadas por meshopt): esqueleto en bind pose → mundo
      body.skeleton.pose(); v.root.updateMatrixWorld(true); body.skeleton.update();
      const Q = new T.Vector3(); const ys = ids.map((i) => { body.getVertexPosition(i, Q); return Q.applyMatrix4(body.matrixWorld).y; }); const ymin = Math.min(...ys);
      sole[side[0]] = ids.filter((i, k) => ys[k] < ymin + 0.012);
    }
    // triángulos de lija del deck
    const gripTris = []; const idx = deck.geometry.index;
    for (let k = 0; k < idx.count; k += 3) gripTris.push([idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)]);
    const gripVerts = [...new Set(gripTris.flat())];
    // apoyos: [desde, hasta] en fracción del clip en que el pie debe estar sobre la lija; 'g' = sobre el suelo
    const PH = {
      SK_Idle: { L: [[0, 1]], R: [[0, 1]] }, SK_Ride: { L: [[0, 1]], R: [[0, 1]] }, SK_CarveL: { L: [[0, 1]], R: [[0, 1]] }, SK_CarveR: { L: [[0, 1]], R: [[0, 1]] },
      SK_CrouchRide: { L: [[0, 1]], R: [[0, 1]] }, SK_Manual: { L: [[0, 1]], R: [[0, 1]] }, SK_Grind: { L: [[0, 1]], R: [[0, 1]] },
      SK_Brake: { L: [[0, 1]], R: [], gR: [[0, 1]] },
      SK_Push: { L: [[0, 1]], R: [[0, 0.004], [0.996, 1]], gR: [[8 / 26, 16 / 26]] },
      SK_Scoot: { L: [[0, 1]], R: [[0, 0.004], [0.996, 1]], gR: [[7 / 21, 12 / 21]] },
      SK_Pop: { L: [[0, 1]], R: [[0, 1]] }, SK_Air: { L: [[0, 1]], R: [[0, 1]] }, SK_Catch: { L: [[0, 1]], R: [[0, 1]] }, SK_Land: { L: [[0, 1]], R: [[0, 1]] },
      SK_LandHard: { L: [[0, 1]], R: [[0, 1]] }, SK_FlipTuck: { L: [[0, 1]], R: [[0, 1]] }, SK_FlipCrouch: { L: [[0, 1]], R: [[0, 1]] }, SK_FlipOpen: { L: [[0, 1]], R: [[0, 1]] },
      SK_Grab: { L: [[0, 1]], R: [[0, 1]] }, SK_FlipKick: { L: [[0, 0.01], [0.99, 1]], R: [[0, 0.01], [0.99, 1]] }, SK_FlipHeel: { L: [[0, 0.01], [0.99, 1]], R: [[0, 0.01], [0.99, 1]] },
      SK_Stand: { L: [], R: [], gL: [[0, 1]], gR: [[0, 1]] }, SK_IdleBoard: { L: [], R: [], gL: [[0, 1]], gR: [[0, 1]] },
      SK_Mount: { L: [[8.5 / 13, 1]], R: [[0.995, 1]], gL: [[0, 4 / 13]], gR: [[0, 8.5 / 13]] }, SK_Dismount: { L: [[0, 0.01]], R: [[0, 0.01]], gL: [[9 / 12, 1]], gR: [[4.5 / 12, 1]] },
      SK_WalkBoard: { L: [], R: [] }, SK_CrouchWalk: { L: [], R: [] },
    };
    const inW = (ws, p) => (ws ?? []).some(([a, b]) => p >= a - 1e-6 && p <= b + 1e-6);
    const mixer = new T.AnimationMixer(v.model);
    const ray = new T.Raycaster(); const P = new T.Vector3(), A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3();
    const out = {};
    const castGrip = (tris, Q, nrm) => {
      const o = Q.clone().addScaledVector(nrm, 0.25); ray.set(o, nrm.clone().negate()); let best = null;
      for (const [a, b, c] of tris) { const hit = ray.ray.intersectTriangle(a, b, c, false, A); if (hit) { const d = hit.distanceTo(o) - 0.25; /* + = suela por encima de la lija */ if (best === null || Math.abs(d) < Math.abs(best)) best = d; } }
      return best;
    };
    const interior = (tris, Q, nrm) => {
      const u = new T.Vector3(1, 0, 0); if (Math.abs(u.dot(nrm)) > 0.9) u.set(0, 0, 1); u.addScaledVector(nrm, -u.dot(nrm)).normalize();
      const w = new T.Vector3().crossVectors(nrm, u);
      return [u, u.clone().negate(), w, w.clone().negate()].every((d) => castGrip(tris, Q.clone().addScaledVector(d, 0.004), nrm) !== null);
    };
    for (const [name, ph] of Object.entries(PH)) {
      const a0 = v.actions.get(name); if (!a0) { out[name] = { missing: true }; continue; }
      for (const a of v.actions.values()) a.stop();
      const clip = a0.getClip(); const act = mixer.clipAction(clip); act.reset(); act.play();
      const n = Math.max(2, Math.round(clip.duration * 120));
      const st = { onL: [], onR: [], freeL: [], freeR: [], gL: [], gR: [] };
      for (let f = 0; f <= n; f++) {
        const t = Math.min(clip.duration - 1e-4, f / 120), p = t / clip.duration;
        mixer.setTime(t); v.root.updateMatrixWorld(true); body.skeleton.update(); deck.skeleton.update();
        // lija deformada en mundo
        const gw = new Map(); for (const i of gripVerts) { deck.getVertexPosition(i, P); gw.set(i, P.clone().applyMatrix4(deck.matrixWorld)); }
        const tris = gripTris.map(([i, j, k]) => [gw.get(i), gw.get(j), gw.get(k)]);
        let nrm = new T.Vector3(); for (const [a, b, c] of tris) nrm.add(B.subVectors(b, a).cross(C.subVectors(c, a))); nrm.normalize(); if (nrm.y < 0) nrm.negate();
        const tri = new T.Triangle();
        for (const s of ['L', 'R']) {
          const onBoard = inW(ph[s], p), onGround = inW(ph['g' + s], p);
          let minC = Infinity, maxC = -Infinity, hits = 0, gmin = Infinity;
          const cand = [];
          for (const i of sole[s]) {
            body.getVertexPosition(i, P); P.applyMatrix4(body.matrixWorld);
            gmin = Math.min(gmin, P.y - v.root.position.y);
            const best = castGrip(tris, P, nrm);
            if (best !== null) { hits++; cand.push([best, P.clone()]); maxC = Math.max(maxC, best); }
          }
          // mínimo sobre vértices INTERIORES (≥4 mm dentro del contorno de la lija; mismo criterio que la calibración del
          // builder): los del canto entran o salen por décimas de milímetro y no representan el apoyo de la suela
          cand.sort((x, y) => x[0] - y[0]);
          for (const [d, Q] of cand) if (interior(tris, Q, nrm)) { minC = d; break; }
          if (cand.length && minC === Infinity) minC = cand[cand.length - 1][0];
          if (onBoard) st['on' + s].push(hits ? [p, minC * 1000, maxC * 1000, hits] : [p, null, null, 0]);
          else if (hits && nrm.y > 0.7 && minC > -0.025) st['free' + s].push([p, minC * 1000]);
          if (onGround) st['g' + s].push([p, gmin * 1000]);
        }
      }
      act.stop(); mixer.uncacheAction(clip);
      const sum = (arr, k) => arr.length ? +Math.min(...arr.map((x) => x[k] ?? Infinity)).toFixed(2) : null;
      const at = (arr, k, f) => { if (!arr.length) return null; let b = arr[0]; for (const x of arr) if (f(x[k] ?? NaN, b[k] ?? NaN)) b = x; return +b[0].toFixed(3); };
      const summ = (arr, k) => arr.length ? +Math.max(...arr.map((x) => x[k] ?? -Infinity)).toFixed(2) : null;
      out[name] = {
        seconds: +clip.duration.toFixed(3), samples: n + 1,
        onBoard: { L: { n: st.onL.length, noHit: st.onL.filter((x) => !x[3]).length, minMm: sum(st.onL, 1), maxOfMinMm: summ(st.onL, 1), atMin: at(st.onL, 1, (a, b) => a < b), atMax: at(st.onL, 1, (a, b) => a > b) }, R: { n: st.onR.length, noHit: st.onR.filter((x) => !x[3]).length, minMm: sum(st.onR, 1), maxOfMinMm: summ(st.onR, 1), atMin: at(st.onR, 1, (a, b) => a < b), atMax: at(st.onR, 1, (a, b) => a > b) } },
        freeOverDeck: { L: sum(st.freeL, 1), R: sum(st.freeR, 1), atL: at(st.freeL, 1, (a, b) => a < b), atR: at(st.freeR, 1, (a, b) => a < b) },
        ground: { L: st.gL.length ? [sum(st.gL, 1), summ(st.gL, 1), at(st.gL, 1, (a, b) => a < b)] : null, R: st.gR.length ? [sum(st.gR, 1), summ(st.gR, 1), at(st.gR, 1, (a, b) => a < b)] : null },
      };
    }
    // altura máxima del cuerpo deformado en los clips agachados (techos bajos del parque: 1,30 túnel, 1,26 descanso TT)
    out.__crouchTop = {};
    const BODY = ['SK_CrouchRide', 'SK_CrouchWalk', 'SK_Scoot', 'SK_WalkBoard', 'SK_IdleBoard', 'Step_Hip_Hop_Dance', 'Hip_Hop_Dance_1', 'Hip_Hop_Dance_2', 'Hip_Hop_Dance_3', 'FunnyDancing_02', 'Breakdance_1990'];
    for (const name of BODY) {
      const a0 = v.actions.get(name); if (!a0) continue;
      for (const a of v.actions.values()) a.stop();
      const clip = a0.getClip(); const act = mixer.clipAction(clip); act.reset(); act.play();
      let top = -Infinity, at = 0, low = Infinity, atLow = 0;
      for (let t = 0; t <= clip.duration; t += 0.05) {
        mixer.setTime(Math.min(clip.duration - 1e-4, t)); v.root.updateMatrixWorld(true); body.skeleton.update();
        const n = body.geometry.attributes.position.count;
        for (let i = 0; i < n; i++) { body.getVertexPosition(i, P); P.applyMatrix4(body.matrixWorld); const h = P.y - v.root.position.y; if (h > top) { top = h; at = t; } if (h < low) { low = h; atLow = t; } }
      }
      act.stop(); mixer.uncacheAction(clip);
      out.__crouchTop[name] = { topM: +top.toFixed(3), at: +at.toFixed(2), lowMm: +(low * 1000).toFixed(1), atLow: +atLow.toFixed(2) };
    }
    return out;
  });
  const crouchTop = res.__crouchTop; delete res.__crouchTop;
  for (const [k, o] of Object.entries(crouchTop)) {
    if (/Crouch|Scoot/.test(k)) R.check(o.topM <= 1.20, `${k}: cuerpo agachado ≤1,20 m (techo más bajo del parque 1,26 m)`, 'static', o);
    if (!/Crouch|Scoot/.test(k)) R.check(o.lowMm >= -5, `${k}: el cuerpo no atraviesa el suelo (vértice más bajo ≥ −5 mm, 20 muestras/s)`, 'static', o);
  }
  R.data.result = res;
  for (const [name, r] of Object.entries(res)) {
    if (r.missing) { R.check(false, `${name}: clip presente en el GLB`, 'static'); continue; }
    for (const s of ['L', 'R']) {
      const o = r.onBoard[s];
      if (o.n) R.check(o.noHit === 0 && o.minMm >= -5 && o.maxOfMinMm <= 8, `${name} ${s}: suela sobre la lija en su apoyo (−5…+8 mm)`, 'static', o);
      if (r.freeOverDeck[s] !== null) R.check(r.freeOverDeck[s] >= -5, `${name} ${s}: pie libre no penetra la lija`, 'static', { minMm: r.freeOverDeck[s], at: r.freeOverDeck['at' + s] });
      if (r.ground[s]) R.check(r.ground[s][0] >= -5 && r.ground[s][1] <= 8, `${name} ${s}: suela sobre el suelo en su apoyo (−5…+8 mm)`, 'static', { minMm: r.ground[s][0], maxMm: r.ground[s][1], atMin: r.ground[s][2] });
    }
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
