// V10.1 · P18 (usuario: «hay un hueco en la espalda de ANMI») guardián de la malla de ANMI que se carga en el juego:
//  · el triángulo 18720 de ANMI_BODY (la astilla de la espalda que al andar se abría y enseñaba el fondo negro del atlas) toma color de
//    camiseta (texel claro en su centro UV);
//  · los 399 triángulos que arregló el agente de ANMI (`assets/derived/v10_1/anmi/review/e1_triangulos_arreglados.json`) tienen área UV y
//    no caen en el fondo negro del atlas (luminancia ≥ 12 en su centro UV salvo que sus vecinos también sean negros —suela, ojos—; antes, astillas de área cero
//    sobre ese fondo). El color exacto
//    del centro tras el WebP puede quedar algo más oscuro que la media de sus vecinos en el pantalón: se mide, no se exige;
//  · y, en pantalla, ANMI de espaldas andando y corriendo: alrededor de donde se proyecta el triángulo 18720 no hay píxeles oscuros
//    (ni la línea negra del fondo del atlas ni la gris del revés de la astilla doblada).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20 } from '../v8/lib.mjs';
import fs from 'node:fs';
const FIX = JSON.parse(fs.readFileSync(new URL('../../../assets/derived/v10_1/anmi/review/e1_triangulos_arreglados.json', import.meta.url))).arreglos.map((a) => [a.tri, a.lum_vecinos]);
const R = new Report('espalda-v10-1');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1500);
    const geo = await page.evaluate((FIX) => { const v = window.__bk.visual, m = v.body, g = m.geometry, uv = g.attributes.uv, ix = g.index, map = m.material.map ?? m.material[0]?.map;
      const img = map.image, W = img.width, H = img.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      const px = (u, v2) => { const d = cx.getImageData(Math.min(W - 1, Math.floor(u * W)), Math.min(H - 1, Math.floor((map.flipY ? 1 - v2 : v2) * H)), 1, 1).data; return [d[0], d[1], d[2]]; };
      const tri = (t) => [0, 1, 2].map((k) => { const i = ix.getX(3 * t + k); return [uv.getX(i), uv.getY(i)]; });
      let zero = 0, bg = 0; const n = ix.count / 3, bad = [];
      for (const [t, lv] of FIX) { const [a, b2, c] = tri(t), A = Math.abs((b2[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b2[1] - a[1])) / 2 * W * H, q = px((a[0] + b2[0] + c[0]) / 3, (a[1] + b2[1] + c[1]) / 3), l = 0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2];
        if (A < 1e-3 || (l < 12 && lv >= 12)) bad.push({ t, A: +A.toFixed(3), l: Math.round(l), lv }); }
      for (let t = 0; t < n; t++) { const [a, b2, c] = tri(t); const A = Math.abs((b2[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b2[1] - a[1])) / 2; if (A * W * H < 1e-3) { zero++; const q = px((a[0] + b2[0] + c[0]) / 3, (a[1] + b2[1] + c[1]) / 3); if (0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2] < 12) bg++; } }
      const T = tri(18720), cu = (T[0][0] + T[1][0] + T[2][0]) / 3, cvv = (T[0][1] + T[1][1] + T[2][1]) / 3, col = px(cu, cvv);
      return { name: m.name, tris: n, zero, bg, bad: bad.length, badEx: bad.slice(0, 6), col, lum: Math.round(0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]) }; }, FIX);
    R.measure('malla', geo);
    R.check(geo.name === 'ANMI_BODY' && geo.lum > 150, `P18 · el triángulo 18720 (espalda) tiene color de camiseta (luminancia ${geo.lum}, antes fondo negro)`, 'static', geo);
    R.check(geo.bad === 0, `P18 · los ${FIX.length} triángulos arreglados tienen área UV y no caen en el fondo negro del atlas (${geo.bad} mal)`, 'static', geo);
    // en pantalla: ANMI andando, cámara 1,6 m detrás a la altura del hombro (como la sonda del agente); píxeles casi negros en la espalda
    // (ventana de 40 × 24 px centrada donde se proyecta el triángulo 18720, en el omoplato derecho; ni pelo, ni cadena, ni el hueco del brazo). Cuenta la línea negra
    // (luminancia < 28) y la gris de la astilla vista del revés (< 110; la camiseta en sombra no baja de ~150)
    await fixture(page, R, 'ANMI a pie en la recta del exterior, andando (W), cámara fija detrás del hombro', () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
      s.teleport(new T.Vector3(-20, 0, -46.5), Math.PI / 2, 'walk'); g.rig.snapBehind(s); g.input.clear(); });
    await page.keyboard.down('KeyW'); await sleep(300);
    const dark = []; for (let k = 0; k < 24; k++) { dark.push(await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, cam = g.rig.cam;
        const p = s.visualPos, f = new T.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)); g.autoMode = true;
        cam.position.copy(p).addScaledVector(f, -1.6).add(new T.Vector3(0, 1.35, 0)); cam.lookAt(p.x, p.y + 1.3, p.z); cam.updateMatrixWorld(); g.renderer.render(g.scene, cam);
        const gl = g.renderer.getContext(), cv = document.getElementById('game'), W = cv.width, H = cv.height, bw = 40, bh = 24, buf = new Uint8Array(4 * bw * bh);
        const m = g.visual.body, ix = m.geometry.index, c3 = new T.Vector3(), tv = new T.Vector3(); for (let k = 0; k < 3; k++) c3.add(m.getVertexPosition(ix.getX(3 * 18720 + k), tv).applyMatrix4(m.matrixWorld)); c3.divideScalar(3).project(cam);
        const sx = Math.round((c3.x + 1) / 2 * W), sy = Math.round((c3.y + 1) / 2 * H);
        gl.readPixels(sx - bw / 2, sy - bh / 2, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf); g.autoMode = false;
        let white = 0, black = 0; for (let i = 0; i < buf.length; i += 4) { const l = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; if (l > 170) white++; else if (l < 110) black++; }
        return { sx, sy, white, black, v: +Math.hypot(s.vel.x, s.vel.z).toFixed(1) }; })); await sleep(110); }
    await page.keyboard.up('KeyW');
    R.measure('pantalla', dark);
    const worst = Math.max(...dark.map((d) => d.black)), shirt = Math.min(...dark.map((d) => d.white));
    R.check(shirt > 600 && worst <= 4, `P18 · de espaldas andando y corriendo no aparece la línea en el omoplato (peor fotograma: ${worst} píxeles oscuros sobre la camiseta)`, 'vision', dark);
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
