// V10.2 · Q01 + Q03 + Q05 + R-03 + R-03b · charlas con Bellakroak, Bellakat (arriba y frase final abajo), La Pantera y Bella (FG):
// · Q01: ANMI se separa a 1,2–1,7 m del NPC (llegue desde donde llegue), apoyada en el suelo (sin quedar en el aire en el puente de NVDA);
// · Q03: plano de charla: la CABEZA del NPC y la de ANMI dentro de la imagen, la del NPC fuera del recuadro del diálogo, y nada tapa la
//   línea cámara → cabeza del NPC; en escritorio y en teléfono vertical;
// · R-03b: con «reducir movimiento» la cámara corta (llega al plano en el mismo fotograma).
import { Report, runTest, launch, openGame, clickStart, sleep, VIEWPORTS } from '../v8/lib.mjs';
import { FRESH, PHONE_V, toZone, ui, waitDialog } from './lib102.mjs';
const R = new Report('charlas');
const ONLY = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const CASES = [
  { id: 'rana', zone: 'act.graffiti', npc: 'rana', name: 'Bellakroak', offs: [[0.55, 0], [0.55, Math.PI / 2], [0.55, Math.PI], [0.55, -Math.PI / 2]] },
  { id: 'fennec', zone: 'act.skateTutorial', npc: 'fennec', name: 'Bellakat', offs: [[0, 0], [0.5, Math.PI / 2], [0.5, -Math.PI / 2]] },
  { id: 'fennec-fin', zone: 'act.skateTutorial', npc: 'fennec', name: 'Bellakat', fin: true, offs: [[0, 0]] },
  { id: 'pantera', zone: 'act.pantherTalk', npc: 'la_pantera', name: 'La Pantera', offs: [[0, 0], [0.6, Math.PI / 2], [0.6, -Math.PI / 2]] },
  { id: 'bella', zone: 'act.danceCombo', npc: 'bella', name: 'Bella', offs: [[0, 0]] },
  // referencia (V7, aprobada por el usuario): Aissa en TRA TRA TRA. Solo Q03 (la distancia la decide su propio recorrido)
  { id: 'aissa', zone: 'act.bridgeTalk.aissa', npc: 'aissa', name: 'Aissa', ref: true, offs: [[0, 0]] },
].filter((c) => !ONLY.length || ONLY.includes(c.id));
const measure = (page, npc) => page.evaluate((npc) => {
  const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, s = g.skater, cam = g.rig.cam;
  const list = g.npcs.get(npc) ?? []; let a = list[0]; if (list.length > 1) a = list.reduce((m, x) => (x.root.position.distanceTo(s.footPos) < m.root.position.distanceTo(s.footPos) ? x : m), list[0]);
  if (!a) return null;
  const headOf = (root) => { let h = null; root.traverse((o) => { if (!h && o.isBone && /head$/i.test(o.name)) h = o; }); if (h) return h.getWorldPosition(new T.Vector3()); const bx = new T.Box3().setFromObject(root); return new T.Vector3((bx.min.x + bx.max.x) / 2, bx.max.y - 0.12, (bx.min.z + bx.max.z) / 2); };
  const np = a.root.getWorldPosition(new T.Vector3()), nh = headOf(a.root), ah = headOf(g.visual.root);
  cam.updateMatrixWorld(); const proj = (p) => { const v = p.clone().project(cam); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z }; };
  const inView = (q) => q.z < 1 && q.x > 0.03 * innerWidth && q.x < 0.97 * innerWidth && q.y > 0.03 * innerHeight && q.y < 0.97 * innerHeight;
  const pn = proj(nh), pa = proj(ah), bub = document.querySelector('#dialog .bubble')?.getBoundingClientRect();
  const underDlg = !!bub && pn.x > bub.left && pn.x < bub.right && pn.y > bub.top && pn.y < bub.bottom;
  // línea de visión: de la cámara a la cabeza del NPC, contra sólidos (sin sensores, sin cápsulas de personajes ni ANMI)
  const o = cam.position, dir = nh.clone().sub(o), L = dir.length(); dir.normalize();
  const hit = g.world.castRay(new RA.Ray({ x: o.x, y: o.y, z: o.z }, { x: dir.x, y: dir.y, z: dir.z }), L, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (c) => !g.npcColliders.has(c.handle));
  const blocked = !!hit && hit.timeOfImpact < L - 0.25;
  const down = g.world.castRay(new RA.Ray({ x: s.footPos.x, y: s.footPos.y + 0.4, z: s.footPos.z }, { x: 0, y: -1, z: 0 }), 1.5, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
  // de frente: la cámara está delante de la cara del NPC (≤ 60° de su frente); tamaño: alto del NPC en pantalla (pies → cabeza)
  const fw = new T.Vector3(0, 0, 1).applyQuaternion(a.root.getWorldQuaternion(new T.Quaternion())).setY(0).normalize(), toCam = o.clone().sub(nh).setY(0).normalize();
  const an = s.footPos.clone().setY(0), nn = np.clone().setY(0), co = o.clone().setY(0), v1 = nn.clone().sub(co).normalize(), v2 = nn.clone().sub(an).normalize();
  const shoulder = +(Math.acos(Math.max(-1, Math.min(1, v1.dot(v2)))) * 180 / Math.PI).toFixed(0), behind = co.distanceTo(nn) > an.distanceTo(nn);
  const front = +(Math.acos(Math.max(-1, Math.min(1, fw.dot(toCam)))) * 180 / Math.PI).toFixed(0), pf = proj(np), tall = +(Math.abs(pf.y - pn.y) / innerHeight).toFixed(3);
  return { h: +(new T.Box3().setFromObject(a.root).max.y - np.y).toFixed(2), shoulder, behind, front, tall, d: +Math.hypot(np.x - s.footPos.x, np.z - s.footPos.z).toFixed(3), ground: down ? +(down.timeOfImpact - 0.4 - (window.__bkTuning?.kccOffset ?? 0)).toFixed(3) : null, gap: down ? +(down.timeOfImpact).toFixed(3) : null,
    npcHead: [pn.x, pn.y].map(Math.round), npcIn: inView(pn), anmiIn: inView(pa), underDlg, blocked, blockName: blocked ? g.park.colliderName?.(hit.collider.handle) : null, blend: g.rig.blend, cam: o.toArray().map((v) => +v.toFixed(2)), foot: s.footPos.toArray().map((v) => +v.toFixed(2)) };
}, npc);
await runTest(R, async () => {
  const b = await launch();
  for (const c of CASES) for (const [vpName, vp] of [['escritorio', VIEWPORTS.desktop], ['vertical', PHONE_V]]) for (const [off, ang] of c.offs) {
    if (vpName === 'vertical' && off) continue;
    const save = c.fin ? { ...FRESH, hints: ['basic', 'nv-fennec-intro'] } : FRESH;
    const page = await openGame(b, R, { save, viewport: vp }); await clickStart(page);
    if (c.npc === 'rana') await page.evaluate(() => window.__bk.loadNpc('rana'));
    const npcPos = await page.evaluate((npc) => window.__bk.npcs.get(npc)?.[0]?.root.position.toArray() ?? null, c.npc);
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      // la rana: el recuadro está centrado en ella → ANMI a `off` m de la rana, mirándola; resto: desplazada desde el centro del recuadro
      if (c.id === 'rana') await page.evaluate((off, ang) => { const g = window.__bk, r = g.npcs.get('rana')[0].root.position, T = window.__bkTHREE; const p = new T.Vector3(r.x + Math.sin(ang) * off, r.y, r.z + Math.cos(ang) * off); g.input.clear(); g.skater.teleport(p, Math.atan2(r.x - p.x, r.z - p.z), 'walk'); g.rig.snapBehind(g.skater); }, off, ang);
      else await toZone(page, c.zone, 0, off, ang);
      await sleep(500); const s = await ui(page); ok = !!s.action && !s.actionOff && !/llegando/.test(s.action);
    }
    if (c.fin) { await page.keyboard.press('KeyE'); await sleep(500); await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'skateTutorial'); a.phase = 'exit'; a.t = 99; }); }
    else await page.keyboard.press('KeyE');
    const d = await waitDialog(page, c.ref ? 9000 : 5000); await sleep(1600);
    const m = await measure(page, c.npc);
    const tag = `${c.id} (${vpName}${off ? `, llega desde ${Math.round(ang * 180 / Math.PI)}°` : ''})`;
    await R.shot(page, `${c.id}_${vpName}_${Math.round(ang * 180 / Math.PI)}`);
    if (!d.dialog || d.dialog.name !== c.name || !m) { R.check(false, `${tag}: habla ${c.name} (diálogo ${JSON.stringify(d.dialog)})`, 'input', m); await page.close(); continue; }
    if (!c.ref) { R.check(m.d >= 1.2 && m.d <= 1.7, `${tag} · Q01: ANMI a ${m.d} m (1,2–1,7)`, 'input', m);
      R.check(m.gap !== null && m.gap < 0.6, `${tag} · Q01: ANMI apoyada en el suelo (rayo al suelo ${m.gap} m)`, 'input', m); }
    R.check(m.behind && m.shoulder <= 45, `${tag} · Q03: plano por encima del hombro de ANMI, como en TT (cámara detrás de ANMI: ${m.behind}; ${m.shoulder}° de la línea ANMI→${c.name}, ≤ 45°)`, 'vision', m);
    R.check(m.npcIn && m.anmiIn && !m.underDlg, `${tag} · Q03: cabeza de ${c.name} en cuadro (${m.npcIn}) y fuera del diálogo (${!m.underDlg}), cabeza de ANMI en cuadro (${m.anmiIn})`, 'vision', m);
    // tamaño: el de Aissa en TT (28 % del alto en ordenador, 20 % en vertical) para una persona de 1,75 m; un NPC más bajo, en proporción a su altura
    const need = (vpName === 'vertical' ? 0.2 : 0.28) * Math.min(1, (m.h || 1.75) / 1.75);
    R.check(m.front <= 45 && m.tall >= need, `${tag} · Q03: se ve a ${c.name} de frente (${m.front}° de su cara, ≤ 45°) y grande (${Math.round(m.tall * 100)} % del alto, ≥ ${Math.round(need * 100)} % para ${m.h} m)`, 'vision', m);
    R.check(!m.blocked, `${tag} · Q03: nada tapa la cara de ${c.name}${m.blocked ? ` (tapa ${m.blockName})` : ''}`, 'vision', m);
    await page.close();
  }
  // R-03b: con «reducir movimiento» la cámara de charla corta
  if (!ONLY.length || ONLY.includes('reducido')) { const page = await openGame(b, R, { save: { ...FRESH, settings: { reducedMotion: true, reducedMotionSet: true } } }); await clickStart(page);
    await toZone(page, 'act.pantherTalk'); await sleep(600); await page.keyboard.press('KeyE'); await waitDialog(page, 4000); await sleep(150);
    const bl = await page.evaluate(() => window.__bk.rig.blend);
    R.check(bl >= 0.999, `R-03b: con «reducir movimiento» la cámara de charla corta (mezcla ${bl} a los 0,15 s)`, 'emulation', { bl });
    await page.close(); }
  await b.close();
}, { timeoutMs: 900000 });
