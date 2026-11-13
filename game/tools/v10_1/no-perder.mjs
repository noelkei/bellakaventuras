// V10.1 R0 (R3 del análisis) · Guardián de lo APROBADO en V10 que no tenía prueba (V10/IT4/NO_PERDER.md, «Huecos»). Mide en el juego servido:
//  1 · coronilla de Bellakroak y Bellakat (rana y fennec) en YY, NVDA y SN: EXPECT_HEAD m sobre su base (V10: 0,895; V10.1 P21: ×1,3 → 1,16)
//  2 · figuras gigantes del exterior: cimas 20 / 25,1 m y centradas en la diagonal de su esquina (|fuera de la diagonal| ≤ 5 cm)
//  3 · suelo turquesa del exterior visible: el primer acierto de un rayo vertical en 8 puntos de suelo libre es el azulado (bola_azulado)
//  4 · letras BELLAKACIONES: color por vértice en tres tonos (cara, canto, techo) + autoiluminación por vértice
//  5 · cielo: cúpula sin niebla, sol low-poly y nubes low-poly presentes
//  6 · carteles rosas (NVDA, TT y NMG) con su lettering nuevo; grafitis BELLAKAT (B1) y Ai (C1) de NVDA
//  7 · pose del reto de SN al tirarse: agachada patinando (SK_CrouchRide con peso > 0,5), nunca pose en A (sin acciones)
//  8 · ANMI r3 con el pantalón T1: color mediano de la tela del pantalón en la textura (máscara por huesos de pierna) dentro de ±12/255
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
const R = new Report('no-perder-v10-1');
/** V10: 0,895 (IT3, `NPC_HEAD_TOP`). Cambio de diseño aprobado D15 (P21, ×1,3) → 1,16 en R3. */
const EXPECT_HEAD = +(0.895 * 1.3).toFixed(3);   // V10.1 R3: D15 aplicado (copia previa en V10/backups/pruebas/V10_1-R3)
/** Medidas de la versión aprobada (V10 final, 5245) tomadas al escribir el guardián. */
const PANTS_RGB = [76, 78, 96];   // V10 final (5241 = 5245), 19 oct
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(4000);
    // 1 · cabezas: se fuerzan las cargas (rana y fennec de sus zonas; reparto de SN) y se espera
    await page.evaluate(async () => { const g = window.__bk; await g.loadNpc('rana'); await g.loadNpc('fennec'); await g.loadSnCast(); });
    await sleep(2500);
    const heads = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, v = new T.Vector3(), out = [];
      g.scene.updateMatrixWorld(true);
      const actors = [['YY rana', g.npcs.get('rana')?.[0]], ['NVDA fennec', g.npcs.get('fennec')?.[0]], ...g.snCast.filter((a) => a.root.userData && !a.variant).slice(0, 2).map((a, i) => [i ? 'SN fennec' : 'SN rana', a])];
      for (const [n, a] of actors) { if (!a) { out.push({ n, falta: true }); continue; } let y = null; a.root.traverse((o) => { if (o.name.endsWith('HeadTop_End')) y = o.getWorldPosition(v).y; });
        const base = a.root.getWorldPosition(new T.Vector3()).y; out.push({ n, coronilla: y === null ? null : +(y - base).toFixed(3) }); }
      return out; });
    R.measure('cabezas', heads);
    R.check(heads.length === 4 && heads.every((h) => h.coronilla !== null && Math.abs(h.coronilla - EXPECT_HEAD) <= 0.035), `1 · coronilla de rana y fennec (YY, NVDA, SN) a ${EXPECT_HEAD} ± 0,035 m (medida animada: el Idle baja la cabeza hasta 2,5 cm)`, 'static', heads);
    // 2 · figuras gigantes
    const fig = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; let F = null; g.scene.traverse((o) => { if (o.name === 'BOLA_FIGURAS') F = o; }); if (!F) return null; g.scene.updateMatrixWorld(true);
      return F.children.map((f) => { const bb = new T.Box3().setFromObject(f, true), c = bb.getCenter(new T.Vector3()), sx = Math.sign(c.x), sz = Math.sign(c.z), lat = new T.Vector3(-sz, 0, sx).normalize();
        return { n: f.name, cima: +bb.max.y.toFixed(2), fuera: +(c.x * lat.x + c.z * lat.z).toFixed(3) }; }); });
    R.measure('figuras', fig);
    const tops = (fig ?? []).map((f) => f.cima).sort((a, b) => a - b);
    R.check(!!fig && fig.length === 2 && Math.abs(tops[0] - 20) <= 0.15 && Math.abs(tops[1] - 25.1) <= 0.15 && fig.every((f) => Math.abs(f.fuera) <= 0.05), '2 · figuras gigantes: cimas 20 y 25,1 m (± 0,15), centradas en su diagonal (± 5 cm)', 'static', fig);
    // 3 · suelo turquesa visible (puntos de suelo libre del exterior del sondeo de IT3)
    const suelo = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, rc = new T.Raycaster(), out = []; g.scene.updateMatrixWorld(true);
      const meshes = []; g.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && !/SKY/.test(o.name)) { let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (vis) meshes.push(o); } });
      for (const [x, z] of [[42, -42], [-44, -30], [-40, -44], [44, 40], [30, 46], [0, -48], [48, 0], [-48, 10], [-46, 46], [46, -10], [-20, -47], [20, 47]]) { rc.set(new T.Vector3(x, 20, z), new T.Vector3(0, -1, 0)); const hits = []; for (const o of meshes) { try { rc.intersectObject(o, false, hits); } catch (e) { /* */ } }
        hits.sort((a, b) => a.distance - b.distance); const h = hits[0]; out.push({ x, z, malla: h?.object.name ?? null, y: h ? +h.point.y.toFixed(3) : null }); }
      return out; });
    R.measure('suelo', suelo);
    const libre = suelo.filter((s) => s.y !== null && s.y < 0.02);   // suelo libre = lo primero que se ve está a ras de suelo (no un banco o una jardinera)
    R.check(libre.length >= 8 && libre.every((s) => /bola_azulado/.test(s.malla ?? '') || /^D-BORDE|LOBBY/.test(s.malla ?? '')), `3 · en el suelo libre del exterior (${libre.length} puntos) lo que se ve es el turquesa (o la plaza/borde del lobby), nunca una losa de la maqueta encima`, 'static', suelo);
    // 4 · letras
    const let_ = await page.evaluate(() => { const g = window.__bk; let L = null; g.scene.traverse((o) => { if (o.name === 'BOLA_LETRAS') L = o; }); if (!L) return null; const tones = new Set(); let vc = 0, em = 0, n = 0;
      L.traverse((o) => { if (!o.isMesh) return; n++; const C = o.geometry.attributes.color; if (C) for (let i = 0; i < C.count; i += 7) tones.add(`${C.getX(i).toFixed(2)},${C.getY(i).toFixed(2)},${C.getZ(i).toFixed(2)}`);
        for (const m of [o.material].flat()) { if (m.vertexColors) vc++; if (String(m.customProgramCacheKey?.() ?? '').includes('bk_letras_vc_emissive') && m.emissiveIntensity > 0.3) em++; else window.__letKey = String(m.customProgramCacheKey?.() ?? '') + '|' + m.emissiveIntensity; } });
      return { mallas: n, tonos: tones.size, vc, em, key: window.__letKey ?? null }; });
    R.measure('letras', let_);
    R.check(!!let_ && let_.mallas > 0 && let_.tonos === 3 && let_.vc >= let_.mallas && let_.em >= let_.mallas, '4 · BELLAKACIONES: tres tonos de rosa por vértice y autoiluminación por vértice', 'static', let_);
    // 5 · cielo
    const sky = await page.evaluate(() => { const g = window.__bk; let dome = null, sun = null, clouds = null; g.scene.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.radius === 400) dome = o; if (o.name === 'SKY_SUN') sun = o; if (o.name === 'SKY_CLOUDS') clouds = o; });
      return { cupula: !!dome, sinNiebla: dome ? dome.material.fog === false : null, sol: !!sun && sun.children.length > 0, nubes: clouds ? clouds.count : 0, nubesSinNiebla: clouds ? clouds.material.fog === false : null }; });
    R.measure('cielo', sky);
    R.check(sky.cupula && sky.sinNiebla && sky.sol && sky.nubes >= 6 && sky.nubesSinNiebla, '5 · cielo: cúpula y nubes sin niebla, sol low-poly y nubes presentes', 'static', sky);
    // 6 · carteles y grafitis de NVDA
    const signs = await page.evaluate(() => { const g = window.__bk, src = (m) => { const t = [m?.material].flat()[0]?.map; return (t?.image?.src ?? t?.source?.data?.src ?? '').split('/').pop(); }; const out = {};
      g.scene.traverse((o) => { if (o.name === 'NV_LETTERING') out.nv = src(o); if (o.name === 'NV_GRAFITI_B1') out.b1 = src(o); if (o.name === 'NV_GRAFITI_C1') out.c1 = src(o); });
      for (const s of g.park.signs) { const f = src(s); if (/tt_lettering/.test(f)) out.tt = f; if (/nmg_lettering/.test(f)) out.nmg = f; }
      return out; });
    R.measure('carteles', signs);
    R.check(/T_nv_lettering_rosa/.test(signs.nv ?? '') && /T_tt_lettering_v10/.test(signs.tt ?? '') && /T_nmg_lettering_v2_rosa/.test(signs.nmg ?? ''), '6a · carteles rosas NVDA, TT (lettering nuevo) y NMG', 'static', signs);
    R.check(/G_nv_bellakat/.test(signs.b1 ?? '') && /G_nv_ai/.test(signs.c1 ?? ''), '6b · grafitis BELLAKAT en B1 y Ai en C1 de NVDA', 'static', signs);
    // 8 · pantalón T1 (antes del reto: la textura no depende de la pose)
    const pants = await page.evaluate(() => { const g = window.__bk; const body = []; g.visual.root.traverse((o) => { if (o.isSkinnedMesh && o.material?.map && /ANMI_BODY/.test(o.name)) body.push(o); }); const m = body[0]; if (!m) return null;
      const G = m.geometry, pos = G.attributes.position, uv = G.attributes.uv, si = G.attributes.skinIndex, sw = G.attributes.skinWeight, bones = m.skeleton.bones.map((b) => b.name), img = m.material.map.image;
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); const D = x.getImageData(0, 0, img.width, img.height).data;
      const flip = m.material.map.flipY, R = [], Gc = [], B = [];
      for (let i = 0; i < pos.count; i += 3) { let best = 0, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
        if (!/(UpLeg|[^p]Leg)$/.test(bones[bi] ?? '') || best < 0.8) continue; const px = Math.min(img.width - 1, Math.floor(uv.getX(i) * img.width)), py = Math.min(img.height - 1, Math.floor((flip ? 1 - uv.getY(i) : uv.getY(i)) * img.height)), o = (py * img.width + px) * 4;
        R.push(D[o]); Gc.push(D[o + 1]); B.push(D[o + 2]); }
      const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; }; return { n: R.length, rgb: [med(R), med(Gc), med(B)], tex: [img.width, img.height], malla: m.name }; });
    R.measure('pantalon', pants);
    const ref = PANTS_RGB ?? pants?.rgb;
    R.check(!!pants && pants.n > 200 && pants.rgb.every((v, i) => Math.abs(v - ref[i]) <= 12), `8 · pantalón T1: color mediano de la tela ${JSON.stringify(pants?.rgb)} (referencia ${JSON.stringify(ref)}, ± 12)`, 'static', pants);
    // 7 · pose del reto al tirarse
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const th = g.park.sn.group.rotation.y; g.skater.teleport(new T.Vector3(0, 7, -12.5).applyAxisAngle(new T.Vector3(0, 1, 0), th), th, 'walk'); g.rig.snapBehind(g.skater); });   /* V10.1: SN girado (copia en V10_1-SNROT) */
    R.fixture('ANMI en el carril de bajada de la coronación de A (y 7)', {});
    await sleep(900); await page.keyboard.press('KeyE');
    const pose = []; for (let i = 0; i < 10; i++) { await sleep(200);
      pose.push(await page.evaluate(() => { const g = window.__bk, v = g.visual, a = g.activities.find((x) => x.id === 'secretJump');
        const acts = (v.mixer?._actions ?? []).filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.05).map((x) => [x.getClip().name, +x.getEffectiveWeight().toFixed(2)]);
        return { ph: a.phase, acts }; })); }
    R.measure('pose_reto', pose);
    const run = pose.filter((p) => p.ph === 'run');
    R.check(run.length >= 2 && run.every((p) => p.acts.some(([n, w]) => n === 'SK_CrouchRide' && w > 0.5)), '7 · al tirarse en el reto de SN: agachada patinando (SK_CrouchRide), nunca pose en A', 'input', run.slice(0, 3));
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
