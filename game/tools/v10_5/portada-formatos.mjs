// V10.5 ronda PORTADA · guardián de la composición en todos los formatos (PROMPT_V10_5_PORTADA §5.10, §7.5): los 46 formatos del prototipo
// (ordenador, monitor, tele, móviles incl. 320×568, iPad, con barras y en pantalla completa; sin las paletas de revisión) + 2 con la pantalla
// girada por el juego («Pantalla: Horizontal» en un móvil en vertical y «Vertical» en uno en horizontal), con partida guardada (CONTINUAR y
// «Empezar de cero» visibles):
//  · JUGAR/CONTINUAR, Sonido, Pantalla completa, Ajustes, título, subtítulo, pie, #load-text y «Empezar de cero» dentro de la pantalla y fuera
//    de las zonas seguras simuladas; sin solaparse entre ellos (salvo título y subtítulo, montados a propósito como en el prototipo); botones
//    ≥ 44 px de alto en táctil;
//  · la escena se ha dibujado; sin errores de consola. Capturas en V10/IT7/evidencias/portada/formatos/.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, sleep, SAVE_20, withTimeout } from '../v8/lib.mjs';
import { BASE_URL, IT7 } from './lib105.mjs';
const R = new Report('portada-formatos');
const OUT = path.join(IT7, 'evidencias', 'portada', 'formatos'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : '';
const F = [
  ['ordenador-portatil-1366x768', 1366, 768, 1], ['ordenador-macbook-1440x900', 1440, 900, 2], ['ordenador-1280x800', 1280, 800, 1], ['monitor-1920x1080', 1920, 1080, 1],
  ['monitor-2560x1440', 2560, 1440, 1], ['monitor-ultrapanoramico-3440x1440', 3440, 1440, 1], ['ventana-dividida-800x900', 800, 900, 2], ['ventana-cuadrada-900x900', 900, 900, 1],
  ['tele-960x540', 960, 540, 2], ['tele-1280x720', 1280, 720, 1.5], ['tele-4k-1920x1080', 1920, 1080, 2],
  ['movil-iphone-se-375x667', 375, 667, 2, 1], ['movil-iphone-se1-320x568', 320, 568, 2, 1], ['movil-android-360x640', 360, 640, 3, 1], ['movil-iphone-mini-375x812', 375, 812, 3, 1],
  ['movil-iphone-393x852', 393, 852, 3, 1], ['movil-iphone-max-430x932', 430, 932, 3, 1], ['movil-android-412x915', 412, 915, 2.625, 1],
  ['movil-apaisado-iphone-se-667x375', 667, 375, 2, 1], ['movil-apaisado-iphone-se1-568x320', 568, 320, 2, 1], ['movil-apaisado-iphone-852x393', 852, 393, 3, 1], ['movil-apaisado-android-915x412', 915, 412, 2.625, 1],
  ['ipad-mini-744x1133', 744, 1133, 2, 1], ['ipad-mini-apaisado-1133x744', 1133, 744, 2, 1], ['ipad-820x1180', 820, 1180, 2, 1], ['ipad-apaisado-1180x820', 1180, 820, 2, 1],
  ['ipad-pro-1024x1366', 1024, 1366, 2, 1], ['ipad-pro-apaisado-1366x1024', 1366, 1024, 2, 1],
  ['barras-ordenador-chrome-1920x969', 1920, 969, 1], ['completa-ordenador-1920x1080', 1920, 1080, 1], ['barras-macbook-safari-1440x789', 1440, 789, 2], ['completa-macbook-1440x900', 1440, 900, 2],
  ['barras-iphone-se-safari-375x548', 375, 548, 2, 1], ['completa-iphone-se-app-375x667', 375, 667, 2, 1, '20,0,0,0'], ['barras-iphone-safari-393x659', 393, 659, 3, 1],
  ['completa-iphone-app-393x852', 393, 852, 3, 1, '59,0,34,0'], ['barras-android-chrome-412x839', 412, 839, 2.625, 1], ['completa-android-412x915', 412, 915, 2.625, 1, '24,0,0,0'],
  ['barras-iphone-apaisado-safari-852x342', 852, 342, 3, 1, '0,59,0,59'], ['completa-iphone-apaisado-852x393', 852, 393, 3, 1, '0,59,21,59'], ['barras-android-apaisado-chrome-915x356', 915, 356, 2.625, 1],
  ['completa-android-apaisado-915x412', 915, 412, 2.625, 1, '0,24,0,0'], ['barras-ipad-safari-820x1106', 820, 1106, 2, 1, '0,0,20,0'], ['completa-ipad-820x1180', 820, 1180, 2, 1, '24,0,20,0'],
  ['barras-ipad-apaisado-safari-1180x746', 1180, 746, 2, 1, '0,0,20,0'], ['completa-ipad-apaisado-1180x820', 1180, 820, 2, 1, '24,0,20,0'],
  ['girada-horizontal-en-movil-vertical-390x844', 390, 844, 3, 1, '', 'horizontal'], ['girada-vertical-en-movil-apaisado-844x390', 844, 390, 3, 1, '', 'vertical'],
].map(([name, w, h, dpr, mobile = 0, zs = '', ori = '']) => ({ name, w, h, dpr, mobile: !!mobile, zs, ori })).filter((f) => !ONLY || f.name.includes(ONLY));
const SEL = { jugar: '#btn-start', sonido: '#btn-sound-start', pantalla: '#btn-fs-start', ajustes: '#btn-settings-start', titulo: '#start .pt-titulo-img', subtitulo: '#start .pt-subtitulo-img',
  pie: '#start .pt-pie', estado: '#load-text', reset: '#btn-reset-start' };

await runTest(R, async () => {
  const b = await launch(), malos = [];
  try {
    for (const f of F) {
      const page = await b.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
      await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
      const [t, r, bo, l] = (f.zs || '0,0,0,0').split(',').map(Number);
      await page.evaluateOnNewDocument((s, ins, ori) => {
        if (!sessionStorage.getItem('__f')) { sessionStorage.setItem('__f', '1'); localStorage.setItem('bellakaventuras.remake.save', JSON.stringify({ ...s, settings: { ...s.settings, orientation: ori || 'auto' } })); }
        if (ins.some(Boolean)) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html:root { --sat: ${ins[0]}px !important; --sar: ${ins[1]}px !important; --sab: ${ins[2]}px !important; --sal: ${ins[3]}px !important; }`; document.head.appendChild(st); });
        window.__ins = ins;
      }, { ...SAVE_20, settings: { iosAppAsked: true } }, [t, r, bo, l], f.ori);
      await withTimeout(page.goto(BASE_URL + '?bktest=1&narr=off', { waitUntil: 'load' }), 60000, 'carga');
      await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
      await sleep(900);
      const m = await page.evaluate((SEL, touch) => {
        const ins = window.__ins, W = innerWidth, H = innerHeight, out = {}, fuera = [], seg = [], chicos = [];
        // las zonas seguras simuladas son físicas: con la pantalla girada por el juego se comparan contra el rectángulo físico igualmente
        for (const [k, s] of Object.entries(SEL)) { const e = document.querySelector(s); if (!e || e.hidden || e.closest('[hidden]')) { out[k] = null; continue; }
          const q = e.getBoundingClientRect(); if (q.width < 1) { out[k] = null; continue; } out[k] = [q.left, q.top, q.right, q.bottom].map((v) => Math.round(v));
          if (q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1) fuera.push(k);
          if (q.left < ins[3] - 1 || q.top < ins[0] - 1 || q.right > W - ins[1] + 1 || q.bottom > H - ins[2] + 1) seg.push(k);
          if (touch && e.tagName === 'BUTTON' && Math.min(q.width, q.height) < 43.5) chicos.push(`${k} ${Math.round(q.width)}×${Math.round(q.height)}`); }
        const ks = Object.keys(out).filter((k) => out[k]), sol = [];
        for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = out[ks[i]], c = out[ks[j]], par = `${ks[i]}~${ks[j]}`; if (par === 'titulo~subtitulo') continue;   /* de diseño: el subtítulo va montado bajo el título (prototipo) */
          if (a[0] < c[2] - 1 && c[0] < a[2] - 1 && a[1] < c[3] - 1 && c[1] < a[3] - 1) sol.push(par); }
        const p = window.__bkPortada; return { fuera, seg, sol, chicos, dibujada: !!p && p.frames > 0 && (p.webgl === 'gl' || p.webgl === 'fija'), html: document.documentElement.className, rects: out };
      }, SEL, f.mobile);
      await page.screenshot({ path: path.join(OUT, `${f.name}.jpg`), type: 'jpeg', quality: 70 });
      const ok = !m.fuera.length && !m.seg.length && !m.sol.length && !m.chicos.length && m.dibujada && !errors.length;
      if (!ok) malos.push({ f: f.name, ...m, errors: errors.slice(0, 3), rects: undefined });
      await page.close();
    }
    R.check(malos.length === 0, `en los ${F.length} formatos: todo dentro de la pantalla y de las zonas seguras, sin solapes, botones ≥ 44 px en táctil, escena dibujada y sin errores (${malos.length} con problemas)`, 'emulation', malos);
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
