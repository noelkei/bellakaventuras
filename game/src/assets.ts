// Carga compartida de GLB y recursos. Cada recurso se descarga una vez; quien clona instancias no libera los buffers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export const ASSET_BASE = new URL('./assets/', document.baseURI).href;
const glbCache = new Map<string, Promise<any>>();

/** Descarga (una sola vez) un GLB de public/assets. Si falla se olvida para permitir reintento. */
export function loadGlb(rel: string, onProgress?: (f: number) => void): Promise<any> {
  if (!glbCache.has(rel)) {
    const p = loader.loadAsync(ASSET_BASE + rel, (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); });
    p.catch(() => glbCache.delete(rel));
    glbCache.set(rel, p);
  }
  return glbCache.get(rel)!;
}

export async function loadJson<T = any>(rel: string): Promise<T> {
  const r = await fetch(ASSET_BASE + rel);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${rel}`);
  return r.json();
}

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
/** Textura compartida y repetible (las mallas del parque usan UV en metros). Nunca se libera: la usan varios sectores. */
export function tex(rel: string, srgb = true): THREE.Texture {
  let t = texCache.get(rel);
  if (!t) {
    t = texLoader.load(ASSET_BASE + rel);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    texCache.set(rel, t);
  }
  return t;
}
