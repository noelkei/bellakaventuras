// V4-NMG-01/03/06 · Pares de revisión NMG desde cámaras de JUGADOR y de referencia (no render de estudio): llegada a la
// altura de la cámara de seguimiento detrás de ANMI en el spawn, general elevada comparable a la referencia 01, ¾ del
// cluster, reverso (lado FG), U/secreto desde la llegada, conversación. Exige mundo visible y kit cargado (no blockout).
import { Report, runTest, launch, openGame, clickStart, reviewShot, sleep, arg, VIEWPORTS } from './lib.mjs';
const tag = arg('tag', 'v4');
const R = new Report('NMG', `nmg-shots-${tag}`);
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    const kit = await page.evaluate(() => window.__bk.park.nmgKit);
    R.check(kit.ok && kit.pieces === 12, 'kit NMG cargado e instanciado (no blockout)', 'static', kit);
    // llegada real: cámara de seguimiento tras ANMI en el spawn (sin tocar nada)
    await sleep(1500);
    await page.evaluate(() => { for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden'; });
    await R.shot(page, `${tag}_01_llegada_camara_juego`);
    await page.evaluate(() => { for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = ''; });
    const F = await page.evaluate(() => {
      const g = window.__bk, m = g.manifest, h = m.get('nmg.heart'), q = m.get('nmg.quarter'), sp = m.spawn.pos;
      return { heart: [h.pos.x, h.pos.z], quarter: [q.pos.x, q.pos.z], spawn: [sp.x, sp.z], u: (() => { const f = m.fries.find((x) => x.id === 'no_me_guillo.hidden'); return [f.pos.x, f.pos.z]; })() };
    });
    const mid = [(F.heart[0] + F.quarter[0]) / 2, (F.heart[1] + F.quarter[1]) / 2];
    const shots = [
      ['02_general_elevada', [mid[0] - 16, 19, mid[1] + 14], [mid[0], 0, mid[1]]],
      ['03_tres_cuartos_cluster', [F.heart[0] - 7.5, 3.2, F.heart[1] + 6.5], [F.heart[0] + 2, 0.7, F.heart[1] - 1]],
      ['04_suelo_altura_jugador', [F.spawn[0] + (F.heart[0] - F.spawn[0]) * 0.25, 1.7, F.spawn[1] + (F.heart[1] - F.spawn[1]) * 0.25], [F.heart[0], 0.9, F.heart[1]]],
      ['05_reverso_desde_fg', [F.quarter[0] + 6, 3.0, F.quarter[1] - 6], [F.heart[0], 0.5, F.heart[1]]],
      ['06_u_desde_llegada', [F.spawn[0], 2.3, F.spawn[1]], [F.u[0], 0.6, F.u[1]]],
    ];
    for (const [n, p, t] of shots) await reviewShot(page, R, `${tag}_${n}`, p, t, 66);
    // V4-NMG-05: Pantera sentada en el bordillo (primer plano de jugador) y conversación por entrada real (E)
    const PN = await page.evaluate(() => { const a = window.__bk.manifest.get('npc.la_pantera'), z = window.__bk.park.zones.get('act.pantherTalk'), pan = window.__bk.npcs.get('la_pantera')?.[0];
      return { p: [a.pos.x, a.pos.z], h: a.heading, zone: [z.pos.x, z.pos.z], seated: !!pan?.seated, clip: pan?.current?.getClip().name }; });
    R.check(PN.seated && PN.clip === 'SitIdle', 'Pantera carga sentada (SitIdle) en el bordillo del corazón', 'static', PN);
    const fx = Math.sin(PN.h), fz = Math.cos(PN.h);
    await reviewShot(page, R, `${tag}_07_pantera_sentada`, [PN.p[0] + fx * 3.2 - fz * 1.4, 1.5, PN.p[1] + fz * 3.2 + fx * 1.4], [PN.p[0] + fx * 0.2, 0.75, PN.p[1] + fz * 0.2], 50);
    await page.evaluate((z) => { const g = window.__bk; g.skater.teleport(new window.__bkTHREE.Vector3(z[0], 0, z[1]), 0, 'walk'); g.input.clear(); }, PN.zone);   // fixture: colocación junto a la zona de charla
    await sleep(500); await page.keyboard.press('KeyE'); await sleep(1200);
    const talk = await page.evaluate(() => { const g = window.__bk, pan = g.npcs.get('la_pantera')[0]; return { mode: g.mode, clip: pan.current?.getClip().name, yaw: pan.yaw, dialog: !document.getElementById('dialog')?.hidden }; });
    await page.evaluate(() => { for (const id of ['touch']) document.getElementById(id).style.visibility = 'hidden'; });
    await R.shot(page, `${tag}_08_conversacion_pantera`);
    R.check(talk.clip === 'SitTalk' && Math.abs(talk.yaw - PN.h) < 1e-6, 'charla: gesto sentado SitTalk sin girar el cuerpo en el bordillo', 'input', talk);
    R.check(true, 'pares de revisión NMG generados (crítica visual por rasgos en V4/evidencias/NMG)', 'vision', shots.map((s) => s[0]));
    R.pendingHuman('Aceptación artística NMG por el usuario (máxima semejanza a las referencias seleccionadas)');
  } finally { await browser.close(); }
});
