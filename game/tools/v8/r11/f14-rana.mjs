// R11 · F14 · copia de la sonda AUD-JUG/ANIM/rana.mjs (mismas comprobaciones; solo cambian rutas y nombre del informe).
// AUD-JUG/ANIM · paseo de la rana (charla → va a mirar el frente de T1 por rana.route.0–4 → rana.watch): ángulo entre hacia dónde mira y
// hacia dónde se mueve (¿anda de lado?), deslizamiento del pie de apoyo frente a la raíz, y si su cuerpo atraviesa colliders del parque.
import { Report, runTest, launch, openGame, clickStart, sleep, place, installHelpers, sim } from './f14-anim-lib.mjs';
const R = new Report('r11-f14-rana');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1000); await installHelpers(page);
    await page.evaluate(() => window.__bk.loadNpc('rana')); await page.waitForFunction(() => window.__bk.npcs.get('rana')?.length, { timeout: 60000 }); await sleep(500);
    for (let rep = 1; rep <= 2; rep++) {
      await page.evaluate(() => { const g = window.__bk; for (const a of g.activities) a.cancel?.(); g.input.clear(); });
      const rp = await page.evaluate(() => window.__bk.manifest.get('rana.watch').pos.toArray()); await place(page, R, [rp[0] + 4, 0, rp[2] + 4], 0, 'walk', `cerca de la rana #${rep}`); await sim(page, 8);
      const r = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, n = g.npcs.get('rana')[0], gr = g.activities.find((a) => a.id === 'graffiti');
        // fixture: la rana va a mirar (lo que hace tras la charla) — llamada directa al método del juego
        gr.ranaToWatch();
        const toes = []; n.model.traverse((o) => { if (o.isBone && /ToeBase$/i.test(o.name)) toes.push(o); });
        let prevR = n.root.position.clone(), prevT = null; const rows = []; const hits = new Set();
        for (let i = 0; i < 60 * 25; i++) { await window.__sim(1 / 60); const p = n.root.position.clone(); const mv = p.clone().sub(prevR); const sp = Math.hypot(mv.x, mv.z) * 60;
          n.model.updateMatrixWorld(true); const tp = toes.map((b) => b.getWorldPosition(new T.Vector3()));
          if (sp > 0.2) { const mvYaw = Math.atan2(mv.x, mv.z); let d = Math.abs(((n.yaw - mvYaw) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 180 / Math.PI;
            const st = prevT && tp.length === 2 ? Math.min(...tp.map((q, k) => Math.hypot(q.x - prevT[k].x, q.z - prevT[k].z) * 60)) : null;
            rows.push({ t: i / 60, sp: +sp.toFixed(2), lado: +d.toFixed(1), pie: st == null ? null : +st.toFixed(2), clip: n.current?.getClip().name });
            // cuerpo de la rana (escala ~0,5): bola de 0,18 m a 0,3 m de altura contra colliders sólidos que no sean de NPC
            g.world.intersectionsWithShape({ x: p.x, y: p.y + 0.3 * (n.root.scale.y || 1), z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.18 * (n.root.scale.y || 1)), (c) => { if (!c.isSensor() && !g.npcColliders.has(c.handle)) hits.add(g.park.colliderName(c.handle) || 'h' + c.handle); return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS); }
          prevR = p; prevT = tp; if (i > 120 && sp < 0.01 && rows.length && !n.gliding) break; }
        return { rows, hits: [...hits], fin: n.root.position.toArray().map((x) => +x.toFixed(2)), scale: n.root.scale.y };
      });
      const lado = r.rows.map((x) => x.lado), md = (a) => { const s = [...a].filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
      const pie = md(r.rows.map((x) => x.pie)), raiz = md(r.rows.map((x) => x.sp));
      const deLado = r.rows.filter((x) => x.lado > 30);
      R.note({ caso: `rana paseo #${rep}`, frames: r.rows.length, ladoMax: Math.max(...lado), framesDeLado30: deLado.length, ejemplosDeLado: deLado.slice(0, 5), pieApoyo: pie, raiz, ratio: pie && raiz ? +(pie / raiz).toFixed(2) : null, atraviesa: r.hits, fin: r.fin });
      R.check(deLado.length < 6, `rana #${rep}: al andar mira hacia donde va (no más de 0,1 s con > 30° de desfase)`, 'vision', { framesDeLado30: deLado.length, max: Math.max(...lado) });
      R.check(!pie || pie / raiz < 0.35, `rana #${rep}: el pie de apoyo no patina (pie/raíz < 0,35)`, 'vision', { pie, raiz });
      R.check(!r.hits.length, `rana #${rep}: su cuerpo no atraviesa colliders del parque`, 'vision', r.hits);
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
