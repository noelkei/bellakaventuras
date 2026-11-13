// IT8 · I1 · guardián estático (sin navegador): la build servida y el código, coherentes.
//  · todo recurso que pide el arranque (carga.json), las pistas (game-config.json), los iconos del manifiesto, las imágenes de index.html y
//    las rutas de recursos escritas en el JS de la build existen en la carpeta de la build, y los tamaños de carga.json son los reales
//    (la barra de carga usa esos bytes);
//  · cada <button> de index.html tiene nombre accesible (texto, aria-label o alt de su imagen);
//  · las teclas que enseñan los botones (data-key) son teclas que el juego escucha;
//  · `window.__bk*` solo se lee en el juego dentro de TEST_HOOKS (complementa v10/no-bk-read, que lo mira en marcha).
// Uso: node game/tools/it8/estatico.mjs [--dist game/dist-v10] [--task IT8]. Para verla en ROJO: --dist con una copia a la que le falte un archivo.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, arg, GAME } from '../v8/lib.mjs';
const R = new Report('it8-estatico', { task: arg('task', 'IT8') });
const DIST = path.resolve(arg('dist', path.join(GAME, 'dist-v10')));
const SRC = path.join(GAME, 'src');
const clean = (rel) => decodeURIComponent(rel.replace(/^\.\//, '').split(/[?#]/)[0]);
const ex = (rel) => fs.existsSync(path.join(DIST, clean(rel)));
// como portada/carga.ts: los nombres con huella de la build se comparan con comodín (la lista no caduca en cada compilación)
const huella = (p) => p.replace(/-[A-Za-z0-9_-]{8}\.(js|css|wasm)$/, '-*.$1');
const real = (rel) => { if (ex(rel)) return path.join(DIST, clean(rel)); const h = huella(clean(rel)), dir = path.dirname(h); if (!fs.existsSync(path.join(DIST, dir))) return null;
  const m = fs.readdirSync(path.join(DIST, dir)).find((f) => huella(path.join(dir, f)) === h); return m ? path.join(DIST, dir, m) : null; };
await runTest(R, async () => {
  R.data.dist = DIST; R.save();
  // 1 · carga.json
  const carga = JSON.parse(fs.readFileSync(path.join(DIST, 'carga.json'), 'utf8'));
  const files = Object.entries(carga.archivos);
  const falta = files.filter(([f]) => !real(f)).map(([f]) => f);
  const malTam = files.filter(([f, n]) => real(f) && fs.statSync(real(f)).size !== n).map(([f, n]) => ({ f, lista: n, real: fs.statSync(real(f)).size }));
  const desvio = malTam.reduce((a, m) => a + Math.abs(m.real - m.lista), 0) / carga.total;
  const suma = files.reduce((a, [, n]) => a + n, 0);
  R.check(files.length > 50 && !falta.length, `carga.json: los ${files.length} archivos del arranque existen en la build (con comodín en la huella, como la barra)`, 'static', { falta: falta.slice(0, 20) });
  R.check(desvio < 0.01, `carga.json: los tamaños apuntados desvían la barra menos de 1 punto (${(desvio * 100).toFixed(3)} %)`, 'static', { distintos: malTam.length, ejemplos: malTam.slice(0, 8) });
  R.check(suma === carga.total, `carga.json: «total» = suma de sus archivos`, 'static', { total: carga.total, suma });
  // 2 · pistas y manifiesto
  const cfg = JSON.parse(fs.readFileSync(path.join(DIST, 'game-config.json'), 'utf8'));
  const pistas = Object.entries(cfg.audio?.tracks ?? {});
  const pfalta = pistas.filter(([, f]) => !ex(f));
  R.check(pistas.length === 6 && !pfalta.length, `game-config: las ${pistas.length} pistas (5 zonas + SECRETNOVIO) existen`, 'static', { falta: pfalta });
  const extraCfg = JSON.stringify({ preview: cfg.preview, share: cfg.share }).match(/[\w./-]+\.(m4a|mp3|ogg|webp|png|jpg)/g) ?? [];
  R.check(extraCfg.every(ex), 'game-config: recursos de la escena final y de compartir existen', 'static', { faltan: extraCfg.filter((f) => !ex(f)) });
  const man = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
  R.check((man.icons ?? []).length >= 2 && man.icons.every((i) => ex(i.src)), 'manifiesto: los iconos de «añadir a inicio» existen', 'static', man.icons);
  // 3 · index.html
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((u) => !/^(data:|https?:|mailto:)/.test(u) && u !== './' && u !== '/');
  const rfalta = refs.filter((u) => !ex(u));
  R.check(refs.length > 5 && !rfalta.length, `index.html: las ${refs.length} referencias (scripts, estilos, imágenes, iconos) existen`, 'static', { falta: rfalta });
  // 4 · rutas en el JS de la build
  const js = fs.readdirSync(path.join(DIST, 'build')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(DIST, 'build', f), 'utf8')).join('\n');
  const RX = /["'`](?:\.\/)?((?:assets|audio|build|icons)\/[\w./-]+?\.(?:glb|gltf|webp|png|jpg|jpeg|m4a|mp3|ogg|json|ktx2|bin|woff2?|svg))["'`]/g;
  const enJs = [...new Set([...js.matchAll(RX)].map((m) => m[1]))];
  const jfalta = enJs.filter((u) => !ex(u));
  R.check(enJs.length > 0 && !jfalta.length, `JS de la build: las ${enJs.length} rutas de recursos escritas a mano existen`, 'static', { falta: jfalta });
  // 5 · nombres accesibles
  const src = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
  const btns = [...src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => {
    const attrs = m[1], inner = m[2], id = attrs.match(/id="([^"]+)"/)?.[1] ?? attrs.match(/class="([^"]+)"/)?.[1] ?? '?';
    const label = attrs.match(/aria-label="([^"]+)"/)?.[1] ?? inner.replace(/<[^>]*alt="([^"]+)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, '').trim();
    return { id, label };
  });
  const sinNombre = btns.filter((b) => !b.label);
  R.check(btns.length > 60 && !sinNombre.length, `index.html: los ${btns.length} botones tienen nombre accesible (texto, aria-label o alt)`, 'static', { sinNombre });
  // 6 · data-key = teclas que el juego escucha
  const inp = fs.readFileSync(path.join(SRC, 'input.ts'), 'utf8') + fs.readFileSync(path.join(SRC, 'bootstrap.ts'), 'utf8');
  const NAME = { Espacio: ['Space'], C: ['KeyC'], Q: ['KeyQ'], R: ['KeyR'], Esc: ['Escape'], B: ['KeyB'], E: ['KeyE'], X: ['KeyX'], T: ['KeyT'], '↑': ['ArrowUp'], '↓': ['ArrowDown'], '←': ['ArrowLeft'], '→': ['ArrowRight'] };
  const keys = [...new Set([...src.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]))];
  const malas = keys.filter((k) => !(NAME[k] ?? [k]).some((c) => inp.includes(`'${c}'`) || inp.includes(`"${c}"`)));
  R.check(keys.length >= 8 && !malas.length, `data-key: las ${keys.length} teclas que enseñan los botones las escucha el juego`, 'static', { keys, malas });
  // 7 · __bk fuera de TEST_HOOKS
  const lecturas = [];
  for (const f of fs.readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.ts'))) {
    const L = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n'); L.forEach((l, i) => {
      if (/window\)?\s*\.?\s*__bk|\(window as any\)\.__bk/.test(l) && !/TEST_HOOKS|SJ_TEST|\bTEST\b|bktest|\/\//.test(l.split('__bk')[0]) && !/if \((TEST_HOOKS|TEST|SJ_TEST)\) \{\s*$/.test(L[i - 1] ?? '')) lecturas.push(`${f}:${i + 1}`);
    });
  }
  R.check(!lecturas.length, 'código: toda mención de window.__bk va tras una guarda de pruebas (TEST_HOOKS / TEST / SJ_TEST) en su línea', 'static', { lecturas });
});
