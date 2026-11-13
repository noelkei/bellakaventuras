// V10.5 R0 · guardián de la regla de oro (AM-05, AM-06, AM-28; E5-08…E5-12): animación y diálogo nunca a la vez. Un muestreador por fotograma
// (rAF) apunta si hay un diálogo a la vista (2D #d2 o charla #dialog) y cuánto se mueve la cámara (m/s y °/s). Exige, en tutorial, OBJ, PAS,
// FIN, despedida (DES), charla con La Pantera y modo ayuda:
//  · 0 tramos con diálogo visible y cámara moviéndose (> 0,25 m/s o > 4 °/s; tramo = ≥ 3 fotogramas o ≥ 0,05 s);
//  · planos limpios (cámara guionizada, quieta y SIN diálogo durante ≥ 1,8 s): ≥ 4 en el tutorial (marca, marca, patata y la 1.ª patata de
//    NMG), ≥ 1 en PAS y ≥ 2 en FIN (plano del reto y vista alta).
// Sale de V10/IT7/tools/anim.mjs (sin teletransportes con un diálogo a punto de abrirse: ANMI se coloca y se deja asentar la cámara).
// Uso: node anim-dialogo.mjs --url … [--devs ip14:v,ip14:h,pc720:h] [--seq tutorial,obj,pas,fin,des,charla,ayuda] [--video]
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, sleep, arg, flag, SAVE_20 } from '../v8/lib.mjs';
import { FRESH, toZone } from '../v10_2/lib102.mjs';
import { dev, open7, start7, tapEl, waitD2, d2State, saveJson, EV } from './lib105.mjs';
const R = new Report('anim-dialogo');
const DEVS = (arg('devs') ?? 'ip14:v,ip14:h,pc720:h').split(',').map((s) => s.split(':')), SEQ = (arg('seq') ?? 'tutorial,obj,pas,fin,des,charla,ayuda').split(','), VIDEO = flag('video');
const N = (vistos, ayuda = 'no') => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos, ayuda });
const BASE = ['PLA-10', 'CIN-01', 'PAR', 'NMG'];
const CLEAN_MIN = { tutorial: 4, pas: 1, fin: 2 };

async function samplerOn(page) {
  await page.evaluate(() => {
    const S = window.__bk7s = { on: true, rows: [], t0: performance.now() }; let prev = null;
    const loop = () => { if (!S.on) return; const g = window.__bk, c = g?.rig?.cam; if (c) {
      const now = performance.now(), d2 = document.getElementById('d2'), dl = document.getElementById('dialog');
      const d2v = !!d2 && !d2.hidden && parseFloat(getComputedStyle(d2).opacity) > 0.3, dlv = !!dl && !dl.hidden;
      const p = c.position, q = c.quaternion; let v = 0, w = 0;
      if (prev) { const dt = Math.max(1e-3, (now - prev.t) / 1000); v = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / dt;
        const dot = Math.min(1, Math.abs(q.x * prev.qx + q.y * prev.qy + q.z * prev.qz + q.w * prev.qw)); w = 2 * Math.acos(dot) * 180 / Math.PI / dt; }
      prev = { t: now, x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
      S.rows.push({ t: +((now - S.t0) / 1000).toFixed(3), d2: d2v ? (d2.querySelector('.d2-text')?.textContent ?? '').slice(0, 48) : null, dl: dlv ? (document.getElementById('dialog-text')?.textContent ?? '').slice(0, 48) : null,
        v: +v.toFixed(2), w: +w.toFixed(1), mode: g.rig.mode, gm: g.mode, cine: !!g.narr?.inCine, busy: !!g.narr?.busy }); }
      requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}
const samplerOff = (page) => page.evaluate(() => { const S = window.__bk7s; S.on = false; return S.rows; });
function overlaps(rows, { v = 0.25, w = 4 } = {}) {
  const out = []; let cur = null;
  for (let i = 1; i < rows.length; i++) { const r = rows[i], txt = r.d2 ?? r.dl, mov = r.v > v || r.w > w;
    if (txt && mov) { if (!cur) cur = { t0: r.t, t1: r.t, text: txt, kind: r.d2 ? '2D' : 'charla', vmax: r.v, wmax: r.w, n: 0 }; cur.t1 = r.t; cur.n++; cur.vmax = Math.max(cur.vmax, r.v); cur.wmax = Math.max(cur.wmax, r.w); }
    else if (cur) { if (cur.t1 - cur.t0 >= 0.05 || cur.n >= 3) out.push(cur); cur = null; } }
  if (cur && (cur.t1 - cur.t0 >= 0.05 || cur.n >= 3)) out.push(cur);
  return out.map((o) => ({ ...o, t0: +o.t0.toFixed(2), t1: +o.t1.toFixed(2), dur: +(o.t1 - o.t0).toFixed(2) }));
}
/** Planos limpios: cámara guionizada (fuera de la cinemática), quieta y sin diálogo durante ≥ 1,8 s seguidos. */
function cleanShots(rows, min = 1.8) {
  const out = []; let t0 = null, last = null;
  for (const r of rows) { const ok = !r.d2 && !r.dl && r.mode === 'scripted' && !r.cine && r.v < 0.25 && r.w < 4;
    if (ok) { if (t0 === null) t0 = r.t; last = r.t; } else { if (t0 !== null && last - t0 >= min) out.push({ t0, dur: +(last - t0).toFixed(2) }); t0 = null; } }
  if (t0 !== null && last - t0 >= min) out.push({ t0, dur: +(last - t0).toFixed(2) });
  return out;
}

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const [di, O] of DEVS) {
      const D = dev(di), TOUCH = D.kind !== 'desktop', tag = `${di}_${O}`, OUT = path.join(EV, 'anim-dialogo', tag); fs.mkdirSync(OUT, { recursive: true });
      const measure = async (page, name, fn) => {
        const frames = []; let cdp = null;
        if (VIDEO) { cdp = await page.createCDPSession(); cdp.on('Page.screencastFrame', async (e) => { frames.push({ t: e.metadata.timestamp, data: e.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch { /* */ } });
          await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 640, everyNthFrame: 2 }); }
        await samplerOn(page); let err = null;
        try { await fn(); } catch (e) { err = String(e?.message ?? e).slice(0, 300); }
        const rows = await samplerOff(page);
        if (cdp) { await cdp.send('Page.stopScreencast').catch(() => {}); await sleep(150); const dir = path.join(OUT, `video_${name}`); fs.mkdirSync(dir, { recursive: true }); const t0 = frames[0]?.t ?? 0;
          frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}_${Math.round((f.t - t0) * 1000)}ms.jpg`), Buffer.from(f.data, 'base64'))); }
        const ov = overlaps(rows), cs = cleanShots(rows);
        saveJson(path.join(OUT, `${name}.json`), { name, err, overlaps: ov, clean: cs, timeline: rows.filter((_, i) => i % 3 === 0) });
        R.check(!err && rows.length > 60 && ov.length === 0, `${tag} ${name}: ningún tramo con diálogo a la vista y la cámara moviéndose`, 'vision', { err, frames: rows.length, solapes: ov.slice(0, 4) });
        if (CLEAN_MIN[name]) R.check(cs.length >= CLEAN_MIN[name], `${tag} ${name}: ≥ ${CLEAN_MIN[name]} planos limpios de ≥ 1,8 s (cámara quieta y sin diálogo)`, 'vision', cs);
        return { ov, cs };
      };
      const advance = async (page) => { await sleep(450); if (TOUCH) { if (!(await tapEl(page, '#d2 .d2-btn.primary', true))) { if (!(await tapEl(page, '#dialog-ok', true))) await page.keyboard.press('KeyE'); } } else await page.keyboard.press('KeyE'); await sleep(250); };
      const playThrough = async (page, until, ms, read = 1200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await until()) return true; const d = await d2State(page); const dl = await page.evaluate(() => !document.getElementById('dialog').hidden);
          if (d || dl) { await sleep(read); await advance(page); } else await sleep(150); } return false; };
      const grab = (page, id) => page.evaluate((id) => { const g = window.__bk, p = g.pickups.find((x) => x.id === id); if (!p) return false; p.available = true; p.group.visible = true; g.skater.teleport(p.spawn.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); return true; }, id);
      const idle = (page) => page.evaluate(() => { const g = window.__bk, d = document.getElementById('d2'); return !g.narr.busy && g.mode === 'explore' && (!d || d.hidden) && document.getElementById('dialog').hidden; });
      const opn = async (save, q = '?bktest=1') => { const p = await open7(b, R, D, O, { save: { ...save, settings: { iosAppAsked: true } }, query: q, errors }); await start7(p, TOUCH); return p; };

      if (SEQ.includes('tutorial')) { const page = await opn(FRESH);
        await measure(page, 'tutorial', async () => {
          const tp = (x, z, loco) => page.evaluate((x, z, loco) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(x, g.skater.footPos.y, z), g.skater.heading, loco); g.rig.snapBehind(g.skater); }, x, z, loco);
          const ex = () => page.evaluate(() => { const n = window.__bk.narr; return n.exercise ? n.exercise.id : null; });
          const marks = () => page.evaluate(() => { const o = []; window.__bk.scene.traverse((m) => { if (m.name === 'TUTORIAL_MARCA') o.push([m.position.x, m.position.z]); }); return o; });
          const t0 = Date.now();
          while (Date.now() - t0 < 200000) {
            const d = await d2State(page);
            if (d) { if (/bienvenida|Siéntate/i.test(d.text)) break; await sleep(1200); if (d.n === 2) { await page.evaluate(() => document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')[1]?.click()); await sleep(300); } else await advance(page); continue; }
            const e = await ex();
            if (e) { await sleep(1500);
              if (e === 'PLA-03') { const m = (await marks())[0]; if (m) await tp(m[0], m[1], 'walk'); }
              else if (e === 'PLA-05' || e === 'PLA-08') { if (TOUCH) await tapEl(page, '#btn-board', true); else await page.keyboard.press('KeyQ'); }
              else if (e === 'PLA-06') { const m = (await marks())[0]; if (m) await tp(m[0], m[1], 'ride'); }
              else if (e === 'PLA-09') { const P = await page.evaluate(() => { const k = window.__bk.narr.practice; return k ? [k.base.x, k.base.z] : null; }); if (P) await tp(P[0], P[1], 'walk'); }
              await sleep(1200); continue; }
            if (await page.evaluate(() => window.__bk.narr.inCine)) await page.keyboard.press('Escape');   // la cinemática del parque no se mide aquí (no tiene diálogo)
            await sleep(150);
          }
          await playThrough(page, async () => page.evaluate(() => { const n = window.__bk.narr; if (n.inCine) return false; return n.N.estado === 'hecho' && !n.busy; }), 120000);
          await sleep(1500);
        }); await page.close(); }
      if (SEQ.includes('obj')) { const page = await opn({ ...FRESH, narr: N(BASE) }); await sleep(1500);
        await measure(page, 'obj', async () => { await grab(page, 'no_me_guillo.visible'); await waitD2(page, null, 8000); await playThrough(page, () => idle(page), 30000); await sleep(1500); }); await page.close(); }
      if (SEQ.includes('pas')) { const col = ['no_me_guillo.visible', 'no_me_guillo.medium', 'no_me_guillo.hidden'];
        const page = await opn({ ...FRESH, collected: col, activities: { ...FRESH.activities, pantherTalk: true }, narr: N([...BASE, 'OBJ']) }); await sleep(1500);
        await measure(page, 'pas', async () => { await grab(page, 'no_me_guillo.activity'); await waitD2(page, null, 10000); await playThrough(page, () => idle(page), 50000); await sleep(2000); }); await page.close(); }
      if (SEQ.includes('fin')) { const col = SAVE_20.collected.filter((x) => x !== 'fashion_girl.activity');
        const page = await opn({ ...SAVE_20, collected: col, revealSeen: false, narr: N([...BASE, 'OBJ', 'PAS-01', 'PAS-02', 'PAS-03', 'PAS-04', 'PAS-05', 'PAS-06', 'PAS-07', 'PAS-08']) }); await sleep(1500);
        await measure(page, 'fin', async () => { await grab(page, 'fashion_girl.activity'); await waitD2(page, null, 10000); await playThrough(page, () => idle(page), 120000); await sleep(2000); }); await page.close(); }
      if (SEQ.includes('des')) { const page = await opn({ ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, narr: N([...BASE, 'OBJ', 'FIN']) }); await sleep(1500);
        await page.evaluate(() => window.__bk.showPreview()); await sleep(5000); await page.keyboard.press('Escape');   // preparación: la escena final se corta con Esc
        await page.waitForFunction(() => window.__bk.mode === 'explore', { timeout: 15000 }).catch(() => {});
        await measure(page, 'des', async () => { await waitD2(page, null, 12000); await playThrough(page, () => idle(page), 30000); await sleep(2500); }); await page.close(); }
      if (SEQ.includes('charla')) { const page = await opn({ ...FRESH, narr: N([...BASE, 'OBJ']) }); await sleep(1500);
        await toZone(page, 'act.pantherTalk'); await sleep(1500);
        await measure(page, 'charla', async () => { if (TOUCH) await tapEl(page, '#btn-action', true); else await page.keyboard.press('KeyE'); await sleep(300); await playThrough(page, () => idle(page), 40000, 1500); await sleep(2000); }); await page.close(); }
      if (SEQ.includes('ayuda')) { const page = await opn({ ...FRESH, narr: N([...BASE, 'OBJ'], 'si') }); await sleep(1500);
        await toZone(page, 'act.pantherTalk', 0, 3, 1); await sleep(1500);
        await measure(page, 'ayuda', async () => { await page.evaluate(() => { window.__bk.ayuda.idle = 59.5; }); await waitD2(page, null, 8000); await sleep(1200); await advance(page); await sleep(2500); }); await page.close(); }
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
