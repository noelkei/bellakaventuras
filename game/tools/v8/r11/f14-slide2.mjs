// R11 · F14 · copia de la sonda AUD-JUG/ANIM/slide2.mjs (mismas comprobaciones; solo cambian rutas y nombre del informe).
// AUD-JUG/ANIM · deslizamiento (variante 2): por fotograma, la MENOR velocidad horizontal de los dos dedos (el pie de apoyo es el más lento) frente al cuerpo;
// apoyo (el más bajo) frente a la velocidad del cuerpo, en marcha, marcha atrás, agachada, giro con pasos y gesto táctil lento.
import { Report, runTest, launch, openGame, clickStart, sleep, place, installHelpers, sim } from './f14-anim-lib.mjs';
const R = new Report('r11-f14-slide2');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1500); await installHelpers(page);
    const cases = [['marcha (W)', ['KeyW']], ['marcha atrás (S)', ['KeyS']], ['agachada (W+C)', ['KeyW', 'KeyC']], ['giro con pasos (A)', ['KeyA']], ['marcha girando (W+D)', ['KeyW', 'KeyD']]];
    for (const [lab, keys] of cases) for (let rep = 1; rep <= 2; rep++) {
      await page.evaluate(() => window.__bk.input.clear()); await place(page, R, [8, 0, -26], 0, 'walk', `${lab} #${rep}`); await sim(page, 0.5);
      const r = await page.evaluate(async (keys) => { const g = window.__bk, V = g.visual, T = window.__bkTHREE, s = g.skater; const bones = V.body.skeleton.bones;
        const toe = [bones.find((b) => /LeftToeBase$/.test(b.name)), bones.find((b) => /RightToeBase$/.test(b.name))]; let prev = null; const st = [], body = [];
        for (const k of keys) window.__K(k, true);
        await window.__sim(3.5, (t) => { V.root.updateMatrixWorld(true); const p = toe.map((b) => b.getWorldPosition(new T.Vector3()));
          if (prev && t > 0.8) { const v0 = Math.hypot(p[0].x - prev[0].x, p[0].z - prev[0].z) * 60, v1 = Math.hypot(p[1].x - prev[1].x, p[1].z - prev[1].z) * 60; st.push(Math.min(v0, v1)); body.push(Math.hypot(s.vel.x, s.vel.z)); }
          prev = p; });
        for (const k of keys) window.__K(k, false);
        const srt = [...st].sort((a, b) => a - b), q = (x) => +srt[Math.floor(x * (srt.length - 1))].toFixed(2);
        return { n: st.length, apoyoMediana: q(0.5), apoyoP75: q(0.75), cuerpoMedia: +(body.reduce((a, b) => a + b, 0) / Math.max(1, body.length)).toFixed(2), timeScale: +(V.actions.get(V.currentName)?.timeScale ?? 0).toFixed(2), clip: V.currentName }; }, keys);
      const ratio = r.cuerpoMedia > 0.05 ? +(r.apoyoMediana / r.cuerpoMedia).toFixed(2) : null;
      R.note({ caso: `${lab} #${rep}`, ...r, ratio });
      // R11: solo el andar AGACHADA es ANIM-02 (el plan lo acota a ese clip); el resto se anota (heurística aproximada, sin hallazgo abierto)
      if (/agachada/.test(lab)) R.check(r.apoyoMediana < 0.35, `ANIM-02 ${lab} #${rep}: el pie de apoyo apenas patina (mediana < 0,35 m/s; cuerpo ${r.cuerpoMedia} m/s)`, 'vision', { ...r, ratio });
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
