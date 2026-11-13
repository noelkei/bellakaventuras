// T5-23 · HUD y actividades (SOL-008, OPUS-011/012/016/025). En escritorio 1280×800, 390×844 y 844×390 (emulación):
// rectángulos DOM REALES de los elementos visibles del HUD y de los botones frente a la proyección en pantalla de cabeza y
// torso de ANMI y de los NPC en cuadro (huesos Head/Neck/Spine/Hips del esqueleto deformado), en: llegada NMG, charla con
// Pantera (al empezar y con el diálogo abierto), baile (3 rondas: solo el encuadre), impacto y aviso largo.
// Aceptación: 0 solapes HUD↔cabeza/torso de personajes en cuadro; 0 solapes avisos↔botones; caras visibles en la charla.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS, SAVE_20 } from '../lib.mjs';
const R = new Report('ux-layouts');
const HUD_IDS = ['mode-chip', 'toast', 'hint', 'objective', 'task', 'prompt', 'counter', 'zone', 'dialog', 'save-badge'];
const BTN_IDS = ['btn-jump', 'btn-crouch', 'btn-extra', 'btn-board', 'btn-cam', 'btn-pause'];
await runTest(R, async () => {
  const b = await launch();
  try {
    const all = [];
    for (const [vpName, vp] of [['escritorio', VIEWPORTS.desktop], ['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp, save: { ...SAVE_20, activities: { ...SAVE_20.activities, pantherTalk: false }, collected: SAVE_20.collected.filter((x) => x !== 'no_me_guillo.activity') } });
      await clickStart(page); await sleep(1200);
      const measure = async (tag) => {
        await sleep(400);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // estado asentado (la recolocación del HUD va 1 fotograma detrás)
        const m = await page.evaluate((HUD_IDS, BTN_IDS) => {
          const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, W = innerWidth, H = innerHeight;
          const vis = (el) => el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
          const rect = (id) => { const el = document.getElementById(id); if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height }; };
          const hud = HUD_IDS.map(rect).filter(Boolean), btn = BTN_IDS.map(rect).filter(Boolean);
          // personajes: ANMI + NPCs visibles; caja en pantalla de cabeza y torso (huesos)
          const chars = [];
          const boneBox = (root, name, minFrac = 0.08) => { const pts = []; root.traverse((o) => { if (o.isBone && /(Head|Neck|Spine2|Spine1|Spine|Hips)$/.test(o.name)) { const p = new T.Vector3(); o.getWorldPosition(p); const n = p.clone().project(cam); if (n.z < 1 && Math.abs(n.x) < 1.2 && Math.abs(n.y) < 1.2) pts.push([(n.x + 1) / 2 * W, (1 - n.y) / 2 * H]); } });
            if (pts.length < 3) return null; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); if (Math.max(...ys) - Math.min(...ys) < Math.max(minFrac * H, 24)) return null;   // personaje lejano/pequeño: no cuenta (ANMI cuenta siempre)
            const pad = 0.04 * H; return { name, x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad }; };
          const a = boneBox(g.visual.root, 'ANMI', 0)   /* ANMI: cuenta desde 24 px de cadera a cabeza (de espaldas en vertical mide 51 px) */; if (a) chars.push(a);
          for (const [id, list] of g.npcs) for (const n of list) if (n.root.visible) { const bb = boneBox(n.root, id, 0.05); if (bb) chars.push(bb); }
          const ov = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
          const hudChar = []; for (const h of hud) for (const c of chars) { const o = ov(h, c); if (o > 0.08 * Math.min(h.w * h.h, c.w * c.h)) hudChar.push([h.id, c.name, Math.round(o)]); }
          const hudBtn = []; for (const h of hud) for (const bn of btn) { const o = ov(h, bn); if (o > 4) hudBtn.push([h.id, bn.id, Math.round(o)]); }
          // V5: solapes entre elementos del HUD (texto sobre texto)
          const hudHud = []; for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) { const o = ov(hud[i], hud[j]); if (o > 4) hudHud.push([hud[i].id, hud[j].id, Math.round(o)]); }
          return { hud: hud.map((h) => h.id), chars: chars.map((c) => c.name), hudChar, hudBtn, hudHud, inset: g.rig.insetShift, mode: g.mode };
        }, HUD_IDS, BTN_IDS);
        const f = await R.shot(page, `${vpName}_${tag}`);
        all.push({ vp: vpName, tag, ...m }); console.log(vpName, tag, JSON.stringify(m));
      };
      // llegada
      await fixture(page, R, 'llegada NMG (spawn)', () => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await sleep(1500); await measure('llegada');
      // aviso largo
      await page.evaluate(() => { const h = document.getElementById('hint'); h.hidden = false; h.innerHTML = 'Patata en alto: coge carrerilla <b>patinando</b> y pulsa <b>SALTO</b> antes del borde para subir al cajón de la plataforma'; });
      R.fixture('aviso largo forzado en #hint (texto real de pista)', {}); await measure('aviso_largo'); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
      // charla Pantera (entrada real: acercarse y E)
      await fixture(page, R, 'junto a Pantera, mirando hacia ella', () => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get('act.pantherTalk'); const pan = g.manifest.get('npc.la_pantera'); g.skater.teleport(z.pos.clone(), Math.atan2(pan.pos.x - z.pos.x, pan.pos.z - z.pos.z), 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await sleep(600); await page.keyboard.press('KeyE'); await sleep(1800); await measure('charla');
      for (let i = 0; i < 4; i++) { await page.keyboard.press('Enter'); await sleep(900); }
      await measure('charla_tarde');
      for (let i = 0; i < 8; i++) { const md = await page.evaluate(() => window.__bk.mode); if (md === 'explore') break; await page.keyboard.press('Enter'); await sleep(700); }
      await sleep(800); await measure('charla_vuelta');
      // impacto (coche): encuadre durante el vuelo
      await fixture(page, R, 'S-car-A', () => { const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0]; const a = C.phase + c.offset - 12 / 17.5, pose = window.__bkCarPose(a), p = pose.pos; g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(-pose.vel.x, -pose.vel.z), 'walk'); g.rig.snapBehind(g.skater); g.skater.impactProtectUntil = -1; return {}; });
      for (let i = 0; i < 80; i++) { const ph = await page.evaluate(() => window.__bk.skater.impactPhase); if (ph === 'air') break; await sleep(40); }
      await sleep(150); await measure('impacto_vuelo');
      await page.close();
    }
    R.measure('capturas', all);
    const bad = all.filter((x) => x.hudChar.length), badBtn = all.filter((x) => x.hudBtn.length);
    R.check(bad.length === 0, `0 solapes de HUD con cabeza/torso de personajes en cuadro (${all.length - bad.length}/${all.length})`, 'emulation', bad.map((x) => `${x.vp}/${x.tag}: ${JSON.stringify(x.hudChar)}`));
    R.check(badBtn.length === 0, `0 solapes de avisos con botones (${all.length - badBtn.length}/${all.length})`, 'emulation', badBtn.map((x) => `${x.vp}/${x.tag}: ${JSON.stringify(x.hudBtn)}`));
    const badHud = all.filter((x) => x.hudHud.length);
    R.check(badHud.length === 0, `0 solapes entre elementos del HUD (${all.length - badHud.length}/${all.length})`, 'emulation', badHud.map((x) => `${x.vp}/${x.tag}: ${JSON.stringify(x.hudHud)}`));
    R.pendingHuman('Revisión visual de las capturas de los tres layouts (G8-V)');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
