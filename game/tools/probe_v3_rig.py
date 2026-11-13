"""Sondeo del rig de ANMI para V3 (solo lectura; escribe .cache/v3_probe.json).
    blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python game/tools/probe_v3_rig.py
"""
import bpy, json, zipfile
from pathlib import Path
from mathutils import Vector
GAME = Path(__file__).resolve().parents[1]; ROOT = GAME.parent; CACHE = GAME / '.cache'
BIPED = ROOT / 'assets/source/character/Meshy_AI_Urban_Skater_Kid_biped.zip'

def extract(name):
    out = CACHE / 'biped' / name
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(BIPED) as z: out.write_bytes(z.read(next(m for m in z.namelist() if m.endswith(name))))
    return out

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=str(extract('Meshy_AI_Urban_Skater_Kid_biped_Animation_Walking_withSkin.glb')))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.name.startswith('Icosphere'))
res = {'arm_matrix': [list(r) for r in arm.matrix_world], 'bones': {}}
for b in arm.data.bones:
    if any(k in b.name for k in ['Hips', 'Hand', 'Foot', 'ToeBase', 'Head', 'Shoulder', 'Spine2']):
        res['bones'][b.name] = {'head': [round(x, 4) for x in (arm.matrix_world @ b.head_local)], 'tail': [round(x, 4) for x in (arm.matrix_world @ b.tail_local)]}
act = arm.animation_data.action if arm.animation_data else None
res['walk_action'] = {'name': act.name if act else None, 'range': list(act.frame_range) if act else None}
# trayectoria de cadera y pies en el walking (para saber hacia dónde mira/anda)
sc = bpy.context.scene; pb = arm.pose.bones
traj = []
if act:
    for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1, 4):
        sc.frame_set(f)
        traj.append({'f': f, 'hips': [round(x, 3) for x in arm.matrix_world @ pb['mixamorig:Hips'].head],
                     'footL': [round(x, 3) for x in arm.matrix_world @ pb['mixamorig:LeftFoot'].head], 'footR': [round(x, 3) for x in arm.matrix_world @ pb['mixamorig:RightFoot'].head]})
res['walk_traj'] = traj
# suela: vértices con peso de pie/dedos > 0.65 y dentro de los 12 mm más bajos (reposo)
sc.frame_set(0)
groups = {g.index: g.name for g in body.vertex_groups}
sole = {}
for side in ('Left', 'Right'):
    ids = []
    for v in body.data.vertices:
        w = sum(g.weight for g in v.groups if groups[g.group] in (f'mixamorig:{side}Foot', f'mixamorig:{side}ToeBase', f'mixamorig:{side}Toe_End'))
        if w > 0.65: ids.append(v.index)
    zs = [(body.matrix_world @ body.data.vertices[i].co).z for i in ids]
    zmin = min(zs)
    sole[side] = {'n_foot': len(ids), 'zmin': round(zmin, 4), 'n_sole': sum(1 for z in zs if z < zmin + 0.012)}
res['sole'] = res['sole_rest'] = sole
(CACHE / 'v3_probe.json').write_text(json.dumps(res, indent=1))
print('PROBE_DONE')
