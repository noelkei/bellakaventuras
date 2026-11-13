"""V4-NMG-05 · Métrica de la pose sentada de La Pantera desde el GLB EXPORTADO (.cache/npcs/la_pantera.glb).
Por fotograma de SitIdle/SitTalk: altura mínima del cuerpo bajo las caderas (asiento = glúteos/muslos) y de los pies,
y su avance horizontal respecto a la raíz; render de perfil y frente con el asiento propuesto como caja.
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python pantera_sit_metrics.py -- <glb> <salida>"""
import bpy, sys, json, math
import numpy as np
from pathlib import Path
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = Path(argv[0]), Path(argv[1]); out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(glb))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); body = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.vertex_groups))
gi = {g.name: g.index for g in body.vertex_groups}
def dom_bone():
    d = np.full(len(body.data.vertices), -1); w = np.zeros(len(body.data.vertices))
    for v in body.data.vertices:
        for g in v.groups:
            if g.weight > w[v.index]: w[v.index] = g.weight; d[v.index] = g.group
    return d
dom = dom_bone(); inv = {i: n for n, i in gi.items()}
seat_bones = {gi[n] for n in gi if any(k in n for k in ('Hips', 'UpLeg'))}
foot_bones = {gi[n] for n in gi if any(k in n for k in ('Foot', 'ToeBase'))}
seat_idx = np.array([i for i, b in enumerate(dom) if b in seat_bones], dtype=int); foot_idx = np.array([i for i, b in enumerate(dom) if b in foot_bones], dtype=int)
print("GROUPS", len(gi), sorted(gi)[:12], len(seat_idx), len(foot_idx))
def coords():
    dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
    co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get('co', co); e.to_mesh_clear()
    M = np.array(body.matrix_world); return co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
res = {}
for name in ('SitIdle', 'SitTalk', 'Idle'):
    act = bpy.data.actions.get(name)
    if not act: res[name] = None; continue
    arm.animation_data_create(); arm.animation_data.action = act
    if hasattr(act, 'slots') and len(act.slots): arm.animation_data.action_slot = act.slots[0]
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    rows = []
    for f in range(f0, f1 + 1, 2):
        bpy.context.scene.frame_set(f); bpy.context.view_layer.update(); c = coords()
        seat = c[seat_idx]; foot = c[foot_idx]
        # asiento = vértices de caderas/muslos por debajo del 30 % inferior de esa región (glúteos y cara inferior del muslo)
        z = seat[:, 2]; low = seat[z < np.percentile(z, 12)]
        rows.append(dict(f=f, seatZ=float(z.min()), seatY=float(low[:, 1].mean()), seatX=float(low[:, 0].mean()), seatYmin=float(low[:, 1].min()), seatYmax=float(low[:, 1].max()),
                         footZ=float(foot[:, 2].min()), footY=float(foot[:, 1].mean()), footYmin=float(foot[:, 1].min()), bodyZmin=float(c[:, 2].min()), headZ=float(c[:, 2].max())))
    agg = lambda k, fn: round(float(fn([r[k] for r in rows])), 4)
    res[name] = dict(frames=[f0, f1], seatZ=[agg('seatZ', min), agg('seatZ', max)], seatY=agg('seatY', np.mean), seatYrange=[agg('seatYmin', min), agg('seatYmax', max)], seatX=agg('seatX', np.mean),
                     footZ=[agg('footZ', min), agg('footZ', max)], footY=agg('footY', np.mean), footYmin=agg('footYmin', min), bodyZmin=agg('bodyZmin', min), headZ=agg('headZ', max))
    print('SIT', name, json.dumps(res[name]))
(out / 'pantera_sit_metrics.json').write_text(json.dumps(res, indent=1))
# render perfil/frente en SitIdle con un asiento de prueba a la altura medida (caja gris, contacto)
act = bpy.data.actions['SitIdle']; arm.animation_data.action = act
if hasattr(act, 'slots') and len(act.slots): arm.animation_data.action_slot = act.slots[0]
bpy.context.scene.frame_set(int(act.frame_range[0]))
r = res['SitIdle']
scn = bpy.context.scene; scn.render.engine = 'BLENDER_EEVEE'; scn.render.resolution_x, scn.render.resolution_y = 600, 640; scn.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.8, 0.84, 1); scn.world = w
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scn.collection.objects.link(sun)
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0)); fl = bpy.context.active_object
def _m(n, rgb):
    m = bpy.data.materials.new(n); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1); return m
fl.data.materials.append(_m('suelo', (0.35, 0.33, 0.32)))
seat_top = r['seatZ'][0]
bpy.ops.mesh.primitive_cube_add(size=1, location=(r['seatX'], (r['seatYrange'][0] + r['seatYrange'][1]) / 2, seat_top / 2)); cb = bpy.context.active_object
cb.scale = (1.2, r['seatYrange'][1] - r['seatYrange'][0] + 0.1, seat_top); cb.data.materials.append(_m('asiento', (0.85, 0.35, 0.55)))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam); scn.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.2
for nm, loc, rot in (('perfil', (4, 0, 0.75), (math.radians(90), 0, math.radians(90))), ('frente', (0, -4, 0.75), (math.radians(90), 0, 0)), ('tres_cuartos', (2.8, -2.8, 1.6), (math.radians(72), 0, math.radians(45))), ('tres_cuartos_bajo', (-2.2, -3.0, 0.9), (math.radians(85), 0, math.radians(-36)))):
    cam.location = loc; cam.rotation_euler = rot; scn.render.filepath = str(out / f'pantera_sit_{nm}.png'); bpy.ops.render.render(write_still=True)
