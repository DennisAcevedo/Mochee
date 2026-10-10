"""Gemini Guy tutor: model, rig, clips, GLB export.

Run headless from the repo root:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup
      --python blender/tutor/build_tutor.py [-- --preview <dir> [--clips a,b] [--moments 0.1,0.4,0.7]]

Writes public/models/tutor.glb (via a temp name, then an atomic rename) and,
last, public/models/tutor.manifest.json. With `--preview <dir>` it also
renders every clip at three moments and stitches a contact sheet there.

Space conventions. All shapes, placements and clip offsets are authored in
three.js axes (x right, y up, z toward the camera; .L = HIS left = +x) and
converted once, with matrices, into Blender axes (z up, model faces -y). The
glTF exporter's +Y-up conversion maps them straight back, so the GLB matches
the classic code character (src/character/geometry.ts, materials.ts).

clips.json semantics (also in its `_doc`):
- keys[bone] = [[t, {loc, rot, scale}, ease?], ...]; loc = offset from the
  bone's rest position in three axes, rot = degrees (three.js Euler XYZ) added
  to rest, scale = multiplier. A channel used by any key of a bone is keyed at
  every key of that bone; a key that omits it is at rest there.
- ease names how the motion ARRIVES at that key (the segment from the previous
  key): linear | bezier | constant (hold, then snap) | back | bounce | elastic
  (the last three overshoot/settle at the arrival).
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
CLIPS_PATH = os.path.join(HERE, 'clips.json')
OUT_DIR = os.path.join(REPO, 'public', 'models')
GLB_PATH = os.path.join(OUT_DIR, 'tutor.glb')
GLB_TMP = os.path.join(OUT_DIR, 'tutor.tmp.glb')
MANIFEST_PATH = os.path.join(OUT_DIR, 'tutor.manifest.json')

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW_DIR = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else None
PREVIEW_ONLY = set(ARGS[ARGS.index('--clips') + 1].split(',')) if '--clips' in ARGS else None  # e.g. --clips wave,hop
PREVIEW_MOMENTS = tuple(float(m) for m in ARGS[ARGS.index('--moments') + 1].split(',')) if '--moments' in ARGS else None  # e.g. --moments 0.1,0.3,0.5

# ---------------------------------------------------------------------------
# Config: every number the model, rig and export use.

MODEL = {
    'body_r': 0.8,  # BODY_R in geometry.ts
    'body_y': 1.0,  # body centre above the floor (feet float underneath)
    'body_segments': (48, 32),
    'flare': 0.1,  # base widens by this share at the bottom
    'flat_y': -0.58,  # below this the base is flattened...
    'flat_k': 0.45,  # ...by this factor
    'subsurf': 1,  # subdivision levels on the body, hands and feet (applied on export)
}

# Face features: (x, y, off, rotZ) for placeOnSphere(), three axes. .L = +x.
FACE = {
    'eye': (0.205, -0.01, -0.012, 0.0),
    'happy': (0.205, -0.02, 0.004, math.pi * 0.075),
    'brow': (0.21, 0.16, 0.004, math.pi * 0.15),
    'brow_tilt': 0.1,  # inner ends of the brows lower by this (rad)
    'smile': (0.0, -0.13, 0.004, -math.pi * 0.9),
    'mouth': (0.0, -0.15, 0.0, 0.0),
    'cheek': (0.37, -0.1, 0.008, 0.0),
}
EYE = {
    'r': 0.094, 'scale': (1.0, 1.1, 0.5), 'segments': (36, 24),
    'glints': [((0.03, 0.035, 0.088), 0.03), ((-0.03, -0.035, 0.09), 0.013)],  # pre-squash, like Face.tsx
}
ARCS = {  # torus (radius, tube, arc) for the ink strokes
    'happy': (0.075, 0.022, math.pi * 0.85),
    'brow': (0.05, 0.012, math.pi * 0.7),
    'smile': (0.048, 0.014, math.pi * 0.8),
    'segments': (10, 28),
}
MOUTH = {'r': 0.066, 'scale': (1.15, 1.0, 0.45), 'tongue_r': 0.036, 'tongue_pos': (0.0, -0.03, 0.012), 'tongue_scale': (1.2, 0.6, 0.5)}
CHEEK = {'size': (0.26, 0.15), 'texture': 64, 'rgba': (250, 140, 150, 0.75)}

CAP = {
    'offset': (0.02, -0.02, 0.0),  # cap group, relative to the body centre
    'tilt': (-0.06, 0.0, -0.12),  # three.js Euler XYZ
    'pivot_y': 0.66,  # cap bone sits at the skull's base, cap-local
    'skull': {'rt': 0.47, 'rb': 0.52, 'h': 0.24, 'y': 0.77, 'segments': 64, 'bevel': 0.022, 'colors': ('#3d5ad6', '#6a4fd0')},
    'board': {'size': (1.1, 0.05, 1.1), 'y': 0.91, 'yaw': math.pi / 4, 'bevel': 0.016, 'colors': ('#5a4cc8', '#7a5ce0')},
    'button': {'r': 0.05, 'y': 0.945, 'squash': 0.6},
    'cord': {'r': 0.013, 'len': 0.52, 'y': 0.945},
    'tassel_at': (0.52, 0.945, 0.0),  # cap-local; the tassel bone's head
    'string': {'r': 0.013, 'len': 0.24},
    'knot': {'r': 0.03, 'y': -0.25},
    'bulb': {'rt': 0.032, 'rb': 0.056, 'h': 0.15, 'y': -0.33},
    'emblem': {'pos': (0.0, 0.77, 0.5), 'pitch': -0.1, 'depth': 0.03, 'bevel': 0.008, 'scale': 1.1},
}

HAND = {
    'rest': (0.95, -0.28, 0.28),  # +x hand (hand.L), relative to the body centre
    'tilt': (-0.25, 0.0, 0.45),  # pitch, yaw, outward roll (top leans out)
    'r': 0.15, 'len': 0.06, 'flat': 0.74,
    'thumb_r': 0.07, 'thumb_pos': (-0.135, -0.04, 0.05), 'thumb_scale': (0.85, 1.25, 0.8), 'thumb_roll': 0.5,
}
FOOT = {
    'rest': (0.27, 0.085, 0.08),  # +x foot (foot.L), relative to the floor
    'toe_out': 0.2,  # yaw outward (rad)
    'r': 0.11, 'len': 0.1, 'scale': (1.05, 0.72, 1.0),
    'sole_y': 0.0,  # foot-local y: faces whose centre sits below this wear the 'sneaker' material (sole band), the rest stay white
}

BONE_LEN = {'root': 0.25, 'body': 0.4, 'cap': 0.2, 'tassel': 0.12, 'hand': 0.15, 'foot': 0.12}
BONES = ['root', 'body', 'cap', 'tassel', 'hand.L', 'hand.R', 'foot.L', 'foot.R']
FACE_NODES = ['eye.L', 'eye.R', 'happy.L', 'happy.R', 'brow.L', 'brow.R', 'smile', 'mouth', 'cheek.L', 'cheek.R']

MATERIALS = {
    # name: base, roughness, metallic, coat, coat roughness, sheen, sheen tint, emission
    'white': dict(base='#f7f7f5', rough=0.6, coat=0.12, coat_rough=0.6, sheen=1.0, sheen_rough=0.5, sheen_tint='#ffffff'),
    'hand': dict(base='#fdfdfc', rough=0.6, coat=0.12, coat_rough=0.6, sheen=1.0, sheen_rough=0.5, sheen_tint='#ffffff'),
    'eye': dict(base='#131316', rough=0.12, coat=1.0, coat_rough=0.05),
    'highlight': dict(base='#ffffff', rough=0.5, emission='#ffffff'),
    'ink': dict(base='#2c2224', rough=0.55),
    'mouth': dict(base='#3a2224', rough=0.7),
    'tongue': dict(base='#e48c88', rough=0.6),
    'cap': dict(base='#ffffff', rough=0.7, sheen=1.0, sheen_rough=0.5, sheen_tint='#b8c4ff', vertex_color=True),
    'sneaker': dict(base='#ff6b5b', rough=0.45, coat=0.35, coat_rough=0.25),  # concept sheet coral; recolourable like 'cap'
    'gold': dict(base='#ffc83d', rough=0.3, metal=0.55, coat=1.0, coat_rough=0.08),  # PALETTE.sun
    'pearl': dict(base='#fbfaff', rough=0.18, coat=1.0, coat_rough=0.05, emission='#ffffff', emission_strength=0.12),
}

EXPORT = {'fps': 60}

PREVIEW = {
    'size': (300, 340),
    'samples': 16,
    'camera': (0.0, 1.7, 8.0),  # three axes
    'look_at': (0.0, 1.4, 0.0),
    'lens': 85,
    'moments': (0.2, 0.5, 0.8),  # share of each clip's duration
    'background': (0.55, 0.6, 0.7),
    'world_strength': 0.5,
    'lights': {'key': ((2.5, 6, 5), 260, 3), 'fill': ((-5, 2.5, 3), 90, 4), 'rim': ((-2, 4, -5), 220, 3)},
    'floor': '#e9e6f2',
}

# three.js axes -> Blender axes: (x, y, z) -> (x, -z, y). det = +1, so winding is kept.
C3 = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
C4 = C3.to_4x4()
C4_INV = C4.inverted()


def to_blender(m3):
    """A three-space 4x4 transform as a Blender-space transform."""
    return C4 @ m3 @ C4_INV


def v3(x, y, z):
    """A three-space point in Blender axes."""
    return C3 @ Vector((x, y, z))


def three_euler(x, y, z):
    """three.js Euler 'XYZ' (radians) as a 4x4: Rx @ Ry @ Rz."""
    return (Matrix.Rotation(x, 4, 'X') @ Matrix.Rotation(y, 4, 'Y') @ Matrix.Rotation(z, 4, 'Z'))


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def S(x, y, z):
    return Matrix.Diagonal((x, y, z, 1.0))


def hex_linear(h):
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def place_on_sphere(x, y, off=0.0, rot_z=0.0):
    """placeOnSphere() from geometry.ts: on the body sphere, facing out, then spun about local z."""
    r = MODEL['body_r']
    z = math.sqrt(max(0.0, r * r - x * x - y * y))
    n = Vector((x, y, z)).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n)
    if rot_z:
        q = q @ Quaternion((0, 0, 1), rot_z)
    return Matrix.Translation(n * (r + off)) @ q.to_matrix().to_4x4()


# ---------------------------------------------------------------------------
# Scene, materials

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = EXPORT['fps']
    return scene


def make_cheek_image():
    n = CHEEK['texture']
    r, g, b, a = CHEEK['rgba']
    img = bpy.data.images.new('cheek_blush', n, n, alpha=True)
    lin = hex_linear('#%02x%02x%02x' % (r, g, b))
    px = []
    for j in range(n):
        for i in range(n):
            d = math.hypot((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1)
            k = max(0.0, 1.0 - d)
            px += [lin[0], lin[1], lin[2], a * k]
    img.pixels.foreach_set(px)
    img.pack()
    return img


def make_material(name, base, rough, metal=0.0, coat=0.0, coat_rough=0.03, sheen=0.0, sheen_rough=0.5,
                  sheen_tint='#ffffff', emission=None, emission_strength=1.0, vertex_color=False, image=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    inp = bsdf.inputs
    inp['Base Color'].default_value = (*hex_linear(base), 1.0)
    inp['Roughness'].default_value = rough
    inp['Metallic'].default_value = metal
    inp['Coat Weight'].default_value = coat
    inp['Coat Roughness'].default_value = coat_rough
    inp['Sheen Weight'].default_value = sheen
    inp['Sheen Roughness'].default_value = sheen_rough
    inp['Sheen Tint'].default_value = (*hex_linear(sheen_tint), 1.0)
    if emission:
        inp['Emission Color'].default_value = (*hex_linear(emission), 1.0)
        inp['Emission Strength'].default_value = emission_strength
    if vertex_color:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], inp['Base Color'])
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], inp['Base Color'])
        nt.links.new(tex.outputs['Alpha'], inp['Alpha'])
        mat.surface_render_method = 'BLENDED'
    mat.diffuse_color = (*hex_linear(base), 1.0)
    return mat


def build_materials():
    mats = {k: make_material(k, **v) for k, v in MATERIALS.items()}
    mats['cheek'] = make_material('cheek', '#ffffff', 0.9, image=make_cheek_image())
    return mats


# ---------------------------------------------------------------------------
# Mesh builders. Each adds a part to a bmesh in three-space object-local
# coordinates; finish() converts the whole bmesh to Blender axes at the end.

def _tag(bm, verts, mat_index, color=None, col_layer=None):
    faces = {f for v in verts for f in v.link_faces}
    for f in faces:
        f.material_index = mat_index
    if color is not None:
        for v in verts:
            v[col_layer] = (*color(v.co), 1.0)


def add_sphere(bm, r, segs, xf=Matrix.Identity(4), mat=0):
    # Poles on +-y, like three's SphereGeometry.
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=r,
                                    matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    verts = ret['verts']
    bmesh.ops.transform(bm, matrix=xf, verts=verts)
    _tag(bm, verts, mat)
    return verts


def add_capsule(bm, r, length, segs, xf=Matrix.Identity(4), mat=0):
    # Sphere with an odd ring count, hemispheres pushed apart along y.
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1] | 1, radius=r,
                                    matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    verts = ret['verts']
    for v in verts:
        v.co.y += math.copysign(length / 2, v.co.y)
    bmesh.ops.transform(bm, matrix=xf, verts=verts)
    _tag(bm, verts, mat)
    return verts


def add_cylinder(bm, rt, rb, h, segs, xf=Matrix.Identity(4), mat=0, bevel=0.0, color=None, col_layer=None):
    ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=rb, radius2=rt,
                                depth=h, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    verts = ret['verts']
    if bevel > 0:
        bm.normal_update()
        vs = set(verts)
        rims = [e for e in bm.edges if e.verts[0] in vs and e.verts[1] in vs and len(e.link_faces) == 2
                and e.link_faces[0].normal.angle(e.link_faces[1].normal) > math.radians(60)]
        out = bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=4, profile=0.5, affect='EDGES', clamp_overlap=True)
        verts = list(vs | set(out['verts']))
        verts = [v for v in verts if v.is_valid]
    if color is not None:
        for v in verts:
            k = min(1.0, max(0.0, (v.co.y + h / 2) / h))
            v[col_layer] = (*color(k), 1.0)
    bmesh.ops.transform(bm, matrix=xf, verts=verts)
    _tag(bm, verts, mat)
    return verts


def add_box(bm, size, xf=Matrix.Identity(4), mat=0, bevel=0.0, color=None, col_layer=None):
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=S(*size))
    verts = ret['verts']
    if bevel > 0:
        vs = set(verts)
        edges = [e for e in bm.edges if e.verts[0] in vs and e.verts[1] in vs]
        out = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=4, profile=0.5, affect='EDGES', clamp_overlap=True)
        verts = [v for v in (vs | set(out['verts'])) if v.is_valid]
    if color is not None:
        h = size[1]
        for v in verts:
            k = min(1.0, max(0.0, (v.co.y + h / 2) / h))
            v[col_layer] = (*color(k), 1.0)
    bmesh.ops.transform(bm, matrix=xf, verts=verts)
    _tag(bm, verts, mat)
    return verts


def add_torus_arc(bm, R, tube, segs, arc, xf=Matrix.Identity(4), mat=0):
    """three's TorusGeometry(R, tube, radial, tubular, arc) with round end caps."""
    radial, tubular = segs
    rows = []
    for i in range(tubular + 1):
        u = i / tubular * arc
        row = []
        for j in range(radial):
            v = j / radial * math.pi * 2
            row.append(bm.verts.new(((R + tube * math.cos(v)) * math.cos(u),
                                     (R + tube * math.cos(v)) * math.sin(u),
                                     tube * math.sin(v))))
        rows.append(row)
    verts = [v for row in rows for v in row]
    for i in range(tubular):
        for j in range(radial):
            a, b = rows[i][j], rows[i + 1][j]
            c, d = rows[i + 1][(j + 1) % radial], rows[i][(j + 1) % radial]
            bm.faces.new((a, b, c, d))
    for u in (0.0, arc):  # round caps
        verts += add_sphere(bm, tube, (12, 8), T(R * math.cos(u), R * math.sin(u), 0.0))
    bmesh.ops.transform(bm, matrix=xf, verts=verts)
    _tag(bm, verts, mat)
    return verts


def add_sparkle(bm, depth, bevel, xf=Matrix.Identity(4), mat=0):
    """The four-point sparkle from geometry.ts (bezier outline), extruded and bevelled."""
    k, kx, c, e = 0.13, 0.11, 0.012, 0.05
    curves = [((0, k), (c, e), (e, c), (kx, 0)), ((kx, 0), (e, -c), (c, -e), (0, -k)),
              ((0, -k), (-c, -e), (-e, -c), (-kx, 0)), ((-kx, 0), (-e, c), (-c, e), (0, k))]
    pts = []
    for p0, p1, p2, p3 in curves:
        for s in range(10):
            t = s / 10
            mt = 1 - t
            pts.append((mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                        mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1]))
    front = [bm.verts.new((x, y, depth)) for x, y in pts]
    back = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    n = len(pts)
    faces = [bm.faces.new(front), bm.faces.new(list(reversed(back)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((back[i], back[j], front[j], front[i])))
    rim = [e for e in bm.edges if (e.verts[0] in front and e.verts[1] in front) or (e.verts[0] in back and e.verts[1] in back)]
    out = bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
    verts = [v for v in set(front + back + out['verts']) if v.is_valid]
    bmesh.ops.transform(bm, matrix=xf, verts=verts)
    _tag(bm, verts, mat)
    return verts


def add_plane(bm, w, h, xf=Matrix.Identity(4), mat=0):
    uv = bm.loops.layers.uv.verify()
    vs = [bm.verts.new((-w / 2, -h / 2, 0)), bm.verts.new((w / 2, -h / 2, 0)),
          bm.verts.new((w / 2, h / 2, 0)), bm.verts.new((-w / 2, h / 2, 0))]
    f = bm.faces.new(vs)
    for loop, co in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = co
    bmesh.ops.transform(bm, matrix=xf, verts=vs)
    _tag(bm, vs, mat)
    return vs


# ---------------------------------------------------------------------------
# Objects and rig

def new_object(name, bm, mats, world3, arm, bone, subsurf=0, sharp_angle=None):
    """Mesh object from a three-space bmesh, placed at `world3`, rigidly parented to `bone`."""
    bmesh.ops.transform(bm, matrix=C4, verts=bm.verts)
    me = bpy.data.meshes.new(name + '_geo')
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.shade_smooth()
    if sharp_angle is not None:
        me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = to_blender(world3)  # bone parent space resolved by Blender: nothing jumps
    if subsurf:
        mod = obj.modifiers.new('Subdivision', 'SUBSURF')
        mod.levels = mod.render_levels = subsurf
    return obj


def rig_points():
    """Rest positions (three space, floor origin) of every bone and the cap frame."""
    by = MODEL['body_y']
    body = T(0, by, 0)
    cap_frame = body @ T(*CAP['offset']) @ three_euler(*CAP['tilt'])
    cap_pivot = (cap_frame @ Vector((0, CAP['pivot_y'], 0)))
    tassel_at = (cap_frame @ Vector(CAP['tassel_at']))
    hx, hy, hz = HAND['rest']
    fx, fy, fz = FOOT['rest']
    pts = {
        'root': Vector((0, 0, 0)),
        'body': Vector((0, by, 0)),
        'cap': cap_pivot,
        'tassel': tassel_at,
        'hand.L': Vector((hx, by + hy, hz)),
        'hand.R': Vector((-hx, by + hy, hz)),
        'foot.L': Vector((fx, fy, fz)),
        'foot.R': Vector((-fx, fy, fz)),
    }
    return pts, cap_frame


PARENTS = {'root': None, 'body': 'root', 'cap': 'body', 'tassel': 'cap',
           'hand.L': 'root', 'hand.R': 'root', 'foot.L': 'root', 'foot.R': 'root'}


def build_armature(pts):
    arm_data = bpy.data.armatures.new('tutor_rig')
    arm = bpy.data.objects.new('tutor', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name in BONES:
        eb = arm_data.edit_bones.new(name)
        head = v3(*pts[name])
        length = BONE_LEN[name.split('.')[0]]
        eb.head = head
        eb.tail = head + Vector((0, 0, length))  # every bone points up (three +y): local axes == three axes
        eb.roll = 0.0
        if PARENTS[name]:
            eb.parent = arm_data.edit_bones[PARENTS[name]]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    return arm


def build_body(arm, mats_by_name, pts, cap_frame):
    M = mats_by_name
    by = MODEL['body_y']
    body_world = T(0, by, 0)
    r = MODEL['body_r']

    # Gumdrop body: sphere with a flared, flattened base (buildBodyGeometry()).
    bm = bmesh.new()
    verts = add_sphere(bm, r, MODEL['body_segments'])
    for v in verts:
        x, y, z = v.co
        if y < 0:
            k = 1 + MODEL['flare'] * (-y / r)
            x *= k
            z *= k
        if y < MODEL['flat_y']:
            y = MODEL['flat_y'] + (y - MODEL['flat_y']) * MODEL['flat_k']
        v.co = (x, y, z)
    new_object('body_mesh', bm, [M['white']], body_world, arm, 'body', subsurf=MODEL['subsurf'])

    # Face: separate nodes on the body bone, the app drives them.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ex, ey, eo, er = FACE['eye']
        bm = bmesh.new()
        sq = S(*EYE['scale'])
        add_sphere(bm, EYE['r'], EYE['segments'], sq, mat=0)
        for (gx, gy, gz), gr in EYE['glints']:
            add_sphere(bm, gr, (16, 10), sq @ T(gx, gy, gz), mat=1)
        new_object('eye.' + sfx, bm, [M['eye'], M['highlight']], body_world @ place_on_sphere(side * ex, ey, eo, er), arm, 'body')

        hx, hy, ho, hr = FACE['happy']
        R, tube, arc = ARCS['happy']
        bm = bmesh.new()
        add_torus_arc(bm, R, tube, ARCS['segments'], arc)
        new_object('happy.' + sfx, bm, [M['ink']], body_world @ place_on_sphere(side * hx, hy, ho, hr), arm, 'body')

        bx, byy, bo, br = FACE['brow']
        R, tube, arc = ARCS['brow']
        bm = bmesh.new()
        add_torus_arc(bm, R, tube, ARCS['segments'], arc)
        roll = br - side * FACE['brow_tilt']
        new_object('brow.' + sfx, bm, [M['ink']], body_world @ place_on_sphere(side * bx, byy, bo, roll), arm, 'body')

        cx, cy, co, cr = FACE['cheek']
        bm = bmesh.new()
        add_plane(bm, *CHEEK['size'])
        new_object('cheek.' + sfx, bm, [M['cheek']], body_world @ place_on_sphere(side * cx, cy, co, cr), arm, 'body')

    sx, sy, so, sr = FACE['smile']
    R, tube, arc = ARCS['smile']
    bm = bmesh.new()
    add_torus_arc(bm, R, tube, ARCS['segments'], arc)
    new_object('smile', bm, [M['ink']], body_world @ place_on_sphere(sx, sy, so, sr), arm, 'body')

    mx, my, mo, mr = FACE['mouth']
    bm = bmesh.new()
    add_sphere(bm, MOUTH['r'], (32, 16), S(*MOUTH['scale']), mat=0)
    add_sphere(bm, MOUTH['tongue_r'], (24, 12), T(*MOUTH['tongue_pos']) @ S(*MOUTH['tongue_scale']), mat=1)
    new_object('mouth', bm, [M['mouth'], M['tongue']], body_world @ place_on_sphere(mx, my, mo, mr), arm, 'body')

    # Cap: skull + board carry the 'cap' material and the indigo->violet gradient.
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new('Col')
    sk = CAP['skull']
    s0, s1 = hex_linear(sk['colors'][0]), hex_linear(sk['colors'][1])
    add_cylinder(bm, sk['rt'], sk['rb'], sk['h'], sk['segments'], T(0, sk['y'], 0), bevel=sk['bevel'],
                 color=lambda k: tuple(a + (b - a) * k for a, b in zip(s0, s1)), col_layer=col)
    bd = CAP['board']
    b0, b1 = hex_linear(bd['colors'][0]), hex_linear(bd['colors'][1])
    add_box(bm, bd['size'], T(0, bd['y'], 0) @ Matrix.Rotation(bd['yaw'], 4, 'Y'), bevel=bd['bevel'],
            color=lambda k: tuple(a + (b - a) * k for a, b in zip(b0, b1)), col_layer=col)
    new_object('cap_mesh', bm, [M['cap']], cap_frame, arm, 'cap', sharp_angle=50)

    bm = bmesh.new()
    bt = CAP['button']
    add_sphere(bm, bt['r'], (24, 12), T(0, bt['y'], 0) @ S(1, bt['squash'], 1))
    cd = CAP['cord']
    add_cylinder(bm, cd['r'], cd['r'], cd['len'], 10, T(cd['len'] / 2, cd['y'], 0) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
    new_object('cap_trim', bm, [M['gold']], cap_frame, arm, 'cap')

    em = CAP['emblem']
    bm = bmesh.new()
    add_sparkle(bm, em['depth'], em['bevel'], S(em['scale'], em['scale'], 1))
    new_object('cap_emblem', bm, [M['pearl']], cap_frame @ T(*em['pos']) @ Matrix.Rotation(em['pitch'], 4, 'X'), arm, 'cap', sharp_angle=40)

    # Tassel hangs straight down in the world at rest; the tassel bone swings it.
    bm = bmesh.new()
    st = CAP['string']
    add_cylinder(bm, st['r'], st['r'], st['len'], 10, T(0, -st['len'] / 2, 0))
    add_sphere(bm, CAP['knot']['r'], (16, 10), T(0, CAP['knot']['y'], 0))
    bu = CAP['bulb']
    add_cylinder(bm, bu['rt'], bu['rb'], bu['h'], 20, T(0, bu['y'], 0), bevel=0.012)
    new_object('tassel_mesh', bm, [M['gold']], T(*pts['tassel']), arm, 'tassel', sharp_angle=50)

    # Mitten hands with thumb nubs, and the rounded feet.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bm = bmesh.new()
        add_capsule(bm, HAND['r'], HAND['len'], (28, 14), S(1, 1, HAND['flat']))
        tx, ty, tz = HAND['thumb_pos']
        add_capsule(bm, HAND['thumb_r'], 0.0, (20, 11),
                    T(side * tx, ty, tz) @ Matrix.Rotation(side * HAND['thumb_roll'], 4, 'Z') @ S(*HAND['thumb_scale']))
        px, py, pz = HAND['tilt']
        xf = T(*pts['hand.' + sfx]) @ three_euler(px, py, -side * pz)
        new_object('hand_mesh.' + sfx, bm, [M['hand']], xf, arm, 'hand.' + sfx, subsurf=MODEL['subsurf'])

        # Sneakers: white upper, coral sole band (material slot 1 = 'sneaker').
        bm = bmesh.new()
        add_capsule(bm, FOOT['r'], FOOT['len'], (24, 13), S(*FOOT['scale']) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        for f in bm.faces:
            f.material_index = 1 if f.calc_center_median().y < FOOT['sole_y'] else 0
        xf = T(*pts['foot.' + sfx]) @ Matrix.Rotation(side * FOOT['toe_out'], 4, 'Y')
        new_object('foot_mesh.' + sfx, bm, [M['hand'], M['sneaker']], xf, arm, 'foot.' + sfx, subsurf=MODEL['subsurf'])


# ---------------------------------------------------------------------------
# Clips

EASES = {'linear', 'bezier', 'constant', 'back', 'bounce', 'elastic'}
FACES = {'neutral', 'happy', 'closed', 'surprised', 'focused'}
FX = {'confetti', 'sparkles', 'hearts', 'stars', 'ring', 'levelup'}


def validate(clips):
    names = [c['name'] for c in clips]
    assert len(names) == len(set(names)), 'duplicate clip names'
    for c in clips:
        n = c['name']
        assert c['face'] in FACES, (n, c['face'])
        for t, kind in c.get('fx', []):
            assert kind in FX and 0 <= t <= c['duration'], (n, t, kind)
        for bone, keys in c['keys'].items():
            assert bone in BONES, (n, bone)
            times = [k[0] for k in keys]
            assert times == sorted(times) and times[0] >= 0 and times[-1] <= c['duration'] + 1e-6, (n, bone, times)
            for k in keys:
                assert len(k) < 3 or k[2] in EASES, (n, bone, k)
            if bone == 'root':
                for k in keys:
                    loc = k[1].get('loc', [0, 0, 0])
                    assert abs(loc[0]) < 1e-9 and abs(loc[2]) < 1e-9, (n, 'root X/Z translation is not allowed')
            if c['loop']:
                assert abs(times[0]) < 1e-9 and abs(times[-1] - c['duration']) < 1e-6, (n, bone, 'loop keys must span 0..duration')
                first, last = keys[0][1], keys[-1][1]
                for ch in ('loc', 'rot', 'scale'):
                    a = first.get(ch)
                    b = last.get(ch)
                    if a or b:
                        rest = [1, 1, 1] if ch == 'scale' else [0, 0, 0]
                        a, b = a or rest, b or rest
                        assert all(abs(p - q) < 1e-6 for p, q in zip(a, b)), (n, bone, ch, 'loop first != last')
            prev = None
            for k in keys:  # Euler continuity needs < 180 deg per segment
                rot = k[1].get('rot', [0, 0, 0])
                if prev is not None:
                    assert all(abs(p - q) < 180 for p, q in zip(rot, prev)), (n, bone, 'split rotations > 180 deg')
                prev = rot


def bone_frames(arm):
    """3x3 maps three-axes vectors into each bone's rest-local axes."""
    out = {}
    for b in arm.data.bones:
        B = b.matrix_local.to_3x3()  # bone-local -> armature (Blender axes)
        out[b.name] = B.inverted() @ C3
    return out


def key_values(bone_keys, A):
    """Per key: (time, loc, euler, scale) in bone-local channels."""
    rows = []
    prev_euler = None
    for k in bone_keys:
        t, ch = k[0], k[1]
        loc = A @ Vector(ch.get('loc', (0, 0, 0)))
        rx, ry, rz = (math.radians(a) for a in ch.get('rot', (0, 0, 0)))
        R_local = (A @ three_euler(rx, ry, rz).to_3x3() @ A.inverted())
        eu = R_local.to_euler('XYZ', prev_euler) if prev_euler is not None else R_local.to_euler('XYZ')
        if prev_euler is None:
            # Keep big authored first-key angles (e.g. a held 360) by matching the authored sign/turns.
            ref = A @ Vector((rx, ry, rz))
            eu = R_local.to_euler('XYZ', type(eu)((ref.x, ref.y, ref.z)))
        prev_euler = eu
        sc = ch.get('scale', (1, 1, 1))
        Sl = A @ Matrix.Diagonal(sc) @ A.inverted()
        assert all(abs(Sl[i][j]) < 1e-6 for i in range(3) for j in range(3) if i != j), 'bone axes must be a signed permutation of three axes'
        rows.append((t, loc, eu, Vector((abs(Sl[0][0]), abs(Sl[1][1]), abs(Sl[2][2]))), k[2] if len(k) > 2 else 'bezier'))
    return rows


def set_interp(kp, ease):
    if ease == 'linear':
        kp.interpolation = 'LINEAR'
    elif ease == 'constant':
        kp.interpolation = 'CONSTANT'
    elif ease == 'back':
        kp.interpolation = 'BACK'
        kp.easing = 'EASE_OUT'
        kp.back = 2.2
    elif ease == 'bounce':
        kp.interpolation = 'BOUNCE'
        kp.easing = 'EASE_OUT'
    elif ease == 'elastic':
        kp.interpolation = 'ELASTIC'
        kp.easing = 'EASE_OUT'
        kp.amplitude = 0.0
        kp.period = 0.0
    else:
        kp.interpolation = 'BEZIER'


def build_action(arm, clip, frames):
    fps = EXPORT['fps']
    act = bpy.data.actions.new(clip['name'])
    act.use_fake_user = True
    slot = act.slots.new(id_type='OBJECT', name='tutor')
    layer = act.layers.new('Layer')
    strip = layer.strips.new(type='KEYFRAME')
    cb = strip.channelbag(slot, ensure=True)
    for bone, keys in clip['keys'].items():
        used = {ch for k in keys for ch in k[1]}
        rows = key_values(keys, frames[bone])
        paths = [('loc', 'location', 1), ('rot', 'rotation_euler', 2), ('scale', 'scale', 3)]
        for ch, prop, idx in paths:
            if ch not in used:
                continue
            for axis in range(3):
                fc = cb.fcurves.new('pose.bones["%s"].%s' % (bone, prop), index=axis, group_name=bone)
                fc.keyframe_points.add(len(rows))
                for i, row in enumerate(rows):
                    kp = fc.keyframe_points[i]
                    kp.co = (row[0] * fps, row[idx][axis])
                    kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
                # A key's ease is how motion arrives at it: set it on the previous key's segment.
                for i in range(1, len(rows)):
                    set_interp(fc.keyframe_points[i - 1], rows[i][4])
                if clip['loop']:
                    fc.modifiers.new('CYCLES')  # cyclic auto handles: no hitch at the loop seam
                fc.update()
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = clip['duration'] * fps
    act.use_cyclic = bool(clip['loop'])
    return act, slot


def build_clips(arm, clips):
    frames = bone_frames(arm)
    arm.animation_data_create()
    built = []
    for clip in clips:
        act, slot = build_action(arm, clip, frames)
        track = arm.animation_data.nla_tracks.new()
        track.name = clip['name']
        st = track.strips.new(clip['name'], 0, act)
        st.action_slot = slot
        track.mute = True
        built.append((clip, act, slot))
    return built


# ---------------------------------------------------------------------------
# Export, measure, manifest

def measure():
    """Rest-pose height (floor to cap top) in model units, from evaluated meshes."""
    deps = bpy.context.evaluated_depsgraph_get()
    top = -1e9
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        ev = obj.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            top = max(top, (ev.matrix_world @ v.co).z)
        ev.to_mesh_clear()
    return top


def triangle_count():
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            ev = obj.evaluated_get(deps)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            ev.to_mesh_clear()
    return tris


def export_glb(arm):
    os.makedirs(OUT_DIR, exist_ok=True)
    ad = arm.animation_data
    ad.action = None
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.ops.export_scene.gltf(
        filepath=GLB_TMP,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_vertex_color='MATERIAL',
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_reset_pose_bones=True,
        export_rest_position_armature=True,
        export_def_bones=False,
        export_leaf_bone=False,
        export_morph=False,
        export_anim_slide_to_zero=False,
    )
    os.replace(GLB_TMP, GLB_PATH)


def write_manifest(clips, pts, height, tris):
    sanitize = lambda n: n.replace('.', '')  # three's PropertyBinding.sanitizeNodeName drops '.'
    manifest = {
        'clips': [{'name': c['name'], 'duration': c['duration'], 'loop': bool(c['loop']), 'face': c['face'],
                   'fx': c.get('fx', [])} for c in clips],
        'bones': BONES,
        'faceNodes': FACE_NODES,
        'threeNames': {n: sanitize(n) for n in BONES + FACE_NODES},
        'height': round(height, 4),
        'bodyCenterY': MODEL['body_y'],
        'bodyRadius': MODEL['body_r'],
        'restPositions': {n: [round(c, 4) for c in pts[n]] for n in BONES},
        'capMaterial': 'cap',
        'sneakerMaterial': 'sneaker',
        'fps': EXPORT['fps'],
        'triangles': tris,
        'notes': [
            'Model units, floor at y = 0, faces +Z. .L = his left = viewer right (+X).',
            'GLTFLoader strips "." from node names: look up "handL", "eyeL", ... (see threeNames).',
            'happy.L/R sit over the eyes at scale 1: hide them by default and toggle .visible.',
            "cap material = white x COLOR_0 (indigo->violet). To recolour: material.vertexColors = false, color.set(x), needsUpdate = true.",
            "sneaker material = the feet's coral sole band (#ff6b5b); the upper is white. To recolour: color.set(x).",
            'Blink: eye node scale.y 1 -> 0.1. Talk: mouth node scale.y.',
        ],
    }
    tmp = MANIFEST_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    os.replace(tmp, MANIFEST_PATH)


# ---------------------------------------------------------------------------
# Preview contact sheet (dev only; never inside the repo)

def look_at_matrix(eye, target):
    d = (target - eye).normalized()
    q = d.to_track_quat('-Z', 'Y')
    return Matrix.Translation(eye) @ q.to_matrix().to_4x4()


def render_previews(arm, built, out_dir):
    import numpy as np
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    try:
        scene.eevee.taa_render_samples = PREVIEW['samples']
    except AttributeError:
        pass
    w, h = PREVIEW['size']
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('preview')
    if world.node_tree is None:
        world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*PREVIEW['background'], 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = PREVIEW['world_strength']
    scene.world = world
    # Preview-only floor (rendered after export, never in the GLB) and hidden happy arcs.
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    floor_me = bpy.data.meshes.new('preview_floor')
    bm.to_mesh(floor_me)
    bm.free()
    floor_me.materials.append(make_material('preview_floor', PREVIEW['floor'], 0.8))
    scene.collection.objects.link(bpy.data.objects.new('preview_floor', floor_me))
    for n in ('happy.L', 'happy.R'):
        bpy.data.objects[n].hide_render = True
    cam_data = bpy.data.cameras.new('preview_cam')
    cam_data.lens = PREVIEW['lens']
    cam = bpy.data.objects.new('preview_cam', cam_data)
    scene.collection.objects.link(cam)
    cam.matrix_world = look_at_matrix(v3(*PREVIEW['camera']), v3(*PREVIEW['look_at']))
    scene.camera = cam
    for name, (pos, energy, size) in PREVIEW['lights'].items():
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.matrix_world = look_at_matrix(v3(*pos), v3(0, 1, 0))
    ad = arm.animation_data
    ad.use_nla = False
    fps = EXPORT['fps']
    tiles = []
    if PREVIEW_ONLY:
        built = [b for b in built if b[0]['name'] in PREVIEW_ONLY]
    for clip, act, slot in built:
        ad.action = act
        ad.action_slot = slot
        row = []
        for m in PREVIEW_MOMENTS or PREVIEW['moments']:
            scene.frame_set(int(round(clip['duration'] * m * fps)))
            path = os.path.join(out_dir, '%s_%d.png' % (clip['name'], int(round(m * 100))))
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            px = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            row.append(px.reshape(h, w, 4))
            bpy.data.images.remove(img)
        tiles.append(np.concatenate(row, axis=1))
    ad.action = None
    ad.use_nla = True
    # Sheet: clips stacked in columns of 7 rows.
    per_col = 7
    cols = []
    for i in range(0, len(tiles), per_col):
        col = tiles[i:i + per_col]
        while len(col) < per_col:
            col.append(np.ones_like(tiles[0]))
        cols.append(np.concatenate(col[::-1], axis=0))  # Blender images are bottom-up
    sheet = np.concatenate(cols, axis=1)
    sh, sw = sheet.shape[:2]
    out = bpy.data.images.new('contact_sheet', sw, sh, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(out_dir, 'contact_sheet.png')
    out.file_format = 'PNG'
    out.save()
    print('PREVIEW sheet', out.filepath_raw)


# ---------------------------------------------------------------------------

def main():
    with open(CLIPS_PATH, encoding='utf-8') as f:
        data = json.load(f)
    clips = data['clips']
    validate(clips)
    reset_scene()
    mats = build_materials()
    pts, cap_frame = rig_points()
    arm = build_armature(pts)
    build_body(arm, mats, pts, cap_frame)
    built = build_clips(arm, clips)
    bpy.context.view_layer.update()
    height = measure()
    tris = triangle_count()
    export_glb(arm)
    write_manifest(clips, pts, height, tris)
    print('BUILD ok: %d clips, height %.3f, %d triangles, %.2f MB' % (len(clips), height, tris, os.path.getsize(GLB_PATH) / 1e6))
    if PREVIEW_DIR:
        render_previews(arm, built, PREVIEW_DIR)


main()
