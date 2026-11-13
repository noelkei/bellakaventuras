// V10.6 · guardián de las capas de menú en pantalla táctil (H8-20 y punto 1.7 de V10/IT9/B1_MOVIL.md): en la pausa, Ajustes y Créditos,
//  · todo botón, casilla y barra que se ve está DENTRO de la pantalla sin desplazar (ni bajo el borde ni bajo la muesca) y no se monta con otro;
//  · en táctil, cada botón mide ≥ 44 px de alto (y las barras ofrecen ≥ 44 px de toque).
// Aparatos: los pequeños de la matriz E1 (SE 320×568, SE 375×667, iPhone 12–15 normal y en modo app con muesca, Android 360) en vertical y
// horizontal, y el iPhone 12–15 en vertical/horizontal. Créditos solo si existe (en la r3 no: se anota).
// Uso: node tools/v10_6/capas.mjs --url <build> [--aparatos se1,ip14] [--capas pausa,ajustes,creditos] [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, tapOrClick, until } from '../it8/lib8.mjs';
const R = new Report('v106-capas', { task: arg('task', 'V10-6') });
const APAR = (arg('aparatos') ?? 'se1,se,ip14,ip14app,and360,and360b').split(',');
const CAPAS = (arg('capas') ?? 'pausa,ajustes,creditos').split(',');
const medir = (page, sel) => page.evaluate((sel) => {
  const root = document.querySelector(sel); if (!root || root.hidden) return null;
  const W = innerWidth, H = innerHeight, cs = getComputedStyle(document.documentElement);
  const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0, safe = { t: px('--sat'), r: px('--sar'), b: px('--sab'), l: px('--sal') };
  const els = [...root.querySelectorAll('button, input, a[href]')].filter((e) => !e.closest('[hidden]') && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden');
  const items = els.map((e) => { const t = e.type === 'checkbox' ? (e.closest('label') ?? e) : e, r = t.getBoundingClientRect();
    return { n: e.id ? '#' + e.id : (e.textContent || e.type || e.tagName).trim().slice(0, 24), tipo: e.type === 'range' ? 'barra' : e.type === 'checkbox' ? 'casilla' : 'botón',
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), alto: Math.round(e.getBoundingClientRect().height) }; });
  const fuera = items.filter((i) => i.y < safe.t - 1 || i.x < safe.l - 1 || i.y + i.h > H - safe.b + 1 || i.x + i.w > W - safe.r + 1);
  const montados = []; for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) { const p = items[a], q = items[b];
    if (p.x < q.x + q.w - 1 && q.x < p.x + p.w - 1 && p.y < q.y + q.h - 1 && q.y < p.y + p.h - 1) montados.push([p.n, q.n]); }
  const pequenos = items.filter((i) => (i.tipo === 'botón' || i.tipo === 'barra') && i.alto < 43.5);
  return { W, H, desplaza: root.scrollHeight > root.clientHeight + 1, items: items.length, fuera, montados, pequenos };
}, sel);
const abrir = {
  pausa: async (p) => { await tapOrClick(p, '#btn-pause', true); return !!(await until(p, () => !document.getElementById('pause').hidden, 3000)); },
  ajustes: async (p) => { await tapOrClick(p, '#btn-pause', true); await sleep(400); await tapOrClick(p, '#btn-settings', true); return !!(await until(p, () => !document.getElementById('settings').hidden, 3000)); },
  creditos: async (p) => { await tapOrClick(p, '#btn-pause', true); await sleep(400);
    if (!(await p.evaluate(() => !!document.getElementById('btn-creditos')))) return null; await tapOrClick(p, '#btn-creditos', true); return !!(await until(p, () => !document.getElementById('creditos')?.hidden, 3000)); },
};
const SEL = { pausa: '#pause', ajustes: '#settings', creditos: '#creditos' };
await runTest(R, async () => {
  const b = await launch(); const out = [];
  try {
    for (const a of APAR) for (const o of ['v', 'h']) {
      const app = a.endsWith('app'), d = dev(app ? a.slice(0, -3) : a);
      for (const capa of CAPAS) {
        const errors = [], page = await open8(b, R, d, o, { save: S20, app, safe: app, errors }); const tag = `${a} ${o} · ${capa}`;
        try { await start8(page, true); await sleep(1200);
          const ok = await abrir[capa](page); await sleep(600);
          if (ok === null) { R.note(`${tag}: no hay botón de Créditos en esta build`); continue; }
          if (!ok) { R.invalid(`${tag}: no se abrió`); continue; }
          const m = await medir(page, SEL[capa]); await R.shot(page, `${a}${o}_${capa}`);
          out.push({ tag, ...m });
          R.check(m && !m.fuera.length && !m.montados.length, `${tag}: todo a la vista sin desplazar y sin montarse`, 'emulation', { fuera: m?.fuera.slice(0, 4), montados: m?.montados.slice(0, 4), desplaza: m?.desplaza });
          R.check(m && !m.pequenos.length, `${tag}: botones y barras ≥ 44 px de alto (táctil)`, 'emulation', m?.pequenos.slice(0, 6));
          R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
        } finally { await page.close(); }
      }
    }
    R.measure('capas', out);
  } finally { await b.close(); }
}, { timeoutMs: 1500000 });
