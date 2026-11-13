// ASSET-05: coste de los derivados frente a sus proxies procedurales en los MISMOS puntos y cámara (draw calls, triángulos,
// texturas/geometrías vivas) + bytes publicados por tipo (asset-report). Datos de Chrome sin interfaz: no certifican GPU móvil.
//   node tools/v3/asset-cost.mjs → captures/v3/P6/ASSET/asset-cost.json
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, GAME } from './lib.mjs';

const R = new Report('P6/ASSET', 'asset-cost', { method: 'renderer.info tras 3 fotogramas con cámara fija; derivados frente a proxies (se alterna la visibilidad, misma escena)' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, save: fs.readFileSync(path.join(GAME, 'tools', 'fixtures', 'v4-triple-ganado.json'), 'utf8') });
R.fixture('guardado v4 con el triple ganado (centro abierto y coches visibles)', 'tools/fixtures/v4-triple-ganado.json');
try {
  await clickStart(page); await sleep(1500);
  const points = { nmg_llegada: [[20, 2, -40], [16, 1, -26]], tt_puente: [[22, 7, 22], [33, 4, 12]], centro: [[0, 6, 24], [0, 1, 0]], fg_pista: [[-20, 3, 22], [-28, 1, 10]] };
  const out = {};
  for (const [name, [cp, tp]] of Object.entries(points)) {
    for (const mode of ['derivados', 'proxies']) {
      const info = await page.evaluate(async ({ cp, tp, mode }) => {
        const g = window.__bk, T = window.__bkTHREE;
        g.cars.setActive(true);
        g.park.root.traverse((o) => { if (o.name.startsWith('PROP_')) o.visible = mode === 'derivados'; if (o.name.startsWith('STATIC_proxy_')) o.visible = mode === 'proxies'; });
        g.rig.toFixed({ pos: new T.Vector3(...cp), target: new T.Vector3(...tp), hfov: 70 }, true);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        const r = g.renderer; r.info.autoReset = false; r.info.reset(); r.render(g.scene, g.rig.cam);
        const i = { calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures }; r.info.autoReset = true; return i;
      }, { cp, tp, mode });
      (out[name] ??= {})[mode] = info;
    }
  }
  await page.evaluate(() => window.__bk.park.root.traverse((o) => { if (o.name.startsWith('PROP_')) o.visible = true; if (o.name.startsWith('STATIC_proxy_')) o.visible = false; }));
  R.data.points = out;
  const rep = JSON.parse(fs.readFileSync(path.join(GAME, 'public', 'assets', 'asset-report.json'), 'utf8'));
  const props = rep.files.filter((f) => /assets\/props\/(palm|tree|shrub|lamp|speaker|planter|limo|car)/.test(f.dst)).map((f) => ({ dst: f.dst, raw: f.before, published: f.after, tris: f.tris }));
  R.data.bytes = { total: rep.totals, props, propsPublished: props.reduce((a, f) => a + f.published, 0) };
  for (const [name, v] of Object.entries(out)) R.check(v.derivados.calls - v.proxies.calls <= 12 && v.derivados.triangles < 1.5e6, `${name}: derivados con ≤12 draw calls más que los proxies y <1,5 M triángulos`, 'static', v);
  R.check(R.data.bytes.propsPublished < 3e6, 'props y vehículos derivados publicados <3 MB en total (meta 2–3 MB netos del plan)', 'static', { propsPublished: R.data.bytes.propsPublished });
  R.note('Medidas locales en Chrome sin interfaz; no certifican rendimiento en GPU móvil.');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
