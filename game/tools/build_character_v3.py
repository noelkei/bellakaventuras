"""ANMI de juego V3: rig + bailes + TABLA OFICIAL (hueso Board) + biblioteca de skate y de a pie.

    blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python game/tools/build_character_v3.py
    (… -- preview  añade hojas de poses en .cache/preview_v3/)

Salidas: .cache/ANMI_GAME.glb · ANMI_GAME.clips.json · ANMI_GAME.blend · ANMI_RIG_EDIT.blend (rig IK/FK editable)
         + .cache/ANMI_V3_contact.json (contacto suela–lija/suelo medido en el mesh deformado de Blender, por clave)
La versión V2 del constructor se conserva en build_character.py y en baselines/v2_2026-10-09/.

Cambios V3 (ANIM-01/03/05):
- Tabla: derivado oficial assets/derived/v3/board/BOARD_V3.glb (BELLAKACIONES, 4 k tris) en vez del deck provisional.
  Una sola geometría: DECK (montada/en mano, skinned a Board) y DECK_PROP (aparcada).
- Hueso Board con cabeza a z = 0,07 (eje largo real del deck): kickflip/heelflip giran sobre la tabla, no sobre el suelo.
- Lija: perfil medido del derivado (plano 0,094 m hasta ±0,24 m; kicks hasta 0,136 m). Cada pose clave CALIBRA los pies
  midiendo la suela deformada (vértices de pie/dedos, 12 mm inferiores) contra la lija real (pies en tabla) o el suelo
  (pies plantados): holgura mínima objetivo +2 mm, sin penetración.
- Push/Ride corregidos con lo aprendido en investigacion-blender…/real-animation-case: pie de impulso alineado con la
  marcha (yaw 22° del control ≈ 0–2° de suela), más abierto (x −0,27), mano trasera hacia el muslo, pie libre levantado
  antes de salir y al volver.
- Clips nuevos: SK_IdleBoard, SK_WalkBoard (Walking propio de ANMI + brazo derecho IK sujetando la tabla),
  SK_CrouchWalk, SK_HopBoard, SK_Mount, SK_Dismount, SK_Scoot, SK_Manual, SK_Grab, SK_FlipHeel, SK_Bail.
"""
import bpy
import bmesh
import json
import math
import sys
import zipfile
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parent
CACHE = GAME / ".cache"
BIPED = ROOT / "assets/source/character/Meshy_AI_Urban_Skater_Kid_biped.zip"
DANCE = ROOT / "assets/source/character/dance"
BOARD_GLB = ROOT / "assets/derived/v3/board/BOARD_V3.glb"
BOARD_REPORT = ROOT / "assets/derived/v3/board/report.json"
PREVIEW = "preview" in sys.argv
FPS = 60          # horneado a 60 fps: menos hundimiento entre fotogramas en apoyos rápidos
SRC_FPS = 30      # fps de las acciones importadas (se reescalan a FPS)

# R2-G8 (usuario, 12 oct): los 8 bailes de ANMI (botón BAILAR del juego); se añaden Cardio_Dance y FunnyDancing_03
DANCES = ["Step_Hip_Hop_Dance", "Hip_Hop_Dance_1", "Hip_Hop_Dance_2", "Hip_Hop_Dance_3", "FunnyDancing_02", "Breakdance_1990", "Cardio_Dance", "FunnyDancing_03"]
DONORS = ["Run_and_Jump"]  # Vault_and_Land descartado en V3 (ver assets/derived/v3/anmi_donors/README.md)

board_rep = json.loads(BOARD_REPORT.read_text())
PROFILE = board_rep["contract"]["grip_profile_y_z"]       # [[y, z], …] centro de la lija
DECK_TOP = board_rep["contract"]["deck_top_center_z"]     # 0,094
ANKLE = 0.200
FZ = DECK_TOP + ANKLE + 0.002
GZ = ANKLE + 0.004
PIVOT_Z = 0.07                                           # eje largo del deck (giro de flips)
CLEAR = 0.003                                            # holgura suela–superficie objetivo


def grip_z(y):
    """Altura de la lija sobre el plano de ruedas en la coordenada y del tablero (perfil medido)."""
    ys = [p[0] for p in PROFILE]; zs = [p[1] for p in PROFILE]
    return float(np.interp(y, ys, zs))


def kick(y):  # compatibilidad con las poses V2: elevación de la lija respecto del centro
    return grip_z(y) - DECK_TOP


def extract(name):
    out = CACHE / "biped" / name
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(BIPED) as z:
            member = next(m for m in z.namelist() if m.endswith(name))
            out.write_bytes(z.read(member))
    return out


def fcurves_of(action):
    if hasattr(action, "layers") and len(action.layers):
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out += list(cb.fcurves)
        return out
    return list(getattr(action, "fcurves", []))


def assign(obj, action):
    obj.animation_data_create()
    obj.animation_data.action = action
    if action is not None and hasattr(action, "slots") and len(action.slots):
        obj.animation_data.action_slot = action.slots[0]


# ------------------------------------------------------------------ base: personaje con rig
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = SRC_FPS
bpy.ops.import_scene.gltf(filepath=str(extract("Meshy_AI_Urban_Skater_Kid_biped_Animation_Walking_withSkin.glb")))
for o in list(bpy.context.scene.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
arm.name = "ANMI"; body.name = "ANMI_BODY"
for a in list(bpy.data.actions):
    a.name = "Walking"; a.use_fake_user = True


def import_action(path, name, strip_root_xy=True):
    before = set(bpy.data.objects); before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new_objs = [o for o in bpy.data.objects if o not in before]
    acts = [a for a in bpy.data.actions if a not in before_actions]
    for a in acts:
        a.name = name; a.use_fake_user = True
        if strip_root_xy:  # sin desplazamiento horizontal de raíz: la física es la única autoridad de movimiento
            for fc in fcurves_of(a):
                if fc.data_path.endswith('"mixamorig:Hips"].location') and fc.array_index in (0, 2):
                    v0 = fc.keyframe_points[0].co[1]
                    for kp in fc.keyframe_points:
                        kp.co[1] = v0; kp.handle_left[1] = v0; kp.handle_right[1] = v0
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    return acts[0] if acts else None


for d in DANCES:
    p = DANCE / f"Meshy_AI_Urban_Skater_Kid_{d}.glb"
    if not p.exists():
        p = extract(f"Meshy_AI_Urban_Skater_Kid_biped_Animation_{d}_withSkin.glb")
    import_action(p, d)
for d in DONORS:
    import_action(extract(f"Meshy_AI_Urban_Skater_Kid_biped_Animation_{d}_withSkin.glb"), f"_donor_{d}", strip_root_xy=False)
WALK_SRC = import_action(extract("Meshy_AI_Urban_Skater_Kid_biped_Animation_Walking_withSkin.glb"), "_src_Walking", strip_root_xy=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
# reescalar a FPS conservando segundos (no se toca la amplitud)
_k = FPS / SRC_FPS
for a in bpy.data.actions:
    if a.name.startswith("_donor_"):
        continue
    for fc in fcurves_of(a):
        for kp in fc.keyframe_points:
            kp.co[0] *= _k; kp.handle_left[0] *= _k; kp.handle_right[0] *= _k
bpy.context.scene.render.fps = FPS

DONOR_CURVES = {}
for d in DONORS:
    act = bpy.data.actions[f"_donor_{d}"]
    curves = {}
    for fc in fcurves_of(act):
        if fc.data_path.endswith("rotation_quaternion"):
            bone = fc.data_path.split('"')[1]
            curves.setdefault(bone, [None] * 4)[fc.array_index] = fc
    DONOR_CURVES[d] = curves


def donor_quat(donor, bone, frame):
    fcs = DONOR_CURVES[donor].get(bone)
    if not fcs or any(f is None for f in fcs):
        return None
    return Quaternion([f.evaluate(frame) for f in fcs]).normalized()


# ------------------------------------------------------------------ hueso de la tabla + tabla oficial
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones.new("Board")
eb.head = (0, 0, PIVOT_Z); eb.tail = (0, -0.3, PIVOT_Z)  # a lo largo de la tabla (hacia la nariz, −Y), a la altura del deck
eb.use_deform = True
bpy.ops.object.mode_set(mode="OBJECT")


def make_deck():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(BOARD_GLB))
    new = [o for o in bpy.data.objects if o not in before]
    mesh = next(o for o in new if o.type == "MESH")
    mw = mesh.matrix_world.copy(); mesh.parent = None; mesh.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT"); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o is not mesh:
            bpy.data.objects.remove(o, do_unlink=True)
    mesh.name = "DECK"; mesh.data.name = "DECK"
    return mesh


deck = make_deck()
deck.parent = arm
vg = deck.vertex_groups.new(name="Board")
vg.add(list(range(len(deck.data.vertices))), 1.0, "REPLACE")
mod = deck.modifiers.new("Armature", "ARMATURE"); mod.object = arm
prop = bpy.data.objects.new("DECK_PROP", deck.data.copy())  # tabla aparcada (baile): misma geometría y atlas
shadow = body.copy(); shadow.data = body.data.copy(); shadow.name = "ANMI_SHADOW"
bpy.context.scene.collection.objects.link(shadow)
dec = shadow.modifiers.new("Decimate", "DECIMATE"); dec.ratio = 0.1; dec.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = shadow
while shadow.modifiers[0].name != "Decimate":
    bpy.ops.object.modifier_move_up(modifier="Decimate")
bpy.ops.object.modifier_apply(modifier="Decimate")
shadow.data.materials.clear()
bpy.context.scene.collection.objects.link(prop)

# ------------------------------------------------------------------ suelas (vértices fijos por peso y altura en reposo)
groups = {g.index: g.name for g in body.vertex_groups}
SOLE = {}
_rest = np.empty(len(body.data.vertices) * 3, dtype=np.float32); body.data.vertices.foreach_get("co", _rest); _rest = _rest.reshape(-1, 3)
for side in ("Left", "Right"):
    ids = [v.index for v in body.data.vertices if sum(g.weight for g in v.groups if groups[g.group] in (f"mixamorig:{side}Foot", f"mixamorig:{side}ToeBase", f"mixamorig:{side}Toe_End")) > 0.65]
    zs = _rest[ids, 2]; zmin = zs.min()
    SOLE[side[0]] = np.array([i for i, z in zip(ids, zs) if z < zmin + 0.012])

# V5 T5-19 (HUM-008, OPUS-007): eje largo de la SUELA en reposo (PCA horizontal de los vértices de suela, en mundo). En el
# bind pose la punta mira ~35° hacia fuera: «yaw 0» de las poses con el pie en el suelo dejaba esa apertura (04 P1: 34–36° en
# reposo). Corrección por pie para que yaw 0 = punta al frente (−Y) con TOE_OUT hacia fuera.
TOE_OUT = 7.0
_Mb = np.array(body.matrix_world)
SOLE_REST_YAW, TOE_REST, FOOT_FIX = {}, {}, {}
for _s in "LR":
    _P = (_rest[SOLE[_s]] @ _Mb[:3, :3].T + _Mb[:3, 3])[:, :2]
    _c = _P - _P.mean(0); _w, _v = np.linalg.eigh(_c.T @ _c); _ax = _v[:, int(np.argmax(_w))]
    if _ax[1] > 0: _ax = -_ax                                    # hacia −Y (frente de ANMI)
    SOLE_REST_YAW[_s] = math.degrees(math.atan2(_ax[0], -_ax[1]))   # 0 = −Y; + = hacia +X (fuera para el pie izquierdo)
    TOE_REST[_s] = Vector((float(_ax[0]), float(_ax[1]), 0.0)).normalized()
    FOOT_FIX[_s] = (TOE_OUT if _s == "L" else -TOE_OUT) - SOLE_REST_YAW[_s]
print("SOLE_REST_YAW", {k: round(v, 1) for k, v in SOLE_REST_YAW.items()}, "FOOT_FIX", {k: round(v, 1) for k, v in FOOT_FIX.items()})


def eval_body():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    co = co.reshape(-1, 3)
    M = np.array(body.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


# ------------------------------------------------------------------ controles de pose (IK + FK)
pb = arm.pose.bones
REST = {b.name: arm.data.bones[b.name].matrix_local.copy() for b in pb}


def empty(name):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e); e.empty_display_size = 0.05
    return e


CTRL = {n: empty(n) for n in ["IK_FootL", "IK_FootR", "Pole_KneeL", "Pole_KneeR", "IK_HandL", "IK_HandR",
                               "Pole_ElbowL", "Pole_ElbowR", "Rot_FootL", "Rot_FootR"]}
IKC = {}


def add_ik(bone, target, pole, pole_angle):
    c = pb[bone].constraints.new("IK")
    c.name = "IK"
    c.target = CTRL[target]; c.pole_target = CTRL[pole]; c.pole_angle = pole_angle; c.chain_count = 2
    IKC[bone] = c
    return c


add_ik("mixamorig:LeftLeg", "IK_FootL", "Pole_KneeL", -math.pi / 2)
add_ik("mixamorig:RightLeg", "IK_FootR", "Pole_KneeR", -math.pi / 2)
add_ik("mixamorig:LeftForeArm", "IK_HandL", "Pole_ElbowL", -math.pi / 2)
add_ik("mixamorig:RightForeArm", "IK_HandR", "Pole_ElbowR", -math.pi / 2)
FOOTROT = {}
for side in "LR":
    c = pb[f"mixamorig:{'Left' if side == 'L' else 'Right'}Foot"].constraints.new("COPY_ROTATION")
    c.name = "FootRot"
    c.target = CTRL[f"Rot_Foot{side}"]; c.owner_space = "WORLD"; c.target_space = "WORLD"
    FOOTROT[side] = c

FOOT_REST_ROT = {s: (arm.matrix_world @ REST[f"mixamorig:{'Left' if s == 'L' else 'Right'}Foot"]).to_quaternion() for s in "LR"}
FK = ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head", "Board"]
ARM_BONES = {s: [f"mixamorig:{s}Shoulder", f"mixamorig:{s}Arm", f"mixamorig:{s}ForeArm", f"mixamorig:{s}Hand"] for s in ("Left", "Right")}
DONOR_TORSO = ["mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head"]
LEGS = ["mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase", "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase"]


def Rz(d): return Matrix.Rotation(math.radians(d), 4, "Z")
def Rx(d): return Matrix.Rotation(math.radians(d), 4, "X")
def Ry(d): return Matrix.Rotation(math.radians(d), 4, "Y")


def rotate_about_head(bone, R):
    m = pb[bone].matrix.copy()
    h = m.to_translation()
    pb[bone].matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ m
    bpy.context.view_layer.update()


def board_matrix(b):
    """b = (x, y, z, pitch, roll, yaw) del plano de ruedas. Nariz arriba = pitch +. Roll + = canto de puntera (−X) arriba.
    Pivote del pitch: eje trasero si pitch > 0 (pop/manual), eje delantero si < 0."""
    if isinstance(b, Matrix):
        return b
    x, y, z, pitch, roll, yaw = (tuple(b) + (0, 0, 0, 0, 0, 0))[:6]
    piv = Vector((0, 0.24 if pitch > 0 else -0.24, 0))
    P = Matrix.Translation(piv) @ Rx(-pitch) @ Matrix.Translation(-piv)
    return Matrix.Translation((x, y, z)) @ Rz(yaw) @ P @ Ry(-roll)


# --- tabla en la mano: vertical junto a la pierna derecha (−X), nariz arriba, lija hacia el cuerpo; la mano derecha
#     sujeta el canto cerca del eje delantero. `low`: agachado, la tabla va de canto a lo largo de la marcha.
def carry_matrix(hip, low=False, swing=0.0):
    hx, hy, hz = hip
    if low:
        # tabla de canto junto al tobillo; nunca por debajo de 0,20 m (canto ~9 cm sobre el suelo) aunque la cadera baje más
        return Matrix.Translation((hx - 0.31, hy + 0.02, max(hz - 0.36, 0.20))) @ Rx(swing) @ Ry(90)
    return Matrix.Translation((hx - 0.31, hy + 0.02 + swing * 0.15, hz - 0.47)) @ Rz(-90) @ Rx(-90 + swing * 12)


def carry_grip(bm, low=False):
    """Punto de agarre (canto del deck) en espacio de armadura para la mano derecha."""
    pt = Vector((-0.10, 0.0, 0.09)) if low else Vector((0.10, -0.29, 0.085))
    return bm @ pt


DEFAULT = dict(
    hip=(0.02, 0.02, 0.90), hipYaw=-90, hipLean=0, hipPitch=0,
    spine=(12, 6), chestTwist=16, neck=20, head=(28, -12),
    footL=(0.06, -0.19, FZ, -78), footR=(0.06, 0.24, FZ, -100),
    kneeL=(-0.9, -0.35, 0.55), kneeR=(-0.9, 0.5, 0.55),
    handL=(-0.16, -0.30, 0.84), handR=(0.02, 0.38, 0.80),
    elbowL=(0.35, -0.6, 1.05), elbowR=(0.4, 0.75, 1.0),
    board=(0, 0, 0, 0, 0, 0),
    armIK=1.0, donor=None,
)

CONTACT_LOG = []
WALK_LIFT_LOG = []   # V5 T5-19: (fotograma, pie, mm subidos) en SK_WalkBoard


def set_ik_influence(v, frame, bones=("mixamorig:LeftForeArm", "mixamorig:RightForeArm")):
    for bone in bones:
        IKC[bone].influence = v
        pb[bone].constraints["IK"].keyframe_insert("influence", frame=frame)


from mathutils.bvhtree import BVHTree
GRIP_MAT = [i for i, m in enumerate(deck.data.materials) if m.name == "M_board_grip"][0]


def grip_tree():
    """Lija REAL evaluada (tabla skinned en su pose actual) como BVH en mundo + normal media del deck."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = deck.evaluated_get(dg); me = ev.to_mesh()
    M = deck.matrix_world
    verts = [M @ v.co for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons if p.material_index == GRIP_MAT]
    n = Vector((0, 0, 0))
    for p in me.polygons:
        if p.material_index == GRIP_MAT: n += (M.to_3x3() @ p.normal) * p.area
    ev.to_mesh_clear()
    n.normalize()
    if n.z < 0: n = -n
    return BVHTree.FromPolygons(verts, polys), n


EDGE_MARGIN = 0.004


def calibrate(frame, P, bm_, clip_name):
    """Ajusta la altura de cada pie para que la suela deformada quede a CLEAR de su superficie real (lija o suelo).
    La holgura es el mínimo sobre los vértices de la suela y puede saltar (un vértice junto al borde del kicktail entra o
    sale de la lija): paso de Newton hasta horquillar el objetivo y después bisección; si no converge, el mejor intento."""
    hist = {"L": [], "R": []}   # (desplazamiento a lo largo de n, holgura)
    base = {s: CTRL[f"IK_Foot{s}"].location.copy() for s in "LR"}
    nrm = {}
    pending = set("LR")
    for it in range(12):
        bpy.context.view_layer.update()
        co = eval_body()
        for s in sorted(pending):
            ids = SOLE[s]
            onboard = not P.get(f"free{s}")
            planted = P.get(f"plant{s}", False)
            if not onboard and not planted:
                pending.discard(s); continue
            pts = co[ids]
            if onboard:
                tree, n = grip_tree()
                ds = []
                u = n.orthogonal().normalized(); w = n.cross(u)
                for q in pts:
                    o = Vector(q) + n * 0.25
                    hit = tree.ray_cast(o, -n, 0.6)
                    # solo vértices interiores (≥ EDGE_MARGIN dentro del contorno de la lija): los del canto entran o salen
                    # por décimas de milímetro (y por la cuantización del GLB) y no representan el apoyo de la suela
                    if hit[0] is not None and all(tree.ray_cast(o + d * EDGE_MARGIN, -n, 0.6)[0] is not None for d in (u, -u, w, -w)):
                        ds.append(hit[3] - 0.25)
                if not ds:
                    pending.discard(s); continue
                clear = float(min(ds))
                spread = float(sorted(ds)[len(ds) // 5]) - clear
            else:
                clear = float(pts[:, 2].min()); n = Vector((0, 0, 1)); spread = 0.0
            nrm.setdefault(s, n.copy())
            H = hist[s]
            t = (CTRL[f"IK_Foot{s}"].location - base[s]).dot(nrm[s])
            H.append((t, clear))
            dz = CLEAR - clear
            ok = abs(dz) <= 0.0008
            if ok or it == 11:
                if not ok:  # mejor intento: el más cercano al objetivo dentro de la banda aceptable (−4…+7 mm) si lo hay
                    cand = [h for h in H if -0.004 <= h[1] <= 0.007] or H
                    t, clear = min(cand, key=lambda h: abs(h[1] - CLEAR))
                CTRL[f"IK_Foot{s}"].location = base[s] + nrm[s] * t
                CTRL[f"IK_Foot{s}"].keyframe_insert("location", frame=frame)
                CONTACT_LOG.append({"clip": clip_name, "frame": frame, "foot": s, "surface": "lija" if onboard else "suelo", "clearance_mm": round(clear * 1000, 2), "spread20_mm": round(spread * 1000, 2), "iter": it, "converged": ok})
                pending.discard(s); continue
            lo = [h for h in H if h[1] < CLEAR]; hi = [h for h in H if h[1] > CLEAR]
            if lo and hi:  # holgura crece con t: bisección entre el mayor t bajo el objetivo y el menor t sobre él
                a = max(lo, key=lambda h: h[0])[0]; b = min(hi, key=lambda h: h[0])[0]
                tn = (a + b) / 2
            else:
                tn = t + dz
            CTRL[f"IK_Foot{s}"].location = base[s] + nrm[s] * tn
            CTRL[f"IK_Foot{s}"].keyframe_insert("location", frame=frame)  # fijar antes de reevaluar (la animación pisaría el ajuste)
        if not pending:
            break
    for s in "LR":
        lift = float(P.get(f"lift{s}") or 0)
        if lift and not P.get(f"free{s}"):
            n = (bm_.to_3x3() @ Vector((0, 0, 1))).normalized()
            CTRL[f"IK_Foot{s}"].location += n * lift
        CTRL[f"IK_Foot{s}"].keyframe_insert("location", frame=frame)


def pose(frame, clip_name="", **kw):
    P = dict(DEFAULT); P.update(kw)
    scn = bpy.context.scene; scn.frame_set(frame)
    for b in FK + ARM_BONES["Left"] + ARM_BONES["Right"]:
        pb[b].location = (0, 0, 0); pb[b].rotation_mode = "QUATERNION"; pb[b].rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    hip = pb["mixamorig:Hips"]
    R0 = REST["mixamorig:Hips"].to_3x3().to_4x4()
    yaw = math.radians(P["hipYaw"])
    lat = Vector((math.cos(yaw), math.sin(yaw), 0))
    fwd = Vector((-math.sin(yaw), math.cos(yaw), 0)) * -1
    hip.matrix = (Matrix.Translation(Vector(P["hip"])) @ Matrix.Rotation(math.radians(P["hipPitch"]), 4, lat)
                  @ Matrix.Rotation(math.radians(P["hipLean"]), 4, fwd) @ Rz(P["hipYaw"]) @ R0)
    bpy.context.view_layer.update()

    def lean_mat(deg): return Matrix.Rotation(math.radians(deg), 4, lat)
    donor = P["donor"]
    torso_from_donor = donor and donor[2] if donor else False
    if not torso_from_donor:
        rotate_about_head("mixamorig:Spine", lean_mat(P["spine"][0]))
        rotate_about_head("mixamorig:Spine1", lean_mat(P["spine"][1]) @ Rz(P["chestTwist"] * 0.5))
        rotate_about_head("mixamorig:Spine2", Rz(P["chestTwist"] * 0.5))
        rotate_about_head("mixamorig:Neck", Rz(P["neck"]))
        rotate_about_head("mixamorig:Head", Rz(P["head"][0]) @ lean_mat(P["head"][1]))
    if donor:
        name, dframe, torso = donor
        bones = ARM_BONES["Left"] + ARM_BONES["Right"] + (DONOR_TORSO if torso else [])
        for b in bones:
            q = donor_quat(name, b, dframe)
            if q is not None:
                pb[b].rotation_quaternion = q
        bpy.context.view_layer.update()
    # tabla: en la mano (carry) o colocada por la pose
    if P.get("carry"):
        bm_ = carry_matrix(P["hip"], low=P.get("carryLow", False), swing=P.get("swing", 0.0))
        g = carry_grip(bm_, low=P.get("carryLow", False))
        P["handR"] = tuple(g); P["elbowR"] = P.get("elbowR_c", (g.x - 0.35, g.y + 0.35, g.z + 0.2))
    else:
        bm_ = board_matrix(P["board"])
    if P.get("grabL"):  # mano delantera al canto de la tabla (grab)
        P["handL"] = tuple(bm_ @ Vector(P["grabL"]))
    pb["Board"].matrix = bm_ @ Matrix.Translation((0, 0, PIVOT_Z)) @ REST["Board"].to_3x3().to_4x4()
    bpy.context.view_layer.update()
    for b in FK + (ARM_BONES["Left"] + ARM_BONES["Right"] if donor else []):
        pb[b].keyframe_insert("location", frame=frame); pb[b].keyframe_insert("rotation_quaternion", frame=frame)
    if not donor:
        for b in ARM_BONES["Left"] + ARM_BONES["Right"]:
            pb[b].keyframe_insert("rotation_quaternion", frame=frame)
    set_ik_influence(0.0 if donor else P["armIK"], frame)
    brot = bm_.to_3x3().to_4x4()
    for s in "LR":
        fx, fy, fz, fyaw = P[f"foot{s}"]
        onboard = not P.get(f"free{s}")
        if onboard:
            p = bm_ @ Vector((fx, fy, fz + kick(fy)))
            q = (brot @ Rz(fyaw)).to_quaternion() @ FOOT_REST_ROT[s]
        else:
            p = Vector((fx, fy, fz))
            tilt = P.get(f"tilt{s}", 0)
            q = (Rz(fyaw + FOOT_FIX[s]) @ Rx(tilt)).to_quaternion() @ FOOT_REST_ROT[s]   # V5 T5-19: yaw 0 = punta al frente (+TOE_OUT)
        CTRL[f"IK_Foot{s}"].location = p
        CTRL[f"IK_Foot{s}"].keyframe_insert("location", frame=frame)
        CTRL[f"Rot_Foot{s}"].rotation_mode = "QUATERNION"; CTRL[f"Rot_Foot{s}"].rotation_quaternion = q
        CTRL[f"Pole_Knee{s}"].location = P[f"knee{s}"]
        CTRL[f"IK_Hand{s}"].location = P[f"hand{s}"]
        CTRL[f"Pole_Elbow{s}"].location = P[f"elbow{s}"]
        for n in (f"Pole_Knee{s}", f"IK_Hand{s}", f"Pole_Elbow{s}"):
            CTRL[n].keyframe_insert("location", frame=frame)
        CTRL[f"Rot_Foot{s}"].keyframe_insert("rotation_quaternion", frame=frame)
    if P.get("calib", True):
        calibrate(frame, P, bm_, clip_name)
    else:
        for s in "LR":
            CTRL[f"IK_Foot{s}"].keyframe_insert("location", frame=frame)


def D(base, **kw):
    out = dict(base); out.update(kw); return out


CLIPS = {}
META = {}


def clip(name, keys, loop=True, **meta):
    k = FPS // SRC_FPS
    keys = [(int(round(f * k)), kw) for f, kw in keys]   # claves autoradas a 30 fps → 60 fps (mismos segundos)
    CLIPS[name] = (keys, loop)
    META[name] = dict(loop=loop, frames=keys[-1][0], seconds=keys[-1][0] / FPS, **meta)


# ------------------------------------------------------------------ biblioteca de skate
RIDE = dict()
STAND = dict(hip=(0.02, 0.02, 0.93), spine=(8, 4), chestTwist=12, neck=18, handL=(-0.08, -0.26, 0.80), handR=(0.06, 0.30, 0.76),
             elbowL=(0.4, -0.5, 1.1), elbowR=(0.45, 0.55, 1.0))
clip("SK_Idle", [(0, STAND), (30, D(STAND, hip=(0.025, 0.035, 0.918), spine=(10, 5), head=(30, -14))), (60, STAND)])
clip("SK_Ride", [
    (0, RIDE),
    (10, D(RIDE, hip=(0.025, 0.02, 0.885), handL=(-0.18, -0.33, 0.86), handR=(0.03, 0.36, 0.77))),
    (20, D(RIDE, hip=(0.015, 0.025, 0.895), handL=(-0.14, -0.29, 0.83), handR=(0.01, 0.34, 0.79))),
    (40, RIDE)])
TOE = dict(hip=(-0.05, 0.02, 0.86), board=(0, 0, 0, 0, 9, 0), spine=(20, 8), hipLean=6, chestTwist=10,
           kneeL=(-1.0, -0.3, 0.5), kneeR=(-1.0, 0.45, 0.5), handL=(-0.30, -0.36, 0.86), handR=(-0.12, 0.40, 0.74),
           elbowL=(0.1, -0.7, 1.1), elbowR=(0.25, 0.8, 1.0))
HEEL = dict(hip=(0.10, 0.02, 0.86), board=(0, 0, 0, 0, -9, 0), spine=(4, 2), hipLean=-6, chestTwist=22, head=(32, -6),
            kneeL=(-0.6, -0.5, 0.65), kneeR=(-0.6, 0.6, 0.65), handL=(-0.36, -0.42, 0.96), handR=(-0.24, 0.30, 0.90),
            elbowL=(0.3, -0.75, 1.2), elbowR=(0.35, 0.75, 1.15))
clip("SK_CarveR", [(0, TOE), (15, D(TOE, hip=(-0.055, 0.02, 0.85))), (30, TOE)])
clip("SK_CarveL", [(0, HEEL), (15, D(HEEL, hip=(0.105, 0.02, 0.855))), (30, HEEL)])
# agachado = pasar bajo techos de 1,26–1,30 m: cabeza agachada (con −34° la gorra llegaba a 1,33 m y atravesaba el techo)
CROUCH = dict(hip=(0.04, 0.03, 0.575), hipPitch=24, spine=(34, 22), chestTwist=8, neck=4, head=(26, 4),
              kneeL=(-1.0, -0.45, 0.45), kneeR=(-1.0, 0.55, 0.45),
              handL=(-0.36, -0.30, 0.52), handR=(-0.28, 0.36, 0.48), elbowL=(0.0, -0.6, 0.9), elbowR=(0.05, 0.7, 0.85))
clip("SK_CrouchRide", [(0, CROUCH), (20, D(CROUCH, hip=(0.04, 0.03, 0.56))), (40, CROUCH)])
BRAKE = dict(hip=(0.0, -0.05, 0.835), spine=(4, 2), chestTwist=30, neck=10, head=(26, 4), hipLean=-8,
             footL=(0.04, -0.17, FZ, -40), kneeL=(-0.7, -0.6, 0.55),
             footR=(0.20, 0.40, GZ + 0.01, -60), freeR=1, plantR=True, kneeR=(-0.4, 0.9, 0.5),
             handL=(-0.30, -0.42, 0.95), handR=(0.10, 0.52, 0.92), elbowL=(0.2, -0.8, 1.1), elbowR=(0.45, 0.8, 1.1))
clip("SK_Brake", [(0, BRAKE), (6, D(BRAKE, footR=(0.21, 0.42, GZ + 0.005, -62))), (12, BRAKE)])
# impulso (ciclo 0,866 s = 26 fotogramas): apoyo plano 8→16, despegue de punta 16→18. Corrección del estudio Push/Ride:
# suela alineada con la marcha (yaw 22), pie más abierto (x −0,27), mano trasera hacia el muslo, pie libre alto al salir/volver.
PB = dict(hipYaw=-60, chestTwist=8, neck=12, head=(22, -2), footL=(0.02, -0.16, FZ, -22), kneeL=(-0.4, -0.95, 0.55),
          hip=(-0.02, -0.08, 0.86), handL=(-0.20, -0.30, 0.86), handR=(0.08, 0.20, 0.73), elbowL=(0.2, -0.55, 1.1), elbowR=(0.35, 0.50, 0.8))
clip("SK_Push", [
    (0, D(PB, footR=(0.06, 0.24, FZ, -100), hip=(0.0, -0.04, 0.89))),
    (1, D(PB, footR=(0.05, 0.23, FZ, -95), liftR=0.07, hip=(-0.01, -0.045, 0.885))),
    (3, D(PB, footR=(-0.06, 0.12, 0.48, -40), freeR=1, hip=(-0.02, -0.05, 0.87), handR=(0.04, 0.17, 0.76))),
    (5, D(PB, footR=(-0.22, -0.03, 0.40, 22), freeR=1, hip=(-0.03, -0.06, 0.86), handR=(0.02, 0.16, 0.77))),
    (8, D(PB, footR=(-0.27, -0.18, GZ, 22), freeR=1, plantR=True, hip=(-0.04, -0.10, 0.81), handR=(-0.04, 0.10, 0.77), handL=(-0.27, -0.36, 0.89))),
    (13, D(PB, footR=(-0.27, 0.20, GZ, 22), freeR=1, plantR=True, hip=(-0.04, -0.08, 0.80), spine=(16, 8), handR=(0.02, 0.18, 0.73))),
    (16, D(PB, footR=(-0.27, 0.46, GZ, 22), freeR=1, plantR=True, hip=(-0.04, -0.06, 0.81), handR=(0.05, 0.22, 0.75))),
    (18, D(PB, footR=(-0.27, 0.62, GZ + 0.06, 22), tiltR=20, freeR=1, hip=(-0.03, -0.04, 0.82), handR=(0.08, 0.24, 0.78), handL=(-0.15, -0.26, 0.83))),
    (21, D(PB, footR=(-0.22, 0.50, 0.40, -20), freeR=1, hip=(-0.01, -0.035, 0.85), handR=(0.06, 0.23, 0.76))),
    (23, D(PB, footR=(-0.10, 0.34, 0.47, -60), freeR=1, hip=(0.0, -0.03, 0.87), handR=(0.05, 0.22, 0.76))),
    (25, D(PB, footR=(0.05, 0.25, FZ, -95), liftR=0.06, hip=(0.0, -0.035, 0.885))),
    (26, D(PB, footR=(0.06, 0.24, FZ, -100), hip=(0.0, -0.04, 0.89))),
], contact=[8 / 26, 16 / 26], events={"push_down": 8 / 26, "toe_off": 18 / 26})
# scoot agachado (CTRL-04): impulso corto y bajo, sin erguirse (0,7 s = 21 fotogramas)
SB = dict(CROUCH, hipYaw=-66, footL=(0.03, -0.16, FZ, -30), kneeR=(-1.0, 0.30, 0.62))
clip("SK_Scoot", [
    (0, D(SB, footR=(0.06, 0.24, FZ, -100))),
    (2, D(SB, footR=(0.05, 0.23, FZ, -97), liftR=0.05)),
    (4, D(SB, footR=(-0.08, 0.13, 0.40, -40), freeR=1)),
    (5.5, D(SB, footR=(-0.19, 0.01, 0.31, 2), freeR=1, hip=(0.02, 0.0, 0.58))),
    (7, D(SB, footR=(-0.25, -0.10, GZ, 22), freeR=1, plantR=True, hip=(0.01, -0.02, 0.56))),
    (12, D(SB, footR=(-0.25, 0.30, GZ, 22), freeR=1, plantR=True, hip=(0.01, -0.01, 0.56))),
    (15, D(SB, footR=(-0.22, 0.42, 0.30, -10), freeR=1, hip=(0.02, 0.0, 0.58))),
    (17.5, D(SB, footR=(-0.06, 0.30, 0.42, -70), freeR=1)),
    (19.5, D(SB, footR=(0.05, 0.25, FZ, -95), liftR=0.05)),
    (21, D(SB, footR=(0.06, 0.24, FZ, -100))),
], contact=[7 / 21, 13 / 21])
POPC = dict(CROUCH, hip=(0.03, 0.02, 0.72), hipPitch=10, spine=(18, 10), neck=12,
            footL=(0.06, -0.16, FZ, -78), footR=(0.06, 0.30, FZ, -100), head=(26, -22))
TUCK = dict(hip=(0.03, 0.02, 0.84), spine=(14, 8), board=(0, 0, 0.30, 0, 0, 0), footL=(0.06, -0.12, FZ, -78), footR=(0.06, 0.24, FZ, -100),
            kneeL=(-1.0, -0.4, 0.95), kneeR=(-1.0, 0.5, 0.95), handL=(-0.30, -0.44, 1.02), handR=(0.04, 0.48, 0.98),
            elbowL=(0.2, -0.8, 1.25), elbowR=(0.4, 0.8, 1.2))
clip("SK_Pop", [
    (0, RIDE),
    (2, POPC),
    (5, D(POPC, hip=(0.03, 0.02, 0.86), board=(0, 0, 0.0, 24, 0, 0), footR=(0.06, 0.30, FZ, -100), footL=(0.06, -0.02, FZ, -70),
          spine=(10, 6), handL=(-0.28, -0.42, 0.90), handR=(-0.10, 0.44, 0.80), elbowR=(0.25, 0.75, 0.95))),
    (9, D(TUCK, board=(0, 0, 0.22, 4, 0, 0), footL=(0.06, -0.18, FZ, -78))),
    (12, TUCK),
], loop=False, takeoff=2 / 12)
clip("SK_Air", [(0, TUCK), (12, D(TUCK, hip=(0.03, 0.02, 0.86), board=(0, 0, 0.28, -2, 0, 0))), (24, TUCK)])
CATCH = dict(hip=(0.02, 0.02, 0.88), spine=(10, 6), board=(0, 0, 0.06, 0, 0, 0), handL=(-0.28, -0.46, 0.98), handR=(0.06, 0.48, 0.92),
             elbowL=(0.2, -0.8, 1.2), elbowR=(0.4, 0.8, 1.15))
clip("SK_Catch", [(0, TUCK), (18, CATCH)], loop=False)  # conducido por fracción: más muestras, mismo tiempo en juego
LANDC = dict(CROUCH, hip=(0.03, 0.02, 0.70), hipPitch=12, spine=(20, 10), neck=12, head=(26, -26))
clip("SK_Land", [(0, D(LANDC, hip=(0.03, 0.02, 0.80))), (3, LANDC), (10, D(RIDE, hip=(0.02, 0.02, 0.86))), (14, RIDE)], loop=False)
clip("SK_LandHard", [
    (0, D(LANDC, hip=(0.03, 0.02, 0.76))),
    (4, D(LANDC, hip=(0.04, 0.03, 0.60), handL=(-0.38, -0.34, 0.64), handR=(-0.30, 0.42, 0.60), elbowL=(-0.1, -0.7, 0.9), elbowR=(0.0, 0.8, 0.9))),
    (12, D(LANDC, hip=(0.03, 0.02, 0.70), handL=(-0.34, -0.40, 0.76), handR=(-0.22, 0.46, 0.72), elbowL=(0.0, -0.75, 1.0), elbowR=(0.1, 0.8, 1.0))),
    (20, D(RIDE, hip=(0.02, 0.02, 0.87))), (24, RIDE)], loop=False)
FLIPTUCK = dict(hip=(0.03, 0.02, 0.86), spine=(28, 16), board=(0, 0, 0.36, 0, 0, 0), footL=(0.06, -0.14, FZ, -78), footR=(0.06, 0.22, FZ, -100),
                kneeL=(-1.0, -0.4, 1.1), kneeR=(-1.0, 0.5, 1.1), donor=("Run_and_Jump", 27, False))
clip("SK_FlipCrouch", [(0, D(POPC, hip=(0.03, 0.02, 0.68))), (10, D(POPC, hip=(0.03, 0.02, 0.66)))])
clip("SK_FlipTuck", [(0, FLIPTUCK), (8, D(FLIPTUCK, donor=("Run_and_Jump", 30, False))), (16, FLIPTUCK)])
# pies quietos en la apertura (los de FLIPTUCK): deslizar el trasero a y 0,24 ponía la punta sobre la esquina redondeada
# del tail, donde la suela entra y sale de la lija por décimas de milímetro (holgura inestable ±8 mm)
clip("SK_FlipOpen", [(0, FLIPTUCK), (6, D(CATCH, board=(0, 0, 0.14, 0, 0, 0), footL=FLIPTUCK["footL"], footR=FLIPTUCK["footR"],
                                          handL=(-0.20, -0.60, 1.20), handR=(0.20, 0.60, 1.16)))], loop=False)
RELEASE = dict(TUCK, board=(0, 0, 0.34, 0, 0, 0), footL=(-0.10, -0.30, 0.86, -60), freeL=1, footR=(0.12, 0.30, 0.80, -100), freeR=1,
               kneeL=(-1.0, -0.6, 1.0), kneeR=(-1.0, 0.6, 1.0), hip=(0.03, 0.02, 0.92))
LIFT2 = D(TUCK, liftL=0.07, liftR=0.06)
clip("SK_FlipKick", [(0, TUCK), (2, LIFT2), (4, D(RELEASE, footL=(-0.18, -0.36, 0.84, -50))), (9, RELEASE), (11, D(LIFT2, board=(0, 0, 0.30, 0, 0, 0))), (13, D(TUCK, board=(0, 0, 0.30, 0, 0, 0)))], loop=False, release=[3 / 13, 11 / 13])
# heelflip: el pie delantero sale hacia el lado de talones (+X)
RELEASE_H = D(RELEASE, footL=(0.22, -0.30, 0.86, -100))
clip("SK_FlipHeel", [(0, TUCK), (2, LIFT2), (4, D(RELEASE_H, footL=(0.28, -0.34, 0.84, -110))), (9, RELEASE_H), (11, D(LIFT2, board=(0, 0, 0.30, 0, 0, 0))), (13, D(TUCK, board=(0, 0, 0.30, 0, 0, 0)))], loop=False, release=[3 / 13, 11 / 13])
GRIND = dict(hip=(0.02, 0.02, 0.92), spine=(8, 4), chestTwist=26, handL=(-0.20, -0.60, 1.06), handR=(0.10, 0.60, 1.00),
             elbowL=(0.2, -0.85, 1.2), elbowR=(0.4, 0.85, 1.15))
clip("SK_Grind", [(0, GRIND), (15, D(GRIND, hip=(0.02, 0.03, 0.905), handL=(-0.22, -0.62, 1.10))), (30, GRIND)])
# manual: nariz arriba con pivote en el eje trasero (board_matrix pitch > 0), peso atrás y brazos de equilibrio
MAN = dict(RIDE, board=(0, 0, 0, 11, 0, 0), hip=(0.02, 0.10, 0.88), spine=(4, 2), chestTwist=20, handL=(-0.28, -0.52, 1.04), handR=(0.10, 0.62, 1.02),
           elbowL=(0.2, -0.8, 1.2), elbowR=(0.4, 0.85, 1.2))
clip("SK_Manual", [(0, MAN), (15, D(MAN, hip=(0.025, 0.11, 0.875), handL=(-0.30, -0.56, 1.08))), (30, MAN)])
# grab: mano delantera al canto de puntera entre los pies; rodillas arriba
# grab = recogimiento real: con brazos de 0,51 m y el hombro a 1,2 m la mano no llegaba al canto (quedaba a 27 cm con el
# brazo estirado). Tabla a las rodillas, cadera baja y torso doblado: hombro ~1,0 m, canto ~0,47 m → al alcance
GRAB = D(TUCK, board=(0, 0, 0.45, 0, 0, 0), hip=(0.03, 0.02, 0.82), hipPitch=18, grabL=(-0.105, -0.03, 0.09),
         kneeL=(-1.0, -0.3, 1.15), kneeR=(-1.0, 0.45, 1.15), elbowL=(-0.3, -0.7, 0.95), spine=(40, 24), neck=-8, head=(26, -30),
         handR=(0.06, 0.55, 0.95), elbowR=(0.3, 0.8, 1.05))
clip("SK_Grab", [(0, GRAB), (12, D(GRAB, board=(0, 0, 0.46, 2, 0, 0))), (24, GRAB)])
GROUND = dict(STAND, hip=(0.0, 0.0, 0.93), hipYaw=0, chestTwist=0, neck=0, head=(0, 0), spine=(3, 2),
              footL=(0.11, 0.0, GZ, 0), freeL=1, plantL=True, footR=(-0.11, 0.02, GZ, 0), freeR=1, plantR=True,
              kneeL=(0.15, -0.9, 0.5), kneeR=(-0.15, -0.9, 0.5), handL=(0.30, -0.02, 0.86), handR=(-0.30, -0.02, 0.86),
              elbowL=(0.45, 0.4, 1.1), elbowR=(-0.45, 0.4, 1.1), board=(0, 0, -2.0, 0, 0, 0))
clip("SK_Stand", [(0, GROUND), (40, D(GROUND, hip=(0.0, 0.01, 0.925), spine=(4, 3))), (80, GROUND)])

# ------------------------------------------------------------------ a pie con la tabla en la mano
IDLEB = D(GROUND, carry=True, hip=(0.0, 0.0, 0.93), handL=(0.28, 0.0, 0.84), elbowL=(0.45, 0.4, 1.1))
clip("SK_IdleBoard", [(0, IDLEB), (30, D(IDLEB, hip=(0.0, 0.006, 0.922), spine=(4, 3), swing=0.02)), (60, IDLEB)])
# V5 T5-19 (HUM-A5-009): salto PROPIO a pie por fases, conducido por el juego (vy y tiempo en el aire), no en bucle:
# preparación (flexión) → impulso (extensión, puntas abajo) → ÁPICE con brazos y piernas abiertos (izquierdo libre abierto;
# el derecho mantiene la tabla con el codo hacia fuera) → recogida → contacto → absorción → reposo con tabla.
# El fotograma ~12 (entre ápice y recogida) es también la pose de CAÍDA sin salto (N5-02).
HOP_PREP = D(IDLEB, hip=(0.0, 0.02, 0.80), hipPitch=14, spine=(16, 8), kneeL=(0.2, -1.0, 0.45), kneeR=(-0.2, -1.0, 0.45), handL=(0.30, 0.18, 0.76), elbowL=(0.5, 0.6, 0.9))
HOP_PUSH = D(IDLEB, hip=(0.0, 0.0, 0.97), hipPitch=-2, spine=(2, 0), footL=(0.11, 0.0, GZ + 0.03, 0), footR=(-0.11, 0.02, GZ + 0.03, 0), plantL=False, plantR=False,
             tiltL=25, tiltR=25, handL=(0.34, -0.14, 1.15), elbowL=(0.6, 0.2, 1.2))
HOP_APEX = D(IDLEB, hip=(0.0, 0.0, 0.93), spine=(4, 2), head=(-6, 0), footL=(0.30, 0.02, GZ + 0.12, 10), footR=(-0.30, 0.04, GZ + 0.12, -10), plantL=False, plantR=False,
             kneeL=(0.7, -0.8, 0.5), kneeR=(-0.7, -0.8, 0.5), handL=(0.70, -0.04, 1.30), elbowL=(0.6, 0.6, 1.45), elbowR_c=(-0.80, 0.25, 1.05))
HOP_DOWN = D(IDLEB, hip=(0.0, 0.0, 0.92), footL=(0.14, -0.04, GZ + 0.07, 0), footR=(-0.14, 0.03, GZ + 0.07, 0), plantL=False, plantR=False,
             kneeL=(0.3, -0.9, 0.55), kneeR=(-0.3, -0.9, 0.55), handL=(0.50, -0.06, 1.06), elbowL=(0.6, 0.4, 1.25), elbowR_c=(-0.62, 0.3, 1.0))
HOP_LAND = D(IDLEB, hip=(0.0, 0.0, 0.90), handL=(0.40, -0.05, 0.95), elbowL=(0.55, 0.4, 1.1))
HOP_ABS = D(IDLEB, hip=(0.0, 0.02, 0.80), hipPitch=12, spine=(14, 8), kneeL=(0.2, -1.0, 0.45), kneeR=(-0.2, -1.0, 0.45), handL=(0.34, -0.10, 0.82))
clip("SK_HopBoard", [(0, HOP_PREP), (3, HOP_PUSH), (9, HOP_APEX), (14, HOP_DOWN), (17, HOP_LAND), (21, HOP_ABS), (26, IDLEB)], loop=False,
     phases={"prep": 0, "push": 3 / 26, "apex": 9 / 26, "fall": 12 / 26, "down": 14 / 26, "contact": 17 / 26, "absorb": 21 / 26, "end": 1})
# montar (0,32 s ≈ 10 fotogramas): la tabla baja de la mano al suelo, pie delantero encima, giro del cuerpo a la postura
MNT1 = D(GROUND, carry=False, board=Matrix.Translation((-0.22, -0.08, 0.20)) @ Rz(-90) @ Rx(-50), hip=(0.0, -0.02, 0.86), hipYaw=-25, spine=(18, 8),
         handR=(-0.27, -0.06, 0.48), elbowR=(-0.55, 0.3, 0.8), handL=(0.26, 0.0, 0.84))
MNT2 = D(RIDE, board=(0, 0, 0, 0, 0, 0), hipYaw=-60, hip=(0.0, -0.02, 0.88), footR=(-0.20, 0.10, GZ, -20), freeR=1, plantR=True,
         handR=(0.06, 0.24, 0.78), handL=(-0.18, -0.30, 0.86))
MNT15 = D(MNT2, footL=(0.06, -0.19, FZ, -78), liftL=0.09, hipYaw=-45, handL=(0.06, -0.16, 0.86), elbowL=(0.4, 0.2, 1.1))
MNT15w = D(MNT1, footL=(0.08, -0.10, 0.36, -40), freeL=1, plantL=False, handL=(0.18, -0.08, 0.85))
clip("SK_Mount", [(0, IDLEB), (4, MNT1), (5.5, D(MNT15w, kneeR=(-0.4, -0.6, 0.5), armKey=False)), (6.3, D(MNT15w, armKey=False, kneeL=(-0.35, -0.75, 0.5), kneeR=(-0.55, -0.3, 0.52), board=Matrix.Translation((-0.12, -0.05, 0.07)) @ Rz(-40) @ Rx(-18), footL=(0.07, -0.14, 0.40, -55))), (7.5, D(MNT15, armKey=False, board=(0, 0, 0, 0, 0, 0), kneeL=(-0.75, -0.5, 0.55), kneeR=(-0.7, 0.0, 0.55))), (8.5, MNT2),
                  (9.5, D(MNT2, footR=(-0.16, 0.18, 0.40, -60), plantR=False, armKey=False)),
                  (11, D(MNT2, footR=(0.06, 0.24, FZ, -100), freeR=0, plantR=False, liftR=0.09, armKey=False)), (13, D(STAND, hip=(0.02, 0.02, 0.92)))],
     loop=False, events={"board_down": 5.5 / 13, "on_board": 8.5 / 13})
# desmontar (0,28 s ≈ 9): pie trasero al suelo, giro hacia la marcha, la mano recoge la tabla
DSM1 = D(RIDE, hipYaw=-60, hip=(0.0, 0.0, 0.88), footR=(-0.18, 0.18, GZ, -20), freeR=1, plantR=True)
DSM2 = D(GROUND, carry=False, board=Matrix.Translation((-0.24, -0.02, 0.24)) @ Rz(-90) @ Rx(-55), hip=(0.0, 0.0, 0.86), hipYaw=-20, spine=(16, 8),
         handR=(-0.29, 0.0, 0.52), elbowR=(-0.55, 0.3, 0.8))
DSM05 = D(STAND, footR=(0.06, 0.24, FZ, -100), liftR=0.09)
DSM15 = D(DSM1, footL=(0.06, -0.19, FZ, -78), liftL=0.09, handL=(-0.04, -0.22, 0.85), hipYaw=-50)
DSM15w = D(DSM1, footL=(0.16, -0.12, 0.34, -30), freeL=1, handL=(0.12, -0.12, 0.85), hipYaw=-38)
clip("SK_Dismount", [(0, STAND), (1.5, D(DSM05, armKey=False)), (3, D(DSM1, footR=(-0.15, 0.20, 0.40, -50), plantR=False, armKey=False)), (4.5, DSM1), (6, D(DSM15, armKey=False, kneeL=(-0.55, -0.6, 0.5), kneeR=(-0.85, 0.15, 0.55))), (7.5, D(DSM15w, armKey=False, kneeL=(0.05, -0.8, 0.5), kneeR=(-0.65, -0.35, 0.5))), (8.3, D(DSM2, armKey=False, kneeL=(0.15, -0.85, 0.5), kneeR=(-0.4, -0.7, 0.5), board=Matrix.Translation((-0.34, -0.02, 0.10)) @ Rz(-48) @ Rx(-22), handR=(-0.36, 0.0, 0.31))), (9.3, D(DSM2, kneeL=(0.25, -0.85, 0.5), kneeR=(-0.3, -0.8, 0.5))), (12, IDLEB)], loop=False, events={"off_board": 4.5 / 12, "pick_up": 9.3 / 12})
# caída suave (1,15 s ≈ 35): pierde la tabla, cae sentado, se levanta y la recoge (termina como IdleBoard)
B1 = D(LANDC, hip=(0.04, 0.0, 0.62), hipPitch=-12, board=(0.0, -0.45, 0.0, 0, 18, 8))
B2 = D(GROUND, carry=False, hipYaw=-50, hip=(0.0, 0.12, 0.30), hipPitch=-28, spine=(-6, -4), board=(0.05, -0.75, 0.0, 0, 0, 25),
       footL=(0.14, -0.35, GZ, -20), footR=(-0.10, -0.30, GZ, 20), plantL=True, plantR=True, kneeL=(0.3, -0.9, 0.7), kneeR=(-0.3, -0.9, 0.7),
       handL=(0.30, 0.30, 0.10), handR=(-0.30, 0.30, 0.10), elbowL=(0.6, 0.5, 0.5), elbowR=(-0.6, 0.5, 0.5), head=(10, -10))
B3 = D(B2, hip=(0.0, 0.0, 0.62), hipPitch=18, spine=(30, 14), hipYaw=-20, footL=(0.12, -0.10, GZ, 0), footR=(-0.12, 0.10, GZ, 0),
       handL=(0.24, -0.10, 0.62), handR=(-0.10, -0.55, 0.12), elbowR=(-0.5, 0.1, 0.6), board=(0.05, -0.75, 0.0, 0, 0, 25))
clip("SK_Bail", [(0, LANDC), (6, B1), (14, B2), (22, B2), (28, B3), (35, IDLEB)], loop=False, events={"hit_ground": 14 / 35, "pick_up": 28 / 35})

# ------------------------------------------------------------------ V4 IMPACT-02 (HUM-A4-007): estrella → suelo → levantarse
# Autoría propia con el mismo sistema de poses (sin donantes ni clips externos). El controlador hace volar la cápsula de
# espaldas al golpe; aquí solo la pose: brazos y piernas abiertos (estrella), tabla despedida hacia atrás, caída boca arriba
# y secuencia de levantarse que recoge la tabla y termina en la pose de IdleBoard (tabla en la mano).
STAR = D(GROUND, carry=False, calib=False, hipYaw=0, hip=(0.0, 0.06, 0.95), hipPitch=-28, spine=(-12, -8), neck=-6, head=(0, -16),
         handL=(0.70, 0.18, 1.58), handR=(-0.70, 0.18, 1.58), elbowL=(0.62, 0.45, 1.25), elbowR=(-0.62, 0.45, 1.25),
         footL=(0.40, 0.22, 0.20, 28), freeL=1, plantL=False, footR=(-0.40, 0.22, 0.20, -28), freeR=1, plantR=False,
         kneeL=(0.65, -0.55, 0.62), kneeR=(-0.65, -0.55, 0.62), board=(0.30, 0.95, 0.70, 40, 65, 25))
STAR2 = D(STAR, hip=(0.0, 0.08, 0.96), handL=(0.74, 0.10, 1.66), handR=(-0.74, 0.10, 1.66), footL=(0.44, 0.28, 0.22, 34), footR=(-0.44, 0.28, 0.22, -34),
          board=(0.36, 1.05, 0.80, 80, 110, 35))
clip("SK_ImpactStar", [(0, STAR), (12, STAR2), (24, STAR)], loop=True)
LIE = D(GROUND, carry=False, calib=False, hipYaw=0, hip=(0.0, 0.38, 0.17), hipPitch=-82, spine=(-4, -3), neck=-4, head=(12, -8),
        handL=(0.72, 0.62, 0.10), handR=(-0.70, 0.50, 0.10), elbowL=(0.55, 0.35, 0.30), elbowR=(-0.55, 0.30, 0.30),
        footL=(0.24, -0.62, 0.11, 30), freeL=1, plantL=False, footR=(-0.20, -0.56, 0.11, -25), freeR=1, plantR=False,
        kneeL=(0.35, -0.30, 0.55), kneeR=(-0.30, -0.25, 0.55), board=(-0.62, -0.10, 0.0, 0, 0, 75))
LIE0 = D(STAR, hip=(0.0, 0.25, 0.55), hipPitch=-55, board=(-0.50, 0.10, 0.20, 0, 30, 70))
clip("SK_ImpactLand", [(0, LIE0), (6, D(LIE, hip=(0.0, 0.36, 0.20))), (9, D(LIE, hip=(0.0, 0.38, 0.15))), (12, LIE)], loop=False, events={"hit_ground": 6 / 12})
SITUP = D(LIE, hip=(0.0, 0.18, 0.20), hipPitch=-18, spine=(28, 16), neck=8, head=(0, 6), handL=(0.30, 0.42, 0.06), handR=(-0.30, 0.40, 0.06),
          elbowL=(0.45, 0.45, 0.35), elbowR=(-0.45, 0.45, 0.35), footL=(0.18, -0.38, GZ, 10), plantL=True, footR=(-0.18, -0.32, GZ, -10), plantR=True,
          kneeL=(0.25, -0.6, 0.75), kneeR=(-0.25, -0.6, 0.75))
KNEEL = D(GROUND, carry=False, calib=False, hipYaw=0, hip=(0.0, -0.02, 0.52), hipPitch=34, spine=(30, 18), neck=10, head=(0, 12),
          footL=(0.16, -0.06, GZ, 6), freeL=1, plantL=True, footR=(-0.16, 0.08, GZ, -6), freeR=1, plantR=True,
          kneeL=(0.3, -0.9, 0.55), kneeR=(-0.3, -0.9, 0.5), handL=(0.30, -0.25, 0.55), handR=(-0.58, -0.12, 0.10),
          elbowL=(0.5, 0.0, 0.8), elbowR=(-0.6, 0.2, 0.5), board=(-0.62, -0.10, 0.0, 0, 0, 75))
GRABB = D(KNEEL, hip=(0.0, 0.0, 0.70), hipPitch=20, spine=(18, 10), handR=(-0.40, -0.05, 0.40),
          board=Matrix.Translation((-0.40, -0.02, 0.18)) @ Rz(-90) @ Rx(-60))
clip("SK_GetUp", [(0, LIE), (8, SITUP), (15, KNEEL), (20, GRABB), (26, D(IDLEB, hip=(0.0, 0.0, 0.88))), (30, IDLEB)], loop=False,
     events={"sit": 8 / 30, "kneel": 15 / 30, "pick_up": 20 / 30, "stand": 26 / 30})
META["SK_GetUp"].update(phase_note="conducido por impactT/getupDur del controlador; termina en la pose de SK_IdleBoard")
META["SK_ImpactLand"].update(phase_note="conducido por impactT/lieDur")

META["SK_Push"].update(phase_note="apoyo plano del pie entre contact[0] y contact[1]; despegue de punta hasta toe_off; la física acelera en esa ventana")
META["SK_Pop"].update(phase_note="takeoff: la física despega en ese punto")
META["SK_Mount"].update(phase_note="conducido por modeT/mountDur del controlador")
META["SK_Dismount"].update(phase_note="conducido por modeT/dismountDur del controlador")


def _lerp(a, b, t):
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        return a if t < 0.5 else b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a + (b - a) * t
    if isinstance(a, Matrix) or isinstance(b, Matrix):
        return board_matrix(a).lerp(board_matrix(b), t)
    if isinstance(a, tuple) and isinstance(b, tuple) and len(a) == len(b) and all(isinstance(x, (int, float)) for x in a + b):
        return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a if t < 0.5 else b


def densify(keys):
    """Una pose por fotograma (interpolación suave de los parámetros entre claves) para calibrar el contacto en TODOS
    los fotogramas. Devuelve (frame, params, key_a, key_b, t). Un pie que cambia de tabla a aire (o lleva lift) se marca
    como transición: su posición se interpola luego entre las posiciones REALES (calibradas) de las claves vecinas."""
    out = []
    for (fa, A), (fb, B) in zip(keys, keys[1:]):
        A = dict(DEFAULT, **A); B = dict(DEFAULT, **B)
        if bool(A.get("carry")) != bool(B.get("carry")):
            def bm_of(X): return carry_matrix(X["hip"], low=X.get("carryLow", False), swing=X.get("swing", 0.0)) if X.get("carry") else board_matrix(X["board"])
            def hand_of(X): return tuple(carry_grip(bm_of(X), low=X.get("carryLow", False))) if X.get("carry") else X["handR"]
            A2 = dict(A, board=bm_of(A), handR=hand_of(A), carry=False); B2 = dict(B, board=bm_of(B), handR=hand_of(B), carry=False)
        else:
            A2, B2 = A, B
        for f in range(fa + 1, fb):
            u = (f - fa) / (fb - fa); t = u * u * (3 - 2 * u)
            P = {k: _lerp(A2.get(k, B2.get(k)), B2.get(k, A2.get(k)), t) for k in set(A2) | set(B2)}
            for s in "LR":
                fa_free, fb_free = bool(A.get(f"free{s}")), bool(B.get(f"free{s}"))
                la, lb = float(A.get(f"lift{s}") or 0), float(B.get(f"lift{s}") or 0)
                pa, pb = bool(A.get(f"plant{s}")), bool(B.get(f"plant{s}"))
                both_board = not fa_free and not fb_free and not la and not lb
                P[f"lift{s}"] = 0
                P[f"plant{s}"] = pa and pb
                P[f"free{s}"] = not both_board
                P[f"_trans{s}"] = not both_board and not (fa_free and fb_free)
            out.append((f, P, fa, fb, t))
    return out


def bake_clip(name, keys, loop):
    ctrl_action = bpy.data.actions.new(f"CTRL_{name}")
    assign(arm, ctrl_action)
    for e in CTRL.values():
        e.animation_data_clear()
    set_ik_influence(1.0, 0, bones=("mixamorig:LeftLeg", "mixamorig:RightLeg"))
    for c in FOOTROT.values():
        c.influence = 1.0
    rec = {}
    for f, kw in keys:  # pasada 1: claves calibradas; se registra la posición real de pies, manos y codos
        pose(f, clip_name=name, **kw)
        rec[f] = {s: CTRL[f"IK_Foot{s}"].location.copy() for s in "LR"}
    for f, P, fa, fb, t in densify(keys):  # pasada 2: intermedios
        for s in "LR":
            if P.get(f"_trans{s}"):
                w = rec[fa][s].lerp(rec[fb][s], t)
                P[f"foot{s}"] = (w.x, w.y, w.z, P[f"foot{s}"][3])
        pose(f, clip_name=name, **P)
    end = keys[-1][0]
    return finish_bake(name, end, loop, ctrl_action, keep_arms={f for f, kw in keys if kw.get('armKey', True)})


def finish_bake(name, end, loop, ctrl_action, keep_arms=None):
    scn = bpy.context.scene
    scn.frame_start = 0; scn.frame_end = end
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(frame_start=0, frame_end=end, step=1, only_selected=False, visual_keying=True,
                     clear_constraints=False, clear_parents=False, use_current_action=False, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    baked = arm.animation_data.action
    baked.name = name; baked.use_fake_user = True
    # los clips no escalan huesos: el bake visual introducía escalas degeneradas (cabeza 477×) en poses de pie
    for layer in baked.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in [f for f in cb.fcurves if f.data_path.endswith(".scale")]:
                    cb.fcurves.remove(fc)
                if keep_arms:
                    # brazos: solo las poses autoradas (el IK intermedio de brazo podía volcar el codo entre claves)
                    for fc in cb.fcurves:
                        if any(f'"mixamorig:{sd}{b}"' in fc.data_path for sd in ("Left", "Right") for b in ("Shoulder", "Arm", "ForeArm", "Hand")):
                            for kp in [k for k in fc.keyframe_points if int(round(k.co[0])) not in keep_arms][::-1]:
                                fc.keyframe_points.remove(kp, fast=True)
                            for kp in fc.keyframe_points: kp.interpolation = "BEZIER"
                            fc.update()
    baked["bk_loop"] = loop
    if keep_arms:
        fix_quat_signs(baked)
    ctrl_action.use_fake_user = True
    for n, e in CTRL.items():
        if e.animation_data and e.animation_data.action:
            e.animation_data.action.name = f"CTRL_{name}__{n}"; e.animation_data.action.use_fake_user = True
    return baked


def fix_quat_signs(action):
    """Hace consecutivos los cuaterniones (q y −q son la misma orientación; la interpolación por componentes no)."""
    for layer in action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                groups = {}
                for fc in cb.fcurves:
                    if fc.data_path.endswith("rotation_quaternion"): groups.setdefault(fc.data_path, [None] * 4)[fc.array_index] = fc
                for comps in groups.values():
                    if None in comps or len({len(c.keyframe_points) for c in comps}) != 1: continue
                    prev = None
                    for i in range(len(comps[0].keyframe_points)):
                        q = [c.keyframe_points[i].co[1] for c in comps]
                        if prev is not None and sum(a * b for a, b in zip(q, prev)) < 0:
                            for c in comps:
                                k = c.keyframe_points[i]; k.co[1] = -k.co[1]; k.handle_left[1] = -k.handle_left[1]; k.handle_right[1] = -k.handle_right[1]
                            q = [-x for x in q]
                        prev = q
                    for c in comps: c.update()


def flat_foot_quat(s, fm):
    """V5 T5-19: orientación del pie del Walking SIN alabeo (suela con el canto horizontal), conservando el cabeceo
    talón–punta del original (el rodamiento del despegue es válido). V5 G8 (usuario, 12 oct): conserva también el RUMBO
    del Walking original (punta algo hacia fuera, «andaba bien»); forzar la punta al frente (+TOE_OUT) hacía una marcha
    rara con los pies «muy para adelante». Solo se quita el alabeo: pie plano con el eje de V4."""
    Rrel = fm.to_3x3() @ FOOT_REST_ROT[s].to_matrix().inverted()
    t = Rrel @ TOE_REST[s]; p = math.asin(max(-1.0, min(1.0, t.z)))
    up = Vector((0, 0, 1)); h = Vector((t.x, t.y, 0)).normalized()
    x1 = (h * math.cos(p) + up * math.sin(p)).normalized(); y1 = up.cross(h).normalized(); z1 = x1.cross(y1)
    x0 = TOE_REST[s]; z0 = up; y0 = z0.cross(x0)
    R = Matrix((x1, y1, z1)).transposed() @ Matrix((x0, y0, z0))
    return (R @ FOOT_REST_ROT[s].to_matrix()).to_quaternion()


def bake_walk(name, crouch=False):
    """Walking propio de ANMI (en el sitio) + brazo derecho IK sujetando la tabla, que acompaña a la cadera.
    crouch=True: cadera 0,30 m más baja y piernas IK que siguen las huellas del Walking (los pies siguen pisando)."""
    src = WALK_SRC
    act = src.copy(); act.name = f"CTRL_{name}"
    assign(arm, act)
    for e in CTRL.values():
        e.animation_data_clear()
    scn = bpy.context.scene
    f0, f1 = int(src.frame_range[0]), int(round(src.frame_range[1]))
    # primera pasada: huellas del Walking sin IK de piernas
    for c in FOOTROT.values():
        c.influence = 0.0
    for bone in ("mixamorig:LeftLeg", "mixamorig:RightLeg", "mixamorig:LeftForeArm", "mixamorig:RightForeArm"):
        IKC[bone].influence = 0.0
    feet = {}; need = {}
    for f in range(f0, f1 + 1):
        scn.frame_set(f); bpy.context.view_layer.update()
        feet[f] = {s: (arm.matrix_world @ pb[f"mixamorig:{'Left' if s == 'L' else 'Right'}Foot"].matrix) for s in "LR"}
    # segunda pasada: claves de control
    if not crouch:   # V5 T5-19: la rotación corregida del pie y el IK de piernas cuentan ya al evaluar la suela
        for c in FOOTROT.values():
            c.influence = 1.0
    for f in range(f0, f1 + 1):
        scn.frame_set(f)
        hip = pb["mixamorig:Hips"]
        if crouch:
            hip.location = hip.location  # mantener la curva de la cadera del walking y bajar en espacio de armadura
        bpy.context.view_layer.update()
        hp = arm.matrix_world @ hip.head
        if crouch:
            m = hip.matrix.copy(); m.translation = m.translation - Vector((0, 0, 0.30)); hip.matrix = m
            rotate_about_head("mixamorig:Spine", Matrix.Rotation(math.radians(22), 4, "X"))
            rotate_about_head("mixamorig:Spine1", Matrix.Rotation(math.radians(10), 4, "X"))
            hip.keyframe_insert("location", frame=f)
            for b in ("mixamorig:Spine", "mixamorig:Spine1"): pb[b].keyframe_insert("rotation_quaternion", frame=f)
            hp = hp - Vector((0, 0, 0.30))
        bm_ = carry_matrix((hp.x, hp.y, hp.z if not crouch else hp.z + 0.30 - 0.30), low=crouch, swing=0.03 * math.sin((f - f0) / (f1 - f0) * 2 * math.pi))
        pb["Board"].matrix = bm_ @ Matrix.Translation((0, 0, PIVOT_Z)) @ REST["Board"].to_3x3().to_4x4()
        bpy.context.view_layer.update()
        pb["Board"].keyframe_insert("location", frame=f); pb["Board"].keyframe_insert("rotation_quaternion", frame=f)
        g = carry_grip(bm_, low=crouch)
        CTRL["IK_HandR"].location = g; CTRL["IK_HandR"].keyframe_insert("location", frame=f)
        CTRL["Pole_ElbowR"].location = (g.x - 0.35, g.y + 0.35, g.z + 0.2); CTRL["Pole_ElbowR"].keyframe_insert("location", frame=f)
        IKC["mixamorig:RightForeArm"].influence = 1.0; pb["mixamorig:RightForeArm"].constraints["IK"].keyframe_insert("influence", frame=f)
        IKC["mixamorig:LeftForeArm"].influence = 0.0; pb["mixamorig:LeftForeArm"].constraints["IK"].keyframe_insert("influence", frame=f)
        # R2-G8 (usuario, 12 oct): la marcha normal vuelve a ser la de V4 (piernas FK del Walking, «andaba bien»); la IK de
        # T5-19 con el pie subido hasta 8,4 cm para no hundir la suela cambiaba la zancada («como un avestruz»). Solo el pie
        # recibe la rotación corregida (COPY_ROTATION): plano y con el rumbo original
        legs = 1.0 if crouch else 0.0
        for side, bone in (("L", "mixamorig:LeftLeg"), ("R", "mixamorig:RightLeg")):
            IKC[bone].influence = legs; pb[bone].constraints["IK"].keyframe_insert("influence", frame=f)
            if crouch:
                fm = feet[f][side]
                CTRL[f"IK_Foot{side}"].location = fm.to_translation(); CTRL[f"IK_Foot{side}"].keyframe_insert("location", frame=f)
                CTRL[f"Rot_Foot{side}"].rotation_mode = "QUATERNION"; CTRL[f"Rot_Foot{side}"].rotation_quaternion = fm.to_quaternion()
                CTRL[f"Rot_Foot{side}"].keyframe_insert("rotation_quaternion", frame=f)
                ft = fm.to_translation()
                CTRL[f"Pole_Knee{side}"].location = Vector((ft.x, hp.y - 0.9, hp.z - 0.2)); CTRL[f"Pole_Knee{side}"].keyframe_insert("location", frame=f)
            else:
                fm = feet[f][side]
                CTRL[f"IK_Foot{side}"].location = fm.to_translation(); CTRL[f"IK_Foot{side}"].keyframe_insert("location", frame=f)
                # R2-G8: plano mientras APOYA (cabeceo talón–punta pequeño); en el despegue/recepción con el pie muy inclinado
                # se funde a la rotación original de V4 (aplanar ahí metía el canto de la punta hasta 8 cm en el suelo)
                tz = (fm.to_3x3() @ FOOT_REST_ROT[side].to_matrix().inverted() @ TOE_REST[side]).z
                pit = abs(math.degrees(math.asin(max(-1.0, min(1.0, tz)))))
                wflat = 1.0 if pit < 12 else max(0.0, 1.0 - (pit - 12) / 13)
                qf = fm.to_quaternion().slerp(flat_foot_quat(side, fm), wflat)
                CTRL[f"Rot_Foot{side}"].rotation_mode = "QUATERNION"; CTRL[f"Rot_Foot{side}"].rotation_quaternion = qf
                CTRL[f"Rot_Foot{side}"].keyframe_insert("rotation_quaternion", frame=f)
                ft = fm.to_translation()
                CTRL[f"Pole_Knee{side}"].location = Vector((ft.x, hp.y - 0.9, hp.z - 0.3)); CTRL[f"Pole_Knee{side}"].keyframe_insert("location", frame=f)
        if not crouch:   # R2-G8: suela bajo el suelo tras quitar el alabeo → se mide aquí y se corrige subiendo el CUERPO (abajo)
            bpy.context.view_layer.update(); co = eval_body()
            need[f] = max(0.0, CLEAR - min(float(co[SOLE[sd]][:, 2].min()) for sd in "LR"))
    # R2-G8: sin subidas de cuerpo ni de pie: la cadera y las piernas son las de V4 (GLB V4 medido: suela −0,6…+0,4 cm). El
    # hundimiento que deja aplanar el pie se mide en el GLB PUBLICADO (walk_soles) y, si hace falta, lo absorbe la guarda de
    # suela del juego (≤ 6 cm, instantánea al subir)
    for k in sorted(need): WALK_LIFT_LOG.append((k, "medido_receta", round(need[k] * 1000, 1)))
    for c in FOOTROT.values():
        c.influence = 1.0
    baked = finish_bake(name, f1 - f0, True, act)
    for c in FOOTROT.values():
        c.influence = 1.0
    return baked, f1 - f0


for name, (keys, loop) in list(CLIPS.items()):
    bake_clip(name, keys, loop)
    print("CLIP", name)
CWB = D(GROUND, carry=True, carryLow=True, hip=(0.0, 0.0, 0.64), hipPitch=16, spine=(26, 14), neck=-6, head=(18, -24),
          kneeL=(0.2, -1.0, 0.35), kneeR=(-0.2, -1.0, 0.35), handL=(0.30, -0.18, 0.60), elbowL=(0.6, 0.3, 0.8))
# Andar agachado (ANIM-02): trayectorias de Quaternius UAL «Crouch_Fwd_Loop» (CC0) extraídas en el marco de la pelvis por
# assets/derived/v3/anmi_donors/extract_crouch_curves.py; las piernas las resuelve el IK de ANMI (pies plantados al
# suelo), la mano derecha sigue llevando la tabla. Periodo 32 f a 30 fps: 0,87 m por ciclo → velocidad natural ~0,81 m/s.
CROUCH_CURVES = json.loads((ROOT / "assets/derived/v3/anmi_donors/crouch_fwd_curves.json").read_text())
CW_FRAMES = 32
# las curvas vienen escaladas por altura de cadera, pero ANMI tiene el tobillo a 0,20 m (zapatilla grande) frente a ~0,10 del
# donante: se remapean con la longitud cadera–tobillo de cada rig (si no, la pierna quedaba plegada y el IK saltaba)
CW_ANKLE = min(min(r["footL"][2], r["footR"][2]) for r in CROUCH_CURVES["samples"])
CW_HIP_REST = (arm.matrix_world @ REST["mixamorig:Hips"].translation).z
CW_K = (CW_HIP_REST - GZ) / (CW_HIP_REST - CW_ANKLE)
def cw_from(r):
    k = CW_K
    def foot(s):
        x, fw, _ = r[f"foot{s}"]
        return (x * k, -fw * k, GZ + (0 if r[f"plant{s}"] else r[f"lift{s}"] * k), 0)
    hx, hf, hz = r["handL"]
    return D(CWB, hip=(0.0, 0.0, GZ + (r["hip_z"] - CW_ANKLE) * k - 0.005), hipPitch=r["hip_pitch"], spine=(r["spine1"] * 0.55, r["spine1"] * 0.45),
             neck=4, head=(18, r["neck"] * 0.55 + 24), footL=foot("L"), footR=foot("R"), plantL=r["plantL"], plantR=r["plantR"],
             # polos lejos y por encima de la rodilla en cuclillas profundas (a 0,35 m el plano del IK se invertía al pasar el pie)
             kneeL=(r["footL"][0] + 0.05, -1.5, 0.6), kneeR=(r["footR"][0] - 0.05, -1.5, 0.6),
             handL=(hx * 0.8 * k, -hf * k, GZ + (hz - CW_ANKLE) * k))
clip("SK_CrouchWalk", [(round(r["u"] * CW_FRAMES), cw_from(r)) for r in CROUCH_CURVES["samples"][::2]],
     natural_speed=round(sum(CROUCH_CURVES["plant_travel_m"].values()) * CW_K / (CW_FRAMES / SRC_FPS), 3),
     source="trayectorias de Quaternius UAL Crouch_Fwd_Loop (CC0) resueltas con IK de ANMI + carry", leg_scale=round(CW_K, 3))
bake_clip("SK_CrouchWalk", *CLIPS["SK_CrouchWalk"]); print("CLIP", "SK_CrouchWalk")
# V5 T5-19 (SOL 87, OPUS a07): AGACHADA QUIETA. El ciclo agachado no tiene fase de doble apoyo (el pie en suspensión más bajo
# sigue a 3 cm, u ≈ 0,78), así que congelarlo dejaba un pie en el aire: pose propia con los DOS pies plantados (calibrados al
# suelo) y una respiración leve; el juego funde a ella por debajo de 0,1 m/s.
CWI = D(CWB, footL=(0.13, -0.02, GZ, 0), footR=(-0.13, 0.04, GZ, 0), freeL=1, freeR=1, plantL=True, plantR=True)
clip("SK_CrouchIdle", [(0, CWI), (40, D(CWI, hip=(0.0, 0.0, 0.632), spine=(27, 15))), (80, CWI)], source="V5 T5-19: pose agachada con doble apoyo")
bake_clip("SK_CrouchIdle", *CLIPS["SK_CrouchIdle"]); print("CLIP", "SK_CrouchIdle")
# V5 T5-19 (OPUS-008): TROTE con tabla en la mano, ciclo procedural con IK (pies plantados, sin deslizar a 3 m/s):
# 2 pasos de 1,05 m en 0,70 s (2,86 pasos/s), apoyo 38 % del ciclo de cada pie, rebote de cadera, inclinación, brazo
# izquierdo libre en oposición a la pierna izquierda; el derecho lleva la tabla.
JOG_T, JOG_STANCE, JOG_HALF = 21, 0.38, 0.40
JOGB = D(GROUND, carry=True, hip=(0.0, 0.0, 0.90), hipPitch=8, spine=(10, 6), neck=-4, head=(6, -8))
def _jog_foot(u, x):
    if u < JOG_STANCE:
        k = u / JOG_STANCE; return dict(pos=(x, -JOG_HALF + 2 * JOG_HALF * k, GZ, 0), plant=True)
    k = (u - JOG_STANCE) / (1 - JOG_STANCE)
    y = JOG_HALF - 2 * JOG_HALF * (0.5 - 0.5 * math.cos(math.pi * k)); lift = 0.26 * math.sin(math.pi * k) ** 0.8
    return dict(pos=(x, y, GZ + lift, 0), plant=False, tilt=18 * math.sin(math.pi * min(1, k * 1.6)))
def _jog_key(f):
    u = f / JOG_T; L = _jog_foot(u, 0.10); R_ = _jog_foot((u + 0.5) % 1.0, -0.10)
    ph = 2 * math.pi * (u - JOG_STANCE / 2) * 2
    return D(JOGB, hip=(0.0, 0.0, 0.905 - 0.03 * math.cos(ph)), hipYaw=6 * math.sin(2 * math.pi * u),
             footL=L["pos"], plantL=L["plant"], freeL=1, tiltL=L.get("tilt", 0), footR=R_["pos"], plantR=R_["plant"], freeR=1, tiltR=R_.get("tilt", 0),
             kneeL=(0.10, -0.9, 0.55), kneeR=(-0.10, -0.9, 0.55),
             handL=(0.26, -0.05 + 0.20 * math.cos(2 * math.pi * u), 0.90 + 0.08 * (1 - math.cos(2 * math.pi * u)) / 2), elbowL=(0.5, 0.45, 1.0))
clip("SK_JogBoard", [(f, _jog_key(f)) for f in range(JOG_T + 1)], natural_speed=3.0,
     source="V5 T5-19: ciclo de trote procedural con IK de ANMI + carry (zancada 1,05 m, 2,86 pasos/s a 3 m/s)")
bake_clip("SK_JogBoard", *CLIPS["SK_JogBoard"]); print("CLIP", "SK_JogBoard")
for name, crouch in (("SK_WalkBoard", False),):
    _, frames = bake_walk(name, crouch)
    META[name] = dict(loop=True, frames=frames, seconds=frames / FPS, source="Walking propio de ANMI (biped zip) en el sitio + carry IK",
                      natural_speed=1.4 if not crouch else 0.9)
    print("CLIP", name)

# V5 (usuario, 12 oct): SENTADA en el banco de NO ME GUILLO (asiento 0,45 m, game/src/world/nmg_kit.json → bench.seat).
# Pose propia de ANMI con IK (no donante): tronco erguido y relajado, muslos sobre el asiento, pies planos en el suelo, manos
# en los muslos y la tabla tumbada en el banco a su derecha (ruedas sobre el asiento). La altura de cadera se CALIBRA en el
# cuerpo deformado: el apoyo bajo la pelvis queda 1,8 cm sobre el asiento (el pantalón ancho cuelga por delante y no debe
# hundirse en el tablero; R1-G8 b2: con +3 mm el bajo entraba 5 cm en el canto). Respiración leve en bucle.
SIT_SEAT = 0.45
SIT = D(GROUND, carry=False, hip=(0.0, 0.0, 0.60), hipPitch=-6, spine=(8, 4), neck=2, head=(0, -4),
        footL=(0.15, -0.44, GZ, 0), footR=(-0.15, -0.44, GZ, 0), freeL=1, freeR=1, plantL=True, plantR=True,
        kneeL=(0.18, -1.2, 0.9), kneeR=(-0.18, -1.2, 0.9),
        handL=(0.20, -0.27, 0.75), handR=(-0.20, -0.27, 0.75), elbowL=(0.44, 0.02, 0.92), elbowR=(-0.44, 0.02, 0.92),   # sobre los muslos, no dentro del pantalón
        board=(-0.62, 0.0, SIT_SEAT + 0.003, 0, 0, 90))
_gi = {g.index: g.name for g in body.vertex_groups}
_dom = {}
for _v in body.data.vertices:
    _best = max(_v.groups, key=lambda g: g.weight, default=None)
    if _best is not None: _dom[_v.index] = _gi[_best.group]
SEAT_IDS = np.array([i for i, n in _dom.items() if n.endswith("Hips") or n.endswith("UpLeg")], dtype=int)
def _seat_low(P):
    tmp = bpy.data.actions.new("_sit_probe"); assign(arm, tmp)
    for e in CTRL.values(): e.animation_data_clear()
    set_ik_influence(1.0, 0, bones=("mixamorig:LeftLeg", "mixamorig:RightLeg"))
    pose(0, clip_name="SK_SitBench", **P); bpy.context.view_layer.update()
    # apoyo = lo que queda JUSTO bajo la pelvis (y −0,05…0,16, |x| < 0,2) y percentil 3: los pantalones anchos cuelgan por
    # delante del muslo y su mínimo no es el apoyo real (en el banco la tela se aplasta)
    co = eval_body()[SEAT_IDS]; co = co[(co[:, 1] > -0.05) & (co[:, 1] < 0.16) & (np.abs(co[:, 0]) < 0.2)]
    z = float(np.percentile(co[:, 2], 3)); bpy.data.actions.remove(tmp); return z
SIT_FIT = []
for _it in range(4):
    _z = _seat_low(SIT); SIT_FIT.append((round(SIT["hip"][2], 4), round(_z, 4)))
    SIT = D(SIT, hip=(SIT["hip"][0], SIT["hip"][1], SIT["hip"][2] + 0.8 * (SIT_SEAT + 0.018 - _z)))
print("SIT_FIT", SIT_FIT, "hip", round(SIT["hip"][2], 4))
SIT_B = D(SIT, hip=(SIT["hip"][0], SIT["hip"][1] + 0.004, SIT["hip"][2] + 0.003), spine=(10, 5), head=(2, -6))
clip("SK_SitBench", [(0, SIT), (45, SIT_B), (90, SIT)], seat=SIT_SEAT, sit_fit=SIT_FIT,
     source="V5: pose sentada propia de ANMI (IK), asiento 0,45 m del banco NMG, tabla en el banco a su derecha")
bake_clip("SK_SitBench", *CLIPS["SK_SitBench"]); print("CLIP", "SK_SitBench")

(CACHE / "ANMI_V3_contact.json").write_text(json.dumps(CONTACT_LOG, indent=0))
(CACHE / "ANMI_V5_walk_lift.json").write_text(json.dumps({"sole_rest_yaw": SOLE_REST_YAW, "foot_fix": FOOT_FIX, "toe_out": TOE_OUT, "walk_lift_mm": WALK_LIFT_LOG}, indent=0))
# ------------------------------------------------------------------ rig editable (antes de limpiar)
assign(arm, bpy.data.actions["SK_Ride"])
bpy.context.scene.frame_set(0)
CACHE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(CACHE / "ANMI_RIG_EDIT.blend"), copy=True)
print("EDIT_RIG_SAVED")

# ------------------------------------------------------------------ vista previa (hojas de poses)
if PREVIEW:
    for c in list(pb):
        for k in list(c.constraints):
            c.constraints.remove(k)
    out = CACHE / "preview_v3"; out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"; scn.render.resolution_x = 300; scn.render.resolution_y = 360
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("W"); scn.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.8, 0.86, 1)
    bpy.ops.mesh.primitive_plane_add(size=6); fl = bpy.context.object
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(30))); bpy.context.object.data.energy = 3
    cam_d = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cam_d); scn.collection.objects.link(cam); scn.camera = cam
    cam_d.type = "ORTHO"; cam_d.ortho_scale = 2.2
    prop.hide_render = True
    views = {"side": Vector((-4, 0, 1.0)), "front": Vector((0, -4, 1.0)), "q": Vector((-3, -3, 2.2))}
    only = [a for a in sys.argv if a.startswith("only=")]
    names = only[0][5:].split(",") if only else list(CLIPS) + ["SK_WalkBoard"]
    for name in names:
        act = bpy.data.actions[name]; assign(arm, act)
        fr = int(act.frame_range[1])
        for vk, pos in views.items():
            cam.location = pos
            cam.rotation_euler = (Vector((0, 0, 0.8)) - pos).to_track_quat("-Z", "Y").to_euler()
            for i, f in enumerate(sorted({0, fr // 4, fr // 2, (3 * fr) // 4, fr})):
                scn.frame_set(f)
                scn.render.filepath = str(out / f"{name}_{vk}_{i}.png")
                bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(fl, do_unlink=True)
    print("PREVIEW_DONE")

# ------------------------------------------------------------------ exportar
for c in list(pb):
    for k in list(c.constraints):
        c.constraints.remove(k)
for e in CTRL.values():
    bpy.data.objects.remove(e, do_unlink=True)
for b in pb:
    b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0)
# ------------------------------------------------------------------ alcance del grab (EXT-03): mano izquierda en el canto
assign(arm, bpy.data.actions["SK_Grab"])
GRAB_REACH = []
for f in (0, 12, 24, 36, 48):
    bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
    hand = arm.matrix_world @ pb["mixamorig:LeftHand"].matrix.translation
    bmw = arm.matrix_world @ pb["Board"].matrix @ REST["Board"].to_3x3().to_4x4().inverted() @ Matrix.Translation((0, 0, -PIVOT_Z))
    GRAB_REACH.append(round(((bmw @ Vector(GRAB["grabL"])) - hand).length, 3))
print("GRAB_REACH_M", GRAB_REACH)
assert max(GRAB_REACH) < 0.06, f"SK_Grab: la mano no llega al canto de la tabla ({max(GRAB_REACH)} m)"

# ------------------------------------------------------------------ bailes: suelo (ANIM-06)
# Las fuentes ya atraviesan el suelo en su propio archivo (Hip_Hop_1 −6 cm constante, Step −9,6, Breakdance −1,27 m: giro
# invertido sobre una mano hundido entero). Por fotograma se mide el punto más bajo del cuerpo deformado y se SUBE la
# cadera solo lo necesario (nunca se baja: saltos y alturas de pelvis se conservan). Máximo móvil ±6 f + media ±4 f:
# la corrección nunca queda por debajo de lo necesario y no tiembla; en bucles la ventana da la vuelta.
DANCE_CLEAR = 0.002
DANCE_FIX = {}
HIPS_RINV = REST["mixamorig:Hips"].to_3x3().inverted()
BOARD_RINV = REST["Board"].to_3x3().inverted()
# SK_WalkBoard también: sus piernas son las del Walking original (sin IK), que hunde la punta 4–5 cm en su propio archivo
# (V4-ANIM-03: probado y RETIRADO incluir SK_GetUp/SK_ImpactLand aquí: en clips horneados con IK la medida de este paso no
# coincide con el GLB exportado y la tumbada quedaba flotando 47 cm; su contacto con el suelo lo corrige el runtime, anmi.ts)
for d in DANCES + ["SK_WalkBoard"]:
    act = bpy.data.actions[d]; assign(arm, act)
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    frames = list(range(f0, f1 + 1)); n = len(frames)
    need = []
    for f in frames:
        bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
        need.append(max(0.0, DANCE_CLEAR - float(eval_body()[:, 2].min())))
    seamless = d in ("Step_Hip_Hop_Dance", "Breakdance_1990", "SK_WalkBoard")
    def at(arr, i): return arr[i % (n - 1)] if seamless else arr[min(max(i, 0), n - 1)]
    if d == "SK_WalkBoard":
        # V4-ANIM-02: anclaje al suelo por fotograma EN AMBOS SENTIDOS. El máximo móvil de los bailes (solo sube) elevaba
        # toda la vecindad cuando la punta se hundía un instante y la marcha flotaba ~3 cm en juego (anim-v4). Al andar
        # siempre hay un pie en el suelo: se lleva el punto más bajo a DANCE_CLEAR en cada fotograma (media cíclica ±2 f).
        signed = []
        for f in frames:
            bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
            signed.append(DANCE_CLEAR - float(eval_body()[:, 2].min()))
        lift = [sum(at(signed, i + j) for j in range(-2, 3)) / 5 for i in range(n)]
    else:
        mx = [max(at(need, i + j) for j in range(-6, 7)) for i in range(n)]
        lift = [sum(at(mx, i + j) for j in range(-4, 5)) / 9 for i in range(n)]
    # la tabla (hueso sin padre, en espacio de armadura) sube con la cadera para no separarse de la mano en SK_WalkBoard
    grip0 = None
    if d == "SK_WalkBoard":
        bpy.context.scene.frame_set(f0); bpy.context.view_layer.update()
        grip0 = (pb["mixamorig:RightHand"].matrix.translation - pb["Board"].matrix.translation).copy()
    for fc in fcurves_of(act):
        rinv = HIPS_RINV if fc.data_path == 'pose.bones["mixamorig:Hips"].location' else BOARD_RINV if fc.data_path == 'pose.bones["Board"].location' else None
        if rinv is None:
            continue
        for kp in fc.keyframe_points:
            i = min(max(int(round(kp.co[0])) - f0, 0), n - 1)
            dv = (rinv @ Vector((0, 0, lift[i])))[fc.array_index]
            kp.co[1] += dv; kp.handle_left[1] += dv; kp.handle_right[1] += dv
        fc.update()
    if grip0 is not None:
        bpy.context.scene.frame_set(f0); bpy.context.view_layer.update()
        drift = (pb["mixamorig:RightHand"].matrix.translation - pb["Board"].matrix.translation - grip0).length
        assert drift < 0.003, f"SK_WalkBoard: la mano se separa de la tabla {drift:.3f} m tras la corrección de suelo"
        print("WALK_GRIP_DRIFT_M", round(drift, 4))
    after = []
    for f in frames[::3]:
        bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
        after.append(float(eval_body()[:, 2].min()))
    DANCE_FIX[d] = dict(ground_min_before_mm=round(-max(need) * 1000 + DANCE_CLEAR * 1000, 1), lift_max_m=round(max(lift), 3),
                        lift_mean_m=round(sum(lift) / n, 3), ground_min_after_mm=round(min(after) * 1000, 1))
    if d == "SK_WalkBoard":
        # suelo tras el anclaje (todos los fotogramas) y velocidad natural MEDIDA: el pie más bajo retrocede respecto al
        # cuerpo a la velocidad de la marcha mientras apoya (frente = −Y de Blender)
        gi_ = {g.name: g.index for g in body.vertex_groups}
        foot_g = {gi_[k] for k in gi_ if ("Foot" in k or "ToeBase" in k)}
        domg = np.full(len(body.data.vertices), -1); wmax = np.zeros(len(body.data.vertices))
        for v in body.data.vertices:
            for g in v.groups:
                if g.weight > wmax[v.index]: wmax[v.index] = g.weight; domg[v.index] = g.group
        fidx = np.array([i for i, gg in enumerate(domg) if gg in foot_g], dtype=int)
        lows, pts = [], []
        for f in frames:
            bpy.context.scene.frame_set(f); bpy.context.view_layer.update(); co = eval_body()
            lows.append(float(co[:, 2].min())); fc_ = co[fidx]; k = int(np.argmin(fc_[:, 2])); pts.append(fc_[k].copy())
        vy = [(pts[i + 1][1] - pts[i][1]) * FPS for i in range(n - 1) if lows[i] < DANCE_CLEAR + 0.006 and lows[i + 1] < DANCE_CLEAR + 0.006 and np.linalg.norm(pts[i + 1][:2] - pts[i][:2]) < 0.05]
        WALK_NATURAL = round(float(np.median(vy)), 3) if len(vy) >= 6 else None
        DANCE_FIX[d].update(ground_after_p50_mm=round(float(np.median(lows)) * 1000, 1), ground_after_max_mm=round(max(lows) * 1000, 1),
                            natural_speed_measured=WALK_NATURAL, contact_samples=len(vy))
    print("DANCE_FIX", d, DANCE_FIX[d])
assign(arm, bpy.data.actions["SK_Idle"])
bpy.context.scene.frame_set(0)
prop.hide_set(False); prop.hide_render = False
bpy.ops.object.select_all(action="DESELECT")
for o in (arm, body, deck, prop, shadow):
    o.select_set(True)
KEEP = set(CLIPS) | set(DANCES) | {"SK_WalkBoard"}
for a in list(bpy.data.actions):
    if a.name not in KEEP:
        bpy.data.actions.remove(a)
bpy.ops.export_scene.gltf(filepath=str(CACHE / "ANMI_GAME.glb"), export_format="GLB", use_selection=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                          export_frame_range=False, export_optimize_animation_size=True, export_yup=True,
                          export_apply=False, export_extras=True, export_skins=True, export_def_bones=False)
bpy.ops.wm.save_as_mainfile(filepath=str(CACHE / "ANMI_GAME.blend"))
for d in DANCES:
    META[d] = dict(loop=d in ("Step_Hip_Hop_Dance", "Breakdance_1990"), source="dance", seconds=round((bpy.data.actions[d].frame_range[1] - bpy.data.actions[d].frame_range[0]) / FPS, 3), ground=DANCE_FIX[d])
META["Breakdance_1990"]["fragment"] = "giro invertido sobre una mano (0,5 s, bucle limpio) sin entrada ni salida: reparado (hundido 1,27 m) y conservado como fragmento; no se asigna a celebraciones"
if DANCE_FIX.get("SK_WalkBoard", {}).get("natural_speed_measured"):
    META["SK_WalkBoard"]["natural_speed"] = DANCE_FIX["SK_WalkBoard"]["natural_speed_measured"]   # V4: medida, no 1,4 supuesto
    META["SK_WalkBoard"]["natural_speed_v3_assumed"] = 1.4
(CACHE / "ANMI_GAME.clips.json").write_text(json.dumps({"fps": FPS, "deck_top": DECK_TOP, "ankle_over_sole": ANKLE, "board_pivot_z": PIVOT_Z,
                                                         "board": str(BOARD_GLB.relative_to(ROOT)), "clips": META}, indent=1))
print("CHAR_DONE", sorted(a.name for a in bpy.data.actions))
