// IT8 · F1 · guardián de audio del sistema (AudioContext real del navegador de pruebas; se lee el estado del motor, no se oye).
//  1 · Música por zona: ANMI a pie dentro de cada una de las 5 zonas (y del centro abierto): en ≤ 4 s la pista con más ganancia es la de
//      esa zona; en la plaza y en el exterior se apunta cuál suena (medida).
//  2 · Volumen y silencio desde la pausa con la entrada real (flechas sobre el deslizador; botón «Silenciar»): la ganancia maestra sigue al
//      ajuste en ≤ 0,5 s; recargar conserva volumen y silencio y la ganancia arranca ya en su valor.
//  3 · Ocultar la pestaña: contexto «suspended» mientras está oculta y «running» al pulsar «Seguir».
//  4 · Sesión de audio de iOS «interrupted» (simulada: navigator.audioSession): sale «Activar sonido», está encima y al tocarlo el
//      contexto vuelve a «running» y el botón se va.
// Aparatos: ordenador 1280×720 (teclado) e iPhone 12–15 horizontal (dedo en los botones).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, onTop, tapOrClick, hideShow, reload8, until, saveJson } from './lib8.mjs';
const R = new Report('it8-audio-sistema', { task: arg('task', 'IT8') });
const APARATOS = (arg('aparatos') ?? 'pc720:h,ip14:h').split(',').map((s) => s.split(':'));
const ZONAS = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const SESION = () => { const as = { type: 'auto', state: 'active', onstatechange: null }; try { Object.defineProperty(navigator, 'audioSession', { get: () => as, configurable: true }); } catch { /* */ } window.__as = as; };
const mus = (page) => page.evaluate(() => { const m = window.__bk.audio.music, c = window.__bk.audio.ctx; if (!m) return null; const g = [...m.tracks.values()].map((t) => [t.id, +(t.gain ?? 0).toFixed(3)]).sort((a, b) => b[1] - a[1]);
  return { top: g[0]?.[1] > 0.02 ? g[0][0] : null, gains: g.slice(0, 3), sonando: m.soundingIds, ctx: c?.state, master: +window.__bk.audio.master.gain.value.toFixed(3), vol: window.__bk.state.p.settings.volume, muted: window.__bk.state.p.settings.muted }; });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    for (const [di, o] of APARATOS) {
      const d = dev(di), touch = d.kind !== 'desktop', tag = `${di} ${o}`, errors = [];
      const page = await open8(b, R, d, o, { save: { ...S20, settings: { iosAppAsked: true, volume: 0.8, muted: false } }, init: [SESION], errors });
      await start8(page, touch); await sleep(2500);
      const o1 = out[tag] = { zonas: {} };
      // 1 · zonas
      // centro de cada sector a r = 32 m sobre su eje (manifest.ts: polar, ejes girados +9° de la corona)
      const EJE = { no_me_guillo: 45, nosvamosdeaqui: 333, yinyang: 261, tratratra: 189, fashion_girl: 117 }, pol = (r, th) => [r * Math.sin(th * Math.PI / 180), -r * Math.cos(th * Math.PI / 180)];
      const sp = await page.evaluate(() => [window.__bk.manifest.spawn.pos.x, window.__bk.manifest.spawn.pos.z]);
      const puntos = { ...Object.fromEntries(ZONAS.map((z) => [z, pol(32, EJE[z])])), plaza: sp, exterior: [0, -47], secretnovio: [3, 3] };
      for (const [z, p] of Object.entries(puntos)) { if (!p) { o1.zonas[z] = 'sin punto'; continue; }
        await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, s = g.skater; const h = g.world.castRay(new RA.Ray({ x: p[0], y: 20, z: p[1] }, { x: 0, y: -1, z: 0 }), 30, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
          g.input.clear(); s.teleport(new T.Vector3(p[0], h ? 20 - h.timeOfImpact + 0.05 : 0.05, p[1]), s.heading, 'walk'); g.rig.snapBehind(s); }, p);
        let m = null; const t0 = Date.now(); while (Date.now() - t0 < 4000) { m = await mus(page); if (ZONAS.includes(z) || z === 'secretnovio' ? m?.top === z : false) break; await sleep(300); }
        o1.zonas[z] = m;
        if (ZONAS.includes(z) || z === 'secretnovio') R.check(m?.top === z, `${tag} · música: dentro de ${z} suena su pista en ≤ 4 s`, 'listen', m);
      }
      R.measure(`${tag}_plaza_exterior`, { plaza: o1.zonas.plaza?.top, exterior: o1.zonas.exterior?.top });
      // 2 · volumen y silencio con la entrada real
      if (touch) await tapOrClick(page, '#btn-pause', true); else await page.keyboard.press('Escape'); await sleep(700);
      await page.focus('#vol'); for (let i = 0; i < 5; i++) { await page.keyboard.press('ArrowLeft'); await sleep(60); }
      await sleep(600); const v1 = await mus(page);
      R.check(Math.abs(v1.master - v1.vol) < 0.03 && v1.vol < 0.8, `${tag} · bajar el volumen en la pausa baja la ganancia maestra (${v1.vol})`, 'listen', v1);
      await tapOrClick(page, '#btn-mute', touch); await sleep(600); const v2 = await mus(page);
      R.check(v2.muted && v2.master < 0.01, `${tag} · «Silenciar» deja la ganancia maestra a 0`, 'listen', v2);
      await reload8(page); const v3a = await page.evaluate(() => ({ vol: window.__bk.state.p.settings.volume, muted: window.__bk.state.p.settings.muted }));
      await start8(page, touch); await sleep(1500); const v3 = await mus(page);
      R.check(v3a.muted && Math.abs(v3a.vol - v1.vol) < 0.01 && v3.master < 0.01, `${tag} · al recargar sigue en silencio con el mismo volumen y no suena nada al empezar`, 'listen', { guardado: v3a, motor: v3 });
      if (touch) await tapOrClick(page, '#btn-pause', true); else await page.keyboard.press('Escape'); await sleep(700);
      await tapOrClick(page, '#btn-mute', touch); await sleep(300); await tapOrClick(page, '#btn-resume', touch); await sleep(900);
      const v4 = await mus(page);
      R.check(!v4.muted && Math.abs(v4.master - v4.vol) < 0.03 && v4.ctx === 'running', `${tag} · quitar el silencio vuelve a sonar al volumen guardado`, 'listen', v4);
      // 3 · ocultar
      const mid = await hideShow(page, 3000, () => mus(page));
      const v5 = await mus(page); await tapOrClick(page, '#btn-resume', touch); await sleep(900); const v6 = await mus(page);
      R.check(mid?.ctx === 'suspended' && v6.ctx === 'running', `${tag} · oculta: contexto suspendido; al seguir, vuelve a sonar`, 'listen', { oculta: mid?.ctx, vuelta: v5.ctx, seguir: v6.ctx });
      // 4 · iOS interrumpido
      await page.evaluate(() => { const as = window.__as; as.state = 'interrupted'; as.onstatechange?.(); }); await sleep(600);
      const fx = await onTop(page, '#btn-sound-fix');
      R.check(fx.ok, `${tag} · sesión de audio interrumpida (llamada, Siri): sale «Activar sonido» y está encima`, 'emulation', fx);
      await page.evaluate(() => { window.__as.state = 'active'; window.__as.onstatechange?.(); });
      if (fx.ok) { await tapOrClick(page, '#btn-sound-fix', touch); await sleep(800); }
      const v7 = await mus(page), gone = await page.evaluate(() => document.getElementById('btn-sound-fix').hidden);
      R.check(v7.ctx === 'running' && gone, `${tag} · al tocar «Activar sonido» vuelve a sonar y el botón se va`, 'listen', { ctx: v7.ctx, botonOculto: gone });
      R.check(!errors.length, `${tag} · sin errores`, 'emulation', errors.slice(0, 3));
      await page.close();
    }
    saveJson('F1-audio/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
