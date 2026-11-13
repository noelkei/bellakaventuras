// Mutaciones de control (V4-VAL-01, cap. 16): aplica en COPIA EN SITIO una mutación textual a un archivo de game/src,
// espera a que el dev server la sirva, ejecuta la prueba indicada con el runner y RESTAURA el archivo original
// (verificando su SHA). Una mutación crítica debe producir rojo; si la prueba sigue verde, la aserción no es sensible.
// Uso: node game/tools/v4/mutate.mjs <id-mutación> [--url U]   (catálogo abajo). Sin argumentos ejecuta todas.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Report, runTest, GAME, HERE, sha256File, arg, sleep } from './lib.mjs';

export const MUTATIONS = {
  'x-impulsa': { file: 'src/skater.ts', test: 'ctrl-contract', why: 'el giro (A/D, stick X) aporta propulsión',
    find: "    const thr = deadzone(THREE.MathUtils.clamp(f.move.y, -1, 1), T.throttleDead);",
    replace: "    const thr = deadzone(THREE.MathUtils.clamp(Math.max(Math.abs(f.move.x), f.move.y), -1, 1), T.throttleDead);" },
  'soltar-baja': { file: 'src/skater.ts', test: 'ctrl-contract', why: 'soltar la propulsión baja de la tabla (automontaje V3)',
    find: "        this.pushing = false; this.zeroT = 0;\n        if (Math.abs(this.slopeTangentY) < 0.06)",
    replace: "        this.pushing = false; this.zeroT = 0; if (Math.abs(fwd) < 6 && this.loco === 'ride') this.setLoco('dismount');\n        if (Math.abs(this.slopeTangentY) < 0.06)" },
  'falso-apoyo': { file: 'src/skater.ts', test: 'repro-baseline', why: 'aceptar cualquier impacto de la sonda larga como apoyo (V3)',
    find: "    const supported = !!hc && this.supportGap <= T.supportDist + T.kccOffset && Math.abs(hc.normal.y) > 0.55;",
    replace: "    const supported = !!hc && Math.abs(hc.normal.y) > 0.55;" },
  'frente-invertido': { file: 'src/anmi.ts', test: 'repro-baseline', why: 'la presentación suma π al andar hacia atrás (HUM-A4-004)',
    find: "    const yaw = s.headingVis + this.revertVis + s.spinVis;",
    replace: "    const yaw = s.headingVis + (s.vLong < -0.3 || s.loco === 'walk' ? Math.PI : 0) + this.revertVis + s.spinVis;" },
  'camara-conduce': { file: 'src/game.ts', test: 'ctrl-contract', why: 'la cámara vuelve a transformar los ejes de conducción',
    find: "    s.step(dt, worldInput ? fs : EMPTY_FRAME, ctx);",
    replace: "    { const cf = this.rig.forward, h = this.skater!.heading; const a = Math.atan2(cf.x, cf.z) - h; const m = fs.move; fs = { ...fs, move: { x: m.x * Math.cos(a) - m.y * Math.sin(a), y: m.y * Math.cos(a) + m.x * Math.sin(a) } }; }\n    s.step(dt, worldInput ? fs : EMPTY_FRAME, ctx);" },
  'coches-desfase': { file: 'src/vehicles.ts', test: 'cars-v4', why: 'la pareja no queda en oposición π',
    find: "offset: i * Math.PI,", replace: "offset: i * Math.PI * 0.9," },
  'coche-frente-invertido': { file: 'src/vehicles.ts', test: 'cars-v4', why: 'envoltorio que vuelve a suponer morro +X (marcha atrás)',
    find: "wrap.rotation.y = Math.PI / 2;", replace: "wrap.rotation.y = -Math.PI / 2;" },
  'coches-ceden': { file: 'src/vehicles.ts', test: 'cars-v4', why: 'los coches frenan/ceden (velocidad no constante)',
    find: "    this.phase -= CARS.W * dt;", replace: "    this.phase -= CARS.W * dt * (this.stepCount % 120 < 30 ? 0.2 : 1);" },
  'coches-antes-de-20': { file: 'src/game.ts', test: 'cars-v4', why: 'los coches aparecen antes de 20 patatas',
    find: "    if (this.centerOpen !== this.cars.active) this.cars.setActive(this.centerOpen,", replace: "    if (true !== this.cars.active) this.cars.setActive(true," },
  'sin-pausa-central': { file: 'src/game.ts', test: 'audio-v4', why: 'el reloj del destello central sigue en pausa (reloj de pared)',
    find: "  centralFlash(t = this.centralClock) {", replace: "  centralFlash(t = performance.now() / 1000) {" },
  'tercera-voz': { file: 'src/music.ts', test: 'audio-v4', why: 'se permite una tercera voz musical',
    find: "  readonly MAX_VOICES = 2;", replace: "  readonly MAX_VOICES = 3;" },
  'choque-no-anula': { file: 'src/activities.ts', test: 'final-v4', why: 'un choque durante el intento del triple no lo anula',
    find: "    if ((this.phase === 'approach' || this.phase === 'armed') && s.loco === 'impact') {", replace: "    if (false && s.loco === 'impact') {" },
  'triple-sin-armar': { file: 'src/activities.ts', test: 'final-v4', why: 'el triple se concede sin SALTO en la ventana',
    find: "    if (this.armed && tripleOk && onTable && s.loco !== 'bail') this.success();", replace: "    if (tripleOk || !this.armed) this.success();" },
  'sin-tramado': { file: 'src/world/camfade.ts', test: 'camfade', why: 'la geometría pegada a la cámara vuelve a tapar a ANMI',
    find: "    if (a < b) discard;", replace: "    if (a < -1.0) discard;" },
  'coche-yaw-vuelta-larga': { file: 'src/vehicles.ts', test: 'cars-v4', why: 'interpolación de yaw sin envolver (giro de 360° al cruzar ±π)',
    find: "  static lerpYaw(a: number, b: number, t: number) { return a + (THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI) * t; }", replace: "  static lerpYaw(a: number, b: number, t: number) { return a + (b - a) * t; }" },
  'marcha-sin-cadencia': { file: 'src/anmi.ts', test: 'anim-v4', why: 'la cadencia de la marcha no sigue la velocidad real (pies patinan)',
    find: "const wa = this.actions.get('SK_WalkBoard'); if (wa) wa.timeScale = back * THREE.MathUtils.clamp(hv / nat, 0.4, 2.2);", replace: "const wa = this.actions.get('SK_WalkBoard'); if (wa) wa.timeScale = back * 1; void nat;" },
  'tabla-sin-restaurar': { file: 'src/anmi.ts', test: 'kick-v4', why: 'la capa de giro de la tabla se acumula (no se restaura la base de los clips)',
    find: "    if (this.boardBone && this.boardLayered) { this.boardBone.quaternion.copy(this.boardBase); this.boardLayered = false; }", replace: "    if (this.boardBone && this.boardLayered) { this.boardLayered = false; }" },
  'empuje-al-soltar': { file: 'src/skater.ts', test: 'sfx-v4', why: 'el empuje (y su sonido) sigue tras soltar W',
    find: "        if (this.pushing && ph > T.pushContact[0] && ph < T.pushContact[1]) {", replace: "        if (ph > T.pushContact[0] && ph < T.pushContact[1]) {" },
  'camara-sin-guarda': { file: 'src/camera.ts', test: 'cam-v4', why: 'sin la guarda de finitud un NaN se queda en la cámara',
    find: "    const c = this.cam, outOk = inOk && CameraRig.fin(c.position)", replace: "    const c = this.cam, outOk = true || CameraRig.fin(c.position)" },
  'apoyo-tardio': { file: 'src/skater.ts', test: 'land-support', why: 'el collider de apoyo no se toma del contacto del KCC en el paso del aterrizaje',
    find: "      if (cy > 0.55 && this.kccGrounded && this.groundCollider === null && c.collider) this.groundCollider = c.collider.handle;", replace: "      void 0;" },
  'giro-invertido': { file: 'src/skater.ts', test: 'ctrl-contract', why: 'D gira a la izquierda (signo del giro invertido)',
    find: "        turnRate = -steer * maxTurn;", replace: "        turnRate = steer * maxTurn;" },
};

const R = new Report('VAL-01', `mutate-${arg('only', 'todas')}`);
await runTest(R, async () => {
  const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : Object.keys(MUTATIONS);
  const url = arg('url', 'http://127.0.0.1:5193/');
  for (const id of only) {
    const m = MUTATIONS[id]; if (!m) { R.check(false, `mutación desconocida ${id}`, 'unit'); continue; }
    const file = path.join(GAME, m.file);
    const orig = fs.readFileSync(file, 'utf8'); const sha0 = sha256File(file);
    if (!orig.includes(m.find)) { R.check(false, `${id}: el texto a mutar no existe (la prueba de sensibilidad caducó)`, 'unit', { file: m.file }); continue; }
    let res;
    try {
      fs.writeFileSync(file, orig.replace(m.find, m.replace));
      await sleep(2500); // el dev server (HMR) sirve la versión mutada a las páginas nuevas
      res = spawnSync(process.execPath, [path.join(HERE, 'run.mjs'), m.test, '--url', url, '--label', `mut-${id}`, '--timeout', '400'], { encoding: 'utf8' });
    } finally {
      fs.writeFileSync(file, orig);
    }
    const restored = sha256File(file) === sha0;
    const man = res?.stdout.match(/manifiesto: (.+manifest\.json)/)?.[1];
    R.check(restored, `${id}: archivo restaurado (SHA original)`, 'unit', { file: m.file });
    R.check(res?.status !== 0, `${id}: la mutación «${m.why}» produce rojo en ${m.test}`, 'unit', { exit: res?.status, manifest: man, tail: res?.stdout.split('\n').filter((l) => /^FALLO/.test(l)).slice(0, 4) });
  }
  await sleep(2500);
}, { timeoutMs: 3 * 3600 * 1000 });
