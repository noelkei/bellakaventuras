// V10.6 · guardián de la vista previa al compartir el enlace (B6 §6.3): la página servida lleva og:title, og:description, og:image (URL absoluta
// https://bellakaventuras.com/…), og:url, twitter:card y description; la imagen se sirve (200, image/jpeg), mide 1200×630 y pesa < 300 KB.
// Uso: node tools/v10_6/compartir.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, arg, argUrl } from '../v8/lib.mjs';
const R = new Report('v106-compartir', { task: arg('task', 'V10-6') });
const U = argUrl();
await runTest(R, async () => {
  const html = await (await fetch(U)).text();
  const meta = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]*)"`)) ?? [])[1] ?? null;
  const m = { title: meta('og:title'), desc: meta('og:description'), img: meta('og:image'), url: meta('og:url'), card: meta('twitter:card'), d: meta('description') };
  R.check(!!m.title && !!m.desc && !!m.d && m.card === 'summary_large_image', 'etiquetas de vista previa (título, descripción, tarjeta grande)', 'static', m);
  R.check(/^https:\/\/bellakaventuras\.com\/[\w.-]+\.jpg$/.test(m.img ?? '') && m.url === 'https://bellakaventuras.com/', 'og:image y og:url con URL absoluta de bellakaventuras.com', 'static', m);
  const nombre = (m.img ?? '').split('/').pop(), r = await fetch(new URL(nombre || 'x', U)), buf = Buffer.from(await r.arrayBuffer());
  let w = 0, h = 0; for (let i = 2; i < buf.length - 9;) { if (buf[i] !== 0xFF) { i++; continue; } const t = buf[i + 1], L = buf.readUInt16BE(i + 2); if (t >= 0xC0 && t <= 0xC2) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + L; }
  R.check(r.status === 200 && /image\/jpeg/.test(r.headers.get('content-type') ?? '') && w === 1200 && h === 630 && buf.length < 300000, 'la imagen se sirve, es JPEG de 1200×630 y pesa < 300 KB', 'static', { status: r.status, tipo: r.headers.get('content-type'), w, h, bytes: buf.length });
}, { timeoutMs: 60000 });
