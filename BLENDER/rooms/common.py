"""Shared kit for the Study and Play rooms: materials, bevelled shapes, walls,
plank floors and floor paint, plus build() for the rest (AO bake, shading,
merge, GLB export: pipeline.py; preview render: preview.py). The contract numbers and
palettes live in contract.py and are re-exported here (C.APP, C.STUDY, C.T).

A room script imports it and builds, e.g. BLENDER/rooms/build_study_room.py:

    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import common as C

    root = C.new_room('study')
    wall = C.mat('wall', C.STUDY['wall'], light=False)
    C.walls([(0, C.TOP, wall)])
    ...
    C.build(root, C.out_path('study'))

and runs headless from the repo root:

  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup
      --python BLENDER/rooms/build_study_room.py [-- --preview tmp/rooms/study.png] [--no-bake]
      [--guides] [--out tmp/rooms/study_room.draft.glb]

Room frame. Every coordinate a helper takes is in three.js axes (x right,
y up, z toward the camera) and the app's world units, shifted so the floor is
y = 0: the app mounts a room GLB at [0, FLOOR_Y, 0] with no rotation or
scale, so room x/z ARE world x/z. T() converts a room point to Blender axes
(z up, camera on -y) once; the glTF exporter's +Y-up conversion maps it back.

Look. Flat palette colours, toy-like bevels. Each face takes its material's
palette colour, darkened by a Cycles AO bake (tinted toward the mock's shadow
ink) and a soft fixed key light, all written into one vertex-colour layer.
Export then swaps every static material for one unlit vertex-colour material
and joins the static meshes, so a room is about one draw call, has no
textures, and keeps the exact palette whatever the app's lights do (the app
sets toneMapped = false on it, as RoomShell does).
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from contract import *  # noqa: F403 (C.APP, C.STUDY, C.T, ... stay reachable as common.X)

# ---------------------------------------------------------------------------
# Scene and materials

_STATE = {'root': None, 'glows': []}


def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)
    _STATE['glows'] = []


def new_room(name):
    """Fresh scene with the room's root empty (`room_<name>`); every helper parents to it."""
    reset_scene()
    root = bpy.data.objects.new('room_%s' % name, None)
    bpy.context.scene.collection.objects.link(root)
    root['gg_room'] = name
    _STATE['root'] = root
    return root


def mat(name, hex_, *, top=None, ao=True, light=True, keep=False):
    """A palette material. Its colour only drives the vertex-colour bake.
    top: a second colour; faces then run from hex_ at the object's bottom to top at its top (sky glass).
    ao / light: take the AO bake / the soft key light (off for glass, screens and glows;
      light off for big walls and floors whose palette colour is already the look).
    keep: survives export as its own unlit material (named after it) instead of the
      shared vertex-colour one, for a surface the app restyles (the scoreboard screen)."""
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*hex_linear(hex_), 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
    m.diffuse_color = (*hex_linear(hex_), 1.0)
    m['gg_hex'] = hex_
    m['gg_ao'] = ao
    m['gg_light'] = light
    m['gg_keep'] = keep
    if top:
        m['gg_top'] = top
    return m


def _object(name, bm, mats, *, parent=None, node=False, shell=False, decal=False, underlay=False, smooth=False):
    """Links a bmesh as an object. node: an app-driven name (kept separate, never
    renamed). shell: walls and floors (skip the zone checks). decal: lies flat on
    another surface (hidden while underlays bake). underlay: the floor's seam base."""
    if node and bpy.data.objects.get(name) is not None:
        raise ValueError('node name %r is already used' % name)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent or _STATE['root']
    ob['gg_node'] = node
    ob['gg_shell'] = shell
    ob['gg_decal'] = decal
    ob['gg_underlay'] = underlay
    return ob


def _place(bm, center, yaw=0.0, pitch=0.0):
    """yaw turns about +y (three), pitch about +x, then the mesh moves to center."""
    if pitch:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(pitch, 3, 'X'))
    if yaw:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, 'Z'))
    bmesh.ops.translate(bm, vec=T(*center), verts=bm.verts)


def node(name, at, *, parent=None, extras=None):
    """A named empty the app reads (a spot, a slot, a pivot)."""
    if bpy.data.objects.get(name) is not None:
        raise ValueError('node name %r is already used' % name)
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent or _STATE['root']
    # A parent made a moment ago has a stale matrix_world until the view layer updates.
    bpy.context.view_layer.update()
    ob.location = ob.parent.matrix_world.inverted() @ T(*at)
    ob.empty_display_size = 0.1
    ob['gg_node'] = True
    for k, v in (extras or {}).items():
        ob['x_' + k] = v  # exported as glTF extras (prefix stripped)
    return ob


def slots(name, points, *, extras=None):
    """A named empty at the points' centre with one child empty per point, named
    <name>_0, <name>_1, ... in order (the ball rack's slots): the app walks the
    children, so it needs no count or spacing of its own."""
    pts = [Vector(p) for p in points]
    group = node(name, tuple(sum(pts, Vector()) / len(pts)), extras={'count': len(pts), **(extras or {})})
    for i, p in enumerate(pts):
        node('%s_%d' % (name, i), tuple(p), parent=group)
    return group


def set_origin(ob, at):
    """A named mesh's pivot (room point) instead of its bounds centre, which the
    merge uses by default: e.g. the net's top ring, or a rim built off-centre."""
    ob['gg_origin'] = tuple(at)


def loose(ob, at):
    """Makes a mesh a loose prop: a named node the app may hide or move (the
    basketball on the court). It stays out of room_static, pivots at `at`, and
    bakes after everything else with nothing hidden for it, so hiding it leaves
    no shadow on the floor."""
    ob['gg_node'] = True
    ob['gg_loose'] = True
    set_origin(ob, at)
    return ob


def stable_faces(bm):
    """Sorts faces by their sorted vertex indices. create_uvsphere returns its
    faces in a different order on every run, so without this the GLB's bytes
    (and its sha256) change from build to build with nothing else changed."""
    bm.verts.index_update()
    n = len(bm.verts) + 1

    def key(f):  # bmesh wants a number: a face's (up to 4) sorted vertex indices in base n
        s = sorted(v.index for v in f.verts)[:4]
        s += [n - 1] * (4 - len(s))
        return ((s[0] * n + s[1]) * n + s[2]) * n + s[3]

    bm.faces.sort(key=key)
    bm.faces.index_update()


# ---------------------------------------------------------------------------
# Shapes. Sizes are (x, height, depth); centres are room points.


def box(name, center, size, material, *, bevel=None, segments=None, yaw=0.0, **kw):
    """A box with rounded (bevelled) edges. bevel=0 for a sharp one."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=T_size(*size), verts=bm.verts)
    b = min(BEVEL['width'] if bevel is None else bevel, 0.45 * min(size))
    if b > 1e-4:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=b, offset_type='OFFSET',
                        segments=BEVEL['segments'] if segments is None else segments,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    _place(bm, center, yaw)
    return _object(name, bm, [material], **kw)


def floor_box(name, x, z, size, material, **kw):
    """A box standing on the floor at (x, z)."""
    return box(name, (x, size[1] / 2, z), size, material, **kw)


def cylinder(name, center, radius, height, material, *, radius_top=None, axis='y', segments=32, bevel=None, yaw=0.0, **kw):
    """A cylinder (or a cone with radius_top) along a room axis, with rounded cap edges."""
    bm = bmesh.new()
    rt = radius if radius_top is None else radius_top
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=rt, depth=height)
    b = min(BEVEL['width'] if bevel is None else bevel, 0.45 * min(radius, rt, height / 2)) if min(radius, rt) > 0 else 0
    if b > 1e-4:
        h = height / 2 - 1e-5
        rims = [e for e in bm.edges if all(abs(v.co.z) > h for v in e.verts)]
        bmesh.ops.bevel(bm, geom=rims, offset=b, offset_type='OFFSET', segments=BEVEL['segments'],
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.99  # smooth sides, flat caps
    if axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    _place(bm, center, yaw)
    return _object(name, bm, [material], **kw)


def sphere(name, center, radius, material, *, scale=(1, 1, 1), segments=24, rings=14, **kw):
    """A UV sphere; scale (x, height, depth) squashes it (soft blocks, pebbles)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    stable_faces(bm)
    bmesh.ops.scale(bm, vec=T_size(*scale), verts=bm.verts)
    _place(bm, center)
    return _object(name, bm, [material], smooth=True, **kw)


def torus(name, center, major, minor, material, *, axis='y', segments=40, sides=10, arc=2 * math.pi, **kw):
    """A ring around a room axis (axis 'y' lies flat, like a rim). arc < 2 pi leaves it open."""
    bm = bmesh.new()
    closed = arc >= 2 * math.pi - 1e-6
    n = segments if closed else segments + 1
    rings = []
    for i in range(n):
        a = arc * i / segments
        c, s = math.cos(a), math.sin(a)
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * c, r * s, minor * math.sin(b))))
        rings.append(ring)
    for i in range(segments):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for j in range(sides):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % sides], r0[(j + 1) % sides]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    _place(bm, center)
    return _object(name, bm, [material], smooth=True, **kw)


def quad(name, center, size, material, *, facing='+z', cuts=(1, 1), uv=False, **kw):
    """A flat w x h panel facing a room axis ('+z' toward the camera, '-x' off the
    right wall, '+y' up). uv=True gives it a 0..1 UV map, (0, 0) at its bottom-left
    as seen from the front (glTF flips v: a texture on it wants flipY = false)."""
    w, h = size
    nu, nv = cuts
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap') if uv else None
    grid_v = [[bm.verts.new(((i / nu - 0.5) * w, (j / nv - 0.5) * h, 0)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((grid_v[i][j], grid_v[i + 1][j], grid_v[i + 1][j + 1], grid_v[i][j + 1]))
            if uv_layer:
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_layer].uv = (co.x / w + 0.5, co.y / h + 0.5)
    # Built in Blender XY facing +Z; turn so it faces the requested room axis.
    turn = {
        '+z': Matrix.Rotation(math.pi / 2, 3, 'X'),  # Blender -Y
        '-z': Matrix.Rotation(math.pi / 2, 3, 'X') @ Matrix.Rotation(math.pi, 3, 'Y'),
        '+x': Matrix.Rotation(math.pi / 2, 3, 'Z') @ Matrix.Rotation(math.pi / 2, 3, 'X'),
        '-x': Matrix.Rotation(-math.pi / 2, 3, 'Z') @ Matrix.Rotation(math.pi / 2, 3, 'X'),
        '+y': Matrix.Identity(3),
    }[facing]
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=turn)
    _place(bm, center)
    return _object(name, bm, [material], **kw)


def text(name, s, center, size, material, *, depth=0.0, facing='+z', font_path=None, align='CENTER', **kw):
    """Text as a mesh (labels, scoreboard digits), centred on center, facing a room axis.
    size is the cap height-ish font size in world units; depth extrudes it.
    font_path: a TTF (default: font(), the bundled Figtree ExtraBold)."""
    cu = bpy.data.curves.new(name + '_text', 'FONT')
    cu.body = s
    cu.size = size
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.extrude = depth / 2
    path = font_path or font()
    if path:
        cu.font = bpy.data.fonts.load(path, check_existing=True)
    tmp = bpy.data.objects.new(name + '_text', cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    turn = {'+z': Matrix.Rotation(math.pi / 2, 3, 'X'),
            '-x': Matrix.Rotation(-math.pi / 2, 3, 'Z') @ Matrix.Rotation(math.pi / 2, 3, 'X'),
            '+x': Matrix.Rotation(math.pi / 2, 3, 'Z') @ Matrix.Rotation(math.pi / 2, 3, 'X')}[facing]
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=turn)
    _place(bm, center)
    return _object(name, bm, [material], **kw)


# The room font ships with the scripts (fonts/, SIL OFL 1.1, licence beside it),
# so a build on any machine draws the same glyphs: Figtree ExtraBold is the
# app's own display face (Figtree 800). Static, not variable: Blender's FreeType
# path would draw a variable font at its default weight.
FONT = os.path.join(FONT_DIR, 'Figtree-ExtraBold.ttf')
FONT_FALLBACKS = ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf',
                  '/System/Library/Fonts/Supplemental/Arial Bold.ttf')
_FONT_WARNED = set()


def font():
    """The bundled room font's path. If it is missing, the first system bold
    font found (or None: Blender's built-in Bfont), with one ROOM WARN, since the
    labels then differ from machine to machine."""
    if os.path.exists(FONT):
        return FONT
    path = next((p for p in FONT_FALLBACKS if os.path.exists(p)), None)
    if path not in _FONT_WARNED:
        _FONT_WARNED.add(path)
        print('ROOM WARN font: %s is missing; using %s' % (FONT, path or "Blender's built-in font"))
    return path

# ---------------------------------------------------------------------------
# Walls, floors and floor paint


def steps(length, *, fine=0.06, coarse=0.45, growth=1.6, breaks=()):
    """Cut positions 0..length: dense next to each end and break (where AO changes
    fastest), coarse in between. Every break is a cut, so colour bands stay crisp."""
    anchors = [0.0, length] + [b for b in breaks if 0 < b < length]
    cuts = set(anchors)
    for a in anchors:
        d, s = 0.0, fine
        while s < coarse:
            d += s
            for p in (a - d, a + d):
                if 0 < p < length:
                    cuts.add(p)
            s *= growth
    out = sorted(cuts)
    filled = [out[0]]
    for p in out[1:]:
        gap = p - filled[-1]
        if gap > coarse:
            k = math.ceil(gap / coarse)
            filled += [filled[-1] + gap * i / k for i in range(1, k)]
        if p - filled[-1] > 1e-4:
            filled.append(p)
    return filled


def grid(name, origin, u, v, us, vs, material_at, *, tint_at=None, **kw):
    """A flat panel of quads: corner (i, j) = origin + u * us[i] + v * vs[j] (room
    frame). Its front faces u x v. material_at(cu, cv) picks the material of the
    quad centred at (cu, cv) panel units; tint_at(cu, cv) an optional brightness."""
    o, u, v = Vector(origin), Vector(u), Vector(v)
    bm = bmesh.new()
    tint = bm.faces.layers.float.new('gg_tint') if tint_at else None
    vert = [[bm.verts.new(T(*(o + u * a + v * b))) for b in vs] for a in us]
    mats = []
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            cu, cv = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            m = material_at(cu, cv)
            if m not in mats:
                mats.append(m)
            f = bm.faces.new((vert[i][j], vert[i + 1][j], vert[i + 1][j + 1], vert[i][j + 1]))
            f.material_index = mats.index(m)
            if tint:
                f[tint] = tint_at(cu, cv)
    return _object(name, bm, mats, **kw)


def band_at(bands, h):
    """The material of the band (from, to, material) covering height h; later bands win."""
    hit = None
    for lo, hi, m in bands:
        if lo <= h < hi:
            hit = m
    return hit if hit is not None else bands[0][2]


def walls(bands, *, side_bands=None, side_shade=0.12, breaks_x=(), breaks_z=(), top=TOP, prefix='wall'):
    """Back wall and both side walls on the physics room's planes, painted in
    horizontal bands [(from, to, material), ...] (heights above the floor; later
    bands win). Side walls take side_bands, or the same bands darkened toward
    SHADOW by side_shade (the mocks' 12% overlay). breaks_x / breaks_z add cuts
    (a prop's edge against the wall) so its contact AO stays sharp."""
    heights = sorted({h for lo, hi, _ in bands for h in (lo, hi) if 0 < h < top})
    if side_bands is None:
        side_bands = [(lo, hi, _shaded(m, side_shade)) for lo, hi, m in bands]
    sheights = sorted({h for lo, hi, _ in side_bands for h in (lo, hi) if 0 < h < top})
    vs, svs = _thin(steps(top, breaks=heights)), _thin(steps(top, breaks=sheights))
    depth = FRONT_Z - BACK_Z
    back = grid('%s_back' % prefix, (-HALF_W, 0, BACK_Z), (1, 0, 0), (0, 1, 0),
                steps(2 * HALF_W, breaks=[x + HALF_W for x in breaks_x]), vs,
                lambda cu, cv: band_at(bands, cv), shell=True)
    zs = steps(depth, breaks=[FRONT_Z - z for z in breaks_z])
    left = grid('%s_left' % prefix, (-HALF_W, 0, FRONT_Z), (0, 0, -1), (0, 1, 0), zs, svs,
                lambda cu, cv: band_at(side_bands, cv), shell=True)
    zs = steps(depth, breaks=[z - BACK_Z for z in breaks_z])
    right = grid('%s_right' % prefix, (HALF_W, 0, BACK_Z), (0, 0, 1), (0, 1, 0), zs, svs,
                 lambda cu, cv: band_at(side_bands, cv), shell=True)
    return back, left, right


def _thin(cuts, above=6.0, every=1.75):
    """Above `above` m the walls are one flat colour with no AO to resolve (the
    camera sees the back wall to ~7 m; the shell runs to 13 m only so a pan never
    shows its edge), so a few rows do."""
    low = [c for c in cuts if c <= above]
    top = cuts[-1]
    if top <= above:
        return cuts
    k = max(1, math.ceil((top - low[-1]) / every))
    return low + [low[-1] + (top - low[-1]) * i / k for i in range(1, k + 1)]


def _shaded(m, amount):
    name = m.name + '_side'
    return bpy.data.materials.get(name) or mat(name, mix_hex(m['gg_hex'], SHADOW, amount),
                                               top=mix_hex(m['gg_top'], SHADOW, amount) if m.get('gg_top') else None,
                                               ao=m['gg_ao'], light=m['gg_light'], keep=m['gg_keep'])


def plank_floor(plank, seam, *, width=0.42, length=2.4, gap=0.014, tint=0.035, cell=0.35, seed=7, prefix='floor'):
    """Wood planks running toward the camera (to the vanishing point), staggered
    row to row, each tinted a little for grain. A seam-coloured base 4 mm below
    shows through the gaps. The plank tops are the floor: y = 0."""
    rng = random.Random(seed)
    depth = FRONT_Z - BACK_Z
    cols = max(1, round(2 * HALF_W / width))
    cw = 2 * HALF_W / cols
    bm = bmesh.new()
    tl = bm.faces.layers.float.new('gg_tint')
    for c in range(cols):
        x0, x1 = -HALF_W + c * cw + gap / 2, -HALF_W + (c + 1) * cw - gap / 2
        z = BACK_Z
        first = length * ((c * 0.618) % 1.0)  # golden-ratio stagger: no visible pattern
        ends = [BACK_Z + first] if first > 0.3 else []
        while (ends[-1] if ends else BACK_Z) + length < FRONT_Z:
            ends.append((ends[-1] if ends else BACK_Z) + length)
        ends.append(FRONT_Z)
        for z1 in ends:
            za, zb = z + (gap / 2 if z > BACK_Z else 0), z1 - (gap / 2 if z1 < FRONT_Z else 0)
            k = max(1, math.ceil((zb - za) / cell))
            t = 1 + rng.uniform(-tint, tint)
            row = [(bm.verts.new(T(x0, 0, za + (zb - za) * i / k)), bm.verts.new(T(x1, 0, za + (zb - za) * i / k))) for i in range(k + 1)]
            for i in range(k):
                f = bm.faces.new((row[i][0], row[i][1], row[i + 1][1], row[i + 1][0]))
                f[tl] = t
            z = z1
    _finish_decal(bm, False)
    planks = _object('%s_planks' % prefix, bm, [plank], shell=True, decal=True)
    base = grid('%s_base' % prefix, (-HALF_W, -0.004, BACK_Z), (1, 0, 0), (0, 0, 1),
                steps(2 * HALF_W, coarse=0.6), steps(depth, coarse=0.6), lambda cu, cv: seam,
                shell=True, underlay=True)
    _flip_to(base, Vector((0, 0, 1)))
    return planks, base


def flat_floor(material, *, cell=0.4, prefix='floor'):
    """A plain floor (no planks) at y = 0."""
    ob = grid('%s_flat' % prefix, (-HALF_W, 0, BACK_Z), (1, 0, 0), (0, 0, 1),
              steps(2 * HALF_W, coarse=cell), steps(FRONT_Z - BACK_Z, coarse=cell), lambda cu, cv: material, shell=True)
    _flip_to(ob, Vector((0, 0, 1)))
    return ob


def _flip_to(ob, want):
    """Points every face of ob along `want` (Blender axes)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        if f.normal.dot(want) < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()


# Floor paint sits just above the planks. Under the platform (its top layers are
# at 0.002..0.008) use lift <= 0.001 or the paint draws over it.
LIFT = {'under_platform': 0.001, 'paint': 0.004, 'line': 0.006}


def floor_ring(name, center_xz, r_in, r_out, material, *, scale=(1, 1), a0=0.0, a1=2 * math.pi, segments=96,
               lift=LIFT['paint'], clip=True, **kw):
    """A flat ring, disc (r_in 0), arc (a0..a1, radians from +x toward -z) or ellipse
    (scale = (sx, sz)) painted on the floor; clip drops faces outside the walls."""
    cx, cz = center_xz
    bm = bmesh.new()
    closed = (a1 - a0) >= 2 * math.pi - 1e-6
    n = max(3, math.ceil(segments * (a1 - a0) / (2 * math.pi)))
    angles = [a0 + (a1 - a0) * i / n for i in range(n if closed else n + 1)]

    def ring(r):
        return [bm.verts.new(T(cx + math.cos(a) * r * scale[0], lift, cz - math.sin(a) * r * scale[1])) for a in angles]

    # A disc gets a half-radius ring too, so its AO has somewhere to vary.
    radii = [r_out, r_in] if r_in > 0 else [r_out, r_out / 2]
    rows = [ring(r) for r in radii]
    for i in range(n):
        j = (i + 1) % len(angles)
        bm.faces.new((rows[0][i], rows[0][j], rows[1][j], rows[1][i]))
    if r_in <= 0:
        centre = bm.verts.new(T(cx, lift, cz))
        for i in range(n):
            bm.faces.new((rows[1][i], rows[1][(i + 1) % len(angles)], centre))
    _finish_decal(bm, clip)
    return _object(name, bm, [material], decal=True, **kw)


def _finish_decal(bm, clip):
    bm.normal_update()
    if clip:
        _clip_floor(bm)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()


def floor_poly(name, pts_xz, material, *, lift=LIFT['paint'], clip=True, **kw):
    """A flat polygon painted on the floor, points (x, z) in order."""
    bm = bmesh.new()
    vs = [bm.verts.new(T(x, lift, z)) for x, z in pts_xz]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f])
    _finish_decal(bm, clip)
    return _object(name, bm, [material], decal=True, **kw)


def floor_line(name, a_xz, b_xz, width, material, *, lift=LIFT['line'], **kw):
    """A straight painted line of the given width from a to b (x, z)."""
    a, b = Vector((a_xz[0], a_xz[1])), Vector((b_xz[0], b_xz[1]))
    d = (b - a).normalized()
    n = Vector((-d.y, d.x)) * width / 2
    return floor_poly(name, [a + n, b + n, b - n, a - n], material, lift=lift, **kw)


def _clip_floor(bm):
    """Drops faces whose centre is outside the walls (a 3-point arc cut by them)."""
    out = [f for f in bm.faces if not (-HALF_W <= f.calc_center_median().x <= HALF_W and
                                       BACK_Z <= -f.calc_center_median().y <= FRONT_Z)]
    if out:
        bmesh.ops.delete(bm, geom=out, context='FACES')


def glow(center, radius, amount, *, color='#FFFFFF', objects=None):
    """A soft lightening baked into the vertex colours: an ellipsoid of radii (x, y, z)
    around a room point, `amount` toward color at its middle (a window's wall glow,
    a daylight patch). objects: names to touch (default: every shell surface)."""
    _STATE['glows'].append({'center': Vector(center), 'radius': Vector(radius), 'amount': amount,
                            'color': hex_srgb(color), 'objects': objects})


# ---------------------------------------------------------------------------


def build(root, path, **kw):
    """Bake, shade, merge, export, report and (with --preview) render: pipeline.build."""
    import pipeline
    return pipeline.build(root, path, **kw)


def render_preview(path, **kw):
    """Renders the current scene from the app camera (after build): preview.render_preview."""
    import preview
    return preview.render_preview(path, **kw)
