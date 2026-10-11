"""The rooms' contract with the app: where the stage, the tutor, the camera,
the floating window and the hoop are, which names the app looks up, the
keep-out zones, and the palettes. Pure numbers and axis/colour/camera maths
(no bpy), shared by common.py (modelling) and pipeline.py (bake, export, preview).

Room frame: three.js axes (x right, y up, z toward the camera), the app's
world units, shifted so the floor is y = 0. The app mounts a room GLB at
[0, FLOOR_Y, 0] with no rotation or scale, so room x/z ARE world x/z.
"""

import math
import os
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'rooms')
MANIFEST_PATH = os.path.join(OUT_DIR, 'rooms.manifest.json')
TUTOR_GLB = os.path.join(REPO, 'public', 'models', 'tutor.glb')
FONT_DIR = os.path.join(HERE, 'fonts')
DRAFT_DIR = os.path.join(REPO, 'tmp', 'rooms')

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    """The value after `name` in the script args (after Blender's `--`)."""
    if name in ARGS and ARGS.index(name) + 1 < len(ARGS):
        return ARGS[ARGS.index(name) + 1]
    return default


def flag(name):
    return name in ARGS


def out_path(room):
    """Where the build writes a room's GLB:
    --out <path> (relative to the repo root) when given;
    else, for a --no-bake draft, tmp/rooms/<room>_room.draft.glb (a draft never
    replaces a shipped room);
    else the shipped file public/models/rooms/<room>_room.glb."""
    out = arg('--out')
    if out:
        return os.path.abspath(os.path.join(REPO, out))
    if flag('--no-bake'):
        return os.path.join(DRAFT_DIR, '%s_room.draft.glb' % room)
    return os.path.join(OUT_DIR, '%s_room.glb' % room)


def ships(path):
    """True for a file in public/models/rooms: only those are listed in the manifest."""
    norm = lambda p: os.path.normcase(os.path.abspath(p))  # noqa: E731
    return os.path.dirname(norm(path)) == norm(OUT_DIR)


# ---------------------------------------------------------------------------
# The contract: the app's stage, read from src/ on 2026-10-10. Mirrors
# src/scene/layout3d.ts, src/scene/physics/config.ts and the live LessonPage
# frame; if those move, move these (and bump CONTRACT).

# Written into each GLB's root extras and the manifest. History:
# 2: one floating window (centre x -3.15, 3.0 wide, focused scale 1.06).
# 3: the one window moved to centre x -3.06, 2.98 wide, unscaled when focused
#    (focus scale 1.0), so its focus ring stays inside the left wall.
CONTRACT = 3

FLOOR_Y = -1.55  # world y of the floor (layout3d FLOOR_Y): the app mounts rooms at [0, FLOOR_Y, 0]
TUTOR_SCALE = 0.8  # layout3d TUTOR_SCALE: model units -> world

APP = {
    # The physics room's inner faces (ROOM_BOX): the tutor and the toys bounce
    # inside x -4.7..4.7, z -7..2 (an invisible front wall) and floor..4.9.
    # Model the walls ON these planes so what bounces off a wall hits a wall you see.
    'room': {'half_w': 4.7, 'back_z': -7.0, 'front_z': 2.0, 'height': 4.9},
    # The visible shell runs past anything a full-bleed canvas shows (WORLD.shell).
    'shell': {'front_z': 11.4, 'top': 13.0},
    'tutor': {
        'spot': (0.0, 0.0, 0.6),  # his centre spot (SPOTS.center); he roams x -0.2..1.05, z 0.6..1.0
        'lane_x': (-0.2, 1.05),  # SPOTS.left.x .. SPOTS.right.x (CharacterDirector's laneMin, laneMax)
        'scale': TUTOR_SCALE,
        'height': 2.08,  # feet to cap top (2.6 model units)
        'radius': 0.64,  # body radius (0.8 model units)
    },
    # The white platform with the rainbow rim: app-side, never modelled. Its top
    # layers sit 0.002..0.008 above the floor and its body hangs below it.
    'platform': {'center': (0.0, 0.0, 0.7), 'rx': 1.5, 'rz': 1.05},
    # THE floating browser window: the app has one (notes, board and quiz all live in
    # it). Every window number lives HERE and nowhere else: the calm boxes, the
    # build's screen-space check and the preview ghost are all worked out from it.
    # If src/scene/layout3d.ts moves the window, refresh this dict and bump CONTRACT.
    'window': {
        'center': (-3.06, 0.33 - FLOOR_Y, -0.45),  # WINDOW.position (world y 0.33 -> room y 1.88)
        'yaw': 0.26,  # WINDOW.yaw, about +y: turned toward the stage
        'size': (2.98, 2.5),  # WINDOW.width x WINDOW.height
        # Focused (the normal teaching state): turned flatter, not scaled, moved toward
        # the camera, and the camera and its target pan left (cameraPan()). The focus
        # ring then spans x -4.600..-1.520: inside the left wall and the study's rail.
        'focus': {
            'yaw': 0.14,  # WINDOWS.focusYaw
            'scale': 1.0,  # WINDOWS.focusScale
            'lift': 0.25,  # WINDOW_STYLE.focus.lift (src/scene/windows/windowStyle.ts), +z
            'pan': -0.9,  # cameraPan(): -LESSON_CAMERA.focusShift while any focus is on
        },
        'ring': 0.065,  # the teal focus outline round it: WINDOW_STYLE.focus.ring gap + stroke
        'ring_gap': 0.03,  # ...of which the gap between the window and the stroke
        # Students drag and resize it (clamped to the resting frame), so keep a margin.
    },
    # LESSON_CAMERA in the room frame, and where LessonPage puts its 16:9 frame in
    # a 1456 x 785 window (measured live). The canvas is full-bleed: CameraRig
    # projects the frame with setViewOffset, so the whole window shows the room.
    'camera': {
        'fov': 40.0,  # vertical, of the 16:9 frame
        'position': (0.0, 2.10, 7.4),
        'target': (0.0, 1.43, 0.0),
        'viewport': (1456, 785),
        'frame': (202.0, 68.125, 1052.0, 591.75),  # x, y, w, h in viewport px
        'near': 0.1,
        'far': 100.0,
    },
    # The toy ball (PHYSICS.ball.radius = 0.2 model units x TUTOR_SCALE): rack balls
    # and the loose ball match it, so the app can swap one for its live ball 1:1.
    'ball_radius': 0.2 * TUTOR_SCALE,
    # The toy hoop (PHYSICS.hoop; src/scene/physics/Toys.tsx owns its colliders and
    # score sensor): rim high on the RIGHT side wall, board flat on that wall facing -x.
    'hoop': {
        'rim': (4.08, 3.60, -2.6),
        'rim_radius': 0.45,
        'tube': 0.035,
        'board': (1.25, 0.85, 0.06),  # width (along z), height, thickness
        'board_above': 0.32,  # board centre above the rim
        'net_depth': 0.36,
        'net_bottom': 0.62,  # net bottom radius, share of the rim's
        'wall_x': 4.7,
    },
    # Where the shoot clip lets go of the ball (BLENDER/tutor/author_play.py: (0, 2.5, 1.04)
    # in his root frame, model units) from the centre spot, facing the camera. The app's
    # shootBall keeps the apex under the physics ceiling minus 0.3 (y 4.6).
    'release': (0.0, 2.0, 1.43),
    'shot_apex_max': 4.6,
}

TOP = APP['shell']['top']
HALF_W = APP['room']['half_w']
BACK_Z = APP['room']['back_z']
FRONT_Z = APP['shell']['front_z']

# Keep-out boxes, room frame, (min xyz, max xyz). check_zones() warns when a prop
# (anything not shell, decal or an allowed node) has a vertex inside one.
CLEAR = {
    # His lane and platform: only flat decals (rug, court paint) under and around him.
    'stage': {'box': ((-1.9, 0.012, -0.5), (1.9, 3.0, 2.2)), 'allow': ()},
    # The shot from the release point up and over to the rim: only the hoop lives here.
    'shot': {'box': ((-0.6, 1.6, -3.4), (4.6, 4.9, 1.9)), 'allow': ('hoop_',)},
}

# ---------------------------------------------------------------------------
# The lesson camera and the window, as the app projects them


def camera_basis(pan=0.0):
    """Eye, forward, right and up (room frame) of LESSON_CAMERA panned by `pan` in x."""
    cam = APP['camera']
    p, t = cam['position'], cam['target']
    eye = Vector((p[0] + pan, p[1], p[2]))
    fwd = (Vector((t[0] + pan, t[1], t[2])) - eye).normalized()
    right = fwd.cross(Vector((0.0, 1.0, 0.0))).normalized()
    return eye, fwd, right, right.cross(fwd)


def projector(pan=0.0):
    """A function: room point -> (x, y, depth), the NDC of the lesson camera's 16:9
    frame (the NDC layout3d.ts quotes for the window; the full-bleed canvas runs
    past +-1) and the distance along the view axis."""
    eye, fwd, right, up = camera_basis(pan)
    cam = APP['camera']
    ty = math.tan(math.radians(cam['fov'] / 2))
    tx = ty * cam['frame'][2] / cam['frame'][3]

    def project(p):
        d = Vector(p) - eye
        z = d.dot(fwd)
        return d.dot(right) / z / tx, d.dot(up) / z / ty, z
    return project


def to_ndc(p, pan=0.0):
    return projector(pan)(p)


def window_pose(focused=False):
    """(centre, yaw, scale, camera pan) of the window at rest or focused."""
    w = APP['window']
    cx, cy, cz = w['center']
    if not focused:
        return Vector((cx, cy, cz)), w['yaw'], 1.0, 0.0
    f = w['focus']
    return Vector((cx, cy, cz + f['lift'])), f['yaw'], f['scale'], f['pan']


def window_corners(focused=False, ring=None):
    """Room points of the window's corners: bottom-left, bottom-right, top-right,
    top-left from the front. ring (default: only when focused) adds the focus outline."""
    centre, yaw, s, _ = window_pose(focused)
    w, h = APP['window']['size']
    pad = APP['window']['ring'] * s if (focused if ring is None else ring) else 0.0
    hw, hh = w / 2 * s + pad, h / 2 * s + pad
    c, sn = math.cos(yaw), math.sin(yaw)
    return [centre + Vector((x * c, y, -x * sn)) for x, y in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]


def _calm_boxes(depth=0.8, floor=0.15, steps=16):
    """Where the window hides the walls: rays from the camera through a grid over
    the window (focus outline included), at rest and focused, to the first wall
    they hit. Each wall's hits make one box reaching `depth` into the room, from
    `floor` (over the skirting and baseboards) up."""
    hits = {}
    for focused in (False, True):
        eye = camera_basis(window_pose(focused)[3])[0]
        bl, br, tr, tl = window_corners(focused, ring=True)
        for i in range(steps + 1):
            for j in range(steps + 1):
                lo, hi = bl.lerp(br, i / steps), tl.lerp(tr, i / steps)
                d = lo.lerp(hi, j / steps) - eye
                walls = [(t, k) for t, k in (((-HALF_W - eye.x) / d.x if d.x < 0 else None, 'left'),
                                             ((HALF_W - eye.x) / d.x if d.x > 0 else None, 'right'),
                                             ((BACK_Z - eye.z) / d.z if d.z < 0 else None, 'back'))
                         if t is not None]
                t, k = min(walls)
                p = eye + d * t
                if p.y > 0:  # rays that reach the floor first hit no wall
                    hits.setdefault(k, []).append(p)
    boxes = {}
    for k, pts in sorted(hits.items()):
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        lo[1] = max(lo[1], floor)
        if k == 'back':
            hi[2] = BACK_Z + depth
        elif k == 'left':
            hi[0] = -HALF_W + depth
        else:
            lo[0] = HALF_W - depth
        boxes['window_%s' % k] = (tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi))
    return boxes


# Wall areas the floating window hides from the lesson camera, at rest or focused
# (worked out from APP['window']). Keep them calm: flat colour or bands, no
# shelves, posters or props, which would be wasted or peek out round its edges.
CALM_ALLOW = ()  # name prefixes allowed inside anyway (the hoop was, under the old right window)
CALM = _calm_boxes()

# Names the app looks up (GLTFLoader keeps these as they are: no dots, no spaces).
NODES = {
    'study': {
        'required': ['tutor_spot', 'window_glass'],
        'optional': ['window_glow', 'trophy_cup', 'trophy_star'],
    },
    'play': {
        'required': ['tutor_spot', 'hoop_rim', 'hoop_backboard', 'hoop_net', 'scoreboard_screen', 'ball_rack_slots'],
        # loose_ball: the basketball on the court, its own node so the app can hide
        # it while the live ball is in play (it casts no baked shadow on the floor).
        'optional': ['scoreboard_digits', 'rack_balls', 'hoop_mount', 'loose_ball'],
    },
}

# ---------------------------------------------------------------------------
# Palettes (design/study-play/claude-design/notes.md). Inspiration, not a
# pixel target: tune shades here, never inline in a room script.

STUDY = {
    'wall': '#DCE6EE',  # back wall
    'side': '#C8D5E1',  # side walls, a shade darker
    'panel': '#F2EADB',  # cream lower wall (wainscot) and the LIBRARY plate
    'trim': '#FBF8F3',  # rail, mouldings, baseboard, window frame and sill
    'floor': '#EADBC4',  # pale wood planks
    'seam': '#D6C1A2',  # plank seams
    'wood': '#C49A74',  # bookcase, shelves
    'sky_top': '#BFDDF2',
    'sky_bottom': '#E6F2FA',
    'rug': '#CFDCD4',  # sage, with a trim-coloured inner ring
    'book_blue': '#7FA3B6',
    'terracotta': '#D49C84',  # book spines and the plant pot
    'sage': '#93B394',  # book spines, leaves, mug
    'gold': '#E2BE6A',  # book spines, cup, star
    'silver': '#C8D5E1',
}

PLAY = {
    'orange': '#FF8A3D',  # top stripe, baseboard, a soft block
    'blue': '#4DB4F0',  # middle stripe, volleyball, a soft block
    'purple': '#8A5CE6',  # lower stripe, painted lane, dodgeball, a soft block
    'yellow': '#FFCE4A',  # big lower wall, scoreboard digits
    'floor': '#E3A55C',  # honey court wood
    'seam': '#C98A45',
    'line': '#FFFFFF',  # court lines, backboard, net
    'navy': '#262A44',  # scoreboard, ball rack, hoop bracket
    'ball': '#F2702E',  # basketballs, rim, target square
    'ink': '#1E1B2E',  # ball seams
}

SHADOW = '#1E2A3A'  # the mocks' shadow / AO ink; side walls take 12% of it in the play mock

# How faces are shaded into the vertex colours.
SHADE = {
    'ao_samples': 96,
    'ao_distance': 0.9,  # world units: how far contact shadows reach
    'ao_strength': 0.55,  # share of the way toward SHADOW at full occlusion
    'light': (2.5, 6.0, 5.0),  # the app's key light direction (LIGHTS.key.position), room frame
    'light_strength': 0.28,  # half-Lambert: faces turned away lose this much
}

# Export. The room is unlit, so normals are dead weight (and split every flat
# corner); turn them on only if the app ever lights the room.
EXPORT = {'normals': False}

# Default bevels: chunky toy edges, scaled down on thin parts.
BEVEL = {'width': 0.035, 'segments': 3}

# Preview render (dev only; never in the GLB).
PREVIEW = {
    'samples': 32,
    'background': '#F3F1EC',  # LessonPage's page colour
    'sun': 3.2,  # W/m2 on the tutor (the room is unlit)
    'world': 0.9,
    'ghost': 0.38,  # window ghost opacity
    'ghost_edge': '#14A39A',  # its header bar (the mocks' teal)
    'guide': '#FF2E88',
}

# ---------------------------------------------------------------------------
# Axes and colours


def T(x, y, z):
    """Room point (three axes) -> Blender."""
    return Vector((x, -z, y))


def T_size(sx, sy, sz):
    """Room size (x, height, depth) -> Blender extents."""
    return Vector((sx, sz, sy))


def from_blender(v):
    """Blender point -> room point (three axes)."""
    return Vector((v.x, v.z, -v.y))


def hex_srgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def to_linear(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def hex_linear(h):
    return to_linear(hex_srgb(h))


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mix_hex(a, b, t):
    """a blended toward b by t in sRGB, like the mocks' alpha overlays."""
    return '#%02X%02X%02X' % tuple(round(v * 255) for v in lerp3(hex_srgb(a), hex_srgb(b), t))


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
