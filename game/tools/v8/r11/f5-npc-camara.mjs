// R11 · F5 · NPC y cámara/HUD del vaso (2 repeticiones).
//  YY-20 (= NPC-02)  los colisores de NPC van con el NPC: mientras Aissa/Juseph andan por la limo (charla y vuelta al asiento) y la rana
//                    durante la charla, ningún colisor de NPC queda «huérfano» a > 0,6 m de su NPC (obstáculo invisible en casa).
//  YY-07  al dejarse caer al vaso enganchada (#384 a 3 y 5 m/s; #432 a 8 m/s en diagonal) la cámara no se mete en ANMI (≥ 0,4 m del pecho)
//         ni dentro de un sólido.
//  YY-16  la pista de la pared del vaso no queda tapada por el chip «En tabla · Q para bajar» (escritorio 1280×800).
//  No empeorar: con los NPC sentados/quietos hay colisor junto a cada uno (≤ 0,3 m); fuera de esas entradas la cámara del vaso sigue sin
//  meterse en sólidos (de frente a #540).
//   node tools/v8/r11/f5-npc-camara.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, paredes, sleep, SAVE_20, corona, giro } from './f5-lib.mjs';
const R = new Report('r11-f5-npc-camara');
const SAVE_RANA = { ...SAVE_20, activities: { ...SAVE_20.activities, graffiti: false }, collected: SAVE_20.collected.filter((c) => c !== 'yinyang.activity') };
// Foto en reposo: raíz de cada NPC y el colisor de NPC más cercano (su «casa»). Después, en cada muestra: si un NPC está fuera de casa
// (raíz a > 0,3 m de donde estaba) y su colisor sigue activo en la casa (< 0,2 m del sitio de reposo) → colisor huérfano.
const FOTO = () => { const g = window.__bk, out = [];
  for (const [id, list] of g.npcs) for (const [i, n] of list.entries()) { const r = n.root.position; let best = null;
    for (const h of g.npcColliders) { const c = g.world.getCollider(h); if (!c) continue; const t = c.translation(), d = Math.hypot(t.x - r.x, t.z - r.z); if (!best || d < best.d) best = { h, d, t: { x: t.x, z: t.z } }; }
    if (best) out.push({ id: id + i, h: best.h, d: +best.d.toFixed(2), R0: { x: r.x, z: r.z }, C0: best.t }); }
  window.__npcFoto = out; return out.map((q) => ({ id: q.id, d: q.d })); };
const HUERFANOS = () => { const g = window.__bk, o = { lejos: 0, huerfano: 0, desplMax: 0 };
  for (const q of window.__npcFoto ?? []) { const [id, i] = [q.id.replace(/\d+$/, ''), +q.id.match(/\d+$/)[0]]; const n = g.npcs.get(id)?.[i]; if (!n) continue;
    const r = n.root.position, disp = Math.hypot(r.x - q.R0.x, r.z - q.R0.z); o.desplMax = Math.max(o.desplMax, +disp.toFixed(2));
    if (disp > 0.3) { o.lejos++; const c = g.world.getCollider(q.h); const on = c && (!c.isEnabled || c.isEnabled()); if (on) { const t = c.translation(); if (Math.hypot(t.x - q.C0.x, t.z - q.C0.z) < 0.2) o.huerfano++; } } }
  return o; };
await runTest(R, async () => {
  for (let k = 1; k <= 2; k++) {
    // ---------------------------------------------------------------- YY-20 / NPC-02: charla de la limo
    { const b = await launch(); try { const page = await abrir(b, R);
      for (const who of ['aissa', 'juseph']) {
        // R11: antes de cada caso, la charla anterior termina y TODOS los NPC vuelven a reposar en su sitio (si no, la «foto» toma a
        // Aissa a medio volver y su colisor de casa, al reactivarse con ella sentada, contaba como huérfano; y la charla de Juseph no empezaba)
        const quietos = await page.evaluate(async () => { const g = window.__bk; g.autoMode = true; window.__R11.releaseAll();
          const pos = () => [...g.npcs.values()].flat().map((n) => n.root.position.clone()); let prev = pos();
          for (let i = 0; i < 150; i++) { const now = pos(), quietos = now.every((p, j) => !prev[j] || p.distanceTo(prev[j]) < 0.01); prev = now;
            if (g.mode === 'explore' && (g.npcHomes ? g.npcHomes.every((h) => h.actor.root.position.distanceTo(h.root0) < 0.05) : quietos && i > 2)) return true;
            if (!document.getElementById('dialog').hidden) document.getElementById('dialog-ok').click(); await g.simulate(0.1); }
          return false; });
        if (!quietos) { R.invalid(`#${k} YY-20/NPC-02 ${who}: los NPC no volvieron a su sitio tras el caso anterior`, {}); continue; }
        await page.evaluate((who) => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get('act.bridgeTalk.' + who); g.autoMode = false; window.__R11.releaseAll(); g.skater.teleport(new T.Vector3(z.pos.x, (z.yMin ?? 0) + 0.05, z.pos.z), 0, 'walk'); }, who);
        await page.waitForFunction((w) => window.__bk.npcs.get(w)?.[0], { timeout: 30000 }, who); await sleep(1200);
        const foto = await page.evaluate(FOTO); const yo = foto.find((q) => q.id === who + '0');
        await page.evaluate(async () => { const g = window.__bk; g.autoMode = true; window.__R11.key('KeyE', true); await g.simulate(0.1); window.__R11.key('KeyE', false); });
        let huer = 0, lejos = 0, despl = 0;
        for (let i = 0; i < 70; i++) { const r = await page.evaluate(async (F) => { const g = window.__bk; await g.simulate(0.1); const dlg = !document.getElementById('dialog').hidden; return { h: (new Function('return (' + F + ')()'))(), dlg }; }, HUERFANOS.toString());
          huer += r.h.huerfano; lejos += r.h.lejos; despl = Math.max(despl, r.h.desplMax); if (r.dlg) { await page.evaluate(() => document.getElementById('dialog-ok').click()); } }
        R.check(!!yo && yo.d <= 0.45, `#${k} no empeorar ${who}: sentado, tiene su colisor junto a él (${yo?.d} m)`, 'input', { foto });
        if (lejos === 0) R.invalid(`#${k} YY-20/NPC-02 ${who}: el NPC no llegó a salir de su sitio`, { despl });
        else R.check(huer === 0, `#${k} YY-20/NPC-02 ${who}: mientras anda fuera de su sitio, su colisor no se queda activo en casa (${huer} de ${lejos} muestras con colisor huérfano; desplazamiento máx. ${despl} m)`, 'input', { huer, lejos, despl });
      }
    } finally { await b.close(); } }
    // ---------------------------------------------------------------- YY-20: la rana (charla de presentación)
    { const b = await launch(); try { const page = await abrir(b, R, { save: SAVE_RANA });
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get('act.graffiti'); g.autoMode = false; g.skater.teleport(new T.Vector3(z.pos.x, (z.yMin ?? 0) + 0.05, z.pos.z), 0, 'walk'); });
      await page.waitForFunction(() => { const a = window.__bk.activities.find((x) => x.id === 'graffiti'); return a.rana && a.rana.actions?.has?.('Dance'); }, { timeout: 30000 }); await sleep(1200);
      const foto = await page.evaluate(FOTO); const yo = foto.find((q) => q.id === 'rana0');
      await page.evaluate(async () => { const g = window.__bk; g.autoMode = true; window.__R11.key('KeyE', true); await g.simulate(0.1); window.__R11.key('KeyE', false); });
      let huer = 0, lejos = 0, despl = 0, salir = false;
      let abierta = -1;
      for (let i = 0; i < 220; i++) { const r = await page.evaluate(async (F) => { const g = window.__bk; await g.simulate(0.1); return { h: (new Function('return (' + F + ')()'))(), dlg: !document.getElementById('dialog').hidden, gfx: !document.getElementById('graffiti').hidden }; }, HUERFANOS.toString());
        huer += r.h.huerfano; lejos += r.h.lejos; despl = Math.max(despl, r.h.desplMax); if (r.dlg) await page.evaluate(() => document.getElementById('dialog-ok').click());
        if (r.gfx && abierta < 0) abierta = i;
        if (abierta >= 0 && i === abierta + 90 && !salir) { salir = true; await page.evaluate(() => { const b = [...document.querySelectorAll('#graffiti button')].find((x) => /salir/i.test(x.textContent)); b?.click(); }); } }
      R.check(!!yo && yo.d <= 0.45, `#${k} no empeorar rana: quieta, tiene su colisor junto a ella (${yo?.d} m)`, 'input', { foto });
      if (lejos === 0) R.invalid(`#${k} YY-20 rana: la rana no llegó a salir de su sitio`, { despl, salir });
      else R.check(huer === 0, `#${k} YY-20 rana: charla, pintura y «Salir»: mientras anda fuera de su sitio su colisor no se queda activo en casa (${huer} de ${lejos} muestras huérfanas; despl. máx. ${despl} m)`, 'input', { huer, lejos, despl, salir });
    } finally { await b.close(); } }
    // ---------------------------------------------------------------- YY-07 cámara al dejarse caer enganchada; YY-16 pista tapada
    { const b = await launch(); try { const page = await abrir(b, R); const P = await paredes(page);
      // YY-16: pista de la pared (la primera vez en tabla dentro del vaso) frente al chip de modo
      // V10 (preparación): el punto del fondo del vaso (literal de V9) gira con la corona (+9°); `yy_pool.json` ya viene girado
      const fondo = giro(await corona(page)).P([-31.87, -1.73, 3.4]);
      const ov = await page.evaluate(async (fondo) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.autoMode = false; s.teleport(new T.Vector3(...fondo), 0, 'walk'); await new Promise((r) => setTimeout(r, 2800));
        document.getElementById('hint').hidden = true; window.__R11.key('KeyQ', true); await new Promise((r) => setTimeout(r, 80)); window.__R11.key('KeyQ', false);
        const H = document.getElementById('hint'), C = document.getElementById('mode-chip'); let o = null; const t0 = performance.now();
        while (performance.now() - t0 < 2500) { await new Promise((r) => setTimeout(r, 100));
          if (!H.hidden && !C.hidden && /Q/.test(C.textContent)) { const a = H.getBoundingClientRect(), c = C.getBoundingClientRect();
            const ix = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)), iy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
            const vis = getComputedStyle(C).visibility !== 'hidden' && +getComputedStyle(C).opacity > 0.05;   // R11: un chip oculto no tapa nada
            o = { pista: H.textContent.trim().slice(0, 40), chip: C.textContent.trim(), chipVisible: vis, solape: vis ? Math.round(ix * iy) : 0, hint: [a.left, a.top, a.right, a.bottom].map(Math.round), chipR: [c.left, c.top, c.right, c.bottom].map(Math.round) }; break; } }
        return o ?? { pista: !H.hidden && H.textContent.slice(0, 40), chip: !C.hidden && C.textContent.trim() }; }, fondo);
      if (ov.solape === undefined) R.invalid(`#${k} YY-16: no apareció la pista o el chip`, ov);
      else R.check(ov.solape === 0, `#${k} YY-16: la pista de la pared del vaso no se solapa con el chip de modo (solape ${ov.solape} px²)`, 'vision', ov);
      const CAM = "{ const c = g.rig.cam.position, f = s.footPos, d = Math.hypot(c.x - f.x, c.y - (f.y + 1.2), c.z - f.z); M.dmin = Math.min(M.dmin ?? 99, d); let dentro = 0; g.world.intersectionsWithPoint({ x: c.x, y: c.y, z: c.z }, (col) => { if (!col.isSensor() && col.handle !== s.collider.handle) dentro++; return true; }); if (dentro) M.solido = (M.solido || 0) + 1; }";
      for (const [i, v, ang] of [[384, 3, 0], [384, 5, 0], [432, 8, -45]]) {
        const w = P[i], a = ang * Math.PI / 180, h = Math.atan2(w[2], w[3]) + a; const p = [w[0] - w[2] * 1.6, 0.02, w[1] - w[3] * 1.6];
        const r = await run(page, { p, h, v, sec: 2.5, script: CAM });
        R.check(r.dmin >= 0.4 && !r.solido, `#${k} YY-07 #${i} ${v} m/s ${ang}°: al entrar al vaso la cámara no se mete en ANMI ni en un sólido (mín. ${r.dmin?.toFixed(2)} m al pecho, ${r.solido ?? 0} pasos dentro de un sólido)`, 'input', { log: r.log.slice(0, 3) });
      }
      { const w = P[540], p = [w[0] + w[2] * 3, w[4] + 0.02, w[1] + w[3] * 3]; const r = await run(page, { p, h: Math.atan2(-w[2], -w[3]), v: 6.5, sec: 3.5, script: CAM });
        R.check(!r.solido && r.dmin >= 0.4, `#${k} no empeorar #540 de frente: la cámara de la pared no entra en sólidos ni en ANMI (mín. ${r.dmin?.toFixed(2)} m)`, 'input', {}); }
    } finally { await b.close(); } }
  }
}, { timeoutMs: 900000 });
