"""NPCs del remake: derivados ligeros desde las fuentes animadas (ZIP biped) aportadas por el usuario.

    blender -b -P game/tools/build_npcs.py -- inspect [who=la_pantera,bella]   # hojas de todos los clips (.cache/npcs/inspect)
    blender -b -P game/tools/build_npcs.py -- build   [who=...]                # .cache/npcs/<id>.glb (+ report.json)

Cada personaje conserva SU rig (66 joints; Aissa 74) y aspecto; se toma la malla skinned de un GLB del ZIP, se reduce
con Decimate (colapso, conserva grupos de vértices) y se añaden solo los clips elegidos (sin desplazamiento horizontal
de raíz). Las fuentes no se modifican ni se publican; sync-assets comprime texturas a WebP.
"""
import bpy
import json
import math
import sys
import zipfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parent
CACHE = GAME / ".cache" / "npcs"
SRC = ROOT / "assets/source/npcs"
MODE = "build" if "build" in sys.argv else "inspect"
WHO = next((a[4:].split(",") for a in sys.argv if a.startswith("who=")), None)

NPCS = {
    # id: (zip, stem, ratio, clips {nombre_runtime: clip_fuente})
    # NPC-01 (V3): sin idle propio en los packs → Idle_Loop de Quaternius UAL (CC0) retargeteado; «hablar» discreto:
    # Pantera = primeros 3,5 s de Stand_Talking_Angry (tramo tranquilo medido; el clip entero dura 20,8 s y crece en enfado),
    # Aissa/Juseph = Idle_Talking_Loop de UAL. Juseph deja Dozing_Elderly (no es «chilling»). Wave_One_Hand queda para Pantera.
    "la_pantera": (SRC / "la_pantera/Meshy_AI_Masked_Streetwear_Ava_biped.zip", "Meshy_AI_Masked_Streetwear_Ava_biped", 0.18,
                   {"Idle": "ual:Idle_Loop", "Talk": "Stand_Talking_Angry@0.0-0.168", "Wave": "Wave_One_Hand",
                    # V4-NMG-05: pose sentada de la referencia sobre el bordillo del corazón (reposo/gesto de NPC: fuera de la
                    # regla «donantes solo para patinar»). UAL Sitting_* retargeteado al rig propio; caderas sin traslación
                    # horizontal; el asiento y los pies se miden en el GLB (tools/v4/pantera_sit_metrics.py).
                    "SitIdle": "ual:Sitting_Idle_Loop", "SitTalk": "ual:Sitting_Talking_Loop",
                    # R7 (usuario, 12 oct): los 8 bailes de ANMI (mismas fuentes Meshy, mismo esqueleto mixamorig) para bailar
                    # sincronizada con ANMI cuando esta baila dentro del recuadro de charla
                    **{f"Dance_{d}": f"anmi:{d}" for d in ("Step_Hip_Hop_Dance", "Hip_Hop_Dance_1", "Hip_Hop_Dance_2", "Hip_Hop_Dance_3",
                                                             "FunnyDancing_02", "FunnyDancing_03", "Cardio_Dance", "Breakdance_1990")}}),
    "aissa": (SRC / "aissa/Meshy_AI_Pink_Cap_Worker_biped.zip", "Meshy_AI_Pink_Cap_Worker_biped", 0.18,
              {"Idle": "ual:Idle_Loop", "Talk": "ual:Idle_Talking_Loop"}),
    "juseph": (SRC / "juseph/Meshy_AI_Fresh_Kicks_biped.zip", "Meshy_AI_Fresh_Kicks_biped", 0.18,
               {"Idle": "ual:Idle_Loop", "Talk": "ual:Idle_Talking_Loop"}),
    "bella": (SRC / "fashion_girl/Meshy_AI_Bella_Vibes_biped.zip", "Meshy_AI_Bella_Vibes_biped", 0.24,
              {"Cheer": "Hop_with_Arms_Raised", "Jump": "Happy_jump_f", "Sway": "Joyful_Dance_with_Hand_Sway",
               # V6 (D6-06, Auditoría 6/plan-v6/07 R6-07): las cinco chicas acompañan a ANMI con SUS 8 bailes (mismas fuentes Meshy,
               # mismo esqueleto mixamorig, vía anmi: probada con La Pantera en R7) → mismo clip y misma duración: sincronía exacta
               **{f"Dance_{d}": f"anmi:{d}" for d in ("Step_Hip_Hop_Dance", "Hip_Hop_Dance_1", "Hip_Hop_Dance_2", "Hip_Hop_Dance_3",
                                                        "FunnyDancing_02", "FunnyDancing_03", "Cardio_Dance", "Breakdance_1990")}}),
}
SIT_SEAT_H = 0.40   # bordillo del corazón NMG (game/src/world/nmg_kit.json → heart.ledge[1])
CHOICE = CACHE / "choice.json"
if CHOICE.exists():  # selección revisada a la vista de las hojas
    for k, v in json.loads(CHOICE.read_text()).items():
        if k in NPCS:
            z, s, r, _ = NPCS[k]; NPCS[k] = (z, s, v.get("ratio", r), v["clips"])


def zip_members(zp, stem):
    with zipfile.ZipFile(zp) as z:
        return [m for m in z.namelist() if m.endswith("_withSkin.glb")]


def extract(zp, member, id_):
    out = CACHE / "src" / id_ / Path(member).name
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zp) as z:
            out.write_bytes(z.read(member))
    return out


def clip_name(member, stem):
    return Path(member).name.replace(stem + "_Animation_", "").replace("_withSkin.glb", "")


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
    obj.animation_data_create(); obj.animation_data.action = action
    if action is not None and hasattr(action, "slots") and len(action.slots):
        obj.animation_data.action_slot = action.slots[0]


def import_glb(path):
    before_o = set(bpy.data.objects); before_a = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before_o], [a for a in bpy.data.actions if a not in before_a]


UAL = ROOT / "Auditoría 3/donantes/quaternius_ual/extracted/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"
UAL_MAP = {"pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2", "neck_01": "Neck", "Head": "Head",
           "thigh_l": "LeftUpLeg", "calf_l": "LeftLeg", "foot_l": "LeftFoot", "ball_l": "LeftToeBase",
           "thigh_r": "RightUpLeg", "calf_r": "RightLeg", "foot_r": "RightFoot", "ball_r": "RightToeBase"}
for sd, S in (("l", "Left"), ("r", "Right")):
    UAL_MAP.update({f"clavicle_{sd}": f"{S}Shoulder", f"upperarm_{sd}": f"{S}Arm", f"lowerarm_{sd}": f"{S}ForeArm", f"hand_{sd}": f"{S}Hand"})
    for fq, fm in (("thumb", "Thumb"), ("index", "Index"), ("middle", "Middle"), ("ring", "Ring"), ("pinky", "Pinky")):
        for k in (1, 2, 3):
            UAL_MAP[f"{fq}_0{k}_{sd}"] = f"{S}Hand{fm}{k}"


def retarget_ual(arm, clip, name):
    """Clip de Quaternius UAL Standard (CC0) sobre el rig propio del NPC: rotación mundo R = R_src·R_src_rest⁻¹·R_npc_rest
    (padre antes que hijo), cadera escalada por la altura de cadera y sin desplazamiento horizontal. Los huesos sin
    equivalente (auxiliares de Aissa, headfront, puntas de dedo) quedan en reposo. Se hornean claves a 30 fps."""
    from mathutils import Matrix, Vector
    pb = arm.pose.bones
    assign(arm, None)
    for b in pb:
        b.location = (0, 0, 0); b.rotation_mode = "QUATERNION"; b.rotation_quaternion = (1, 0, 0, 0); b.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    pairs = [(k, f"mixamorig:{v}") for k, v in UAL_MAP.items() if f"mixamorig:{v}" in pb]
    RA = {n: (arm.matrix_world @ pb[n].matrix).to_quaternion() for _, n in pairs}
    hipA = (arm.matrix_world @ pb["mixamorig:Hips"].matrix).translation.copy()
    objs, acts = import_glb(UAL)
    src = max([o for o in objs if o.type == "ARMATURE"], key=lambda o: len(o.data.bones)); sb = src.pose.bones
    assign(src, None)
    for b in sb:
        b.location = (0, 0, 0); b.rotation_mode = "QUATERNION"; b.rotation_quaternion = (1, 0, 0, 0); b.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    RS = {k: (src.matrix_world @ sb[k].matrix).to_quaternion() for k, _ in pairs}
    # V5 T5-20 (HUM-A5-015, DT-23): los reposos de fuente (UAL, T) y destino (NPC, A) no coinciden en los BRAZOS: el delta
    # R_src·R_src_rest⁻¹ aplicado al reposo A del NPC dejaba los brazos ≈55° más abajo (dentro del torso). Corrección por
    # DIRECCIÓN de hueso en reposo: Q lleva la dirección del hueso del NPC a la de la fuente, R = Δ·Q·R_npc_rest. Solo en los
    # clips de pie (los sentados se ajustan después con sit_fit/hand_rest_fit y no se tocan).
    AIM = {}
    arm_keys = [k for k, _ in pairs if k.split('_')[0] in ('clavicle', 'upperarm', 'lowerarm', 'hand')]
    for k, n in pairs:
        if k not in arm_keys: continue
        dA = ((arm.matrix_world @ pb[n].tail) if hasattr(pb[n], 'tail') else None)
        hA = arm.matrix_world @ pb[n].head; tA = arm.matrix_world @ pb[n].tail
        hS = src.matrix_world @ sb[k].head; tS = src.matrix_world @ sb[k].tail
        AIM[k] = (tA - hA).normalized().rotation_difference((tS - hS).normalized())
    probe = {k: round(math.degrees(AIM[k].angle), 1) for k in AIM}
    print('AIM_REST_DELTA_DEG', name, json.dumps(probe))
    use_aim = not name.startswith('Sit')
    hipS = (src.matrix_world @ sb["pelvis"].matrix).translation.copy()
    k_h = hipA.z / hipS.z
    act_src = bpy.data.actions[clip]; assign(src, act_src)
    f0, f1 = int(act_src.frame_range[0]), int(round(act_src.frame_range[1]))
    out = bpy.data.actions.new(name); out.use_fake_user = True
    assign(arm, out)
    Ainv = arm.matrix_world.inverted()
    scn = bpy.context.scene
    for f in range(f0, f1 + 1):
        scn.frame_set(f); bpy.context.view_layer.update()
        W = {k: src.matrix_world @ sb[k].matrix for k, _ in pairs}
        for b in pb:
            b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0)
        bpy.context.view_layer.update()
        for k, n in pairs:
            Q = AIM.get(k) if use_aim else None
            Rw = ((W[k].to_quaternion() @ RS[k].inverted() @ Q @ RA[n]) if Q is not None else (W[k].to_quaternion() @ RS[k].inverted() @ RA[n])).to_matrix().to_4x4()
            head = (arm.matrix_world @ pb[n].matrix).translation
            if k == "pelvis":
                head = Vector((hipA.x, hipA.y, hipA.z + (W[k].translation.z - hipS.z) * k_h))
            pb[n].matrix = Ainv @ (Matrix.Translation(head) @ Rw)
            bpy.context.view_layer.update()
        for k, n in pairs:
            pb[n].keyframe_insert("rotation_quaternion", frame=f - f0)
        pb["mixamorig:Hips"].keyframe_insert("location", frame=f - f0)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in acts:
        bpy.data.actions.remove(a)
    return out


def ground_fix(arm, body, act):
    """Los clips Meshy de los packs atraviesan el suelo (~4 cm, medido en GLB): por fotograma se mide el vértice más
    bajo del cuerpo deformado y se SUBE la cadera solo lo necesario (máximo móvil ±6 f + media ±4 f; nunca baja)."""
    from mathutils import Vector
    import numpy as np
    assign(arm, act)
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    frames = list(range(f0, f1 + 1)); n = len(frames)
    def low():
        dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
        co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get("co", co); e.to_mesh_clear()
        co = co.reshape(-1, 3); M = np.array(body.matrix_world)
        return float((co @ M[:3, :3].T + M[:3, 3])[:, 2].min())
    need = []
    for f in frames:
        bpy.context.scene.frame_set(f); bpy.context.view_layer.update(); need.append(max(0.0, 0.002 - low()))
    at = lambda a, i: a[min(max(i, 0), n - 1)]
    mx = [max(at(need, i + j) for j in range(-6, 7)) for i in range(n)]
    lift = [sum(at(mx, i + j) for j in range(-4, 5)) / 9 for i in range(n)]
    rinv = arm.data.bones["mixamorig:Hips"].matrix_local.to_3x3().inverted()
    for fc in fcurves_of(act):
        if fc.data_path == 'pose.bones["mixamorig:Hips"].location':
            for kp in fc.keyframe_points:
                i = min(max(int(round(kp.co[0])) - f0, 0), n - 1)
                dv = (rinv @ Vector((0, 0, lift[i])))[fc.array_index]
                kp.co[1] += dv; kp.handle_left[1] += dv; kp.handle_right[1] += dv
            fc.update()
    return {"before_mm": round((0.002 - max(need)) * 1000, 1), "lift_max_m": round(max(lift), 3)}


def sit_fit(arm, body, act, seat_h, foot_clear=0.004):
    """V4-NMG-05: encaja la pose sentada en un asiento real de `seat_h` m con los pies en el suelo. El retarget UAL deja
    asiento 0,25 y suela −0,09 (piernas proporcionalmente más cortas): se sube la cadera hasta el asiento y una IK de
    dos huesos (muslo+pierna, nativa de Blender) baja cada tobillo lo que sobra hasta apoyar la suela; se hornea con
    claves visuales y se retiran las restricciones. Devuelve las alturas medidas antes y después."""
    import numpy as np
    from mathutils import Vector
    gi = {g.name: g.index for g in body.vertex_groups}
    dom = np.full(len(body.data.vertices), -1)
    w = np.zeros(len(body.data.vertices))
    for v in body.data.vertices:
        for g in v.groups:
            if g.weight > w[v.index]: w[v.index] = g.weight; dom[v.index] = g.group
    seat_ids = np.array([i for i, b in enumerate(dom) if b in {gi[n] for n in gi if "Hips" in n or "UpLeg" in n}], dtype=int)
    foot_ids = {sd: np.array([i for i, b in enumerate(dom) if b in {gi[n] for n in gi if n.startswith(f"mixamorig:{sd}") and ("Foot" in n or "ToeBase" in n)}], dtype=int) for sd in ("Left", "Right")}
    def coords():
        dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
        co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get("co", co); e.to_mesh_clear()
        M = np.array(body.matrix_world); return co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    assign(arm, act)
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    scn = bpy.context.scene
    scn.frame_set(f0); bpy.context.view_layer.update(); c = coords()
    before = {"seat": round(float(c[seat_ids][:, 2].min()), 4), **{sd: round(float(c[foot_ids[sd]][:, 2].min()), 4) for sd in foot_ids}}
    dz = seat_h - before["seat"]
    rinv = arm.data.bones["mixamorig:Hips"].matrix_local.to_3x3().inverted()
    for fc in fcurves_of(act):
        if fc.data_path == 'pose.bones["mixamorig:Hips"].location':
            dv = (rinv @ Vector((0, 0, dz)))[fc.array_index]
            for kp in fc.keyframe_points:
                kp.co[1] += dv; kp.handle_left[1] += dv; kp.handle_right[1] += dv
            fc.update()
    # objetivos IK por fotograma: tobillo actual bajado lo que la suela de ese lado sobresale del suelo
    pb = arm.pose.bones; Mw = arm.matrix_world
    empties = {}
    for sd in ("Left", "Right"):
        e = bpy.data.objects.new(f"IK_{sd}", None); scn.collection.objects.link(e); empties[sd] = e
    for f in range(f0, f1 + 1):
        scn.frame_set(f); bpy.context.view_layer.update(); c = coords()
        for sd in ("Left", "Right"):
            sole = float(c[foot_ids[sd]][:, 2].min())
            e = empties[sd]; e.location = Mw @ pb[f"mixamorig:{sd}Foot"].head - Vector((0, 0, sole - foot_clear))
            e.keyframe_insert("location", frame=f)
    for sd in ("Left", "Right"):
        k = pb[f"mixamorig:{sd}Leg"].constraints.new("IK"); k.target = empties[sd]; k.chain_count = 2; k.use_tail = True
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for b in arm.pose.bones:
        if hasattr(b, "select"): b.select = True
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=False, visual_keying=True, clear_constraints=True, use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    for e in empties.values(): bpy.data.objects.remove(e, do_unlink=True)
    act2 = arm.animation_data.action
    after = []
    for f in range(f0, f1 + 1, 5):
        scn.frame_set(f); bpy.context.view_layer.update(); c = coords()
        after.append((float(c[seat_ids][:, 2].min()), *[float(c[foot_ids[sd]][:, 2].min()) for sd in ("Left", "Right")]))
    a = np.array(after)
    return act2, {"seat_h": seat_h, "before": before, "hip_raise_m": round(dz, 4),
                  "after": {"seat": [round(float(a[:, 0].min()), 4), round(float(a[:, 0].max()), 4)], "Left": [round(float(a[:, 1].min()), 4), round(float(a[:, 1].max()), 4)], "Right": [round(float(a[:, 2].min()), 4), round(float(a[:, 2].max()), 4)]}}


def hand_rest_fit(arm, body, act, gap_max=0.04, along=0.72):
    """V4-NMG-05: en el reposo sentado, una mano que queda separada del muslo (retarget UAL: brazos de otra proporción)
    se apoya sobre él con IK de dos huesos (brazo+antebrazo): objetivo de muñeca = punto del muslo a `along` de cadera a
    rodilla, sobre su cara superior. Solo se corrige el lado cuya separación supera `gap_max`."""
    import numpy as np
    from mathutils import Vector
    gi = {g.name: g.index for g in body.vertex_groups}
    dom = np.full(len(body.data.vertices), -1); w = np.zeros(len(body.data.vertices))
    for v in body.data.vertices:
        for g in v.groups:
            if g.weight > w[v.index]: w[v.index] = g.weight; dom[v.index] = g.group
    ids = lambda pred: np.array([i for i, b in enumerate(dom) if b in {gi[n] for n in gi if pred(n)}], dtype=int)
    hand = {sd: ids(lambda n, sd=sd: n.startswith(f"mixamorig:{sd}Hand")) for sd in ("Left", "Right")}
    thigh = {sd: ids(lambda n, sd=sd: n == f"mixamorig:{sd}UpLeg") for sd in ("Left", "Right")}
    def coords():
        dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
        co = np.empty(len(m.vertices) * 3, dtype=np.float32); m.vertices.foreach_get("co", co); e.to_mesh_clear()
        M = np.array(body.matrix_world); return co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    def gap(c, sd):
        h, t = c[hand[sd]], c[thigh[sd]]
        d = np.sqrt(((h[::2, None, :] - t[None, ::2, :]) ** 2).sum(-1)); return float(d.min())
    assign(arm, act); scn = bpy.context.scene
    f0, f1 = int(act.frame_range[0]), int(round(act.frame_range[1]))
    scn.frame_set(f0); bpy.context.view_layer.update(); c = coords()
    before = {sd: round(gap(c, sd), 4) for sd in hand}
    fix = [sd for sd in hand if before[sd] > gap_max]
    if not fix: return act, {"before": before, "fixed": []}
    pb = arm.pose.bones; Mw = arm.matrix_world; empties = {}
    for sd in fix:
        e = bpy.data.objects.new(f"IKH_{sd}", None); scn.collection.objects.link(e); empties[sd] = e
    for f in range(f0, f1 + 1):
        scn.frame_set(f); bpy.context.view_layer.update(); c = coords()
        for sd in fix:
            hip, knee = Mw @ pb[f"mixamorig:{sd}UpLeg"].head, Mw @ pb[f"mixamorig:{sd}Leg"].head
            p = hip.lerp(knee, along); t = c[thigh[sd]]
            near = t[np.hypot(t[:, 0] - p.x, t[:, 1] - p.y) < 0.07]
            top = float(near[:, 2].max()) if len(near) else p.z + 0.08
            empties[sd].location = Vector((p.x, p.y, top + 0.035)); empties[sd].keyframe_insert("location", frame=f)   # muñeca sobre el muslo
    for sd in fix:
        k = pb[f"mixamorig:{sd}ForeArm"].constraints.new("IK"); k.target = empties[sd]; k.chain_count = 2; k.use_tail = True
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=False, visual_keying=True, clear_constraints=True, use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    for e in empties.values(): bpy.data.objects.remove(e, do_unlink=True)
    act2 = arm.animation_data.action
    scn.frame_set(f0); bpy.context.view_layer.update(); c = coords()
    return act2, {"before": before, "fixed": fix, "after": {sd: round(gap(c, sd), 4) for sd in hand}}


def bella_regions(body):
    """NPC-02: región por isla UV (no por umbral de color por píxel, que teñía las fosas nasales y dejaba mechones sin
    teñir): color medio de cada isla en el atlas → 1 pelo, 2 piel/cara, 0 resto. Se guarda como atributo de punto
    _REGION (glTF «_REGION», Three «_region») que lee el shader de variantes de npc.ts."""
    import bmesh, colorsys
    import numpy as np
    me = body.data
    img = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    W, H = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); uvl = bm.loops.layers.uv.active
    region = np.zeros(len(me.vertices), dtype=np.float32); seen = set(); stats = {0: 0, 1: 0, 2: 0}; hair_lum = []
    for f0 in bm.faces:
        if f0.index in seen: continue
        stack = [f0]; seen.add(f0.index); fs = []
        while stack:
            x = stack.pop(); fs.append(x)
            for e in x.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        cols = np.array([px[int(l[uvl].uv.y * H) % H, int(l[uvl].uv.x * W) % W, :3] for f in fs for l in f.loops])
        lin = cols.mean(0); r, g_, b = lin ** (1 / 2.2); h, sat, val = colorsys.rgb_to_hsv(r, g_, b)
        reg = 1 if (0.02 <= h <= 0.12 and sat >= 0.35 and val <= 0.72) else 2 if (0.02 <= h <= 0.11 and 0.18 <= sat <= 0.5 and val >= 0.8) else 0
        if reg == 1: hair_lum.append(float((cols @ np.array([0.299, 0.587, 0.114])).mean()))
        stats[reg] += len(fs)
        for f in fs:
            for v in f.verts: region[v.index] = max(region[v.index], reg)
    bm.free()
    at = me.attributes.get("_REGION") or me.attributes.new("_REGION", "FLOAT", "POINT")
    at.data.foreach_set("value", region)
    return {"faces_by_region": stats, "hair_mean_linear_lum": round(float(np.mean(hair_lum)), 4) if hair_lum else None}


def bella_nose_fix(body):
    """V6 R5 (usuario, 13 oct): mancha gris/blanca «como de periódico» del tabique a la punta de la nariz (ya venía en el
    modelo de Meshy: triángulos de la nariz cuya UV cae en trozos del atlas que no son piel). Se localiza la nariz por
    geometría (punto más adelantado de la cabeza en el eje), se toma el color de piel de la cara (mediana) y los triángulos
    de la nariz con alguna muestra lejos de ese color llevan su UV a un punto de piel. No toca ojos, cejas ni labios."""
    import numpy as np
    me = body.data; M = body.matrix_world
    img = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE"); W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[..., :3]
    co = np.array([tuple(M @ v.co) for v in me.vertices]); zmax = co[:, 2].max(); head = co[:, 2] > zmax - 0.32
    cand = head & (np.abs(co[:, 0]) < 0.03); tip = co[np.where(cand)[0][np.argmin(co[cand, 1])]]
    uvl = me.uv_layers.active.data
    samp = lambda uv: px[int(uv[1] * H) % H, int(uv[0] * W) % W]
    bary = [(1/3, 1/3, 1/3), (0.7, 0.15, 0.15), (0.15, 0.7, 0.15), (0.15, 0.15, 0.7), (0.5, 0.5, 0), (0, 0.5, 0.5), (0.5, 0, 0.5)]
    def samples(pi):
        uv = [np.array(uvl[li].uv) for li in me.polygons[pi].loop_indices][:3]
        return np.array([samp(a * uv[0] + b * uv[1] + c * uv[2]) for a, b, c in bary])
    face, nose = [], []
    for p in me.polygons:
        c = co[list(p.vertices)].mean(0)
        if abs(c[0] - tip[0]) < 0.06 and tip[2] - 0.06 < c[2] < tip[2] + 0.07 and c[1] < tip[1] + 0.06: face.append(p.index)
        if abs(c[0] - tip[0]) < (0.024 if c[2] < tip[2] + 0.03 else 0.016) and tip[2] - 0.012 < c[2] < tip[2] + 0.085 and c[1] < tip[1] + 0.045: nose.append(p.index)
    allc = np.concatenate([samples(pi) for pi in face]); lin = allc ** (1 / 2.2)
    mx, mn = lin.max(1), lin.min(1); skinm = ((mx - mn) / np.maximum(mx, 1e-4) > 0.3) & (mx > 0.6) & (lin[:, 0] > lin[:, 2] * 1.3)
    skin = np.median(allc[skinm], 0)
    best = min(face, key=lambda pi: np.abs(samples(pi) - skin).sum())
    skin_uv = tuple(np.mean([np.array(uvl[li].uv) for li in me.polygons[best].loop_indices], 0))
    bad = [pi for pi in nose if (np.abs(samples(pi) ** (1 / 2.2) - skin ** (1 / 2.2)).max(1) > 0.11).any()]
    for pi in bad:
        for li in me.polygons[pi].loop_indices: uvl[li].uv = skin_uv
    return {"nose_faces": len(nose), "fixed": len(bad), "skin_srgb": [round(float(x), 3) for x in skin ** (1 / 2.2)]}


def setup_render():
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"; scn.render.resolution_x = 220; scn.render.resolution_y = 300
    scn.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("W"); scn.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.8, 0.86, 1)
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(30)))
    cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd); scn.collection.objects.link(cam); scn.camera = cam
    cd.type = "ORTHO"; cd.ortho_scale = 2.4
    cam.location = (0.8, -4, 1.1); cam.rotation_euler = (math.radians(88), 0, math.radians(11))
    return scn


report = {}
for id_, (zp, stem, ratio, clips) in NPCS.items():
    if WHO and id_ not in WHO:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    members = zip_members(zp, stem)
    names = {clip_name(m, stem): m for m in members}
    if MODE == "inspect":
        out = CACHE / "inspect"; out.mkdir(parents=True, exist_ok=True)
        base = names.get("Walking") or members[0]
        objs, acts = import_glb(extract(zp, base, id_))
        arm = next(o for o in objs if o.type == "ARMATURE")
        scn = setup_render()
        for cn, m in names.items():
            o2, a2 = import_glb(extract(zp, m, id_))
            for o in o2:
                bpy.data.objects.remove(o, do_unlink=True)
            act = a2[0]; assign(arm, act)
            s, e = [int(x) for x in act.frame_range]
            for k in range(5):
                scn.frame_set(s + round((e - s) * k / 4))
                scn.render.filepath = str(out / f"{id_}__{cn}__{k}.png")
                bpy.ops.render.render(write_still=True)
            print("INSPECT", id_, cn, e - s)
        continue

    # ---------------------------------------------------------------- build
    base_member = names[next(v for v in clips.values() if not v.startswith("ual:")).split("@")[0]] if any(not v.startswith("ual:") for v in clips.values()) else names.get("Walking") or members[0]
    objs, acts = import_glb(extract(zp, base_member, id_))
    for o in objs:
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = next(o for o in bpy.data.objects if o.type == "MESH")
    for a in acts:
        bpy.data.actions.remove(a)
    arm.name = id_.upper(); body.name = id_.upper() + "_BODY"
    tris0 = sum(len(p.vertices) - 2 for p in body.data.polygons)
    dec = body.modifiers.new("Decimate", "DECIMATE"); dec.ratio = ratio; dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = body
    while body.modifiers[0].name != "Decimate":
        bpy.ops.object.modifier_move_up(modifier="Decimate")
    bpy.ops.object.modifier_apply(modifier="Decimate")
    tris1 = sum(len(p.vertices) - 2 for p in body.data.polygons)
    regions = bella_regions(body) if id_ == "bella" else None
    if regions: print("REGIONS", regions)
    nose = bella_nose_fix(body) if id_ == "bella" else None   # V6 R5: nariz sin la mancha gris del atlas
    if nose: print("NOSE", nose)
    hips_rest_z = (arm.matrix_world @ arm.data.bones["mixamorig:Hips"].head_local).z
    for rt, src in clips.items():
        if src.startswith("ual:"):  # Quaternius UAL (CC0), retarget al rig propio
            retarget_ual(arm, src[4:], rt)
            continue
        if src.startswith("anmi:"):  # R7: baile de ANMI (Meshy, mismo esqueleto mixamorig): rotaciones tal cual; cadera escalada
            o2, a2 = import_glb(ROOT / "assets/source/character/dance" / f"Meshy_AI_Urban_Skater_Kid_{src[5:]}.glb")
            src_arm = next(o for o in o2 if o.type == "ARMATURE")
            k = hips_rest_z / max(1e-6, (src_arm.matrix_world @ src_arm.data.bones["mixamorig:Hips"].head_local).z)
            for o in o2: bpy.data.objects.remove(o, do_unlink=True)
            a = a2[0]; a.name = rt; a.use_fake_user = True
            for extra in a2[1:]: bpy.data.actions.remove(extra)
            for fc in fcurves_of(a):
                if fc.data_path.endswith('"mixamorig:Hips"].location'):
                    v0 = fc.keyframe_points[0].co[1]
                    for kp in fc.keyframe_points:
                        if fc.array_index in (0, 2): kp.co[1] = v0; kp.handle_left[1] = v0; kp.handle_right[1] = v0   # sin desplazamiento horizontal
                        else: kp.co[1] *= k; kp.handle_left[1] *= k; kp.handle_right[1] *= k
            continue
        srcname, _, win = src.partition("@")
        o2, a2 = import_glb(extract(zp, names[srcname], id_))
        for o in o2:
            bpy.data.objects.remove(o, do_unlink=True)
        a = a2[0]; a.name = rt; a.use_fake_user = True
        if win:  # ventana de tiempo de un clip (reposo extraído del final de Stand_Up9, se reproduce en ping-pong)
            f0, f1 = a.frame_range
            w0, w1 = [float(x) for x in win.split("-")]
            a.use_frame_range = True
            a.frame_start = round(f0 + (f1 - f0) * w0); a.frame_end = round(f0 + (f1 - f0) * w1)
        for fc in fcurves_of(a):
            if fc.data_path.endswith('"mixamorig:Hips"].location') and fc.array_index in (0, 2):
                v0 = fc.keyframe_points[0].co[1]
                for kp in fc.keyframe_points:
                    kp.co[1] = v0; kp.handle_left[1] = v0; kp.handle_right[1] = v0
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    ground = {rt: ground_fix(arm, body, bpy.data.actions[rt]) for rt, src in clips.items() if not src.startswith("ual:")}   # (incluye los bailes)
    print("GROUND", id_, ground)
    sit = {}
    for rt in [k for k in clips if k.startswith("Sit")]:
        act0 = bpy.data.actions[rt]
        act1, sit[rt] = sit_fit(arm, body, act0, SIT_SEAT_H)
        if rt == "SitIdle":   # en la charla las manos gesticulan: solo el reposo apoya la mano suelta en el muslo
            act1, sit[rt]["hands"] = hand_rest_fit(arm, body, act1)
        if act1 is not act0: act0.name = rt + "_raw"; act1.name = rt; act1.use_fake_user = True; bpy.data.actions.remove(act0)
    if sit: print("SIT", id_, json.dumps(sit))
    assign(arm, bpy.data.actions[next(iter(clips))])
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); body.select_set(True)
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{id_}.glb"
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_animations=True,
                              export_animation_mode="ACTIONS", export_force_sampling=True, export_optimize_animation_size=True,
                              export_yup=True, export_skins=True, export_def_bones=False, export_attributes=True)
    report[id_] = dict(source=str(zp.relative_to(ROOT)), base_clip=clip_name(base_member, stem), tris_source=tris0, tris_derived=tris1,
                       joints=len(arm.data.bones), clips=clips, ground=ground, sit=sit or None, regions=regions, nose=nose, bytes_raw=out.stat().st_size)
    print("NPC", id_, json.dumps(report[id_]))
if MODE == "build":
    rp = CACHE / "report.json"
    old = json.loads(rp.read_text()) if rp.exists() else {}
    old.update(report)
    rp.write_text(json.dumps(old, indent=1))
