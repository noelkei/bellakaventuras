// V10.5 ronda PORTADA · escena viva de la pantalla de inicio (portada del prototipo `prototipos/pantalla-inicio-cozy/web/escena.js`, casi
// tal cual): un único lienzo WebGL2 que compone, por píxel, cielo + nubes del fondo (deriva lenta) → primer plano (copas con viento, sombras
// moteadas del suelo) → sombra de contacto → ANMI (respiración, altavoces, radio). Con movimiento 0 y tiempo 0 reproduce el bitmap original.
// Novedades frente al prototipo: tipos, contador de fotogramas y `destruir()` (texturas, programa y contexto liberados al empezar a jugar).
/* eslint-disable */
const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec2 uRes;            // lienzo en px de dispositivo
uniform vec2 uBgSize;         // fondo original en px
uniform vec4 uCover;          // px de lienzo -> px de fondo: src = p * uCover.xy + uCover.zw
uniform float uTime;          // segundos de animación (se congela en quieto)
uniform float uMotion;        // 0 quieto .. 1 animado (transición suave)
uniform float uWind;          // intensidad global del viento
uniform float uVientoPx;
uniform sampler2D tFondo, tCielo, tNubes, tRelevo, tViento, tViento2, tSombra, tAnmi;
uniform vec4 uNube[3];        // rect actual de cada nube en px de fondo (x, y, w, h)
uniform vec4 uNubeUV[3];      // rect en su atlas (normalizado)
uniform float uNubeAtlas[3];  // 0 = atlas del fondo, 1 = atlas de relevo
uniform vec4 uAnmi;           // rect de ANMI en px de lienzo (x, y desde arriba, w, h)
uniform vec2 uAnmiSize;       // tamaño del PNG de ANMI
uniform float uBreath;        // px de imagen ANMI (respiración, hacia arriba)
uniform float uSway;          // px de imagen ANMI (balanceo lateral mínimo)
uniform float uPump;          // 0..1 pulso de los altavoces
uniform float uRadio;         // 0..1 sacudida de la radio («chillando») en cada golpe
uniform float uRadioHover;    // 0..1 bamboleo al pasar el ratón o enfocar la radio
uniform float uAnmiOn;
uniform float uAnmiLod;       // nivel de mipmap según la escala de ANMI en pantalla
uniform float uFade;          // 0..1 velo crema de transición
uniform float uSombra;        // V10.5: 0..1 ANMI como silueta oscura (entrada deslizándose desde la derecha)

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Catmull-Rom en 9 lecturas bilineales: nitidez al ampliar el fondo (1672 px) en pantallas grandes.
vec4 bicubic(sampler2D t, vec2 uv, vec2 size){
  vec2 sp = uv * size, tp = floor(sp - .5) + .5, f = sp - tp;
  vec2 w0 = f * (-.5 + f * (1. - .5 * f)), w1 = 1. + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (.5 + f * (2. - 1.5 * f)), w3 = f * f * (-.5 + .5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / w12;
  vec2 t0 = (tp - 1.) / size, t3 = (tp + 2.) / size, t12 = (tp + o12) / size;
  vec4 r = vec4(0.);
  r += texture(t, vec2(t0.x, t0.y)) * w0.x * w0.y;  r += texture(t, vec2(t12.x, t0.y)) * w12.x * w0.y;  r += texture(t, vec2(t3.x, t0.y)) * w3.x * w0.y;
  r += texture(t, vec2(t0.x, t12.y)) * w0.x * w12.y; r += texture(t, vec2(t12.x, t12.y)) * w12.x * w12.y; r += texture(t, vec2(t3.x, t12.y)) * w3.x * w12.y;
  r += texture(t, vec2(t0.x, t3.y)) * w0.x * w3.y;  r += texture(t, vec2(t12.x, t3.y)) * w12.x * w3.y;  r += texture(t, vec2(t3.x, t3.y)) * w3.x * w3.y;
  return clamp(r, 0., 1.);
}

// Ráfaga lenta común (0..1) que recorre la escena de izquierda a derecha.
float gust(float t){ return .5 + .5 * sin(.19 * t) * sin(.071 * t + 1.3); }
float theta(float t, float ph){
  float g = gust(t);
  float o = .55 * sin(1.07 * t + ph) + .30 * sin(1.63 * t + 2.1 * ph) + .15 * sin(2.71 * t + 3.7 * ph);
  return (.45 * g + o * (.40 + .60 * g));
}

float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);     // px de lienzo, origen arriba
  vec2 src = p * uCover.xy + uCover.zw;                        // px de fondo
  vec2 uv = src / uBgSize;
  float mot = uMotion;

  // --- viento en las copas: campo precalculado por grupos, fase con retardo según x (la ráfaga viaja)
  vec2 d = vec2(0.);
  if (mot > 0.) {
    float t = uTime - src.x * .0028;
    vec4 a = texture(tViento, uv) * (255. / 127.) - (128. / 127.);
    vec4 b = texture(tViento2, uv) * (255. / 127.) - (128. / 127.);
    d = a.xy * theta(t, 0.) + a.zw * theta(t * 1.09 + 7.3, 2.1) + b.xy * theta(t * .93 + 3.1, 4.2) + b.zw * theta(t * 1.17 + 11.7, 5.3);
    d *= uVientoPx * uWind * mot;
  }
  vec2 suv = (src - d) / uBgSize;
  vec4 fg = bicubic(tFondo, suv, uBgSize);                     // premultiplicado

  // --- sombras moteadas del suelo: el factor de sombra se desplaza; la textura del pavimento no
  if (mot > 0.) {
    float t = uTime;
    vec2 ds = vec2(.75 * sin(.53 * t + src.y * .006) + .45 * sin(.91 * t + src.x * .004 + 1.7),
                   .25 * sin(.67 * t + src.x * .005 + .4)) * 4.2 + vec2(2.2 * (gust(t - 1.5) - .5), 0.);
    ds *= uWind * mot;
    vec3 s0 = texture(tSombra, uv).rgb, s1 = texture(tSombra, uv - ds / uBgSize).rgb;
    fg.rgb *= s1 / max(s0, vec3(.08));
  }

  // --- cielo limpio con un grano mínimo (evita bandas) y nubes del propio fondo
  vec3 sky = texture(tCielo, uv).rgb + (hash(p + fract(uTime)) - .5) / 255.;
  for (int i = 0; i < 3; i++) {
    vec4 r = uNube[i];
    vec2 q = (src - r.xy) / r.zw;
    if (q.x > 0. && q.y > 0. && q.x < 1. && q.y < 1.) {
      vec2 auv = uNubeUV[i].xy + q * uNubeUV[i].zw;
      vec4 c = uNubeAtlas[i] < .5 ? texture(tNubes, auv) : texture(tRelevo, auv);
      sky = sky * (1. - c.a) + c.rgb;
    }
  }
  vec3 col = sky * (1. - fg.a) + fg.rgb;

  // --- ANMI: sombra de contacto + figura
  if (uAnmiOn > .5) {
    vec2 q = (p - uAnmi.xy) / uAnmi.zw * uAnmiSize;            // px de la imagen de ANMI
    if (q.x > -260. && q.x < uAnmiSize.x + 260. && q.y > 900. && q.y < uAnmiSize.y + 160.) {
      // suelo en perspectiva: aplastamos la vertical para que las manchas se tumben en el plano
      vec2 g = vec2(1., 2.6);
      float sh = 0.;
      sh += .46 * exp(-pow(segDist(q * g, vec2(135., 1232.) * g, vec2(640., 1462.) * g) / 95., 2.));   // tabla
      sh += .22 * exp(-pow(length((q - vec2(410., 1470.)) * vec2(1., 3.2)) / 340., 2.));                  // cuerpo, suave hacia delante
      sh += .50 * exp(-pow(length((q - vec2(112., 1224.)) * vec2(1., 3.)) / 36., 2.));                    // ruedas: contacto
      sh += .38 * exp(-pow(length((q - vec2(190., 1188.)) * vec2(1., 3.)) / 26., 2.));
      sh += .50 * exp(-pow(length((q - vec2(620., 1455.)) * vec2(1., 3.)) / 36., 2.));
      sh += .40 * exp(-pow(length((q - vec2(682., 1426.)) * vec2(1., 3.)) / 30., 2.));
      sh = 1. - exp(-sh * 1.5);
      col *= mix(vec3(1.), vec3(.40, .27, .30), sh * .92);
    }
    if (q.x >= 0. && q.y >= 0. && q.x <= uAnmiSize.x && q.y <= uAnmiSize.y) {
      vec2 qs = q;
      // respiración: cabeza y hombros suben como bloque rígido; el pecho se estira; de cintura abajo, nada
      float up = 1. - smoothstep(430., 800., q.y);
      qs.y += uBreath * up;
      qs.x -= uSway * (1. - smoothstep(380., 820., q.y));
      // radiocasete «chillando»: la caja (no la mano) se hincha y tiembla un poco con cada golpe; el asa estira lo justo
      {
        vec2 rc = vec2(805., 1028.);
        float wr = smoothstep(845., 905., q.y) * (1. - smoothstep(1195., 1235., q.y)) * smoothstep(575., 615., q.x) * (1. - smoothstep(1000., 1012., q.x));
        float k = uRadio * wr;
        float ang = (uRadioHover * .022 * sin(uTime * 11.) + k * .012 * sin(uTime * 37.)) * wr;
        vec2 v = qs - rc; v = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * v;
        qs = rc + v * (1. - .024 * k) - vec2(sin(uTime * 61.), cos(uTime * 53.)) * 1.4 * k;
      }
      // altavoces del radiocasete: el cono «empuja» (lupa radial que se anula en el aro)
      for (int k = 0; k < 2; k++) {
        vec2 c = k == 0 ? vec2(708., 1037.) : vec2(924., 1061.);
        float rr = k == 0 ? 52. : 49.;
        vec2 v = qs - c; float r = length(v) / rr;
        if (r < 1.) qs = c + v * (1. - uPump * .075 * (1. - r * r));
      }
      // LOD uniforme: dentro de una rama divergente las derivadas no son fiables (línea en el borde del rectángulo)
      vec4 a = textureLod(tAnmi, qs / uAnmiSize, uAnmiLod);
      a.rgb = mix(a.rgb, vec3(.16, .08, .11) * a.a, uSombra);   // entrada: llega como una sombra y toma su color al pararse
      col = col * (1. - a.a) + a.rgb;
    }
  }
  col = mix(col, vec3(.984, .929, .8), uFade);
  outColor = vec4(col, 1.);
}`;


export interface CapasMeta { [k: string]: any }
type Set = { fondo: WebGLTexture; cielo: WebGLTexture; nubes: WebGLTexture; viento: WebGLTexture; viento2: WebGLTexture; sombra: WebGLTexture; size: [number, number]; nubesMeta: any[]; vientoPx: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo cargar ' + src)); im.src = src; });
}

export class Escena {
  canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; prog!: WebGLProgram; buf: WebGLBuffer | null = null; u: Record<string, WebGLUniformLocation | null> = {};
  orient: 'h' | 'v' | null = null; sets: Partial<Record<'h' | 'v', Set>> = {}; cargas: Partial<Record<'h' | 'v', Promise<Set>>> = {};
  anmiTex: WebGLTexture | null = null; relevoTex: WebGLTexture | null = null; relevoMeta: any[] = []; anmiSize: [number, number] | null = null;
  /** V10.5: entrada de ANMI (1 = fuera de la pantalla por la derecha, 0 = en su sitio) y cuánto es todavía silueta (0..1). */
  entrada = 0; sombra = 0;
  time = 0; motion = 0; wind = 1; breath = 0; sway = 0; pump = 0; radio = 0; radioHover = 0; fade = 0; anmiRect: [number, number, number, number] = [0, 0, 0, 0];
  focus = { h: [0.56, 0.62], v: [0.5, 0.62] } as Record<'h' | 'v', [number, number]>;
  dpr = 1; lost = false; frames = 0; destruida = false; onRestore: (() => void) | null = null;
  private texs: WebGLTexture[] = [];
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'default', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    this._prog();
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { if (this.destruida) return; this.lost = false; this._prog(); this.sets = {}; this.cargas = {}; this.texs = []; this.anmiTex = null; this.relevoTex = null; this.orient = null; this.onRestore?.(); });
  }
  private _prog() {
    const gl = this.gl;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'programa');
    this.prog = p; gl.useProgram(p);
    const buf = gl.createBuffer(); this.buf = buf; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i)!; const name = info.name.replace(/\[0\]$/, ''); this.u[name] = gl.getUniformLocation(p, info.name); }
    ['tFondo', 'tCielo', 'tNubes', 'tRelevo', 'tViento', 'tViento2', 'tSombra', 'tAnmi'].forEach((k, i) => gl.uniform1i(this.u[k], i));
  }
  private _tex(img: TexImageSource, { mip = false, premul = true } = {}) {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.texs.push(t);
    return t;
  }
  async cargarAnmi(base: string, meta: CapasMeta) {
    if (this.anmiTex) return;
    const [im, r] = await Promise.all([loadImage(base + 'anmi.webp'), this.relevoTex ? null : loadImage(base + 'nubes-relevo.png')]);
    if (this.destruida) return;
    this.anmiSize = [im.naturalWidth, im.naturalHeight];
    this.anmiTex = this._tex(im, { mip: true });
    if (r && !this.relevoTex) { this.relevoTex = this._tex(r); this.relevoMeta = meta.nubes_relevo.nubes; }
  }
  cargarOrientacion(o: 'h' | 'v', base: string, meta: CapasMeta): Promise<Set> {
    return (this.cargas[o] ??= this._cargarOrientacion(o, base, meta).catch((e) => { delete this.cargas[o]; throw e; }));
  }
  private async _cargarOrientacion(o: 'h' | 'v', base: string, meta: CapasMeta): Promise<Set> {
    const ya = this.sets[o]; if (ya) return ya;
    const names = ['fondo.webp', 'cielo.png', 'nubes.png', 'viento.png', 'viento2.png', 'sombra.png'];
    const [fondo, cielo, nubes, viento, viento2, sombra] = await Promise.all(names.map((n) => loadImage(`${base}${o}-${n}`)));
    if (this.destruida) throw new Error('escena destruida');
    const set: Set = {
      fondo: this._tex(fondo), cielo: this._tex(cielo, { premul: false }), nubes: this._tex(nubes),
      viento: this._tex(viento, { premul: false }), viento2: this._tex(viento2, { premul: false }), sombra: this._tex(sombra, { premul: false }),
      size: meta[o].size, nubesMeta: meta[o].nubes, vientoPx: meta[o].viento_px_por_unidad,
    };
    this.sets[o] = set; return set;
  }
  usar(o: 'h' | 'v') { this.orient = o; }
  /** Recorte tipo «cover» con punto focal; devuelve la transformación lienzo -> fondo. */
  private _cover(W: number, H: number, set: Set): [number, number, number, number] {
    const [bw, bh] = set.size, s = Math.max(W / bw, H / bh);
    const vw = W / s, vh = H / s; const [fx, fy] = this.focus[this.orient ?? 'h'];
    const ox = Math.min(Math.max(fx * bw - vw / 2, 0), bw - vw), oy = Math.min(Math.max(fy * bh - vh / 2, 0), bh - vh);
    return [1 / s, 1 / s, ox, oy];
  }
  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }
  /** Posiciones de las nubes: deriva continua hacia la derecha; al salir, vuelven a entrar como nube de relevo. */
  private _nubes(set: Set) {
    const [bw] = set.size, out: { rect: number[]; uv: number[]; atlas: number }[] = [];
    const speeds = [2.3, 1.6, 3.0];
    set.nubesMeta.forEach((m: any, i: number) => {
      const travel = this.time * speeds[i];
      const span = bw + 520;
      const lap = Math.floor((m.x + travel + 260) / span);
      const x = ((m.x + travel + 260) % span) - 260;
      if (lap === 0 || !this.relevoMeta.length) out.push({ rect: [x, m.y, m.w, m.h], uv: [m.u / m.aw, m.v / m.ah, m.w / m.aw, m.h / m.ah], atlas: 0 });
      else {
        const r = this.relevoMeta[(i + lap - 1) % this.relevoMeta.length];
        const k = (m.w / r.w) * 1.05;
        const y = m.y + Math.sin(lap * 1.7 + i) * 18;
        out.push({ rect: [x, y, r.w * k, r.h * k], uv: [r.u / r.aw, r.v / r.ah, r.w / r.aw, r.h / r.ah], atlas: 1 });
      }
    });
    return out;
  }
  render() {
    const gl = this.gl; if (this.lost || this.destruida) return;
    const set = this.orient ? this.sets[this.orient] : undefined; if (!set) return;
    const W = this.canvas.width, H = this.canvas.height, u = this.u;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(u.uRes, W, H); gl.uniform2f(u.uBgSize, set.size[0], set.size[1]);
    gl.uniform4fv(u.uCover, this._cover(W, H, set));
    gl.uniform1f(u.uTime, this.time); gl.uniform1f(u.uMotion, this.motion); gl.uniform1f(u.uWind, this.wind); gl.uniform1f(u.uVientoPx, set.vientoPx);
    const nubes = this._nubes(set);
    gl.uniform4fv(u.uNube, nubes.flatMap((n) => n.rect)); gl.uniform4fv(u.uNubeUV, nubes.flatMap((n) => n.uv)); gl.uniform1fv(u.uNubeAtlas, nubes.map((n) => n.atlas));
    const r = this.anmiRect, d = this.dpr, dx = this.entrada > 0 ? this.entrada * (W / d - r[0] + r[2] * 0.15) : 0;   // entrada: desde fuera por la derecha
    gl.uniform4f(u.uAnmi, (r[0] + dx) * d, r[1] * d, r[2] * d, r[3] * d);
    const as = this.anmiSize ?? [1, 1]; gl.uniform2f(u.uAnmiSize, as[0], as[1]);
    gl.uniform1f(u.uBreath, this.breath); gl.uniform1f(u.uSway, this.sway); gl.uniform1f(u.uPump, this.pump); gl.uniform1f(u.uRadio, this.radio || 0); gl.uniform1f(u.uRadioHover, this.radioHover || 0);
    gl.uniform1f(u.uAnmiLod, r[3] > 0 && this.anmiSize ? Math.max(0, Math.log2(this.anmiSize[1] / (r[3] * d)) - 0.25) : 0);
    gl.uniform1f(u.uAnmiOn, this.anmiTex && r[2] > 0 ? 1 : 0); gl.uniform1f(u.uFade, this.fade); gl.uniform1f(u.uSombra, this.sombra);
    const texs = [set.fondo, set.cielo, set.nubes, this.relevoTex || set.nubes, set.viento, set.viento2, set.sombra, this.anmiTex || set.fondo];
    texs.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frames++;
  }
  /** Libera todo lo de la GPU (texturas, programa, búfer) y pierde el contexto a propósito: durante la partida no queda nada de la portada. */
  destruir() {
    if (this.destruida) return; this.destruida = true;
    const gl = this.gl;
    try { for (const t of this.texs) gl.deleteTexture(t); if (this.buf) gl.deleteBuffer(this.buf); gl.deleteProgram(this.prog); } catch { /* contexto ya perdido */ }
    this.texs = []; this.sets = {}; this.cargas = {}; this.anmiTex = null; this.relevoTex = null;
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* */ }
    this.canvas.width = this.canvas.height = 1;
  }
  get contextoPerdido() { try { return this.gl.isContextLost(); } catch { return true; } }
}
