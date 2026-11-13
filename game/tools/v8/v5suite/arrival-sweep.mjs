// T5-23 · Llegada NMG (OPUS-011, plan 15 §4): barrido del desfase de rumbo de llegada (respecto a «mirar al corazón») y, por
// layout, cuánto tapan la cabeza y el torso de ANMI (huesos proyectados) a Pantera (cabeza+torso) y al corazón (centro y
// bordes del collider). Cámara real tras snapBehind + 1,5 s de asentamiento. Elige el desfase con 0 solapes y ANMI a la
// izquierda de ambos (composición de la ref 03). Solo mide: el valor elegido se fija en nmg.ts.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS, r3, arg } from '../lib.mjs';
const R = new Report('arrival-sweep');
const OFFS = arg('offs', '-0.2,-0.1,0,0.12,0.2,0.33,0.45,0.55').split(',').map(Number);
await runTest(R, async () => {
  const b = await launch();
  try {
    const rows = [];
    for (const [lay, vp] of [['escritorio', VIEWPORTS.desktop], ['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page); await sleep(1000);
      for (const off of OFFS) {
        await fixture(page, R, `${lay}: llegada con desfase ${off} rad`, (off) => { const g = window.__bk, m = g.park.manifest.spawn, h = g.manifest.get('nmg.heart').pos;
          const hd = Math.atan2(h.x - m.pos.x, h.z - m.pos.z) + off; g.input.clear(); g.skater.teleport(m.pos.clone(), hd, 'walk'); g.rig.snapBehind(g.skater); return { hd }; }, off);
        await sleep(1500);
        const r = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, W = innerWidth, H = innerHeight;
          const P = (v) => { const n = v.clone().project(cam); return [(n.x + 1) / 2 * W, (1 - n.y) / 2 * H, n.z]; };
          const bones = (root, re) => { const pts = []; root.traverse((o) => { if (o.isBone && re.test(o.name)) { const p = new T.Vector3(); o.getWorldPosition(p); pts.push(P(p)); } }); return pts; };
          const bb = (pts, pad) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad }; };
          const pad = 0.03 * H;
          const anmiHead = bb(bones(g.visual.root, /(Head|HeadTop_End|Neck)$/), pad * 1.6), anmiTorso = bb(bones(g.visual.root, /(Spine2|Spine1|Spine|Hips|Neck)$/), pad * 1.6);
          const pan = g.npcs.get('la_pantera')[0]; const panB = bb(bones(pan.root, /(Head|Neck|Spine2|Spine1|Spine|Hips)$/), pad);
          const hp = g.manifest.get('nmg.heart').pos; const heart = bb([P(new T.Vector3(hp.x, 0.475, hp.z)), P(new T.Vector3(hp.x, 0.95, hp.z)), P(new T.Vector3(hp.x, 0.05, hp.z))], pad);
          const ov = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
          const frac = (a, t) => ov(a, t) / (t.w * t.h);
          const inF = (q) => q.x >= 0 && q.x + q.w <= W && q.y >= 0 && q.y + q.h <= H;
          return { panCover: +Math.max(frac(anmiHead, panB), frac(anmiTorso, panB)).toFixed(3), heartCover: +Math.max(frac(anmiHead, heart), frac(anmiTorso, heart)).toFixed(3),
            anmiLeftOfBoth: anmiHead.x + anmiHead.w < Math.min(panB.x, heart.x), panIn: inF(panB), heartIn: inF(heart), panX: +(panB.x / W).toFixed(2), heartX: +(heart.x / W).toFixed(2) }; });
        const row = { lay, off, ...r }; rows.push(row); console.log(JSON.stringify(row));
      }
      await page.close();
    }
    R.measure('barrido', rows);
    const ok = OFFS.filter((o) => rows.filter((r) => r.off === o).every((r) => r.panCover === 0 && r.heartCover === 0 && r.panIn && r.heartIn));
    R.measure('desfases_sin_solape_en_los_3_layouts', ok);
    const cur = await (async () => { const p = await openGame(b, R); const h = await p.evaluate(() => { const g = window.__bk, m = g.park.manifest.spawn, h = g.manifest.get('nmg.heart').pos; return m.heading - Math.atan2(h.x - m.pos.x, h.z - m.pos.z); }); await p.close(); return h; })();
    R.measure('desfase_servido', r3(cur));
    R.check(ok.some((o) => Math.abs(o - cur) < 0.011), `el desfase de llegada servido (${r3(cur)} rad) deja a Pantera y el corazón sin tapar por ANMI en los 3 layouts (válidos: ${ok.join(', ') || 'ninguno'})`, 'vision', rows.filter((r) => Math.abs(r.off - cur) < 0.011));
    R.pendingHuman('Composición de la llegada frente a la ref 03 (par visual) — G8-V');
  } finally { await b.close(); }
});
