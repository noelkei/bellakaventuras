// R11 · F13 (SIS-23) · copia de la sonda AUD-JUG/SIS/hitch.mjs (mismas comprobaciones; solo cambian rutas y nombre).
// AUD-JUG/SIS · tirones de primera visita: partida recién cargada; se lleva a ANMI (teleport declarado) a cada zona por primera
// vez y se registran 3 s de fotogramas reales SIN tiempo de asentamiento: fotograma más largo, nº > 50 ms y programas de shader
// nuevos (renderer.info.programs) → ¿compilación en caliente? Después, segunda visita (control). 2 repeticiones (perfil limpio).
import { Report, runTest, launch, sleep, SAVE_20, VIEWPORTS } from '../lib.mjs';
import { openSis, start } from './f11-sis-lib.mjs';
const R = new Report('r11-f13-hitch');
const ORDER = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl', 'center'];
await runTest(R, async () => {
  for (let rep = 1; rep <= 2; rep++) {
    const b = await launch();
    try {
      const page = await openSis(b, R, { viewport: VIEWPORTS.desktop, save: SAVE_20, label: `#${rep}` }); await start(page); await sleep(2500);
      const visit = (z) => page.evaluate(async (z) => { const g = window.__bk, info = g.renderer.info; const p0 = info.programs?.length ?? 0, t0g = info.memory.textures;
        g.input.clear(); g.teleportTo(z); g.rig.snapBehind(g.skater);
        const ts = []; let last = performance.now(); const tStart = last;
        await new Promise((res) => { const f = () => { const t = performance.now(); ts.push(+(t - last).toFixed(1)); last = t; if (t - tStart < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        return { z, max: Math.max(...ts), over50: ts.filter((x) => x > 50).length, top3: [...ts].sort((a, b) => b - a).slice(0, 3), newPrograms: (info.programs?.length ?? 0) - p0, newTextures: info.memory.textures - t0g }; }, z);
      const first = []; for (const z of ORDER) first.push(await visit(z));
      const second = []; for (const z of ORDER) second.push(await visit(z));
      R.measure(`rep${rep}`, { first, second });
      const bad = first.filter((v) => v.max > 100);
      R.check(bad.length === 0, `#${rep}: primera visita a cada zona sin tirones > 100 ms`, 'emulation', { first: first.map((v) => `${v.z}: max ${v.max} ms, >50ms ${v.over50}, programas +${v.newPrograms}, texturas +${v.newTextures}`), second: second.map((v) => `${v.z}: max ${v.max}`) });
    } finally { await b.close(); }
  }
}, { timeoutMs: 600000 });
