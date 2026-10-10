"""The rooms' contract with the app: where the stage, the tutor, the camera,
the floating windows and the hoop are, which names the app looks up, the
keep-out zones, and the palettes. Pure numbers and axis/colour maths (no
bpy), shared by common.py (modelling) and pipeline.py (bake, export, preview).

Room frame: three.js axes (x right, y up, z toward the camera), the app's
world units, shifted so the floor is y = 0. The app mounts a room GLB at
[0, FLOOR_Y, 0] with no rotation or scale, so room x/z ARE world x/z.
"""

import os
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(REPO, 'public', 'models', 'rooms')
MANIFEST_PATH = os.path.join(OUT_DIR, 'rooms.manifest.json')
TUTOR_GLB = os.path.join(REPO, 'public', 'models', 'tutor.glb')

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    """The value after `name` in the script args (after Blender's `--`)."""
    if name in ARGS and ARGS.index(name) + 1 < len(ARGS):
        return ARGS[ARGS.index(name) + 1]
    return default


def flag(name):
    return name in ARGS


# ---------------------------------------------------------------------------
# The contract: the app's stage, read from src/ on 2026-10-10. Mirrors
# src/scene/layout3d.ts, src/scene/physics/config.ts and the live LessonPage
# frame; if those move, move these (and bump CONTRACT).

CONTRACT = 1  # written into each GLB's root extras and the manifest

FLOOR_Y = -1.55  # world y of the floor (layout3d FLOOR_Y): the app mounts rooms at [0, FLOOR_Y, 0]

APP = {
    # The physics room's inner faces (ROOM_BOX): the tutor and the toys bounce
    # inside x -4.7..4.7, z -7..2 (an invisible front wall) and floor..4.9.
    # Model the walls ON these planes so what bounces off a wall hits a wall you see.
    'room': {'half_w': 4.7, 'back_z': -7.0, 'front_z': 2.0, 'height': 4.9},
    # The visible shell runs past anything a full-bleed canvas shows (WORLD.shell).
    'shell': {'front_z': 11.4, 'top': 13.0},
    'tutor': {
        'spot': (0.0, 0.0, 0.6),  # his centre spot (SPOTS.center); he roams x -1.05..1.05, z 0.6..1.0
        'lane_x': (-1.05, 1.05),
        'scale': 0.8,  # TUTOR_SCALE: model units -> world
        'height': 2.08,  # feet to cap top (2.6 model units)
        'radius': 0.64,  # body radius (0.8 model units)
    },
    # The white platform with the rainbow rim: app-side, never modelled. Its top
    # layers sit 0.002..0.008 above the floor and its body hangs below it.
    'platform': {'center': (0.0, 0.0, 0.7), 'rx': 1.5, 'rz': 1.05},
    # The two floating browser windows at rest (WINDOWS): centre, yaw about +y, width x height.
    # Students drag and resize them, and a focused one pulls the camera 0.9 toward it.
    'windows': {
        'notes': {'center': (-3.15, 1.95, -0.3), 'yaw': 0.28, 'size': (2.6, 2.35)},
        'board': {'center': (3.15, 1.95, -0.3), 'yaw': -0.28, 'size': (2.6, 2.35)},
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
        'pan': 0.9,  # x shift of camera and target while a window is focused
        'near': 0.1,
        'far': 100.0,
    },
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
# Wall areas the floating windows cover from the lesson camera (mostly the SIDE
# walls: the back wall only spans screen x 465..991 at 1456 wide). Keep them
# calm: flat colour or bands, no shelves, posters or props. The hoop is the one
# exception: the app hangs it there, just above the board window.
CALM_ALLOW = ('hoop_',)
CALM = {
    'notes_wall': ((-4.7, 0.6, -7.0), (-3.9, 4.2, 0.2)),
    'board_wall': ((3.9, 0.6, -7.0), (4.7, 4.2, 0.2)),
    'notes_back': ((-4.7, 0.6, -7.0), (-3.3, 4.2, -6.2)),
    'board_back': ((3.3, 0.6, -7.0), (4.7, 4.2, -6.2)),
}

# Names the app looks up (GLTFLoader keeps these as they are: no dots, no spaces).
NODES = {
    'study': {
        'required': ['tutor_spot', 'window_glass'],
        'optional': ['window_glow', 'trophy_cup', 'trophy_star'],
    },
    'play': {
        'required': ['tutor_spot', 'hoop_rim', 'hoop_backboard', 'hoop_net', 'scoreboard_screen', 'ball_rack_slots'],
        'optional': ['scoreboard_digits', 'rack_balls', 'hoop_mount'],
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
    'ghost_edge': ('#14A39A', '#4F55C9'),  # notes, board (the mocks' accents)
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
