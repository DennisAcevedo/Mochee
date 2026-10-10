"""The Play room: a sunny toy gym behind the tutor, built with the rooms kit.

  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup
      --python BLENDER/rooms/build_play_room.py -- [--preview tmp/rooms/play_render.png] [--guides] [--no-bake]
      [--out tmp/rooms/play_room.draft.glb] [--pan -0.9]

Writes public/models/rooms/play_room.glb and its rooms.manifest.json entry (a
--no-bake or --out draft goes elsewhere and leaves the manifest alone).

Inspiration, not a pixel target: design/study-play/claude-design/play-noui.png.
Orange / sky / purple stripes over a big yellow lower wall, a honey court
with a purple lane under the hoop, the hoop on the right wall at the physics
rim, a navy SHOTS scoreboard high on the back wall, a dark ball rack and
folded mats back right, a loose basketball on the court and soft toy blocks
up front. The space from the tutor up to the rim stays empty: he shoots real
arcs at it (contract.CLEAR['shot']).

Every point here is in the room frame (contract.py): x right, y up from the
floor, z toward the camera. Colours come from contract.PLAY only.
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

P = C.PLAY
HOOP = C.APP['hoop']
RIM = HOOP['rim']
W = C.HALF_W

# Stripe tops, heights above the floor. They sit higher than the mock's: the
# lesson camera sees the back wall up to about 7 high, so the mock's heights
# would leave a sea of orange above the stripes.
BANDS = {'skirting': 0.14, 'yellow': 2.85, 'purple': 3.55, 'blue': 4.25}

COURT = {
    'line': 0.065,  # painted line width
    'lane': (2.05, 1.7),  # length out from the right wall (the baseline), width along z
    'free_throw': 0.62,  # radius of the free-throw half circle
    'three': 3.3,  # 3-point radius around the rim's floor spot...
    'three_corner': 3.0,  # ...with straight corners this far either side of it (z)
    'centre': 2.0,  # centre circle radius, around the platform (its rx is 1.5)
    'back_line': -6.2,  # sideline in front of the rack and the mats
}

# Back RIGHT, not the mock's back left: the floating window hides the back wall
# left of x -2.02 once focused (contract CALM['window_back']).
RACK = {
    'x': (1.55, 3.07),  # post centres: 4 balls a row plus the old ~4 cm side clearance
    'z': -6.62,  # cradle midline
    'gap': 0.21,  # front-to-back rail spacing: the balls sit between two rails
    'tiers': (0.22, 0.70),  # rail heights
    'top': 1.14,
    'post_r': 0.028,
    'rail_r': 0.024,
    # The app's live ball (PHYSICS.ball.radius x the tutor's scale), so it can swap
    # a rack ball for its toy ball 1:1.
    'ball_r': C.APP['ball_radius'],
    'balls': (('basketball', 'dodgeball', 'basketball', 'basketball'),  # lower tier, left to right
              ('basketball', 'basketball', 'volleyball', 'basketball')),
    'loose': (1.75, -4.3),  # one basketball rolled out onto the court, just right of the tutor from the camera
}

# Each kind: body colour, seam colour, seams as (axis, offset as a share of the radius).
BALLS = {
    'basketball': (P['ball'], P['ink'], [((1, 0, 0), 0.0), ((0, 0, 1), 0.0), ((1, 0, 0), 0.62), ((1, 0, 0), -0.62)]),
    'volleyball': (P['blue'], P['line'], [((0, 0, 1), 0.0), ((1, 0, 0), 0.45), ((1, 0, 0), -0.45)]),
    'dodgeball': (P['purple'], P['purple'], []),
}
# Seams are flat bands lying ON the ball's radius over a body a hair smaller, so
# every part of a ball stays within RACK['ball_r'] (the live ball's collider):
# a rack ball swaps 1:1 for the live one and the loose ball touches the floor
# without dipping through it. Tubes centred on the surface stuck out to ~0.174.
# clear: how far the body stays under the bands' flat faces (no z-fighting).
SEAM = {'width': 0.024, 'segments': 32, 'clear': 0.0005}

# High on the back wall, left of the tutor: its left edge clears what the focused
# window hides (x < -2.02) and its right edge stops short of x 0, where the shot
# starts to rise. label / digits: (height off the centre, size) of the baked text.
SCOREBOARD = {'center': (-0.95, 3.7), 'size': (1.8, 1.4, 0.14), 'screen': (1.54, 1.08),
              'label': ('SHOTS', 0.32, 0.24), 'digits': ('7 / 10', -0.1, 0.48)}

# Soft foam blocks: (name, colour, x, y of the base, z, size, yaw), front left and
# right, in front of the physics room's front wall (z 2.0). Low enough to stay
# under the window's bottom edge in the focused shot (checks.check_window): the
# purple one once sat on the blue one and poked up into the window.
BLOCKS = [
    ('block_blue', 'blue', -3.75, 0.0, 2.5, 0.78, 0.18),
    ('block_purple', 'purple', -3.0, 0.0, 2.8, 0.44, -0.26),
    ('block_orange', 'orange', 3.45, 0.0, 2.45, 0.68, -0.28),
]
FOAM = {'bevel': 0.07, 'segments': 4}

# Folded gym mats back right, between the rack and the right wall: the back wall
# left of x -2.02 is behind the focused window.
MATS = {'x': (3.25, 4.6), 'z': -6.5, 'depth': 0.85, 'fold': 0.13, 'folds': 3}


# ---------------------------------------------------------------------------
# Local helpers (shapes the kit does not have: tubes, balls, joined nodes)


def tube(bm, pts, radius, sides, *, closed=False, ref=None, mat=0):
    """Sweeps a circle along Blender points (a seam, a net strand). ref anchors the
    cross-section (a ring's axis) so it never twists. Faces wind outward: the room
    is drawn single-sided."""
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        a = pts[(i - 1) % n] if (closed or i > 0) else p
        b = pts[(i + 1) % n] if (closed or i < n - 1) else p
        t = (b - a).normalized()
        r = ref if ref is not None else (Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0)))
        u = r.cross(t).normalized()
        v = t.cross(u)
        rings.append([bm.verts.new(p + radius * (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)))
                      for k in range(sides)])
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            f = bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
            f.material_index = mat


def circle(center, axis, radius, n=32):
    """n Blender points on a circle around `axis` (Blender) through `center` (Blender)."""
    a = Vector(axis).normalized()
    u = a.orthogonal().normalized()
    v = a.cross(u)
    return [center + radius * (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) for k in range(n)]


def join(name, objs, *, node=True):
    """Joins objects into one mesh named `name` (one node the app can find and move)."""
    target = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=target, object=target,
                                       selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    target.name = name
    target.data.name = name
    target['gg_node'] = node
    return target


def seam_band(bm, axis, off, r, mat):
    """A seam: a band SEAM['width'] wide with its corners on the sphere of radius
    r, round `axis` (Blender), its centre line off * r along the axis. Its faces
    face outward: the room is drawn single-sided."""
    a = Vector(axis).normalized()
    u = a.orthogonal().normalized()
    v = a.cross(u)
    n, t0, d = SEAM['segments'], math.acos(off), SEAM['width'] / 2 / r
    rows = [[bm.verts.new(r * (a * math.cos(t) + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n))
                               * math.sin(t))) for k in range(n)] for t in (t0 - d, t0 + d)]
    for k in range(n):
        f = bm.faces.new((rows[0][k], rows[0][(k + 1) % n], rows[1][(k + 1) % n], rows[1][k]))
        f.material_index = mat
        f.normal_update()
        if f.normal.dot(f.calc_center_median()) < 0:
            f.normal_flip()


def ball(name, center, kind, rng):
    """A ball and its seams (bands on its radius), turned at random so a rack of
    them does not look stamped. Nothing reaches past RACK['ball_r'] from the centre."""
    body, seam, seams = BALLS[kind]
    r = RACK['ball_r']
    # A band's flat faces sag inside r between its corners, least of all on a great
    # circle (r cos(pi/n) cos(half width)): the body's vertices stay under that.
    sag = math.cos(math.pi / SEAM['segments']) * math.cos(SEAM['width'] / 2 / r)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=r * sag - SEAM['clear'] if seams else r)
    C.stable_faces(bm)  # else the face order (and the GLB's bytes) change run to run
    for axis, off in seams:
        seam_band(bm, axis, off, r, 1)
    turn = Euler((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(-0.7, 0.7))).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=turn)
    bmesh.ops.translate(bm, vec=C.T(*center), verts=bm.verts)
    mats = [C.mat('ball_' + kind, body), C.mat('seam_' + kind, seam)]
    return C._object(name, bm, mats, smooth=True)


def floor_strip(name, path, material, *, width=COURT['line'], lift=C.LIFT['line'], closed=False, step=0.25):
    """A painted line along floor points (x, z), cut every `step` so the baked AO
    can vary along it (a wall's contact shadow) instead of smearing end to end."""
    pts = []
    src = [Vector(p) for p in path]
    for i in range(len(src) if closed else len(src) - 1):
        a, b = src[i], src[(i + 1) % len(src)]
        k = max(1, math.ceil((b - a).length / step))
        pts += [a + (b - a) * (j / k) for j in range(k)]
    if not closed:
        pts.append(src[-1])
    n = len(pts)
    bm = bmesh.new()
    sides = []
    for i, p in enumerate(pts):
        a = pts[i - 1] if (closed or i > 0) else p
        b = pts[(i + 1) % n] if (closed or i < n - 1) else p
        d = (b - a).normalized()
        o = Vector((-d.y, d.x)) * width / 2
        sides.append((bm.verts.new(C.T(p.x + o.x, lift, p.y + o.y)), bm.verts.new(C.T(p.x - o.x, lift, p.y - o.y))))
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        bm.faces.new((sides[i][0], sides[j][0], sides[j][1], sides[i][1]))
    C._finish_decal(bm, True)
    return C._object(name, bm, [material], decal=True)


def arc(cx, cz, r, a0, a1, step=0.12):
    """Floor points (x, z) on an arc, angles from +x toward -z (floor_ring's convention)."""
    n = max(2, math.ceil(abs(a1 - a0) * r / step))
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * r, cz - math.sin(a0 + (a1 - a0) * i / n) * r) for i in range(n + 1)]


def paint_rect(name, x0, x1, z0, z1, material, *, lift=C.LIFT['paint']):
    """A painted rectangle cut into ~0.3 cells, so its AO follows the planks under it."""
    ob = C.grid(name, (x0, lift, z0), (1, 0, 0), (0, 0, 1), C.steps(x1 - x0, coarse=0.3),
                C.steps(z1 - z0, coarse=0.3), lambda cu, cv: material, decal=True)
    C._flip_to(ob, Vector((0, 0, 1)))
    return ob


# ---------------------------------------------------------------------------
# The room


def shell():
    # The top orange deepens upward (13% by the top of the shot), like the mock's
    # corner vignette, so the big band above the stripes does not read flat.
    orange = C.mat('play_orange', P['orange'], top=C.mix_hex(P['orange'], C.SHADOW, 0.25), light=False)
    blue = C.mat('play_blue', P['blue'], light=False)
    purple = C.mat('play_purple', P['purple'], light=False)
    yellow = C.mat('play_yellow', P['yellow'], light=False)
    B = BANDS
    C.walls([(0, C.TOP, orange), (0, B['yellow'], yellow), (B['yellow'], B['purple'], purple),
             (B['purple'], B['blue'], blue), (0, B['skirting'], orange)],
            breaks_x=[*RACK['x'], *MATS['x'], SCOREBOARD['center'][0] - SCOREBOARD['size'][0] / 2,
                      SCOREBOARD['center'][0] + SCOREBOARD['size'][0] / 2],
            breaks_z=[RIM[2] - HOOP['board'][0] / 2 - 0.1, RIM[2] + HOOP['board'][0] / 2 + 0.1])
    # A real skirting board (the mock's orange baseboard) so the floor meets the wall with a shadow line.
    skirt = C.mat('play_skirting', P['orange'])
    h, d = B['skirting'], 0.04
    C.box('skirting_back', (0, h / 2, C.BACK_Z + d / 2), (2 * W, h, d), skirt, bevel=0.012)
    for s in (-1, 1):
        C.box('skirting_%s' % ('left' if s < 0 else 'right'), (s * (W - d / 2), h / 2, (C.BACK_Z + 6.0) / 2),
              (d, h, 6.0 - C.BACK_Z), skirt, bevel=0.012)
    C.plank_floor(C.mat('court_wood', P['floor'], light=False), C.mat('court_seam', P['seam'], light=False),
                  width=0.34, length=2.2, tint=0.04)
    # The mock's soft light: a pale wash on the back wall behind the stage, a sunny floor.
    C.glow((0, 2.6, C.BACK_Z), (4.8, 2.6, 0.6), 0.2)
    C.glow((0, 0, -1.0), (5.2, 0.6, 5.5), 0.08)


def court():
    line = C.mat('court_line', P['line'], light=False)
    lane = C.mat('court_lane', P['purple'], light=False)
    # The centre disc lies under the half-court line and the platform; nothing near
    # it casts AO, and the line on top would only bake a dark streak into it.
    centre = C.mat('court_centre', P['purple'], ao=False, light=False)
    rx, rz = RIM[0], RIM[2]
    length, width = COURT['lane']
    ft, hw = W - length, width / 2
    # Lane under the hoop, from the right wall (the baseline) to the free-throw line.
    # Its edges stop 2 mm short of the lines' inner edges: a vertex under a line
    # bakes as occluded and darkens the lane around it.
    inset = COURT['line'] / 2 + 0.002
    paint_rect('court_lane', ft + inset, W, rz - hw + inset, rz + hw - inset, lane)
    floor_strip('line_lane_back', [(ft - 0.03, rz - hw), (W, rz - hw)], line)
    floor_strip('line_lane_front', [(ft - 0.03, rz + hw), (W, rz + hw)], line)
    floor_strip('line_free_throw', [(ft, rz - hw), (ft, rz + hw)], line)
    floor_strip('line_ft_circle', arc(ft, rz, COURT['free_throw'], math.pi / 2, 3 * math.pi / 2), line)
    # 3-point line: straight corners off the wall, then the arc round the rim's floor spot.
    r, c = COURT['three'], COURT['three_corner']
    a = math.asin(c / r)
    x_corner = rx - math.sqrt(r * r - c * c)
    floor_strip('line_three', [(W, rz - c), (x_corner, rz - c)] + arc(rx, rz, r, math.pi - a, math.pi + a)[1:-1]
                + [(x_corner, rz + c), (W, rz + c)], line)
    # Half-court line and centre circle: the tutor stands at centre court. Paint
    # under his platform stays at lift <= 0.001 (its top layers start at 0.002).
    pc = C.APP['platform']['center']
    C.floor_ring('court_centre', (pc[0], pc[2]), 0, COURT['centre'], centre, lift=0.0005)
    floor_strip('line_half', [(0, C.BACK_Z), (0, 6.0)], line, lift=C.LIFT['under_platform'])
    floor_strip('line_centre', arc(pc[0], pc[2], COURT['centre'], 0, 2 * math.pi)[:-1], line, closed=True)
    floor_strip('line_back', [(-W, COURT['back_line']), (W, COURT['back_line'])], line)


def hoop():
    """Board flat on the right wall, rim at the physics rim, net, navy mount. The
    board's target square is part of hoop_backboard so it shakes with it."""
    white = C.mat('hoop_white', P['line'])
    orange = C.mat('hoop_orange', P['ball'])
    navy = C.mat('hoop_navy', P['navy'])
    bw, bh, bt = HOOP['board']
    by = RIM[1] + HOOP['board_above']
    bx = W - bt / 2
    face = W - bt
    parts = [C.box('hoop_board_body', (bx, by, RIM[2]), (bt, bh, bw), white, bevel=0.02)]
    # Target square: 0.42 x 0.32, its bottom edge 0.1 above the rim, a 0.045 stroke.
    sw, sh, st = 0.42, 0.32, 0.045
    sy = RIM[1] + 0.1 + sh / 2
    for i, (dy, dz, h, w) in enumerate([(sh / 2 - st / 2, 0, st, sw), (-sh / 2 + st / 2, 0, st, sw),
                                        (0, sw / 2 - st / 2, sh, st), (0, -sw / 2 + st / 2, sh, st)]):
        parts.append(C.box('hoop_square_%d' % i, (face - 0.004, sy + dy, RIM[2] + dz), (0.008, h, w), orange, bevel=0))
    board = join('hoop_backboard', parts)
    C.set_origin(board, (bx, by, RIM[2]))

    C.torus('hoop_rim', RIM, HOOP['rim_radius'], HOOP['tube'], orange, segments=48, sides=10, node=True)

    # Mount: a navy plate behind the board (a thin frame round it) and an L
    # bracket from the board face to the back of the rim.
    back = C.box('hoop_mount_plate', (W - 0.01, by, RIM[2]), (0.02, bh + 0.14, bw + 0.14), navy, bevel=0.008)
    plate = C.box('hoop_mount_face', (W - 0.045, RIM[1] - 0.08, RIM[2]), (0.09, 0.28, 0.28), navy, bevel=0.012)
    arm_x0 = RIM[0] + HOOP['rim_radius'] - 0.03
    arm = C.box('hoop_mount_arm', ((arm_x0 + face) / 2, RIM[1] - 0.03, RIM[2]), (face - arm_x0, 0.05, 0.12), navy, bevel=0.01)
    join('hoop_mount', [back, plate, arm])

    # Net: a diamond lattice of thin strands from just under the rim, tapering in.
    n, rows = 12, 4
    top_y, bot_y = RIM[1] - 0.025, RIM[1] - HOOP['net_depth']
    top_r, bot_r = HOOP['rim_radius'] - 0.02, HOOP['rim_radius'] * HOOP['net_bottom']
    centre = C.T(RIM[0], 0, RIM[2])

    def row(j):
        """Radius and height of the net's j-th knot row; it narrows faster near the bottom."""
        t = j / rows
        return top_r + (bot_r - top_r) * t ** 1.4, top_y + (bot_y - top_y) * t

    def knot(i, j):
        rr, y = row(j)
        ang = 2 * math.pi * (i + 0.5 * (j % 2)) / n
        return centre + Vector((math.cos(ang) * rr, math.sin(ang) * rr, y))

    bm = bmesh.new()
    for j in range(rows):
        for i in range(n):
            # Each knot ties to its two neighbours on the next row down.
            for di in ((0, -1) if j % 2 == 0 else (0, 1)):
                tube(bm, [knot(i, j), knot((i + di) % n, j + 1)], 0.0085, 4)
    for j in (0, rows):
        rr, y = row(j)
        tube(bm, circle(centre + Vector((0, 0, y)), (0, 0, 1), rr, 36), 0.011, 5, closed=True, ref=Vector((0, 0, 1)))
    net = C._object('hoop_net', bm, [C.mat('hoop_net', P['line'])], node=True, smooth=True)
    C.set_origin(net, (RIM[0], top_y, RIM[2]))


def scoreboard():
    navy = C.mat('score_panel', P['navy'])
    trim = C.mat('score_trim', C.mix_hex(P['navy'], P['line'], 0.16))
    cx, cy = SCOREBOARD['center']
    w, h, d = SCOREBOARD['size']
    z = C.BACK_Z + d / 2
    C.box('score_panel', (cx, cy, z), (w, h, d), navy, bevel=0.05)
    sw, sh = SCOREBOARD['screen']
    face = C.BACK_Z + d
    # A lighter inset outline round the screen, as on the mock's board.
    st = 0.028
    for i, (dx, dy, bw, bh) in enumerate([(0, sh / 2 + st / 2, sw + 2 * st, st), (0, -sh / 2 - st / 2, sw + 2 * st, st),
                                          (sw / 2 + st / 2, 0, st, sh), (-sw / 2 - st / 2, 0, st, sh)]):
        C.box('score_trim_%d' % i, (cx + dx, cy + dy, face + 0.004), (bw, bh, 0.008), trim, bevel=0)
    C.quad('scoreboard_screen', (cx, cy, face + 0.002), (sw, sh),
           C.mat('scoreboard_screen', P['navy'], ao=False, light=False, keep=True), uv=True, node=True)
    # Baked text for a still frame; the app hides it while it draws the live score on the screen.
    s, dy, size = SCOREBOARD['label']
    label = C.text('score_label', s, (cx, cy + dy, face + 0.006), size, C.mat('score_label', P['line'], ao=False, light=False))
    s, dy, size = SCOREBOARD['digits']
    digits = C.text('score_digits', s, (cx, cy + dy, face + 0.006), size, C.mat('score_digits', P['yellow'], ao=False, light=False))
    join('scoreboard_digits', [label, digits])


def rack(rng):
    """Two-tier navy rack against the back wall; each ball rests in a cradle of two rails."""
    navy = C.mat('rack_navy', P['navy'])
    x0, x1 = RACK['x']
    z, g = RACK['z'], RACK['gap']
    pr, rr = RACK['post_r'], RACK['rail_r']
    # Thin tubes: a bevel would not show at this size, so none (it was ~10k triangles).
    for i, x in enumerate((x0, x1)):
        for j, zz in enumerate((z - g / 2, z + g / 2)):
            C.cylinder('rack_post_%d%d' % (i, j), (x, RACK['top'] / 2, zz), pr, RACK['top'], navy, segments=12, bevel=0)
            C.cylinder('rack_foot_%d%d' % (i, j), (x, 0.015, zz), 0.05, 0.03, navy, segments=12, bevel=0)
    for k, y in enumerate(RACK['tiers'] + (RACK['top'] - rr,)):
        for j, zz in enumerate((z - g / 2, z + g / 2)):
            C.cylinder('rack_rail_%d%d' % (k, j), ((x0 + x1) / 2, y, zz), rr, x1 - x0, navy, axis='x', segments=10, bevel=0)
        for i, x in enumerate((x0, x1)):
            C.cylinder('rack_cross_%d%d' % (k, i), (x, y, z), rr, g, navy, axis='z', segments=10, bevel=0)
    r = RACK['ball_r']
    lift = math.sqrt((r + rr) ** 2 - (g / 2) ** 2)  # ball centre above the rails it rests on
    xs = [(x0 + x1) / 2 + (k - 1.5) * 2.2 * r for k in range(4)]
    slots, balls, kinds = [], [], []
    for tier, row in zip(RACK['tiers'], RACK['balls']):
        for x, kind in zip(xs, row):
            p = (x, tier + lift, z)
            slots.append(p)
            kinds.append(kind)
            balls.append(ball('rack_ball_%d' % len(balls), p, kind, rng))
    join('rack_balls', balls)
    C.slots('ball_rack_slots', slots, extras={'radius': r, 'kinds': ','.join(kinds)})
    # Its own node (contract NODES optional), so the app can hide it or swap it
    # for the live ball; baked apart, so hiding it leaves no shadow behind.
    lx, lz = RACK['loose']
    C.loose(ball('loose_ball', (lx, r, lz), 'basketball', rng), (lx, r, lz))


def blocks():
    for name, colour, x, y, z, s, yaw in BLOCKS:
        C.box(name, (x, y + s / 2, z), (s, s, s), C.mat('foam_' + colour, P[colour]),
              bevel=FOAM['bevel'] * s / 0.7, segments=FOAM['segments'], yaw=yaw)


def mats():
    """Folded gym mats: a stack of blue panels, each fold a little out of line."""
    blue = C.mat('mat_blue', C.mix_hex(P['blue'], C.SHADOW, 0.18))
    x0, x1 = MATS['x']
    f = MATS['fold']
    for k in range(MATS['folds']):
        C.box('mat_%d' % k, ((x0 + x1) / 2 + (0.03 if k % 2 else -0.02), f * (k + 0.5), MATS['z'] + (0.02 if k % 2 else 0)),
              (x1 - x0 - 0.04 * k, f - 0.004, MATS['depth']), blue, bevel=0.045, segments=3)


def main():
    rng = random.Random(11)
    root = C.new_room('play')
    shell()
    court()
    hoop()
    scoreboard()
    rack(rng)
    blocks()
    mats()
    C.node('tutor_spot', C.APP['tutor']['spot'])
    # Floor paint bakes apart from the planks (pipeline.PASSES['paint_apart']): in
    # one pass every plank vertex under a line bakes occluded and smears a halo.
    C.build(root, C.out_path('play'), passes='paint_apart')


main()
