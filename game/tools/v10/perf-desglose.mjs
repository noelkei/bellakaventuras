// V10 · desglose de llamadas de dibujo y triángulos por grupo de objetos (herramienta de diagnóstico, sin comprobaciones): en los puntos
// de control de perf-v8 (girados como la build) y en la plaza exterior. Para cada malla visible dentro del frustum suma 1 llamada por
// material y (índices/3 × instancias) triángulos, agrupando por el nombre del primer antepasado con nombre. Compara con renderer.info.
// Uso: node tools/v10/perf-desglose.mjs --url v10 [--top 25]
import { Report, runTest, launch, openGame, clickStart, sleep, arg } from '../v8/lib.mjs';
import { W, HD } from '../v8/tt-lib.mjs';
import { W as YW, HD as YHD } from '../v8/yy-lib.mjs';
const R = new Report('perf-desglose');
const TOP = +arg('top', '25');
const th = (108 + 9) * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], Wf = [Math.sin(th), -Math.cos(th)], Sf = [-Math.cos(th), -Math.sin(th)];
const VF = (w, s) => [O[0] + Wf[0] * w + Sf[0] * s, 0, O[1] + Wf[1] * w + Sf[1] * s], HF = (dw, ds) => Math.atan2(Wf[0] * dw + Sf[0] * ds, Wf[1] * dw + Sf[1] * ds);
const POSES = { nmg: 'nmg.llegada', fg: [VF(0.8, -15.5), HF(0, 1)], tt_entrada: [W(0.6, -8.4), HD(0, 1)], yy_paseo_interior: [YW(1.0, 24.0), YHD(0, 1)], yy_deck_exterior: [YW(-1.0, 37.0), YHD(0.2, -1)], plaza: 'bola.spawn' };
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(2500);
    for (const [k, pose] of Object.entries(POSES)) {
      await page.evaluate((pose) => { const g = window.__bk, T = window.__bkTHREE;
        if (typeof pose === 'string') { const a = g.manifest.anchors.get(pose); if (a) g.skater.teleport(a.pos.clone(), a.heading, 'walk'); }
        else g.skater.teleport(new T.Vector3(pose[0][0], pose[0][1] ?? 0, pose[0][2]), pose[1], 'walk');
        g.rig.snapBehind(g.skater); }, pose);
      await sleep(3500);
      const r = await page.evaluate((TOP) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, info = g.renderer.info.render;
        const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const groups = {}; let calls = 0, tris = 0; const sph = new T.Sphere();
        const label = (o) => { let p = o; while (p && !p.name) p = p.parent; const n = p?.name ?? '?'; return n.split('|')[0].replace(/_\d+$/, ''); };
        const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
        g.scene.traverse((o) => { if (!o.isMesh || !vis(o)) return; const geo = o.geometry; if (!geo) return;
          if (o.frustumCulled) { if (!geo.boundingSphere) geo.computeBoundingSphere(); if (o.isInstancedMesh && o.boundingSphere) sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); else sph.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sph)) return; }
          const n = o.isInstancedMesh ? o.count : 1, t = ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) * n, c = Array.isArray(o.material) ? geo.groups.length || 1 : 1;
          const L = label(o); groups[L] ??= { calls: 0, tris: 0 }; groups[L].calls += c; groups[L].tris += t; calls += c; tris += t; });
        // pasada de sombras: mallas con castShadow dentro del frustum de la cámara de sombra de la luz direccional
        const sg = {}; let sl = null; g.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) sl = o; });
        if (sl) { const sc = sl.shadow.camera; sc.updateMatrixWorld(); const sf = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
          g.scene.traverse((o) => { if (!o.isMesh || !o.castShadow || !vis(o)) return; const geo = o.geometry; if (!geo) return;
            if (o.frustumCulled) { if (!geo.boundingSphere) geo.computeBoundingSphere(); if (o.isInstancedMesh && o.boundingSphere) sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); else sph.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld); if (!sf.intersectsSphere(sph)) return; }
            const n = o.isInstancedMesh ? o.count : 1, t = ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) * n, L = label(o); sg[L] ??= { calls: 0, tris: 0 }; sg[L].calls++; sg[L].tris += t; }); }
        const sombras = Object.entries(sg).sort((a, b) => b[1].tris - a[1].tris).slice(0, TOP).map(([n, v]) => [n, v.calls, Math.round(v.tris)]);
        const top = Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, TOP).map(([n, v]) => [n, v.calls, Math.round(v.tris)]);
        const topC = Object.entries(groups).sort((a, b) => b[1].calls - a[1].calls).slice(0, TOP).map(([n, v]) => [n, v.calls, Math.round(v.tris)]);
        res({ info: { calls: info.calls, tris: info.triangles }, est: { calls, tris: Math.round(tris) }, top, topC, sombras, foot: g.skater.footPos.toArray().map((x) => +x.toFixed(2)) });
      }))), TOP);
      R.measure(k, r);
      console.log(`\n== ${k} @${r.foot}  info ${r.info.calls} llamadas ${r.info.tris} tris · estimado (sin sombras) ${r.est.calls} / ${r.est.tris}`);
      console.log(' por triángulos:', r.top.map(([n, c, t]) => `${n} ${c}/${t}`).join(' · '));
      console.log(' por llamadas:', r.topC.map(([n, c, t]) => `${n} ${c}/${t}`).join(' · '));
      console.log(' sombras:', r.sombras.map(([n, c, t]) => `${n} ${c}/${t}`).join(' · '));
    }
    R.note('herramienta de diagnóstico: sin comprobaciones');
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
