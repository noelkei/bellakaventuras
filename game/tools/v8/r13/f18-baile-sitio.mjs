// R13 · punto 2 · baile libre: sitio para bailar (FG-04) y tabla tumbada sobre suelo (FG-06), funcionando en el juego PUBLICADO.
// En R11 ambas comprobaciones leían `window.__bkRapier`, que solo existe con `?bktest`/DEV: en workers.dev no hacían nada y las
// pruebas (siempre con `?bktest`) no lo veían. Aquí se EMULA el juego publicado borrando `window.__bkRapier` antes de cada caso
// (la sonda guarda su propia copia para sus rayos).
//  E  estática: ningún módulo del juego (salvo bootstrap.ts, que las crea) lee `window.__bk*` (solo se permite escribir `__bkFinalLog`).
//  T  (retirado en V10.3: el túnel de FASHION GIRL ya no existe)
//  C  agachada en llano: no se puede bailar.
//  L  no empeorar: en llano abierto se baila; y en los 10 sitios junto a rampas/escalones que el arreglo de R11 bloqueaba sin techo
//     (U y escenario de FG, rack, quarter de NMG, super landing, piscina de YY), con 4 rumbos, se baila.
//  P  bordes (deck de FG, plataformas): al bailar, la tabla tumbada queda apoyada (≤ 15 cm del suelo) o se queda en la mano.
//   node tools/v8/r13/f18-baile-sitio.mjs --url pre13 --task R13 --label base
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, corona, giro } from '../r11/f5-lib.mjs';
const R = new Report('r13-f18-baile-sitio');
const SRC = process.env.BK_SRC ? path.resolve(process.env.BK_SRC) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../src');   // BK_SRC: copia de src de la base
const LIBRES = [[29.3, 1.47, -17.7], [28, 1.26, 17.1], [29.3, 0.44, -19.6], [26.1, 0.03, 9.1], [26.9, 0.03, 20.4], [13.6, 0.95, -1], [26.6, 0.51, 3.1], [12.1, 2.5, -0.6], [30.2, 0.34, 0], [-26, -1.18, 12.7]];
await runTest(R, async () => {
  // ---------------------------------------------------------------- E (estática, sobre el código fuente actual)
  { const lee = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.ts$/.test(f.name) && f.name !== 'bootstrap.ts') {
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (/\(window as any\)\.__bk(?!FinalLog)|window\.__bk(?!FinalLog)/.test(l)) lee.push(`${path.relative(SRC, p)}:${i + 1}`); }); } } };
    walk(SRC); R.check(lee.length === 0, `E el juego no depende de los atajos de prueba window.__bk* (${lee.length ? lee.join(', ') : 'ninguno'})`, 'static', { lee }); }
  const b = await launch();
  try {
    const page = await abrir(b, R);
    // V10 (preparación): posiciones y rumbos literales de V9 girados con la corona (+9°; el centro no gira)
    const G = giro(await corona(page)), BOCA = { p: G.P([30.316, 19.313]), h: G.H(-1.885) }, LIB = LIBRES.map((q) => G.P(q));
    await page.evaluate(() => { window.__r13RA = window.__bkRapier; delete window.__bkRapier; });
    R.fixture('juego publicado emulado: window.__bkRapier borrado (la sonda usa su copia)');
    // utilidades en página
    await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, RA = window.__r13RA, s = g.skater, fd = g.activities.find((a) => a.id === 'freeDance');
      const F = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      window.__r13 = {
        floor(x, z, y0 = 12, len = 20) { const h = g.world.castRay(new RA.Ray({ x, y: y0, z }, { x: 0, y: -1, z: 0 }), len, true, F, undefined, s.collider); return h ? y0 - h.timeOfImpact : null; },
        async at(x, y, z, h, crouch = false) { fd.stop?.(); for (const c of ['KeyC', 'KeyW']) window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
          s.teleport(new T.Vector3(x, y + 0.03, z), h, 'walk'); s.vel.set(0, 0, 0); if (crouch) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
          await g.simulate(0.4); return { ok: s.grounded && s.loco === 'walk', crouch: s.isCrouched, pie: [s.footPos.x, s.footPos.y, s.footPos.z].map((q) => +q.toFixed(2)) }; },
        async baila() { const a = fd.available(); fd.request(1); await g.simulate(0.2); const d = fd.dancing; const prop = fd.prop ? fd.prop.position.clone() : null;
          let gap = null; if (prop) { const fy = this.floor(prop.x, prop.z, prop.y + 0.3, 3); gap = fy === null ? 99 : +(prop.y - fy).toFixed(2); }
          fd.stop?.(); await g.simulate(0.1); return { disponible: a, bailando: d >= 0, gap, enMano: d >= 0 && !prop }; },
      };
    });
    for (let k = 1; k <= 2; k++) {
      // V10.3 R2 (W05, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_3-R2): el caso T (túnel de FG, techo 1,68 m) ya no
      // existe: el túnel se cerró. Se anota y no se sustituye por otro sitio
      if (k === 1) R.note('caso T retirado en V10.3: el túnel de FASHION GIRL ya no existe (W05)');
      // C: agachada en llano
      { const p = await page.evaluate(() => window.__r13.at(-6, 0, -40, Math.PI / 2, true)); const r = await page.evaluate(() => window.__r13.baila());
        R.check(p.crouch && !r.bailando, `#${k} C agachada en llano: no se puede bailar (${r.bailando ? 'baila' : 'no baila'})`, 'emulation', { p, r }); }
      // L: llano abierto + 10 sitios junto a rampas (4 rumbos)
      { const p = await page.evaluate(() => window.__r13.at(-6, 0, -40, Math.PI / 2)); const r = await page.evaluate(() => window.__r13.baila());
        R.check(p.ok && r.bailando && r.gap !== null && r.gap <= 0.15, `#${k} L llano abierto: se baila y la tabla queda en el suelo (hueco ${r.gap})`, 'emulation', { p, r }); }
      { const mal = []; let n = 0;
        for (const q of LIB) for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const p = await page.evaluate((q, h) => window.__r13.at(q[0], q[1], q[2], h), q, h); if (!p.ok) continue; n++;
          const r = await page.evaluate(() => window.__r13.baila()); if (!r.bailando) mal.push([...p.pie, +h.toFixed(2)]); }
        R.check(n >= 30 && mal.length === 0, `#${k} L junto a rampas y escalones sin techo (${n} casos): se baila en todos (bloqueados: ${mal.length})`, 'emulation', { mal }); }
      // P: bordes con vacío a la derecha o a la izquierda (muestreo determinista): la tabla tumbada nunca flota
      { const r = await page.evaluate(async () => { const g = window.__bk, s = g.skater; let st = 4242; const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; };
          const out = { casos: 0, flotan: [], mano: 0, suelo: 0 };
          for (let i = 0; i < 3000 && out.casos < 40; i++) { const x = -46 + rnd() * 92, z = -46 + rnd() * 92, h = rnd() * 6.28, y = window.__r13.floor(x, z); if (y === null || y < 0.3 || y > 8) continue;
            const c = Math.cos(h), sn = Math.sin(h), yr = window.__r13.floor(x - c * 0.85, z + sn * 0.85, y + 0.5, 3); if (yr !== null && Math.abs(yr - y) < 0.15) continue;   // vacío a la derecha
            const p = await window.__r13.at(x, y, z, h); if (!p.ok || Math.abs(p.pie[1] - y) > 0.1) continue;
            const r = await window.__r13.baila(); if (!r.bailando) continue; out.casos++;
            if (r.enMano) out.mano++; else if (r.gap > 0.15) out.flotan.push([...p.pie, r.gap]); else out.suelo++; }
          return out; });
        R.check(r.casos >= 20 && r.flotan.length === 0, `#${k} P bailando junto a un borde (${r.casos} casos): la tabla nunca flota (en el suelo ${r.suelo}, en la mano ${r.mano}, flotando ${r.flotan.length})`, 'emulation', r); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
