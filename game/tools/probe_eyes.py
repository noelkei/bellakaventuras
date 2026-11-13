"""Localiza en el atlas de Bella Vibes las islas UV de los ojos (para variar el color de iris por instancia).
    blender -b -P game/tools/probe_eyes.py   → .cache/npcs/bella_eyes.json  (rectángulos UV glTF: v invertida)"""
import bpy, json
from pathlib import Path
from mathutils import Vector
G = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(G / ".cache/npcs/bella.glb"))
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
arm.data.pose_position = "REST"; bpy.context.view_layer.update()
head = arm.matrix_world @ arm.data.bones["mixamorig:Head"].head_local
top = arm.matrix_world @ arm.data.bones["mixamorig:HeadTop_End"].head_local
me = body.data
uvl = me.uv_layers.active.data
img = next(n.image for m in me.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and "normal" not in n.image.name.lower() and "rough" not in n.image.name.lower())
W, H = img.size; px = list(img.pixels[:])
def texel(u, v):
    x = min(W - 1, max(0, int(u * W))); y = min(H - 1, max(0, int(v * H))); i = (y * W + x) * 4
    return px[i], px[i + 1], px[i + 2]
mw = body.matrix_world
z0 = head.z + (top.z - head.z) * 0.25; z1 = head.z + (top.z - head.z) * 0.6
cand = []
for p in me.polygons:
    c = mw @ p.center
    if not (z0 < c.z < z1 and abs(c.x - head.x) < 0.08): continue
    cand.append((c.y, p))
miny = min(y for y, _ in cand)
res = {"L": [], "R": []}
for y, p in cand:
    if y > miny + 0.035: continue
    c = mw @ p.center
    us = [uvl[li].uv for li in p.loop_indices]
    u = sum(t.x for t in us) / len(us); v = sum(t.y for t in us) / len(us)
    r, g, b = texel(u, v); lum = (r + g + b) / 3
    if lum < 0.25 or lum > 0.85:  # iris/pupila oscura o esclerótica blanca
        side = "L" if c.x > head.x else "R"
        res[side].append((c.x, c.y, c.z, lum))
out = {}
for k, pts in res.items():
    dark = [p for p in pts if p[3] < 0.25]
    if not dark: continue
    xs = [p[0] for p in dark]; ys = [p[1] for p in dark]; zs = [p[2] for p in dark]
    # caja en espacio glTF de la pose de reposo: (x, z, −y)
    out[k] = {"min": [min(xs), min(zs), -max(ys)], "max": [max(xs), max(zs), -min(ys)], "n": len(dark)}
out["head"] = [head.x, head.z, -head.y]
print("EYES", json.dumps(out), len(cand))
(G / ".cache/npcs/bella_eyes.json").write_text(json.dumps(out))
