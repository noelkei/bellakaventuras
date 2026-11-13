"""Sondeo del rig de ANMI y de dos donantes locales (mismo esqueleto Mixamo) antes de retocar clips.

    blender -b -P game/tools/probe_rig.py

Escribe .cache/probe/rig.json (cabezas de hueso en reposo, alturas de suela, tamaño) y renderiza hojas de
fotogramas de los donantes en .cache/probe/donor_<clip>_<f>.png para revisarlos visualmente.
"""
import bpy, json, math, zipfile
from pathlib import Path
from mathutils import Vector

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parent
CACHE = GAME / ".cache"
OUT = CACHE / "probe"; OUT.mkdir(parents=True, exist_ok=True)
BIPED = ROOT / "assets/source/character/Meshy_AI_Urban_Skater_Kid_biped.zip"
DONORS = ["slide_right", "Vault_and_Land", "Run_and_Jump", "Unarmed_Vault"]


def extract(name):
    out = CACHE / "biped" / name
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(BIPED) as z:
            m = next(m for m in z.namelist() if m.endswith(name))
            out.write_bytes(z.read(m))
    return out


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(extract("Meshy_AI_Urban_Skater_Kid_biped_Animation_Walking_withSkin.glb")))
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
info = {"bones": {}, "arm_scale": list(arm.scale), "arm_rot": list(arm.rotation_euler)}
for b in arm.data.bones:
    h = arm.matrix_world @ b.head_local; t = arm.matrix_world @ b.tail_local
    info["bones"][b.name] = {"head": [round(v, 4) for v in h], "tail": [round(v, 4) for v in t], "parent": b.parent.name if b.parent else None}
arm.data.pose_position = "REST"; bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
me = body.evaluated_get(dg).to_mesh()
zs = [(body.matrix_world @ v.co) for v in me.vertices]
info["mesh_min"] = [round(min(p[i] for p in zs), 4) for i in range(3)]
info["mesh_max"] = [round(max(p[i] for p in zs), 4) for i in range(3)]
info["triangles"] = sum(len(p.vertices) - 2 for p in me.polygons)
# altura de suela bajo cada tobillo: mínimo z de vértices cercanos al pie
for side in ("Left", "Right"):
    fh = Vector(info["bones"][f"mixamorig:{side}Foot"]["head"])
    near = [p for p in zs if (Vector((p.x, p.y, 0)) - Vector((fh.x, fh.y, 0))).length < 0.12]
    info[f"{side}_sole_z"] = round(min(p.z for p in near), 4) if near else None
    info[f"{side}_ankle_over_sole"] = round(fh.z - info[f"{side}_sole_z"], 4) if near else None
arm.data.pose_position = "POSE"
(OUT / "rig.json").write_text(json.dumps(info, indent=1))
print("RIG", json.dumps({k: v for k, v in info.items() if k != "bones"}))

# donantes: importar acciones y renderizar
scn = bpy.context.scene
scn.render.engine = "BLENDER_EEVEE"; scn.render.resolution_x = 320; scn.render.resolution_y = 380
w = bpy.data.worlds.new("W"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.8, 0.85, 1)
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(30)))
cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd); scn.collection.objects.link(cam); scn.camera = cam
cd.type = "ORTHO"; cd.ortho_scale = 2.6
for d in DONORS:
    before = set(bpy.data.actions); objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(extract(f"Meshy_AI_Urban_Skater_Kid_biped_Animation_{d}_withSkin.glb")))
    for o in set(bpy.data.objects) - objs:
        bpy.data.objects.remove(o, do_unlink=True)
    act = next(a for a in bpy.data.actions if a not in before)
    act.name = d
    arm.animation_data_create(); arm.animation_data.action = act
    if hasattr(act, 'slots') and len(act.slots):
        arm.animation_data.action_slot = act.slots[0]
    s, e = [int(x) for x in act.frame_range]
    print("DONOR", d, s, e, (e - s) / 24.0)
    hips = arm.pose.bones["mixamorig:Hips"]
    for k in range(6):
        f = s + round((e - s) * k / 5)
        scn.frame_set(f)
        c = arm.matrix_world @ hips.head
        cam.location = (c.x - 4, c.y, 1.0); cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
        scn.render.filepath = str(OUT / f"donor_{d}_{k}.png")
        bpy.ops.render.render(write_still=True)
