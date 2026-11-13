"""ANMI de juego (remake): un solo personaje con rig + bailes + tabla como hueso + biblioteca de skate v2.

    blender -b -P game/tools/build_character.py              # .cache/ANMI_GAME.glb, ANMI_GAME.blend,
                                                             # ANMI_RIG_EDIT.blend (rig editable IK/FK) y clips.json
    blender -b -P game/tools/build_character.py -- preview   # además hojas de poses en .cache/preview/

Fuentes (no se modifican): assets/source/character/Meshy_AI_Urban_Skater_Kid_biped.zip y dance/*.glb.
Versión anterior (plantas) conservada en baseline_plantas_2026-10-07/game/tools/build_character.py.

Convención: Blender Z arriba, marcha hacia -Y (= +Z glTF), postura regular: pie izquierdo delante (nariz, -Y),
pecho hacia -X (lado de puntera = derecha de la marcha). Unidades en metros.

Cambios frente a la versión de plantas (motivo medido o visto en el baseline):
- Contacto: el tobillo queda a 0,20 m de la suela (rig.json); la cubierta está a 0,091 m. El tobillo va a 0,293 m sobre la
  tabla (antes 0,27 m: 2 cm de suela dentro del deck).
- Pitch de tabla con signo correcto (nariz arriba +) y pivote en el eje trasero: el pop levanta la nariz (antes bajaba).
- Brazos relajados y asimétricos (antes casi en T en todos los clips).
- Fases explícitas: push (apoyo 0.31–0.69), pop (despegue en 0.17), catch, absorción; se exportan en clips.json.
- Nuevos clips: carve izq/der con roll de tabla, freno de pie, agachado patinando, pop, catch, aterrizaje suave/fuerte,
  backflip (crouch/tuck/apertura), kickflip/shove-it con pies liberados, 50-50 (P1) y Breakdance_1990.
- Donantes del mismo esqueleto (ZIP biped de ANMI): Run_and_Jump (mortal agrupado) aporta brazos/columna del tuck;
  Vault_and_Land aporta la absorción de brazos/columna del aterrizaje fuerte. Transferencia directa de rotaciones
  locales (mismo rig); piernas y tabla siguen gobernadas por IK sobre el deck.
- Se guarda ANMI_RIG_EDIT.blend con constraints IK/FK, empties de control y una acción de control por clip.
"""
import bpy
import json
import math
import sys
import zipfile
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parent
CACHE = GAME / ".cache"
BIPED = ROOT / "assets/source/character/Meshy_AI_Urban_Skater_Kid_biped.zip"
DANCE = ROOT / "assets/source/character/dance"
TEX = ROOT / "environments/textures"
PREVIEW = "preview" in sys.argv
FPS = 30

DANCES = ["Step_Hip_Hop_Dance", "Hip_Hop_Dance_1", "Hip_Hop_Dance_2", "Hip_Hop_Dance_3", "FunnyDancing_02", "Breakdance_1990"]
DONORS = ["Run_and_Jump", "Vault_and_Land"]

DECK_TOP = 0.091      # cara superior del deck sobre el plano de ruedas
ANKLE = 0.200         # tobillo sobre suela (medido en rig.json)
FZ = DECK_TOP + ANKLE + 0.002
GZ = ANKLE + 0.004    # tobillo con el pie apoyado en el suelo


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
bpy.context.scene.render.fps = FPS
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
bpy.ops.outliner.orphans_purge(do_recursive=True)

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


# ------------------------------------------------------------------ hueso de la tabla + malla del deck
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones.new("Board")
eb.head = (0, 0, 0.0); eb.tail = (0, -0.3, 0.0)  # a lo largo de la tabla (hacia la nariz, -Y)
eb.use_deform = True
bpy.ops.object.mode_set(mode="OBJECT")

L_DECK, W_DECK, T_DECK = 0.80, 0.215, 0.016


def kick(y):
    e = abs(y) - (L_DECK / 2 - 0.13)
    return max(0.0, e) ** 1.5 * 2.6


def make_deck():
    import bmesh
    L, W, T = L_DECK, W_DECK, T_DECK
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    prof = []
    for i in range(14):
        a = math.pi + i / 13 * math.pi
        prof.append((math.cos(a) * W / 2, -L / 2 + W / 2 + math.sin(a) * W / 2))
    for i in range(14):
        a = i / 13 * math.pi
        prof.append((math.cos(a) * W / 2, L / 2 - W / 2 + math.sin(a) * W / 2))
    z0 = 0.075
    bot = [bm.verts.new((x, y, z0 + kick(y))) for x, y in prof]
    top = [bm.verts.new((x, y, z0 + T + kick(y))) for x, y in prof]
    fb = bm.faces.new(list(reversed(bot))); ft = bm.faces.new(top)
    n = len(prof)
    sides = [bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])) for i in range(n)]
    for f in [fb, ft] + sides:
        for lp in f.loops:
            x, y = lp.vert.co.x, lp.vert.co.y
            lp[uv].uv = ((y + L / 2) / L, (x + W / 2) / W)
    ft.material_index = 1
    for f in sides:
        f.material_index = 2

    def box(c, s, mi):
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=s, verts=r["verts"]); bmesh.ops.translate(bm, vec=c, verts=r["verts"])
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = mi

    def cyl(c, rad, depth, mi):
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=rad, radius2=rad, depth=depth,
                                  matrix=Matrix.Translation(c) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = mi; f.smooth = True
    for sy in (-0.25, 0.25):
        box((0, sy, 0.058), (0.17, 0.05, 0.03), 3)
        box((0, sy, 0.045), (0.05, 0.05, 0.03), 3)
        for sx in (-0.088, 0.088):
            cyl((sx, sy, 0.028), 0.028, 0.032, 4)
    me = bpy.data.meshes.new("DECK")
    bm.to_mesh(me)

    def m(name, color=None, tex=None, rough=0.6, metal=0.0):
        mt = bpy.data.materials.new(name); mt.use_nodes = True
        b = mt.node_tree.nodes["Principled BSDF"]
        if color:
            b.inputs["Base Color"].default_value = color
        b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
        if tex:
            t = mt.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(str(tex))
            mt.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
        return mt
    me.materials.append(m("M_deck_graphic", tex=TEX / "T_deck_bottom_PROVISIONAL.png"))
    me.materials.append(m("M_deck_grip", color=(0.05, 0.03, 0.03, 1), rough=0.95))
    me.materials.append(m("M_deck_edge", color=(0.85, 0.3, 0.45, 1)))
    me.materials.append(m("M_truck", color=(0.95, 0.62, 0.74, 1), rough=0.35, metal=0.5))
    me.materials.append(m("M_wheel", color=(0.95, 0.92, 0.85, 1), rough=0.5))
    return me


deck_me = make_deck()
deck = bpy.data.objects.new("DECK", deck_me)
bpy.context.scene.collection.objects.link(deck)
deck.parent = arm
vg = deck.vertex_groups.new(name="Board")
vg.add(list(range(len(deck_me.vertices))), 1.0, "REPLACE")
mod = deck.modifiers.new("Armature", "ARMATURE"); mod.object = arm
prop = bpy.data.objects.new("DECK_PROP", deck_me.copy())  # tabla aparcada (baile/final)
# proxy de sombra: copia diezmada del cuerpo con los mismos grupos/esqueleto; solo se dibuja en el mapa de sombras
shadow = body.copy(); shadow.data = body.data.copy(); shadow.name = "ANMI_SHADOW"
bpy.context.scene.collection.objects.link(shadow)
dec = shadow.modifiers.new("Decimate", "DECIMATE"); dec.ratio = 0.1; dec.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = shadow
while shadow.modifiers[0].name != "Decimate":
    bpy.ops.object.modifier_move_up(modifier="Decimate")
bpy.ops.object.modifier_apply(modifier="Decimate")
shadow.data.materials.clear()
bpy.context.scene.collection.objects.link(prop)

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
for side in "LR":
    c = pb[f"mixamorig:{'Left' if side == 'L' else 'Right'}Foot"].constraints.new("COPY_ROTATION")
    c.name = "FootRot"
    c.target = CTRL[f"Rot_Foot{side}"]; c.owner_space = "WORLD"; c.target_space = "WORLD"

FOOT_REST_ROT = {s: (arm.matrix_world @ REST[f"mixamorig:{'Left' if s == 'L' else 'Right'}Foot"]).to_quaternion() for s in "LR"}
FK = ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head", "Board"]
ARM_BONES = {s: [f"mixamorig:{s}Shoulder", f"mixamorig:{s}Arm", f"mixamorig:{s}ForeArm", f"mixamorig:{s}Hand"] for s in ("Left", "Right")}
DONOR_TORSO = ["mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head"]


def Rz(d): return Matrix.Rotation(math.radians(d), 4, "Z")
def Rx(d): return Matrix.Rotation(math.radians(d), 4, "X")
def Ry(d): return Matrix.Rotation(math.radians(d), 4, "Y")


def rotate_about_head(bone, R):
    m = pb[bone].matrix.copy()
    h = m.to_translation()
    pb[bone].matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ m
    bpy.context.view_layer.update()


def board_matrix(b):
    """b = (x, y, z, pitch, roll, yaw). Nariz arriba = pitch +. Roll + = canto de puntera (−X) arriba.
    Pivote del pitch: eje trasero si pitch > 0 (pop de cola), eje delantero si < 0."""
    x, y, z, pitch, roll, yaw = (tuple(b) + (0, 0, 0, 0, 0, 0))[:6]
    piv = Vector((0, 0.25 if pitch > 0 else -0.25, 0))
    P = Matrix.Translation(piv) @ Rx(-pitch) @ Matrix.Translation(-piv)
    return Matrix.Translation((x, y, z)) @ Rz(yaw) @ P @ Ry(-roll)


DEFAULT = dict(
    hip=(0.02, 0.02, 0.90), hipYaw=-90, hipLean=0, hipPitch=0,
    spine=(12, 6), chestTwist=16, neck=20, head=(28, -12),
    # pies: (x, y, z, yaw) en espacio de tabla si están apoyados; con freeX=1 en mundo
    footL=(0.06, -0.19, FZ, -78), footR=(0.06, 0.24, FZ, -100),
    kneeL=(-0.9, -0.35, 0.55), kneeR=(-0.9, 0.5, 0.55),
    handL=(-0.16, -0.30, 0.84), handR=(0.02, 0.38, 0.80),
    elbowL=(0.35, -0.6, 1.05), elbowR=(0.4, 0.75, 1.0),
    board=(0, 0, 0, 0, 0, 0),
    armIK=1.0, donor=None,
)


def set_ik_influence(v, frame):
    for bone in ("mixamorig:LeftForeArm", "mixamorig:RightForeArm"):
        IKC[bone].influence = v
        pb[bone].constraints["IK"].keyframe_insert("influence", frame=frame)


def pose(frame, **kw):
    P = dict(DEFAULT); P.update(kw)
    scn = bpy.context.scene; scn.frame_set(frame)
    for b in FK + ARM_BONES["Left"] + ARM_BONES["Right"]:
        pb[b].location = (0, 0, 0); pb[b].rotation_mode = "QUATERNION"; pb[b].rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    hip = pb["mixamorig:Hips"]
    R0 = REST["mixamorig:Hips"].to_3x3().to_4x4()
    yaw = math.radians(P["hipYaw"])
    lat = Vector((math.cos(yaw), math.sin(yaw), 0))   # eje lateral del cuerpo (hacia la izquierda del jinete = nariz)
    fwd = Vector((-math.sin(yaw), math.cos(yaw), 0)) * -1  # hacia el pecho
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
    if donor:  # transferencia directa de rotaciones locales (mismo esqueleto)
        name, dframe, torso = donor
        bones = ARM_BONES["Left"] + ARM_BONES["Right"] + (DONOR_TORSO if torso else [])
        for b in bones:
            q = donor_quat(name, b, dframe)
            if q is not None:
                pb[b].rotation_quaternion = q
        bpy.context.view_layer.update()
    pb["Board"].matrix = board_matrix(P["board"]) @ REST["Board"].to_3x3().to_4x4()
    bpy.context.view_layer.update()
    for b in FK + (ARM_BONES["Left"] + ARM_BONES["Right"] if donor else []):
        pb[b].keyframe_insert("location", frame=frame); pb[b].keyframe_insert("rotation_quaternion", frame=frame)
    if not donor:
        for b in ARM_BONES["Left"] + ARM_BONES["Right"]:
            pb[b].keyframe_insert("rotation_quaternion", frame=frame)
    set_ik_influence(0.0 if donor else P["armIK"], frame)
    bm_ = board_matrix(P["board"])
    brot = bm_.to_3x3().to_4x4()
    for s in "LR":
        fx, fy, fz, fyaw = P[f"foot{s}"]
        onboard = not P.get(f"free{s}")
        if onboard:
            p = bm_ @ Vector((fx, fy, fz + kick(fy)))
            q = (brot @ Rz(fyaw)).to_quaternion() @ FOOT_REST_ROT[s]
        else:
            p = Vector((fx, fy, fz))
            tilt = P.get(f"tilt{s}", 0)  # punta del pie (empuje)
            q = (Rz(fyaw) @ Rx(tilt)).to_quaternion() @ FOOT_REST_ROT[s]
        CTRL[f"IK_Foot{s}"].location = p
        CTRL[f"Rot_Foot{s}"].rotation_mode = "QUATERNION"; CTRL[f"Rot_Foot{s}"].rotation_quaternion = q
        CTRL[f"Pole_Knee{s}"].location = P[f"knee{s}"]
        CTRL[f"IK_Hand{s}"].location = P[f"hand{s}"]
        CTRL[f"Pole_Elbow{s}"].location = P[f"elbow{s}"]
        for n in (f"IK_Foot{s}", f"Pole_Knee{s}", f"IK_Hand{s}", f"Pole_Elbow{s}"):
            CTRL[n].keyframe_insert("location", frame=frame)
        CTRL[f"Rot_Foot{s}"].keyframe_insert("rotation_quaternion", frame=frame)


def D(base, **kw):
    out = dict(base); out.update(kw); return out


CLIPS = {}
META = {}


def clip(name, keys, loop=True, **meta):
    CLIPS[name] = (keys, loop)
    META[name] = dict(loop=loop, frames=keys[-1][0], seconds=keys[-1][0] / FPS, **meta)


# ------------------------------------------------------------------ biblioteca de skate v2
RIDE = dict()
STAND = dict(hip=(0.02, 0.02, 0.93), spine=(8, 4), chestTwist=12, neck=18, handL=(-0.08, -0.26, 0.80), handR=(0.06, 0.32, 0.78),
             elbowL=(0.4, -0.5, 1.1), elbowR=(0.45, 0.6, 1.05))
clip("SK_Idle", [(0, STAND), (30, D(STAND, hip=(0.025, 0.035, 0.918), spine=(10, 5), head=(30, -14))), (60, STAND)])
clip("SK_Ride", [
    (0, RIDE),
    (10, D(RIDE, hip=(0.025, 0.02, 0.885), handL=(-0.18, -0.33, 0.86), handR=(0.03, 0.40, 0.79))),
    (20, D(RIDE, hip=(0.015, 0.025, 0.895), handL=(-0.14, -0.29, 0.83), handR=(0.01, 0.37, 0.81))),
    (40, RIDE)])
# carve: derecha de la marcha = puntera (pecho, −X); izquierda = talones
TOE = dict(hip=(-0.05, 0.02, 0.86), board=(0, 0, 0, 0, 9, 0), spine=(20, 8), hipLean=6, chestTwist=10,
           kneeL=(-1.0, -0.3, 0.5), kneeR=(-1.0, 0.45, 0.5), handL=(-0.30, -0.36, 0.86), handR=(-0.12, 0.42, 0.74),
           elbowL=(0.1, -0.7, 1.1), elbowR=(0.25, 0.8, 1.0))
HEEL = dict(hip=(0.10, 0.02, 0.86), board=(0, 0, 0, 0, -9, 0), spine=(4, 2), hipLean=-6, chestTwist=22, head=(32, -6),
            kneeL=(-0.6, -0.5, 0.65), kneeR=(-0.6, 0.6, 0.65), handL=(-0.36, -0.42, 0.96), handR=(-0.24, 0.30, 0.90),
            elbowL=(0.3, -0.75, 1.2), elbowR=(0.35, 0.75, 1.15))
clip("SK_CarveR", [(0, TOE), (15, D(TOE, hip=(-0.055, 0.02, 0.85))), (30, TOE)])
clip("SK_CarveL", [(0, HEEL), (15, D(HEEL, hip=(0.105, 0.02, 0.855))), (30, HEEL)])
# agachado patinando: cabeza ≲ 1,05 m para caber en la cápsula baja (1,10 m)
CROUCH = dict(hip=(0.04, 0.03, 0.60), hipPitch=22, spine=(30, 18), chestTwist=8, neck=-4, head=(26, -34),
              kneeL=(-1.0, -0.45, 0.45), kneeR=(-1.0, 0.55, 0.45),
              handL=(-0.36, -0.30, 0.52), handR=(-0.28, 0.36, 0.48), elbowL=(0.0, -0.6, 0.9), elbowR=(0.05, 0.7, 0.85))
clip("SK_CrouchRide", [(0, CROUCH), (20, D(CROUCH, hip=(0.04, 0.03, 0.585))), (40, CROUCH)])
# freno de pie: el pie trasero baja a raspar junto a la cola, peso en el delantero
BRAKE = dict(hip=(0.0, -0.05, 0.86), spine=(4, 2), chestTwist=30, neck=10, head=(26, 4), hipLean=-8,
             footL=(0.04, -0.17, FZ, -40), kneeL=(-0.7, -0.6, 0.55),
             footR=(0.20, 0.40, GZ + 0.01, -60), freeR=1, kneeR=(-0.4, 0.9, 0.5),
             handL=(-0.30, -0.42, 0.95), handR=(0.10, 0.52, 0.92), elbowL=(0.2, -0.8, 1.1), elbowR=(0.45, 0.8, 1.1))
clip("SK_Brake", [(0, BRAKE), (6, D(BRAKE, footR=(0.21, 0.42, GZ + 0.005, -62))), (12, BRAKE)])
# impulso (ciclo = TUNING.pushCycle 0.85 s ≈ 26 fotogramas): apoyo del pie trasero 8→18 (0.31–0.69)
PB = dict(hipYaw=-60, chestTwist=8, neck=12, head=(22, -2), footL=(0.02, -0.16, FZ, -22), kneeL=(-0.4, -0.95, 0.55),
          hip=(-0.02, -0.08, 0.86), handL=(-0.20, -0.36, 0.86), handR=(0.14, 0.30, 0.82), elbowL=(0.2, -0.7, 1.1), elbowR=(0.5, 0.6, 1.0))
clip("SK_Push", [
    (0, D(PB, footR=(0.06, 0.24, FZ, -100), hip=(0.0, -0.04, 0.89))),
    (4, D(PB, footR=(-0.02, 0.10, 0.42, -40), freeR=1, hip=(-0.02, -0.07, 0.87))),
    (8, D(PB, footR=(-0.22, -0.18, GZ, -12), freeR=1, hip=(-0.02, -0.10, 0.80), handR=(0.24, 0.18, 0.86), handL=(-0.30, -0.42, 0.90))),
    (13, D(PB, footR=(-0.22, 0.20, GZ, -12), freeR=1, hip=(-0.02, -0.08, 0.79), spine=(16, 8))),
    (18, D(PB, footR=(-0.22, 0.62, GZ + 0.02, -12), tiltR=-25, freeR=1, hip=(-0.02, -0.06, 0.80), handR=(0.02, 0.50, 0.88), handL=(-0.10, -0.26, 0.80))),
    (22, D(PB, footR=(-0.10, 0.48, 0.44, -50), freeR=1, hip=(0.0, -0.05, 0.86))),
    (26, D(PB, footR=(0.06, 0.24, FZ, -100), hip=(0.0, -0.04, 0.89))),
], contact=[8 / 26, 18 / 26])
# pop/ollie: anticipación (0→2) · pop cola-suelo nariz arriba (2→5) · subida y nivelado (5→9) · tuck (12)
POPC = dict(CROUCH, hip=(0.03, 0.02, 0.72), hipPitch=10, spine=(18, 10), neck=12,
            footL=(0.06, -0.16, FZ, -78), footR=(0.06, 0.30, FZ, -100), head=(26, -22))
TUCK = dict(hip=(0.03, 0.02, 0.84), spine=(14, 8), board=(0, 0, 0.30, 0, 0, 0), footL=(0.06, -0.12, FZ, -78), footR=(0.06, 0.24, FZ, -100),
            kneeL=(-1.0, -0.4, 0.95), kneeR=(-1.0, 0.5, 0.95), handL=(-0.30, -0.44, 1.02), handR=(0.04, 0.50, 1.00),
            elbowL=(0.2, -0.8, 1.25), elbowR=(0.4, 0.8, 1.2))
clip("SK_Pop", [
    (0, RIDE),
    (2, POPC),
    (5, D(POPC, hip=(0.03, 0.02, 0.86), board=(0, 0, 0.0, 24, 0, 0), footR=(0.06, 0.33, FZ, -100), footL=(0.06, -0.02, FZ, -70),
          spine=(10, 6), handL=(-0.26, -0.46, 1.04), handR=(0.04, 0.52, 1.02))),
    (9, D(TUCK, board=(0, 0, 0.22, 4, 0, 0), footL=(0.06, -0.18, FZ, -78))),
    (12, TUCK),
], loop=False, takeoff=2 / 12)
clip("SK_Air", [(0, TUCK), (12, D(TUCK, hip=(0.03, 0.02, 0.86), board=(0, 0, 0.28, -2, 0, 0))), (24, TUCK)])
# catch: piernas se extienden hacia el suelo antes de tocar
CATCH = dict(hip=(0.02, 0.02, 0.92), spine=(10, 6), board=(0, 0, 0.06, 0, 0, 0), handL=(-0.28, -0.46, 0.98), handR=(0.06, 0.50, 0.94),
             elbowL=(0.2, -0.8, 1.2), elbowR=(0.4, 0.8, 1.15))
clip("SK_Catch", [(0, TUCK), (6, CATCH)], loop=False)
LANDC = dict(CROUCH, hip=(0.03, 0.02, 0.70), hipPitch=12, spine=(20, 10), neck=12, head=(26, -26))
clip("SK_Land", [(0, D(LANDC, hip=(0.03, 0.02, 0.80))), (3, LANDC), (10, D(RIDE, hip=(0.02, 0.02, 0.86))), (14, RIDE)], loop=False)
clip("SK_LandHard", [
    (0, D(LANDC, hip=(0.03, 0.02, 0.76))),
    (4, D(LANDC, hip=(0.04, 0.03, 0.60), donor=("Vault_and_Land", 46, False))),
    (12, D(LANDC, hip=(0.03, 0.02, 0.70), donor=("Vault_and_Land", 52, False))),
    (20, D(RIDE, hip=(0.02, 0.02, 0.87))), (24, RIDE)], loop=False)
# backflip: crouch carga, pop, tuck (brazos/columna del donante), apertura, catch y absorción
FLIPTUCK = dict(hip=(0.03, 0.02, 0.86), spine=(28, 16), board=(0, 0, 0.36, 0, 0, 0), footL=(0.06, -0.14, FZ, -78), footR=(0.06, 0.22, FZ, -100),
                kneeL=(-1.0, -0.4, 1.1), kneeR=(-1.0, 0.5, 1.1), donor=("Run_and_Jump", 27, False))
clip("SK_FlipCrouch", [(0, D(POPC, hip=(0.03, 0.02, 0.68))), (10, D(POPC, hip=(0.03, 0.02, 0.66)))])
clip("SK_FlipTuck", [(0, FLIPTUCK), (8, D(FLIPTUCK, donor=("Run_and_Jump", 30, False))), (16, FLIPTUCK)])
clip("SK_FlipOpen", [(0, FLIPTUCK), (6, D(CATCH, board=(0, 0, 0.14, 0, 0, 0), handL=(-0.20, -0.60, 1.20), handR=(0.20, 0.62, 1.18)))], loop=False)
# trucos de tabla: los pies se separan para que la tabla gire (la rotación la añade el runtime al hueso Board)
RELEASE = dict(TUCK, board=(0, 0, 0.34, 0, 0, 0), footL=(-0.10, -0.30, 0.86, -60), freeL=1, footR=(0.12, 0.30, 0.80, -100), freeR=1,
               kneeL=(-1.0, -0.6, 1.0), kneeR=(-1.0, 0.6, 1.0), hip=(0.03, 0.02, 0.92))
clip("SK_FlipKick", [(0, TUCK), (3, D(RELEASE, footL=(-0.18, -0.36, 0.84, -50))), (9, RELEASE), (13, D(TUCK, board=(0, 0, 0.30, 0, 0, 0)))], loop=False, release=[3 / 13, 11 / 13])
# 50-50 (P1, grind): ambos ejes sobre el rail, brazos abiertos para equilibrio
GRIND = dict(hip=(0.02, 0.02, 0.92), spine=(8, 4), chestTwist=26, handL=(-0.20, -0.60, 1.06), handR=(0.10, 0.62, 1.02),
             elbowL=(0.2, -0.85, 1.2), elbowR=(0.4, 0.85, 1.15))
clip("SK_Grind", [(0, GRIND), (15, D(GRIND, hip=(0.02, 0.03, 0.905), handL=(-0.22, -0.62, 1.10))), (30, GRIND)])
# de pie en el suelo junto a la tabla (charla/baile entra con la tabla apartada)
GROUND = dict(STAND, hip=(0.0, 0.0, 0.93), hipYaw=0, chestTwist=0, neck=0, head=(0, 0), spine=(3, 2),
              footL=(0.11, 0.0, GZ, 0), freeL=1, footR=(-0.11, 0.02, GZ, 0), freeR=1,
              kneeL=(0.15, -0.9, 0.5), kneeR=(-0.15, -0.9, 0.5), handL=(0.30, -0.02, 0.86), handR=(-0.30, -0.02, 0.86),
              elbowL=(0.45, 0.4, 1.1), elbowR=(-0.45, 0.4, 1.1), board=(0, 0, -2.0, 0, 0, 0))
clip("SK_Stand", [(0, GROUND), (40, D(GROUND, hip=(0.0, 0.01, 0.925), spine=(4, 3))), (80, GROUND)])

# Metadatos de fases para el runtime (una sola fuente: este script)
META["SK_Push"].update(phase_note="apoyo del pie en el suelo entre contact[0] y contact[1] del ciclo; la física acelera en esa ventana")
META["SK_Pop"].update(phase_note="takeoff: la física despega en ese punto (anticipación 2/30 s)")


def bake_clip(name, keys, loop):
    ctrl_action = bpy.data.actions.new(f"CTRL_{name}")
    assign(arm, ctrl_action)
    for e in CTRL.values():
        e.animation_data_clear()
    for f, kw in keys:
        pose(f, **kw)
    end = keys[-1][0]
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
    baked["bk_loop"] = loop
    # conservar acciones de control para el rig editable
    ctrl_action.use_fake_user = True
    for n, e in CTRL.items():
        if e.animation_data and e.animation_data.action:
            e.animation_data.action.name = f"CTRL_{name}__{n}"; e.animation_data.action.use_fake_user = True
    return baked


for name, (keys, loop) in CLIPS.items():
    bake_clip(name, keys, loop)
    print("CLIP", name)

# La medida de contacto se hace sobre el GLB exportado (tools/anmi-contact.mjs), no sobre el .blend.

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
    out = CACHE / "preview"; out.mkdir(parents=True, exist_ok=True)
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
    names = only[0][5:].split(",") if only else list(CLIPS)
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
assign(arm, bpy.data.actions["SK_Idle"])
bpy.context.scene.frame_set(0)
prop.hide_set(False); prop.hide_render = False
bpy.ops.object.select_all(action="DESELECT")
for o in (arm, body, deck, prop, shadow):
    o.select_set(True)
KEEP = set(CLIPS) | set(DANCES)
for a in list(bpy.data.actions):
    if a.name not in KEEP:
        bpy.data.actions.remove(a)
bpy.ops.export_scene.gltf(filepath=str(CACHE / "ANMI_GAME.glb"), export_format="GLB", use_selection=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                          export_frame_range=False, export_optimize_animation_size=True, export_yup=True,
                          export_apply=False, export_extras=True, export_skins=True, export_def_bones=False)
bpy.ops.wm.save_as_mainfile(filepath=str(CACHE / "ANMI_GAME.blend"))
for d in DANCES:
    META[d] = dict(loop=d == "Step_Hip_Hop_Dance", source="dance", seconds=round((bpy.data.actions[d].frame_range[1] - bpy.data.actions[d].frame_range[0]) / FPS, 3))
(CACHE / "ANMI_GAME.clips.json").write_text(json.dumps({"fps": FPS, "deck_top": DECK_TOP, "ankle_over_sole": ANKLE, "clips": META}, indent=1))
print("CHAR_DONE", sorted(a.name for a in bpy.data.actions))
