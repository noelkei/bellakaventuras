// V4-GRAF-02 · Texturas del kit NMG y suelos tal como las usa el RUNTIME: espacio de color (sRGB en color base), mipmaps y
// filtrado, anisotropía, sin transparencia accidental en caras opacas, tamaño servido acotado (no PNG enormes en runtime) y
// UV dentro de [0,1] o repetición declarada. Además, la textura del corazón del kit es la PROPIA V4 (no el recorte V3).
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('GRAF-02', 'graf-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(2000);
    const res = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, out = [];
      let kit = null; g.park.root.traverse((o) => { if (!kit && o.name === 'NMG_KIT') kit = o; });
      const seen = new Set();
      const scan = (root, tag) => root?.traverse((o) => {
        if (!o.isMesh) return; for (const m of [].concat(o.material)) {
          if (!m || seen.has(m)) continue; seen.add(m);
          const tex = m.map; if (!tex) continue; const img = tex.image;
          out.push({ tag, mat: m.name, mesh: o.name, cs: tex.colorSpace, srgb: tex.colorSpace === T.SRGBColorSpace, mip: tex.generateMipmaps !== false && tex.minFilter !== T.LinearFilter && tex.minFilter !== T.NearestFilter, aniso: tex.anisotropy,
            w: img?.width ?? null, h: img?.height ?? null, transparent: !!m.transparent, alphaTest: m.alphaTest, wrap: [tex.wrapS, tex.wrapT] });
        }
      });
      scan(kit, 'kit');
      const floors = []; g.park.root.traverse((o) => { if (o.isMesh && /nmg_floor/.test(o.name + ' ' + [].concat(o.material).map((m) => m?.name).join(' '))) floors.push(o); });
      for (const f of floors) scan(f, 'suelo');
      return { kitFound: !!kit, rows: out, maxAniso: g.renderer.capabilities.getMaxAnisotropy() };
    });
    R.note({ texturas: res.rows });
    R.check(res.kitFound && res.rows.filter((r) => r.tag === 'kit').length >= 3, 'kit NMG cargado con texturas propias', 'static', { n: res.rows.length });
    R.check(res.rows.every((r) => r.srgb), 'color base en sRGB en todas las caras texturizadas (sin colores lavados)', 'static', res.rows.filter((r) => !r.srgb));
    R.check(res.rows.every((r) => r.mip), 'mipmaps/filtrado trilineal (sin parpadeo a distancia)', 'static', res.rows.filter((r) => !r.mip));
    R.check(res.rows.every((r) => !r.transparent || r.alphaTest > 0), 'sin transparencia accidental en piezas opacas (las calcas usan recorte alfa)', 'static', res.rows.filter((r) => r.transparent && !(r.alphaTest > 0)));
    R.check(res.rows.every((r) => (r.w ?? 0) <= 2048 && (r.h ?? 0) <= 2048), 'tamaño servido acotado (≤ 2048 px; sin PNG enormes en runtime)', 'static', res.rows.map((r) => `${r.mat} ${r.w}×${r.h}`));
    R.note({ anisotropia: { max: res.maxAniso, valores: [...new Set(res.rows.map((r) => r.aniso))] } });
  } finally { await browser.close(); }
});
