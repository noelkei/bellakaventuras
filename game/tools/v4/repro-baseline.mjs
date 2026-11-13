// V4-FIS-01 / V4-CTRL-05 · Reproducción ANTES de corregir (se ejecuta contra la baseline V3 y se repite tras el arreglo).
// Caso A (HUM-A4-001/META-A4-002): salir andando/patinando del borde de una superficie elevada (plataforma NMG 0,6 m) sin
//   saltar. Fixture declarada: colocar a ANMI sobre la plataforma mirando al borde. Entrada normal: tecla W real.
//   Se mide por paso de render la altura del pie y si sigue «grounded» fuera de la huella de la plataforma.
// Caso B (HUM-A4-004): bajar de la tabla estando en fakie y andar. Fixture declarada: fakie=true y montado. Entrada normal:
//   tecla Q/W reales. Se compara la dirección visible de ANMI (raíz del modelo) con la velocidad real.
// Ambos casos DEBEN dar rojo en V3 si el mecanismo es el diagnosticado; en V4 deben pasar.
import { Report, runTest, launch, openGame, clickStart, snap, sleep, holdKeys } from './lib.mjs';

const R = new Report('FIS-01', 'repro-baseline');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    // ---------------------------------------------------------------- A: falso suelo
    const plat = await page.evaluate(() => {
      const g = window.__bk;
      const c = [...g.park.b.colliders].find((x) => x.name === 'nmg_platform').c;
      const t = c.translation(), h = c.halfExtents(), r = c.rotation();
      const yaw = 2 * Math.atan2(r.y, r.w);
      return { x: t.x, y: t.y, z: t.z, hx: h.x, hy: h.y, hz: h.z, yaw, top: t.y + h.y };
    });
    R.check(Math.abs(plat.top - 0.6) < 0.01, 'plataforma NMG localizada (techo 0,6 m)', 'static', plat);
    for (const mode of ['walk', 'ride']) {
      // fixture: sobre la plataforma, a 1 m de un borde SIN pieza adosada, mirando hacia él. V3: lateral −X; V4 (planta
      // nueva, el corazón está adosado al lado −X): borde trasero −Z en x +1,5
      const start = await page.evaluate((p, mode) => {
        const g = window.__bk, s = g.skater, T = window.__bkTHREE;
        const v4 = !!g.park.colliderName && [...g.park.b.colliders].some((x) => x.name === 'nmg_heart_ledge' && Math.hypot(x.c.translation().x - p.x, x.c.translation().z - p.z) < 5);
        const lx = v4 ? 1.5 : -p.hx + 1.0, lz = v4 ? -p.hz + 1.0 : 0, c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
        const pos = new T.Vector3(p.x + lx * c + lz * sn, p.top, p.z - lx * sn + lz * c);
        const heading = v4 ? p.yaw + Math.PI : p.yaw - Math.PI / 2; // V4: dirección −Z local; V3: −X local
        s.teleport(pos, heading, mode === 'ride' ? 'ride' : 'walk');
        if (s.walkLock !== undefined && mode === 'walk') s.walkLock = true;
        g.rig.snapBehind(s);
        return { x: pos.x, y: pos.y, z: pos.z, heading };
      }, plat, mode);
      R.fixture(`A-${mode}: ANMI sobre la plataforma NMG mirando al borde lateral`, start);
      await sleep(300);
      const inside = (q) => { const dx = q.x - plat.x, dz = q.z - plat.z, c = Math.cos(plat.yaw), sn = Math.sin(plat.yaw); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < plat.hx + 0.31 && Math.abs(lz) < plat.hz + 0.31; };
      const samples = await holdKeys(page, ['KeyW'], 1400, { every: 50 });
      const after = []; for (let i = 0; i < 20; i++) { after.push(await snap(page)); await sleep(50); }
      const all = [...samples, ...after];
      const off = all.filter((q) => !inside(q));
      const hover = off.filter((q) => q.y > 0.3);
      const hoverGrounded = hover.filter((q) => q.grounded);
      R.nonEmpty(off, `A-${mode}: muestras fuera de la huella de la plataforma`);
      R.check(hoverGrounded.length <= 2, `A-${mode}: fuera de la plataforma no queda «grounded» flotando (≤2 muestras a >0,3 m)`, 'input',
        { offSamples: off.length, hoverSamples: hover.length, hoverGrounded: hoverGrounded.length, lastY: all.at(-1)?.y, maxOffY: Math.max(...off.map((q) => q.y)), first: off[0] });
      R.check(after.at(-1).y < 0.15, `A-${mode}: termina en el suelo sin saltar`, 'input', { finalY: after.at(-1).y, state: after.at(-1).state });
      // mecanismo: en la traza por paso fijo nunca hay «grounded» con el suelo más lejos que la tolerancia de apoyo (V4)
      const tr = await page.evaluate(() => (window.__bk.skater.trace ?? []).slice(-240));
      if (tr.length) { const bad = tr.filter((q) => q.g === 1 && q.kcc === 0 && q.sup > 0.08 + 0.03 + 0.02); R.check(bad.length === 0, `A-${mode}: traza por paso: ningún «grounded» sin contacto KCC con hueco > tolerancia`, 'input', { bad: bad.length, sample: bad[0] }); }
    }
    // ---------------------------------------------------------------- B: inversión visible tras bajar en fakie
    const v4 = await page.evaluate(() => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.__bk.skater), 'vLong') !== undefined);
    const B = await page.evaluate((v4) => {
      const g = window.__bk, s = g.skater;
      const p = g.manifest.spawn.pos.clone();
      s.teleport(p, g.manifest.spawn.heading, 'ride'); if (!v4) s.fakie = true; g.rig.snapBehind(s);
      return { fakie: s.fakie, loco: s.loco, v4 };
    }, v4);
    R.fixture(v4 ? 'B: montado y parado en el spawn (V4: la marcha atrás se produce con S real)' : 'B: montado y en fakie en el spawn (fakie preparado, V3)', B);
    await sleep(200);
    if (v4) {
      // ruta V4 legítima: S mantenida = freno → zona neutra → reversa; soltar; esperar a ≤0,8 m/s
      const rev = await holdKeys(page, ['KeyS'], 1200, { every: 100 });
      R.check(rev.some((q) => q.vLong < -0.8 && q.state === 'reverse'), 'B: S desde parado produce marcha atrás en tabla (frente conservado)', 'input', { minV: Math.min(...rev.map((q) => q.vLong)), states: [...new Set(rev.map((q) => q.state))] });
      for (let i = 0; i < 40; i++) { const q = await snap(page); if (Math.abs(q.vLong) < 0.75) break; await sleep(100); }
    }
    // bajar con Q (entrada real) y andar con W
    await page.keyboard.press('KeyQ'); await sleep(900);
    const mid = await snap(page);
    if (mid.loco !== 'walk') { await page.keyboard.press('KeyQ'); await sleep(900); }
    const walk = await holdKeys(page, ['KeyW'], 900, { every: 100 });
    const vis = await page.evaluate(() => {
      const g = window.__bk, s = g.skater, T = window.__bkTHREE;
      const f = new T.Vector3(0, 0, 1).applyQuaternion(g.visual.root.quaternion); f.y = 0; f.normalize();
      const v = new T.Vector3(s.vel.x, 0, s.vel.z); const sp = v.length(); if (sp > 1e-3) v.divideScalar(sp);
      return { loco: s.loco, fakie: s.fakie, speed: sp, dot: f.x * v.x + f.z * v.z };
    });
    R.check(vis.loco === 'walk' && vis.speed > 0.5, 'B: anda tras bajar de la tabla', 'input', vis);
    R.check(vis.dot > 0.5, 'B: ANMI mira hacia donde anda (no anda de espaldas con el clip de avance)', 'input', { ...vis, walk: walk.slice(-2) });
  } finally { await browser.close(); }
});
