"""The Study room: a calm, pale reading room behind the tutor.

  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup
      --python BLENDER/rooms/build_study_room.py -- [--preview tmp/rooms/study_render.png] [--no-ghosts]
      [--preview-ghosts tmp/rooms/study_render_window.png] [--no-bake] [--guides] [--pan -0.9]
      [--out tmp/rooms/study_room.draft.glb]

Writes public/models/rooms/study_room.glb and the study entry of
rooms.manifest.json (a draft with --no-bake or --out goes elsewhere: see
contract.out_path). --preview-ghosts renders a second shot with the floating
window ghosted in (after --preview, which can then skip it); with --pan -0.9
both shots use the focused camera and the ghost its focused pose.

The Claude Design frame (design/study-play/claude-design/study-noui.png) is
the inspiration for mood, palette and props, not a pixel target. Pale
blue-grey walls over a cream wainscot with a white rail and ledge, a white
four-pane window centred above his spot with a soft glow on the wall, a pale
plank floor with a daylight patch, a sage rug under his platform, a low
LIBRARY bookcase front left, a terracotta plant front right and a little wood
shelf with the gold cup and star. The app's camera sees a deep room (the back
wall is the middle third of the frame), so the props sit where the mock put
them on screen, not where it put them on the floor plan.

Keep-outs (contract.py): nothing but flat paint inside the stage box, nothing
inside the shot lane, and only wall finish (rails, baseboard, mouldings,
built as shell) behind the floating window (the CALM boxes, worked out from
it). The bookcase and the plant stand in front of the window's z and of the
physics room's front wall (z 2.0), so the tutor and the toys never meet them.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

S = C.STUDY
BZ = C.BACK_Z  # back wall plane (props stand off it toward +z)
HW = C.HALF_W

# Study-only shades, derived from the contract palette (contract.py stays shared
# with the play room, so nothing new goes in there).
SHADE = {
    'panel_side': C.mix_hex(S['panel'], C.SHADOW, 0.07),  # wainscot on the side walls
    'wood_dark': C.mix_hex(S['wood'], C.SHADOW, 0.32),  # bookcase back, label ink
    # The pot's flared sides face the floor, so AO takes them darker than the mock's flat terracotta.
    'pot': C.mix_hex(S['terracotta'], '#FFFFFF', 0.12),
    'rim': C.mix_hex(S['terracotta'], '#FFFFFF', 0.24),  # the rolled rim, a step lighter
    'leaf': C.mix_hex(S['sage'], '#FFFFFF', 0.12),  # the AO between leaves darkens them, so start light
    'leaf_dark': S['sage'],
    'soil': C.mix_hex(S['wood'], C.SHADOW, 0.45),
    'glass': C.mix_hex(S['sky_top'], S['sky_bottom'], 0.3),  # flat: the glass keeps its own unlit material
}

# Layout, room frame (x right, y up, z toward the camera; floor y 0).
PANEL_H = 0.95  # cream wainscot; the rail covers its top edge
# One chunky rail; on the back wall it is a ledge, deep enough that the mug and
# the books on it stand clear of the wall.
RAIL = {'y0': 0.88, 'y1': 1.04, 'depth': 0.2, 'side_depth': 0.08}
WINDOW = {'w': 3.3, 'y0': 1.75, 'y1': 4.55, 'bar': 0.15, 'depth': 0.1, 'muntin': 0.08}
# Deep enough for the gold cup's bowl (0.17 across at its rim) to clear the wall.
SHELF = {'x0': 1.95, 'x1': 3.28, 'y': 1.85, 'thick': 0.06, 'depth': 0.34}
# Low and well forward: it stands in front of the floating window, so its top must
# project under the window's bottom (checks.check_window warns if it does not; at h
# 1.02 and z 1.85 it once hid the window's progress bar). Its back edge sits on the
# physics room's invisible front wall (z 2.0), so nothing the app bounces reaches it.
# The middle shelf splits the height evenly.
BOOKCASE = {'x0': -4.4, 'x1': -2.3, 'front': 2.32, 'depth': 0.3, 'h': 0.8, 'side': 0.06,
            'top': 0.05, 'plinth': 0.08, 'header': 0.15}
# The stack of books and the mug on the back ledge. The books keep left of the
# tutor but clear of what the focused window hides (CALM window_back, x < -2.02).
LEDGE = {'books_x': -1.62, 'mug_x': 2.25}
PLANT = {'x': 3.85, 'z': 2.35}
RUG = {'center': C.APP['platform']['center'][::2], 'r': 2.3, 'ring': (1.93, 2.0)}

# The room comes first: new_room() clears the scene, materials included.
ROOT = C.new_room('study')
M = {
    'wall': C.mat('study_wall', S['wall'], light=False),
    'side': C.mat('study_side', S['side'], light=False),
    # The wainscot and the wall finish stay flat, as in the mock: AO from the floor,
    # the rail and the mouldings greyed the cream and left dark ticks by each frame.
    'panel': C.mat('study_panel', S['panel'], ao=False, light=False),
    'panel_side': C.mat('study_panel_side', SHADE['panel_side'], ao=False, light=False),
    'finish': C.mat('study_finish', S['trim'], ao=False, light=False),
    'trim': C.mat('study_trim', S['trim']),
    'plank': C.mat('study_plank', S['floor'], light=False),
    'seam': C.mat('study_seam', S['seam'], light=False),
    'rug': C.mat('study_rug', S['rug'], light=False),
    'rug_ring': C.mat('study_rug_ring', S['trim'], light=False),
    'wood': C.mat('study_wood', S['wood']),
    'wood_dark': C.mat('study_wood_dark', SHADE['wood_dark']),
    'plate': C.mat('study_plate', S['panel']),
    'glass': C.mat('window_glass', SHADE['glass'], ao=False, light=False, keep=True),
    'cloud': C.mat('study_cloud', '#FFFFFF', ao=False, light=False),
    'blue': C.mat('study_blue', S['book_blue']),
    'terracotta': C.mat('study_terracotta', S['terracotta']),
    'sage': C.mat('study_sage', S['sage']),
    'gold': C.mat('study_gold', S['gold']),
    'silver': C.mat('study_silver', S['silver']),
    'pot': C.mat('study_pot', SHADE['pot']),
    'rim': C.mat('study_pot_rim', SHADE['rim']),
    'leaf': C.mat('study_leaf', SHADE['leaf']),
    'leaf_dark': C.mat('study_leaf_dark', SHADE['leaf_dark']),
    'soil': C.mat('study_soil', SHADE['soil']),
}
BOOK_MATS = [M['blue'], M['gold'], M['sage'], M['terracotta']]

# ---------------------------------------------------------------------------
# Local shape helpers (common.py stays as the scaffold left it)


def disc(name, center, r, material, *, segments=24, **kw):
    """A flat round disc facing the camera (+z): a cloud puff on the glass."""
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=segments, radius=r)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.y > 0:  # Blender -y is room +z: face the camera (the room is single-sided)
            f.normal_flip()
    C._place(bm, center)
    return C._object(name, bm, [material], **kw)


def join(name, parts, *, origin=None):
    """Joins prop parts into one named node mesh (a trophy the app may bounce).
    origin: its pivot (room point), e.g. the base so a bounce squashes from the shelf."""
    target = parts[0]
    with bpy.context.temp_override(active_object=target, object=target,
                                   selected_objects=parts, selected_editable_objects=parts):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    target['gg_node'] = True
    if origin is not None:
        C.set_origin(target, origin)
    return target


def roll(ob, angle, pivot):
    """Tilts a finished prop about the room z axis (toward the camera) around a room
    point: a book leaning on its neighbour. Positive leans its top toward -x."""
    p = C.T(*pivot)
    ob.data.transform(Matrix.Translation(p) @ Matrix.Rotation(-angle, 4, 'Y') @ Matrix.Translation(-p))


def leaf(name, base, length, width, tilt, yaw, material, *, thick=0.05, rings=9, sides=8):
    """A pointed, slightly arching leaf (closed, so it survives backface culling)
    rising from base, leaning `tilt` radians off vertical, turned `yaw` about +y."""
    bm = bmesh.new()
    bend = 0.12 * (1 if tilt >= 0 else -1) if abs(tilt) > 0.05 else 0.0
    tip0 = bm.verts.new((0, 0, 0))
    rows = []
    for i in range(1, rings):
        t = i / rings
        w = math.sin(math.pi * t ** 0.75)  # widest a little below the middle, long pointed tip
        x0 = bend * length * t * t  # arches outward as it rises
        rows.append([bm.verts.new((x0 + width / 2 * w * math.cos(a), thick / 2 * w * math.sin(a), length * t))
                     for a in (2 * math.pi * j / sides for j in range(sides))])
    tip1 = bm.verts.new((bend * length, 0, length))
    for j in range(sides):
        k = (j + 1) % sides
        bm.faces.new((tip0, rows[0][k], rows[0][j]))
        for a, b in zip(rows, rows[1:]):
            bm.faces.new((a[j], a[k], b[k], b[j]))
        bm.faces.new((rows[-1][j], rows[-1][k], tip1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(tilt, 3, 'Y'))
    C._place(bm, base, yaw)
    return C._object(name, bm, [material], smooth=True)


def label(name, s, center, size, material, *, spacing=1.0, depth=0.004):
    """Tracked capitals facing the camera (the mock's spaced-out LIBRARY plate):
    C.text with letter spacing, which it does not expose."""
    cu = bpy.data.curves.new(name + '_text', 'FONT')
    cu.body, cu.size, cu.space_character = s, size, spacing
    cu.align_x, cu.align_y, cu.extrude = 'CENTER', 'CENTER', depth / 2
    path = C.font()
    if path:
        cu.font = bpy.data.fonts.load(path, check_existing=True)
    tmp = bpy.data.objects.new(name + '_text', cu)
    bpy.context.scene.collection.objects.link(tmp)
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    C._place(bm, center)
    return C._object(name, bm, [material])


def star(name, center, r_out, r_in, depth, material):
    """A puffy five-point star facing the camera: the outline at the middle, a raised
    point front and back, so the facets catch the baked key light like a toy."""
    bm = bmesh.new()
    rim = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = r_out if i % 2 == 0 else r_in
        rim.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0)))
    front, back = bm.verts.new((0, 0, depth / 2)), bm.verts.new((0, 0, -depth / 2))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((front, rim[i], rim[j]))
        bm.faces.new((back, rim[j], rim[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    C._place(bm, center)
    return C._object(name, bm, [material])


# ---------------------------------------------------------------------------
# Shell: walls, wall finish, floor, rug


def shell():
    w = WINDOW
    # Zero-width bands add same-colour cuts where the window and shelf meet the
    # wall, so their contact AO stays crisp instead of smearing across a big quad.
    cuts = [(h, h, M['wall']) for h in (w['y0'], w['y1'], SHELF['y'])]
    C.walls([(0, C.TOP, M['wall']), (0, PANEL_H, M['panel'])] + cuts,
            side_bands=[(0, C.TOP, M['side']), (0, PANEL_H, M['panel_side'])],
            breaks_x=[-w['w'] / 2, w['w'] / 2, SHELF['x0'], SHELF['x1']])
    C.plank_floor(M['plank'], M['seam'], width=0.5, length=2.0)

    # Wall finish: flat white bands (shell, so the calm check leaves them be).
    # The back wall's rail is deep enough to be a ledge for the books and the mug.
    depth = C.FRONT_Z - BZ
    mid_z = (C.FRONT_Z + BZ) / 2
    rail_h, rail_y = RAIL['y1'] - RAIL['y0'], (RAIL['y0'] + RAIL['y1']) / 2
    C.box('base_back', (0, 0.06, BZ + 0.025), (2 * HW, 0.12, 0.05), M['finish'], bevel=0.012, segments=1, shell=True)
    C.box('rail_back', (0, rail_y, BZ + RAIL['depth'] / 2), (2 * HW, rail_h, RAIL['depth']), M['finish'],
          bevel=0.03, segments=2, shell=True)
    for s, side in ((-1, 'left'), (1, 'right')):
        x = s * HW
        C.box('base_%s' % side, (x - s * 0.025, 0.06, mid_z), (0.05, 0.12, depth), M['finish'], bevel=0.012, segments=1, shell=True)
        C.box('rail_%s' % side, (x - s * RAIL['side_depth'] / 2, rail_y, mid_z), (RAIL['side_depth'], rail_h, depth),
              M['finish'], bevel=0.03, segments=2, shell=True)

    # Wainscot mouldings: eight low-relief frames across the back panel, as in the mock.
    n, margin, gap = 8, 0.16, 0.16
    pw = (2 * HW - 2 * margin - (n - 1) * gap) / n
    y0, y1, bar, z = 0.24, 0.74, 0.035, BZ + 0.008
    for i in range(n):
        x0 = -HW + margin + i * (pw + gap)
        xc = x0 + pw / 2
        for k, (c, size) in enumerate((((xc, y1 - bar / 2, z), (pw, bar, 0.016)),
                                       ((xc, y0 + bar / 2, z), (pw, bar, 0.016)),
                                       ((x0 + bar / 2, (y0 + y1) / 2, z), (bar, y1 - y0 - 2 * bar, 0.016)),
                                       ((x0 + pw - bar / 2, (y0 + y1) / 2, z), (bar, y1 - y0 - 2 * bar, 0.016)))):
            C.box('moulding_%d_%d' % (i, k), c, size, M['finish'], bevel=0.006, segments=1, shell=True)

    # Sage rug under his platform (lift <= 0.001: the app's platform draws over it),
    # its trim ring outside the platform's oval, so it can sit a hair higher.
    C.floor_ring('rug', RUG['center'], 0, RUG['r'], M['rug'], segments=128, lift=C.LIFT['under_platform'])
    C.floor_ring('rug_ring', RUG['center'], *RUG['ring'], M['rug_ring'], segments=128, lift=0.003)

    # Light: a soft glow on the wall round the window and a daylight patch on
    # the floor in front of it, baked into the vertex colours.
    C.glow((0, (WINDOW['y0'] + WINDOW['y1']) / 2, BZ), (3.4, 2.7, 0.6), 0.95)
    C.glow((0, 0, BZ + 2.2), (1.9, 0.6, 2.8), 0.45, objects=['floor_planks', 'floor_base'])


# ---------------------------------------------------------------------------
# The window: white frame, cross muntins, sill, sky glass with two clouds


def window():
    w = WINDOW
    x0, x1, y0, y1, bar, d = -w['w'] / 2, w['w'] / 2, w['y0'], w['y1'], w['bar'], w['depth']
    zc = BZ + d / 2
    gx0, gx1, gy0, gy1 = x0 + bar, x1 - bar, y0 + bar, y1 - bar
    ym = (gy0 + gy1) / 2
    # The glass runs a little under the frame so no wall shows at its edges.
    C.quad('window_glass', (0, ym, BZ + 0.01), (gx1 - gx0 + 0.04, gy1 - gy0 + 0.04), M['glass'], uv=True, node=True)
    C.box('window_top', (0, y1 - bar / 2, zc), (w['w'], bar, d), M['trim'], bevel=0.03)
    C.box('window_bottom', (0, y0 + bar / 2, zc), (w['w'], bar, d), M['trim'], bevel=0.03)
    for s, side in ((-1, 'left'), (1, 'right')):
        C.box('window_%s' % side, (s * (w['w'] / 2 - bar / 2), ym, zc), (bar, gy1 - gy0, d), M['trim'], bevel=0.03)
    mu = w['muntin']
    C.box('window_muntin_v', (0, ym, BZ + 0.04), (mu, gy1 - gy0, 0.06), M['trim'], bevel=0.018, segments=2)
    C.box('window_muntin_h', (0, ym, BZ + 0.04), (gx1 - gx0, mu, 0.06), M['trim'], bevel=0.018, segments=2)
    C.box('window_sill', (0, y0 - 0.055, BZ + 0.13), (w['w'] + 0.4, 0.11, 0.26), M['trim'], bevel=0.03)
    # Two little clouds, flat on the glass (upper left pane, lower right pane).
    zc = BZ + 0.018
    for k, (cx, cy, s) in enumerate(((-0.8, 3.85, 1.0), (0.78, 2.45, 0.8))):
        for j, (dx, dy, r) in enumerate(((0, 0.03, 0.2), (-0.22, -0.04, 0.14), (0.21, -0.03, 0.16), (0.02, -0.07, 0.15))):
            disc('cloud_%d_%d' % (k, j), (cx + dx * s, cy + dy * s, zc), r * s, M['cloud'])


# ---------------------------------------------------------------------------
# Back-wall props: books and a mug on the ledge, the trophy shelf


def ledge_props():
    # Chunky on purpose: the back wall is 14 units from the camera, so a real-size mug is a speck.
    # Each stands 1 cm off the wall: a turned book reaches back by its half-depth
    # plus its half-width times sin(yaw), and once poked through the wall.
    top, d = RAIL['y1'], 0.12
    y = top
    for k, (w, h, m, yaw) in enumerate(((0.62, 0.09, 'terracotta', 0.0), (0.54, 0.08, 'blue', 0.07), (0.46, 0.07, 'sage', -0.05))):
        zc = BZ + 0.01 + w / 2 * abs(math.sin(yaw)) + d / 2 * math.cos(yaw)
        C.box('ledge_book_%d' % k, (LEDGE['books_x'] + 0.02 * k, y + h / 2, zc), (w, h, d), M[m], bevel=0.014, segments=2, yaw=yaw)
        y += h
    mx, r = LEDGE['mug_x'], 0.09
    zc = BZ + 0.01 + r
    C.cylinder('mug', (mx, top + 0.11, zc), r, 0.22, M['sage'], bevel=0.02, segments=20)
    C.torus('mug_handle', (mx + 0.1, top + 0.11, zc), 0.06, 0.018, M['sage'], axis='z', segments=16, sides=8)


def cup(prefix, cx, ys, zc, scale, material, *, handles=True):
    """A trophy cup standing on the shelf at (cx, ys): wood block, foot, stem, bowl, handles."""
    s = scale
    parts = [
        C.box(prefix + '_base', (cx, ys + 0.035 * s, zc), (0.22 * s, 0.07 * s, 0.15 * s), M['wood'], bevel=0.012, segments=2),
        C.cylinder(prefix + '_foot', (cx, ys + 0.085 * s, zc), 0.07 * s, 0.03 * s, material, bevel=0.008, segments=20),
        C.cylinder(prefix + '_stem', (cx, ys + 0.14 * s, zc), 0.024 * s, 0.09 * s, material, bevel=0.004, segments=12),
        C.cylinder(prefix + '_bowl', (cx, ys + 0.265 * s, zc), 0.05 * s, 0.17 * s, material, radius_top=0.13 * s,
                   bevel=0.012, segments=24),
    ]
    if handles:
        for k, side in enumerate((-1, 1)):
            parts.append(C.torus('%s_handle_%d' % (prefix, k), (cx + side * 0.13 * s, ys + 0.285 * s, zc),
                                 0.055 * s, 0.016 * s, material, axis='z', segments=20, sides=8))
    return parts


def trophy_shelf():
    sh = SHELF
    xc, ys = (sh['x0'] + sh['x1']) / 2, sh['y'] + sh['thick']
    C.box('trophy_shelf', (xc, sh['y'] + sh['thick'] / 2, BZ + sh['depth'] / 2), (sh['x1'] - sh['x0'], sh['thick'], sh['depth']),
          M['wood'], bevel=0.018, segments=2)
    for bx in (sh['x0'] + 0.18, sh['x1'] - 0.18):
        C.box('trophy_bracket_%d' % round(bx * 100), (bx, sh['y'] - 0.09, BZ + 0.1), (0.05, 0.18, 0.2), M['wood'],
              bevel=0.01, segments=1)
    # Far enough out that the gold cup's bowl (radius 0.17 at its rim) clears the wall.
    zc = BZ + 0.18
    # The two the app may bounce on a level-up: named, pivots on their bases.
    # Oversized for the same reason as the mug.
    cx = 2.28
    join('trophy_cup', cup('trophy_cup', cx, ys, zc, 1.3, M['gold']), origin=(cx, ys, zc))
    sx = 2.81
    parts = [
        C.box('trophy_star_base', (sx, ys + 0.045, zc), (0.26, 0.09, 0.16), M['wood'], bevel=0.014, segments=2),
        C.cylinder('trophy_star_stem', (sx, ys + 0.16, zc), 0.028, 0.16, M['silver'], bevel=0.005, segments=12),
        star('trophy_star_star', (sx, ys + 0.42, zc), 0.22, 0.095, 0.1, M['gold']),
    ]
    join('trophy_star', parts, origin=(sx, ys, zc))
    cup('silver_cup', 3.13, ys, zc, 0.98, M['silver'], handles=False)


# ---------------------------------------------------------------------------
# Floor props: the LIBRARY bookcase (front left) and the plant (front right)


def bookcase():
    b = BOOKCASE
    x0, x1, z1, d, h, t = b['x0'], b['x1'], b['front'], b['depth'], b['h'], b['side']
    z0, xc, zc, w = z1 - d, (b['x0'] + b['x1']) / 2, z1 - d / 2, x1 - x0
    wood, dark = M['wood'], M['wood_dark']
    for s, x in (('l', x0 + t / 2), ('r', x1 - t / 2)):
        C.box('bookcase_side_' + s, (x, (h - b['top']) / 2, zc), (t, h - b['top'], d), wood, bevel=0.02)
    C.box('bookcase_top', (xc, h - b['top'] / 2, zc + 0.01), (w + 0.05, b['top'], d + 0.05), wood, bevel=0.025)
    C.box('bookcase_plinth', (xc, b['plinth'] / 2, zc), (w - 2 * t, b['plinth'], d - 0.02), wood, bevel=0.015)
    C.box('bookcase_back', (xc, h / 2, z0 + 0.015), (w - 2 * t, h - 0.02, 0.03), dark, bevel=0.0)
    hy0, hy1 = h - b['top'] - b['header'], h - b['top']
    shelf = (b['plinth'] + hy0) / 2  # two bays of equal height
    C.box('bookcase_shelf', (xc, shelf, zc), (w - 2 * t, 0.045, d - 0.03), wood, bevel=0.012, segments=2)
    C.box('bookcase_header', (xc, (hy0 + hy1) / 2, z1 - 0.03), (w - 2 * t, b['header'], 0.06), wood, bevel=0.015)
    # The LIBRARY plate on the header, cream with dark wood letters.
    py = (hy0 + hy1) / 2
    C.box('bookcase_plate', (xc, py, z1 + 0.008), (0.84, 0.12, 0.02), M['plate'], bevel=0.012, segments=2)
    label('bookcase_label', 'LIBRARY', (xc, py - 0.005, z1 + 0.0205), 0.1, dark, spacing=1.35)

    # Books: two bays, a row of spines in the muted four, a gap here and there,
    # one leaning on its neighbour and a short stack lying flat.
    rng = random.Random(11)
    bays = ((b['plinth'], shelf - 0.0225), (shelf + 0.0225, hy0))
    inner0, inner1 = x0 + t + 0.03, x1 - t - 0.03
    k = 0
    for bay, (by0, by1) in enumerate(bays):
        bh = by1 - by0
        x = inner0 + (0.0 if bay == 0 else 0.06)
        n = 0
        while True:
            bw = rng.uniform(0.07, 0.11)
            if x + bw > inner1:
                break
            if n in ((5, 11) if bay == 0 else (4, 9)):  # gaps: room to lean, room to breathe
                if bay == 1 and n == 9:
                    # A short stack lying flat in the second gap.
                    for j, sh in enumerate((0.05, 0.045)):
                        C.box('book_%d' % k, (x + 0.13, by0 + 0.025 + j * 0.05, zc + 0.01), (0.24 - j * 0.03, sh, 0.2),
                              BOOK_MATS[(k + j) % 4], bevel=0.008, segments=1)
                        k += 1
                    x += 0.3
                else:
                    x += 0.12
                n += 1
                continue
            hgt = bh * rng.uniform(0.72, 0.9)
            dep = rng.uniform(0.18, 0.22)  # between the back panel and 5 cm in from the front
            ob = C.box('book_%d' % k, (x + bw / 2, by0 + hgt / 2, z1 - 0.05 - dep / 2), (bw, hgt, dep),
                       BOOK_MATS[k % 4], bevel=0.008, segments=1)
            if bay == 0 and n == 6:
                # The first book after the gap leans into it, pivoting on its right
                # foot (the left foot dips into the shelf rather than floating).
                roll(ob, 0.22, (x + bw, by0, 0))
            x += bw + rng.uniform(0.0, 0.012)
            k += 1
            n += 1


def plant():
    x, z = PLANT['x'], PLANT['z']
    C.cylinder('pot', (x, 0.2, z), 0.21, 0.4, M['pot'], radius_top=0.25, bevel=0.03, segments=28)
    C.cylinder('pot_rim', (x, 0.43, z), 0.285, 0.09, M['rim'], bevel=0.025, segments=28)
    C.cylinder('pot_soil', (x, 0.47, z), 0.245, 0.02, M['soil'], bevel=0.005, segments=24)
    base = (x, 0.46, z)
    # (length, lean, turn, shade): a tall fan like the mock's snake plant.
    for i, (ln, tilt, yaw, dark) in enumerate((
            (1.02, 0.0, 0.0, False), (0.9, -0.3, 0.25, True), (0.88, 0.32, -0.2, False),
            (0.72, -0.62, 0.4, False), (0.74, 0.6, -0.45, True), (0.62, -0.16, 1.25, True),
            (0.64, 0.2, -1.3, False), (0.55, -0.42, -0.9, True))):
        leaf('leaf_%d' % i, base, ln, 0.2, tilt, yaw, M['leaf_dark'] if dark else M['leaf'])


# ---------------------------------------------------------------------------


shell()
window()
ledge_props()
trophy_shelf()
bookcase()
plant()
C.node('tutor_spot', C.APP['tutor']['spot'])

# This room's big pale walls show AO noise as blotches at the contract's 96
# samples; more samples change nothing but the noise (and the bake time).
C.SHADE['ao_samples'] = max(C.SHADE['ao_samples'], 256)
report = C.build(ROOT, C.out_path('study'))

# A second shot with the floating window ghosted in (the first can skip it, to
# sit next to the mock, which has none).
extra = C.arg('--preview-ghosts')
if extra:
    import preview
    if C.arg('--preview'):
        if C.flag('--no-ghosts'):  # else the first shot already added it
            preview._add_ghosts(focused=bool(float(C.arg('--pan', 0.0))))
        bpy.context.scene.render.filepath = os.path.abspath(extra)
        bpy.ops.render.render(write_still=True)
        print('ROOM PREVIEW', os.path.abspath(extra))
    else:
        C.render_preview(extra, ghosts=True, pan=float(C.arg('--pan', 0.0)))
