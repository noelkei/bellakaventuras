// T5-15 · Clip lateral (cámara fija de costado, HUD oculto) de la tabla subiendo y bajando quarter_bola y trick_kicker a
// 4/8/14 m/s (velocidad inicial declarada, sin W) + coste de la comprobación final del deck (nº de rayos y ms por fotograma).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, recordClip } from './lib.mjs';
const R = new Report('board-clip');
const CASES = [['quarter_bola', [39.17855707804362, -33.804545402526855], [0.7071065729004644, -0.7071069894725693]], ['trick_kicker', [-35.68679475784302, -35.68679475784302], [-0.7071067811865476, -0.7071067811865476]]];
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    for (const [name, lo, dir] of CASES) for (const v of [4, 8, 14]) {
      await fixture(page, R, `${name} a ${v} m/s, cámara lateral fija`, (lo, dir, v) => { const g = window.__bk, T = window.__bkTHREE, h = Math.atan2(dir[0], dir[1]); const p = [lo[0] - dir[0] * 3, lo[1] - dir[1] * 3];
        g.input.clear(); g.skater.teleport(new T.Vector3(p[0], 0, p[1]), h, 'ride'); g.skater.vel.set(Math.sin(h) * v, 0, Math.cos(h) * v);
        for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
        if (!window.__r0) window.__r0 = g.render.bind(g);
        g.render = () => { const s = g.skater, cam = g.rig.cam; cam.position.set(s.footPos.x + dir[1] * 2.2, s.footPos.y + 0.35, s.footPos.z - dir[0] * 2.2); cam.lookAt(s.footPos.x, s.footPos.y + 0.15, s.footPos.z); cam.fov = 40; cam.updateProjectionMatrix(); window.__r0(); };
        return {}; }, lo, dir, v);
      await recordClip(page, R, `${name}_${v}`, () => sleep(3000), { everyNthFrame: 1 });
    }
    const cost = await page.evaluate(async () => { const g = window.__bk, V = g.visual; let calls = 0, frames = 0; const ga = V.groundAt; V.groundAt = (...a) => { calls++; return ga(...a); };
      const r = g.render; g.render = () => { frames++; r(); }; await new Promise((res) => setTimeout(res, 1500)); V.groundAt = ga; g.render = r;
      const t0 = performance.now(); for (let k = 0; k < 200; k++) for (const [m, i] of V.deckLow) { m.getVertexPosition(i, V.tmpV).applyMatrix4(m.matrixWorld); ga(V.tmpV.x, V.tmpV.z, V.tmpV.y + 0.6); }
      return { deckLow: V.deckLow.length, groundAtPerFrame: +(calls / Math.max(1, frames)).toFixed(1), msPerFrameCheck: +((performance.now() - t0) / 200).toFixed(3) }; });
    R.measure('coste_comprobacion_deck', cost); console.log(JSON.stringify(cost));
    R.check(cost.msPerFrameCheck < 1.0, 'coste de la comprobación final del deck < 1 ms por fotograma (headless, escritorio)', 'unit', cost);
    R.pendingHuman('Revisión visual del clip lateral: la tabla sigue la curva sin hundirse ni flotar (G8-V)');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
