"""V4-ANIM-02 · Métrica del ciclo de marcha en el GLB SERVIDO (public/assets/anmi.glb): por pie (grupos de vértices de
Foot/ToeBase), altura del vértice más bajo y su velocidad horizontal en el espacio del personaje (raíz fija). En apoyo
(altura < mínimo + 2 cm) el pie retrocede a la velocidad natural del ciclo; se compara con natural_speed de los metadatos.
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python walk_clip_metrics.py -- <glb> <clip> [<clip>…]"""
import bpy, sys, json
import numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
glb, clips = argv[0], argv[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 60   # los clips de ANMI están a 60 fps: a 24 el importador remuestrea y la velocidad no sirve
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = max((o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups), key=lambda o: len(o.data.vertices))
gi = {g.name: g.index for g in body.vertex_groups}
dom = np.full(len(body.data.vertices), -1); w = np.zeros(len(body.data.vertices))
for v in body.data.vertices:
    for g in v.groups:
        if g.weight > w[v.index]: w[v.index] = g.weight; dom[v.index] = g.group
side = {sd: np.array([i for i, b in enumerate(dom) if b in {gi[n] for n in gi if n.replace('mixamorig:', '').replace('mixamorig', '').startswith(sd) and ('Foot' in n or 'ToeBase' in n or 'Toe_End' in n)}], dtype=int) for sd in ('Left', 'Right')}
fps = bpy.context.scene.render.fps
res = {}
for name in clips:
    act = bpy.data.actions.get(name)
    if not act: res[name] = None; continue
    arm.animation_data_create(); arm.animation_data.action = act
    if hasattr(act, 'slots') and len(act.slots): arm.animation_data.action_slot = act.slots[0]
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    rows = []
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
        co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get('co', co); e.to_mesh_clear()
        M = np.array(body.matrix_world); co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        r = {'f': f}
        for sd, idx in side.items():
            c = co[idx]; k = int(np.argmin(c[:, 2])); r[sd] = c[k].tolist()
        rows.append(r)
    out = {'frames': [f0, f1], 'fps': fps}
    for sd in ('Left', 'Right'):
        z = np.array([r[sd][2] for r in rows]); y = np.array([r[sd][1] for r in rows]); x = np.array([r[sd][0] for r in rows])
        zmin = float(z.min()); st = z < zmin + 0.02
        vy = np.gradient(y) * fps; vx = np.gradient(x) * fps
        out[sd] = {'z_min': round(zmin, 4), 'z_p50': round(float(np.median(z)), 4), 'stance_frac': round(float(st.mean()), 3),
                   'stance_vy_med': round(float(np.median(vy[st])), 3) if st.any() else None, 'stance_vx_med': round(float(np.median(vx[st])), 3) if st.any() else None}
    res[name] = out
    print('CLIP', name, json.dumps(out))

# deslizamiento por vértice EN EL CLIP: el cuerpo avanza a natural_speed (frente = −Y de Blender); un vértice de suela en
# contacto (z < 1,5 cm) en dos fotogramas seguidos se desliza a |Δy_clip·fps − natural| (más Δx lateral)
import os
meta_p = os.path.join(os.path.dirname(glb), 'anmi.clips.json')
nat = json.load(open(meta_p))['clips'].get('SK_WalkBoard', {}).get('natural_speed', 1.4) if os.path.exists(meta_p) else 1.4
act = bpy.data.actions.get('SK_WalkBoard')
if act:
    arm.animation_data.action = act
    if hasattr(act, 'slots') and len(act.slots): arm.animation_data.action_slot = act.slots[0]
    sole = np.concatenate([side['Left'], side['Right']])
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1])); P = []
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
        co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get('co', co); e.to_mesh_clear()
        M = np.array(body.matrix_world); P.append((co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])[sole])
    zmin = min(float(p[:, 2].min()) for p in P)
    sl = []
    for a, b in zip(P, P[1:]):
        c = (a[:, 2] < zmin + 0.015) & (b[:, 2] < zmin + 0.015)
        if c.sum() < 4: continue
        dx = (b[c, 0] - a[c, 0]) * fps; dy = (b[c, 1] - a[c, 1]) * fps
        # mundo: el cuerpo avanza hacia −Y a `nat` → desplazamiento mundial del vértice = (dx, dy − nat)
        sl.append(float(np.median(np.hypot(dx, dy - nat))))
    sl.sort()
    print('SLIDE_CLIP', json.dumps({'natural': nat, 'pairs': len(sl), 'median': round(sl[len(sl) // 2], 3) if sl else None, 'p90': round(sl[int(0.9 * (len(sl) - 1))], 3) if sl else None, 'zmin': round(zmin, 4)}))

# misma métrica que anim-v4 (zona de apoyo = vértices a < 1 cm del punto más bajo, en el suelo; «quieto» < 0,6 m/s en el
# mundo) simulando el juego: pasos de 1/60 s, el clip avanza ts·(1/60) s y el cuerpo v = ts·natural (adelante = −Y)
def stationary(ts):
    clip_fps = 60.0; T = (f1 - f0) / clip_fps; v = ts * nat
    def pos(tc):
        fr = f0 + (tc % T) * clip_fps; fi = int(fr); bpy.context.scene.frame_set(fi, subframe=fr - fi)
        dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
        co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get('co', co); e.to_mesh_clear()
        M = np.array(body.matrix_world); return (co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3])[sole]
    n = int(round(T / abs(ts) * 60)) * 2; tc = 0.0; prev = pos(0.0); q = 0; tot = 0
    for k in range(n):
        tc += ts / 60.0; cur = pos(tc)
        low = prev[:, 2].min()
        if low <= 0.015:
            c = (prev[:, 2] < low + 0.01) & (cur[:, 2] < 0.025)
            if c.sum() >= 4:
                dx = (cur[c, 0] - prev[c, 0]) * 60; dy = (cur[c, 1] - prev[c, 1]) * 60 - (v if ts > 0 else -abs(v))
                sp = float(np.median(np.hypot(dx, dy))); tot += 1; q += sp < 0.6
        prev = cur
    return {'ts': ts, 'v': round(abs(v), 3), 'frames': tot, 'quieto': round(q / max(1, tot), 3)}
if act:
    out = {'glb': glb, 'natural_speed': nat, 'stationary': [stationary(ts) for ts in (2.2, 1.0, -0.91)], 'clips': res}
    for r in out['stationary']: print('STATIONARY', json.dumps(r))
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'V4', 'evidencias', 'ANIM-02'); os.makedirs(dst, exist_ok=True)
    json.dump(out, open(os.path.join(dst, 'walk_clip_metrics.json'), 'w'), indent=1)
