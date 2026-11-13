// UX-03: cámaras de actividad en apaisado 900×620 y vertical 390×844. Entrada real (E) a cada actividad desde una posición
// declarada; tras la transición se mide: puntos clave (cabeza/manos/pies de ANMI, cabeza de los NPC, tabla aparcada, limo)
// dentro del encuadre con margen y sin sólido entre cámara y punto; tamaño en pantalla del sujeto principal; en el grafiti,
// lienzo entero dentro de la pantalla y controles fuera del lienzo; en el baile, ningún rótulo delante de ANMI.
// El final (vuelo ¾, triple y aterrizaje) se mide en final.mjs (P5/FIN).
//   node tools/v3/ux03.mjs [L|P] → captures/v3/P3/UX-03/ux03.json + *.jpg
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, VIEWPORTS, GAME } from './lib.mjs';

const only = (process.argv[2] ?? 'LP').toUpperCase();
const R = new Report('P3/UX-03', 'ux03', { method: 'E real para entrar; fixtures: posición de salida junto a cada actividad y guardado con el puente alcanzado; medidas por proyección y rayos en la página' });
const browser = await launch();
const fx = (n) => fs.readFileSync(path.join(GAME, 'tools', 'fixtures', n + '.json'), 'utf8');
let page;
/** Proyecta puntos y comprueba encuadre y oclusión. pts: [{name, obj:'anmi'|npcId, bone:/regex/ | null, pos?}] */
const frame = (spec) => page.evaluate((spec) => {
  const g = window.__bk, T = window.__bkTHREE, R = window.__bkRapier, cam = g.rig.cam, cp = cam.position;
  const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  const boneOf = (root, re) => { let b = null; root.traverse((o) => { if (!b && (o.isBone || o.type === 'Bone') && re.test(o.name)) b = o; }); return b; };
  const rootOf = (who) => who === 'anmi' ? g.visual.model : (g.npcs.get(who)?.[who === 'bella' ? spec.idx ?? 0 : 0]?.model);
  const out = [];
  for (const p of spec.pts) {
    let w = null;
    if (p.pos) w = new T.Vector3(...p.pos);
    else { const root = p.who === 'bella' ? g.npcs.get('bella')?.[p.idx]?.model : rootOf(p.who); if (!root) { out.push({ name: p.name, missing: true }); continue; } const b = boneOf(root, new RegExp(p.bone, 'i')); w = new T.Vector3(); (b ?? root).getWorldPosition(w); }
    const n = w.clone().project(cam), inFrame = Math.abs(n.x) <= 0.94 && Math.abs(n.y) <= 0.94 && n.z < 1;
    const d = w.clone().sub(cp), L = d.length(); d.divideScalar(L);
    ray.origin = { x: cp.x, y: cp.y, z: cp.z }; ray.dir = { x: d.x, y: d.y, z: d.z };
    const hit = g.world.castRay(ray, Math.max(0, L - 0.3), true, R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, g.skater.collider, undefined, g.rig.ignore ?? undefined);
    // oclusión VISUAL: mallas del parque (rótulos y decorado sin colisión incluidos)
    const rc = new T.Raycaster(cp.clone(), d.clone(), 0.1, Math.max(0, L - 0.35)); const vh = rc.intersectObject(g.park.root, true).filter((h) => h.object.visible && !(h.object.material?.transparent && h.object.material?.opacity < 0.6));
    out.push({ name: p.name, ndc: [+n.x.toFixed(2), +n.y.toFixed(2)], inFrame, occluded: !!hit || vh.length > 0, visBy: vh[0]?.object.name || (vh.length ? vh[0].object.type : null), dist: +L.toFixed(2), px: [Math.round((n.x + 1) / 2 * innerWidth), Math.round((1 - n.y) / 2 * innerHeight)] });
  }
  // altura en pantalla del sujeto principal (cabeza→pies), fracción de la altura de la vista
  const span = (a, b) => { const A = out.find((o) => o.name === a), B = out.find((o) => o.name === b); return A && B && !A.missing && !B.missing ? +Math.abs(A.ndc[1] - B.ndc[1]).toFixed(2) / 2 : null; };
  return { pts: out, mainSpan: spec.main ? span(spec.main[0], spec.main[1]) : null, mode: g.rig.mode, fov: +cam.fov.toFixed(1), aspect: +cam.aspect.toFixed(2) };
}, spec);
const ok = (f, names) => names.every((n) => { const p = f.pts.find((q) => q.name === n); return p && !p.missing && p.inFrame && !p.occluded; });
const enter = async (label) => {
  await page.waitForFunction((l) => new RegExp(l).test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 6000 }, label).catch(() => {});
  await page.keyboard.press('KeyE'); await sleep(1500);
};

try {
  for (const [tag, vp] of [['L', { width: 900, height: 620, deviceScaleFactor: 1 }], ['P', VIEWPORTS.phone]]) {
    if (!only.includes(tag)) continue;
    const name = tag === 'L' ? '900x620' : '390x844';
    page = await openGame(browser, R, { viewport: vp, save: fx('v2-puente-arriba') });
    R.fixture(`${name}: guardado con el puente alcanzado (charla pendiente)`, 'tools/fixtures/v2-puente-arriba.json');
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    const shot = (n) => page.screenshot({ path: path.join(R.dir, `${name}_${n}.jpg`), type: 'jpeg', quality: 72 });
    const near = (anchor, dist) => page.evaluate(async ({ anchor, dist }) => { const g = window.__bk, T = window.__bkTHREE; const n = g.manifest.get(anchor); const d = new T.Vector3(Math.sin(n.heading), 0, Math.cos(n.heading)); g.skater.teleport(n.pos.clone().addScaledVector(d, dist), n.heading + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); }, { anchor, dist });

    // Pantera
    await page.evaluate(async () => { for (const id of ['la_pantera', 'aissa', 'juseph', 'bella']) await window.__bk.loadNpc(id); });
    await near('npc.la_pantera', 2.4); await enter('HABLAR');
    let f = await frame({ pts: [{ name: 'panteraCabeza', who: 'la_pantera', bone: 'head' }, { name: 'panteraMano', who: 'la_pantera', bone: 'righthand$' }, { name: 'anmiCabeza', who: 'anmi', bone: 'head$' }], main: ['panteraCabeza', 'panteraMano'] });
    await shot('pantera'); R.data[`pantera_${tag}`] = f;
    R.check(ok(f, ['panteraCabeza', 'panteraMano', 'anmiCabeza']), `${name} Pantera: cara y mano de La Pantera y ANMI en cuadro sin bloque ni poste delante`, 'input', f);
    await page.keyboard.press('Escape'); await sleep(300); await page.evaluate(() => document.getElementById('btn-resume')?.click()); await sleep(200);
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__bk.mode !== 'explore')); i++) { await page.keyboard.press('Enter'); await sleep(600); }

    // Aissa y Juseph en el tablero
    await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('bridge.top'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
    await enter('HABLAR');
    f = await frame({ pts: [{ name: 'aissaCabeza', who: 'aissa', bone: 'head' }, { name: 'josephCabeza', who: 'juseph', bone: 'head' }, { name: 'aissaPie', who: 'aissa', bone: 'foot' }, { name: 'anmiCabeza', who: 'anmi', bone: 'head$' }] });
    const limo = await page.evaluate(() => { const s = window.__bk.park.propSlots.find((q) => q.kind === 'limo'); return s ? [s.x, s.y + 0.8, s.z] : null; });
    const fl = limo ? await frame({ pts: [{ name: 'limo', pos: limo }] }) : null;
    await shot('puente'); R.data[`puente_${tag}`] = { f, fl };
    R.check(ok(f, ['aissaCabeza', 'josephCabeza', 'anmiCabeza']) && (!fl || fl.pts[0].inFrame), `${name} puente: Aissa, Juseph, ANMI y la limo en cuadro, sin oclusión`, 'input', { f, fl });
    for (let i = 0; i < 10 && (await page.evaluate(() => window.__bk.mode !== 'explore')); i++) { await page.keyboard.press('Enter'); await sleep(600); }

    // grafiti: lienzo entero y controles fuera
    await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('mural.paint'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.input.clear(); });
    await enter('PINTAR'); await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 6000 }).catch(() => {});
    const gr = await page.evaluate(() => { const c = document.getElementById('graffiti-canvas').getBoundingClientRect(); const ctr = [...document.querySelectorAll('#graffiti button')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, overlaps: r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top, w: r.width, h: r.height }; }); return { canvas: { x: c.left, y: c.top, w: c.width, h: c.height, inside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, ratio: +(c.width / c.height).toFixed(2) }, ctr }; });
    await shot('grafiti'); R.data[`grafiti_${tag}`] = gr;
    R.check(gr.canvas.inside && gr.canvas.w >= 300 && gr.ctr.every((c) => !c.overlaps && c.w >= 44 && c.h >= 44), `${name} grafiti: lienzo entero dentro de la pantalla (≥300 px de ancho) y controles fuera del lienzo`, 'input', gr);
    await page.click('#graffiti-exit'); await sleep(500);

    // baile: ANMI de cara, pies y tabla aparcada visibles, tres chicas alrededor, sin rótulo delante
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, c = g.manifest.get('dance.center'); const dir = new T.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading)); g.skater.teleport(c.pos.clone().addScaledVector(dir, 3.0), c.heading + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
    await page.keyboard.down('KeyW'); await page.waitForFunction(() => /BAIL/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 6000 }).catch(() => {}); await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE'); await sleep(1600);
    const board = await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo').boardProp; if (!a) return null; const p = new window.__bkTHREE.Vector3(); a.getWorldPosition(p); return [p.x, p.y + 0.05, p.z]; });
    f = await frame({ pts: [{ name: 'anmiCabeza', who: 'anmi', bone: 'head$' }, { name: 'anmiPieI', who: 'anmi', bone: 'leftfoot$' }, { name: 'anmiPieD', who: 'anmi', bone: 'rightfoot$' }, { name: 'anmiManoI', who: 'anmi', bone: 'lefthand$' }, { name: 'anmiManoD', who: 'anmi', bone: 'righthand$' },
      ...[0, 1, 2].map((i) => ({ name: `chica${i}`, who: 'bella', idx: i, bone: 'head' })), ...(board ? [{ name: 'tabla', pos: board }] : [])], main: ['anmiCabeza', 'anmiPieI'] });
    const cover = await page.evaluate((pts) => { const a = pts.filter((p) => /^anmi/.test(p.name) && p.px); return [...document.querySelectorAll('#dance > *')].filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, covers: a.filter((p) => p.px[0] > r.left && p.px[0] < r.right && p.px[1] > r.top && p.px[1] < r.bottom).map((p) => p.name) }; }).filter((x) => x.covers.length); }, f.pts);
    const facing = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; const fw = new T.Vector3(0, 0, 1).applyQuaternion(g.visual.model.getWorldQuaternion(new T.Quaternion())); fw.y = 0; fw.normalize(); const to = g.rig.cam.position.clone().sub(g.skater.visualPos); to.y = 0; to.normalize(); return +fw.dot(to).toFixed(2); });
    await shot('baile'); R.data[`baile_${tag}`] = { f, cover, facing };
    R.check(ok(f, ['anmiCabeza', 'anmiPieI', 'anmiPieD', 'anmiManoI', 'anmiManoD', 'tabla', 'chica0', 'chica1', 'chica2']) && cover.length === 0 && facing > 0.5 && (f.mainSpan ?? 0) >= (tag === 'P' ? 0.08 : 0.18),
      `${name} baile: ANMI de cara (pies y manos), tabla aparcada y las tres chicas en cuadro, sujeto ≥18 % de la altura (≥8 % en vertical: grupo ancho en pantalla estrecha) y ningún rótulo delante de ANMI`, 'input', { f, cover, facing });
    await page.click('#dance-exit'); await sleep(500);
    const back = await page.evaluate(() => ({ mode: window.__bk.mode, cam: window.__bk.rig.mode }));
    R.check(back.mode === 'explore' && back.cam === 'follow', `${name}: al salir de la actividad la cámara vuelve al seguimiento`, 'input', back);
    await page.close();
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
