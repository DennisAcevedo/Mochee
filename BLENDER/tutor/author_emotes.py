"""Authors the emote one-shots (emote_*) into clips.json's "extra" list (plain Python 3, no Blender needed).

  python blender/tutor/author_emotes.py [path/to/clips.json]

Run it after author_extra.py, then rebuild (build_tutor.py). Like author_extra
it uses author_clips.py's pose helpers and tassel simulation and writes its
clips under "extra" (and into "clips"), so an author_clips.py rerun keeps them.

Every emote is a fast one-shot (0.9-1.5 s) that starts and ends on the rest
pose, so it crossfades in and out of any loop. Each has an anticipation beat
(a dip or a wind-up), a snappy 'back' arrival on the main pose, and a settle.

Hands and feet hang off the root, not the body, so a hand that touches him
(cheek, belly, face, heart, brow) is placed with on_body(): the point and the
orientation are given in the body's frame and ride whatever the body key does
(lean, squash, turn), so the mitten stays glued to the same spot.

Axes are three.js (x right, y up, z toward the camera); .L = his left = +x.
"""

import json
import math
import os
import sys

from author_clips import OUT, SIDEWAYS, UPRIGHT, K, body, cap, clip, foot, hand, r3

HAND_REST = (0.95, -0.28, 0.28)  # hand.L centre relative to the body centre (build_tutor HAND['rest'])


# ---------------------------------------------------------------------------
# Rotation helpers (three.js Euler XYZ in degrees: R = Rx @ Ry @ Rz)

def _rot(axis, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    if axis == 'x':
        return [[1, 0, 0], [0, c, -s], [0, s, c]]
    if axis == 'y':
        return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]


def _mm(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _mv(m, v):
    return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]


def _euler_m(r):
    return _mm(_mm(_rot('x', r[0]), _rot('y', r[1])), _rot('z', r[2]))


def _m_euler(m):
    """Inverse of _euler_m (three.js Euler.setFromRotationMatrix, order XYZ), degrees."""
    y = math.asin(max(-1.0, min(1.0, m[0][2])))
    if abs(m[0][2]) < 0.9999999:
        x, z = math.atan2(-m[1][2], m[2][2]), math.atan2(-m[0][1], m[0][0])
    else:
        x, z = math.atan2(m[2][1], m[1][1]), 0.0
    return [math.degrees(x), math.degrees(y), math.degrees(z)]


def on_body(s, b, p, pitch=0.0, yaw=0.0, tilt=0.0):
    """Hand s glued to the body: p = point relative to the body centre in his-left terms
    (x is mirrored by s), oriented like hand(s, pitch=, yaw=, tilt=) in the body's frame,
    then carried by the body pose b (a body() dict: loc, Euler rot, scale)."""
    R = _euler_m(b['rot'])
    q = [s * p[0] * b['scale'][0], p[1] * b['scale'][1], p[2] * b['scale'][2]]
    w = _mv(R, q)
    rest = (s * HAND_REST[0], HAND_REST[1], HAND_REST[2])
    loc = [w[i] + b['loc'][i] - rest[i] for i in range(3)]
    rot = _m_euler(_mm(R, _euler_m((pitch, s * yaw, -s * tilt))))
    return {'loc': r3(loc), 'rot': r3(rot)}


def glued(s, rows, p, t0, t1, **orient):
    """Hand keys glued to point p for every body row with t0 <= t <= t1 (same times and eases)."""
    return [K(t, on_body(s, b, p, **orient), e) for t, b, e in rows if t0 - 1e-6 <= t <= t1 + 1e-6]


def keys(rows):
    return [K(t, ch, e) for t, ch, e in rows]


def both(fn):
    return {'hand.L': fn(1), 'hand.R': fn(-1)}


# ---------------------------------------------------------------------------
# Emotes

def laugh():
    """Belly laugh: dip, throw his head back clutching his belly, ha-ha-ha bounces, double over, stomp."""
    d = 1.3
    rows = [(0, body(), None), (0.1, body(sy=0.92, rx=8), None), (0.24, body(y=0.05, sy=1.08, rx=-16), 'back')]
    for i, t in enumerate([0.34, 0.44, 0.54, 0.64, 0.74, 0.84]):
        up = i % 2
        rows.append((t, body(y=0.04 * up, sy=1.05 if up else 0.93, rx=-17 if up else -12, rz=4 if i % 4 < 2 else -4),
                     None if up else 'linear'))
    rows += [(0.98, body(sy=0.88, rx=11), 'back'), (1.12, body(y=0.02, sy=1.03, rx=4), None), (d, body(), None)]
    belly = dict(p=(0.46, -0.44, 0.7), yaw=34, tilt=-70)
    h = lambda s: [K(0, hand(s)), K(0.1, hand(s, out=0.06, up=0.1, tilt=-8))] + glued(s, rows, belly['p'], 0.24, 0.98, yaw=belly['yaw'], tilt=belly['tilt']) + \
        [K(1.12, hand(s, out=0.02, up=-0.02, fwd=0.08, tilt=10)), K(d, hand(s))]
    return clip('emote_laugh', d, False, 'happy', [[0.24, 'sparkles']], {
        'body': keys(rows), **both(h),
        'foot.L': [K(0, foot(1)), K(0.86, foot(1)), K(0.92, foot(1, up=0.1, fwd=0.04, pitch=-15)), K(0.98, foot(1), 'linear'), K(d, foot(1))],
        'cap': [K(0, cap()), K(0.24, cap(loc=(0, 0.05, -0.02), rot=(-8, 0, 0)), 'back'), K(0.84, cap(rot=(-5, 0, 3))), K(0.98, cap(rot=(6, 0, 0)), 'back'), K(d, cap())],
    }, 'Belly laugh: dip, head thrown back with both mittens on his belly, ha-ha-ha bounces, doubles over with a stomp.')


def shy():
    """Bashful: turns half away with mittens on his cheeks, sways, scuffs a toe, sneaks a peek back."""
    d = 1.4
    rows = [(0, body(), None), (0.1, body(sy=0.95, rx=5), None), (0.26, body(y=0.02, sy=1.04, rx=8, ry=-22, rz=8), 'back'),
            (0.5, body(sy=0.98, rx=9, ry=-15, rz=-3), None), (0.74, body(y=0.02, sy=1.02, rx=8, ry=-23, rz=8), None),
            (0.96, body(sy=0.98, rx=9, ry=-15, rz=-2), None), (1.08, body(y=0.02, sy=1.03, rx=2, ry=8, rz=4), 'back'),
            (1.22, body(rx=3, ry=5, rz=3), None), (d, body(), None)]
    cheek = dict(p=(0.56, -0.13, 0.69), pitch=9, yaw=39, tilt=-20)
    h = lambda s: [K(0, hand(s)), K(0.1, hand(s, up=-0.05, tilt=12)), K(0.18, hand(s, out=-0.15, up=0.1, fwd=0.32, tilt=-5))] + \
        glued(s, rows, cheek['p'], 0.26, 1.22, pitch=cheek['pitch'], yaw=cheek['yaw'], tilt=cheek['tilt']) + [K(d, hand(s))]
    scuff = [K(0, foot(-1)), K(0.3, foot(-1)), K(0.42, foot(-1, out=-0.02, up=0.07, fwd=0.1, pitch=30)),
             K(0.6, foot(-1, out=0.1, up=0.07, fwd=0.04, pitch=30, yaw=25)), K(0.78, foot(-1, out=-0.02, up=0.07, fwd=0.1, pitch=30)),
             K(0.94, foot(-1)), K(d, foot(-1))]
    return clip('emote_shy', d, False, 'happy', [[0.3, 'hearts']], {
        'body': keys(rows), **both(h), 'foot.R': scuff,
        'cap': [K(0, cap()), K(0.26, cap(rot=(4, 0, 6)), 'back'), K(0.74, cap(rot=(4, 0, 8))), K(1.08, cap(rot=(0, 0, -3)), 'back'), K(d, cap())],
    }, 'Bashful: turns half away with his mittens on his cheeks, sways, scuffs a toe, then sneaks a peek back at the student.')


def doubletake():
    """Glances off to the side, then SNAPS back with a hop, jazz hands, cap pop and a stare."""
    d = 1.1
    jazz = lambda s, up, tilt: hand(s, out=0.3, up=up, fwd=0.12, tilt=tilt)
    return clip('emote_doubletake', d, False, 'surprised', [[0.4, 'ring']], {
        'body': [K(0, body()), K(0.2, body(ry=-38, rz=3, rx=-2)), K(0.3, body(sy=0.95, ry=-40, rz=3)),
                 K(0.4, body(y=0.12, sy=1.14, rx=-10, ry=5), 'back'), K(0.52, body(sy=0.88, rx=-4), 'linear'),
                 K(0.62, body(y=0.03, sy=1.05, rx=-7), 'back'), K(0.7, body(y=0.02, sy=1.03, rx=-6, ry=3)),
                 K(0.76, body(y=0.02, sy=1.03, rx=-6, ry=-3)), K(0.82, body(y=0.02, sy=1.03, rx=-6, ry=2)),
                 K(0.88, body(y=0.02, sy=1.03, rx=-6)), K(d, body())],
        **both(lambda s: [K(0, hand(s)), K(0.2, hand(s, up=0.02, tilt=5)), K(0.3, hand(s, up=-0.06, tilt=15)),
                          K(0.4, jazz(s, 0.62, -25), 'back'), K(0.52, jazz(s, 0.5, -20)), K(0.62, jazz(s, 0.6, -28), 'back'),
                          K(0.88, jazz(s, 0.56, -25)), K(d, hand(s))]),
        **{b: [K(0, foot(s)), K(0.3, foot(s)), K(0.4, foot(s, up=0.1, pitch=10), 'back'), K(0.52, foot(s), 'linear'), K(d, foot(s))]
           for b, s in (('foot.L', 1), ('foot.R', -1))},
        'cap': [K(0, cap()), K(0.3, cap()), K(0.4, cap(loc=(0, 0.16, 0), rot=(-8, 0, 6)), 'back'), K(0.56, cap(), 'bounce'), K(d, cap())],
    }, 'Double take: casual glance to the viewer left, snaps back with a hop, stretch 1.14, jazz hands and a cap pop, then a wide-eyed stare.')


def fistpump():
    """"Yesss!": cocks his left fist high, yanks it down to his hip with a knee pull, pumps again."""
    d = 1.0
    fist = lambda up, out=-0.2, fwd=0.32: hand(1, out=out, up=up, fwd=fwd, pitch=-25, tilt=20)
    return clip('emote_fistpump', d, False, 'happy', [[0.26, 'stars']], {
        'body': [K(0, body()), K(0.12, body(y=0.04, sy=1.06, rx=-8, rz=-6)), K(0.24, body(sy=0.86, rx=12, rz=3), 'linear'),
                 K(0.32, body(y=0.02, sy=1.03, rx=6), 'back'), K(0.4, body(sy=0.92, rx=10), 'linear'),
                 K(0.5, body(y=0.04, sy=1.05, rx=-5), 'back'), K(0.75, body(y=0.03, sy=1.03, rx=-4)), K(d, body())],
        'hand.L': [K(0, hand(1)), K(0.12, hand(1, out=0.02, up=0.98, fwd=0.05, tilt=-15)), K(0.24, fist(-0.06), 'linear'),
                   K(0.3, fist(0.02), 'back'), K(0.35, fist(0.3, -0.12, 0.26)), K(0.4, fist(-0.06), 'linear'),
                   K(0.5, fist(0.0), 'back'), K(0.75, fist(0.02)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.12, hand(-1, out=0.06, up=0.08, tilt=10)), K(0.24, hand(-1, out=0.12, up=0.18, fwd=-0.05, tilt=20), 'back'),
                   K(0.75, hand(-1, out=0.08, up=0.1, tilt=12)), K(d, hand(-1))],
        'foot.L': [K(0, foot(1)), K(0.14, foot(1)), K(0.24, foot(1, up=0.12, fwd=0.12, pitch=-15), 'linear'), K(0.34, foot(1, up=0.06, fwd=0.06)),
                   K(0.4, foot(1), 'linear'), K(d, foot(1))],
        'cap': [K(0, cap()), K(0.12, cap(rot=(0, 0, -4))), K(0.26, cap(loc=(0, -0.02, 0), rot=(6, 0, 3)), 'back'), K(0.5, cap(rot=(-3, 0, 0))), K(d, cap())],
    }, '"Yesss!": cocks his left fist high, yanks it down to his hip with a knee pull and a crunch, a second quick pump, proud hold.')


def facepalm():
    """D'oh: winds up, slaps a mitten flat across his forehead, slumps, slow head-shake under it, drags it down."""
    d = 1.3
    rows = [(0, body(), None), (0.12, body(y=0.03, sy=1.04, rx=-6, rz=-3), None), (0.24, body(sy=0.9, rx=12), 'linear'),
            (0.34, body(y=0.01, sy=0.97, rx=16), 'back'), (0.52, body(sy=0.96, rx=17, ry=9), None),
            (0.68, body(sy=0.96, rx=17, ry=-9), None), (0.84, body(sy=0.96, rx=16, ry=6), None),
            (0.98, body(sy=0.95, rx=10), None), (1.12, body(sy=0.97, rx=3), None), (d, body(), None)]
    brow, chin = (0.02, 0.22, 0.88), (0.08, -0.24, 0.86)  # mitten laid flat across his forehead, then dragged down
    palm = [K(0, hand(-1)), K(0.12, hand(-1, out=0.18, up=0.4, fwd=0.2, tilt=-5))] + glued(-1, rows, brow, 0.24, 0.84, pitch=-14, tilt=-116) + \
        glued(-1, rows, chin, 0.98, 0.98, tilt=-45) + [K(1.1, hand(-1, out=-0.3, up=-0.12, fwd=0.42, tilt=15)), K(d, hand(-1))]
    return clip('emote_facepalm', d, False, 'closed', [], {
        'body': keys(rows), 'hand.R': palm,
        'hand.L': [K(0, hand(1)), K(0.24, hand(1, out=-0.02, up=-0.1, fwd=0.04, tilt=25)), K(0.98, hand(1, out=-0.02, up=-0.12, fwd=0.04, tilt=28)), K(d, hand(1))],
        'cap': [K(0, cap()), K(0.34, cap(loc=(0, -0.02, 0.02), rot=(6, 0, -3)), 'back'), K(0.98, cap(rot=(4, 0, -2))), K(d, cap())],
    }, "D'oh: winds up, slaps his right mitten flat across his forehead, slumps forward, slow head-shake under it, drags it down his face.")


def nod():
    """Eager yes: three quick nods (big, small, smaller) with clasped hands bouncing in front."""
    d = 0.9
    clasp = lambda s, up: hand(s, out=-0.62, up=up, fwd=0.6, pitch=-15, tilt=-45)
    return clip('emote_nod', d, False, 'happy', [], {
        'body': [K(0, body()), K(0.07, body(y=0.03, sy=1.05, rx=-8)), K(0.17, body(sy=0.92, rx=16), 'linear'),
                 K(0.27, body(y=0.03, sy=1.04, rx=-6), 'back'), K(0.37, body(sy=0.93, rx=14), 'linear'),
                 K(0.47, body(y=0.02, sy=1.03, rx=-4), 'back'), K(0.57, body(sy=0.96, rx=9)), K(0.68, body(y=0.01, sy=1.01, rx=-2)), K(d, body())],
        **both(lambda s: [K(0, hand(s)), K(0.07, clasp(s, -0.08)), K(0.17, clasp(s, -0.15), 'linear'), K(0.27, clasp(s, -0.06), 'back'),
                          K(0.37, clasp(s, -0.14), 'linear'), K(0.47, clasp(s, -0.07), 'back'), K(0.57, clasp(s, -0.11)),
                          K(0.68, clasp(s, -0.08)), K(0.78, hand(s, out=-0.3, up=-0.06, fwd=0.4, tilt=-10)), K(d, hand(s))]),
        'cap': [K(0, cap()), K(0.17, cap(rot=(5, 0, 0))), K(0.27, cap(rot=(-4, 0, 0)), 'back'), K(0.47, cap(rot=(-3, 0, 0))), K(d, cap())],
    }, 'Eager yes: three quick whole-body nods (16, 14, 9 deg) with squash on each, clasped mittens bouncing in front.')


def headshake():
    """Nope: fast no-no shakes with both mittens waving palms-out the other way."""
    d = 1.0
    wave = lambda s, dx: hand(s, out=-0.38 + s * dx, up=0.1, fwd=0.5, tilt=UPRIGHT + 5)
    shakes = [(0.08, 10, -0.05), (0.18, -22, 0.15), (0.3, 20, -0.15), (0.42, -16, 0.12), (0.54, 12, -0.1), (0.66, -6, 0.05), (0.78, 2, 0.0)]
    return clip('emote_headshake', d, False, 'closed', [], {
        'body': [K(0, body())] + [K(t, body(y=0.02 if 0.1 < t < 0.5 else 0, sy=0.95 if t < 0.1 else 1.02, ry=ry, rz=-ry * 0.14)) for t, ry, _ in shakes] + [K(d, body())],
        **both(lambda s: [K(0, hand(s))] + [K(t, wave(s, dx)) for t, _, dx in shakes] + [K(d, hand(s))]),
        'cap': [K(0, cap()), K(0.3, cap(rot=(0, 0, 6))), K(0.54, cap(rot=(0, 0, -5))), K(0.78, cap(rot=(0, 0, 2))), K(d, cap())],
    }, 'Nope: fast no-no shakes (22, 20, 16 deg, decaying), eyes squeezed shut, both mittens wave palms-out against the shake.')


def love():
    """Aww: both mittens pressed over his heart, swoons, sways side to side, foot pop, hearts."""
    d = 1.5
    rows = [(0, body(), None), (0.12, body(sy=0.93, rx=5), None), (0.28, body(y=0.05, sy=1.08, rx=-8, rz=-5), 'back'),
            (0.5, body(y=0.03, sy=1.04, rx=-6, ry=8, rz=11), None), (0.74, body(y=0.03, sy=1.04, rx=-6, ry=-8, rz=-11), None),
            (0.98, body(y=0.03, sy=1.04, rx=-6, ry=8, rz=10), None), (1.16, body(sy=0.92, rx=2), None),
            (1.3, body(y=0.02, sy=1.03), None), (d, body(), None)]
    heart = {1: dict(p=(0.43, -0.45, 0.7), pitch=20, yaw=31, tilt=-45), -1: dict(p=(-0.13, -0.5, 0.8), pitch=25, yaw=-10, tilt=-50)}  # hand.R crosses over
    via = {1: hand(1, out=-0.3, up=-0.12, fwd=0.42, tilt=-10), -1: hand(-1, out=-0.5, up=-0.1, fwd=0.67, tilt=-20)}  # in front, clear of him
    h = lambda s: [K(0, hand(s)), K(0.12, hand(s, up=-0.06, tilt=12)), K(0.2, via[s])] + \
        glued(s, rows, heart[s]['p'], 0.28, 1.16, pitch=heart[s]['pitch'], yaw=heart[s]['yaw'], tilt=heart[s]['tilt']) + \
        [K(1.24, via[s]), K(1.36, hand(s, out=0.05, up=0.05, tilt=-5)), K(d, hand(s))]
    pop = lambda up, fwd, pitch: foot(-1, up=up, fwd=fwd, pitch=pitch)
    return clip('emote_love', d, False, 'happy', [[0.3, 'hearts'], [0.9, 'hearts']], {
        'body': keys(rows), **both(h),
        'foot.R': [K(0, foot(-1)), K(0.18, foot(-1)), K(0.3, pop(0.06, -0.2, 40), 'back'), K(1.1, pop(0.05, -0.18, 36)), K(1.22, foot(-1), 'linear'), K(d, foot(-1))],
        'cap': [K(0, cap()), K(0.28, cap(rot=(-4, 0, -6)), 'back'), K(0.74, cap(rot=(0, 0, 5))), K(1.16, cap(rot=(0, 0, -3))), K(d, cap())],
    }, 'Aww: both mittens pressed over his heart, swoons back, sways side to side with a foot pop, hearts.')


def salute():
    """Snaps to attention: stretch tall, heels click, right mitten flat at his brow, hold, snap down."""
    d = 1.2
    rows = [(0, body(), None), (0.1, body(sy=0.94), None), (0.24, body(y=0.04, sy=1.08, rx=-4), 'back'),
            (0.34, body(y=0.02, sy=1.05, rx=-3), None), (0.8, body(y=0.02, sy=1.05, rx=-3), None),
            (0.92, body(sy=0.95), 'linear'), (1.04, body(y=0.01, sy=1.02), 'back'), (d, body(), None)]
    brow = (0.5, 0.22, 0.74)
    snap = [K(0, hand(-1)), K(0.1, hand(-1, up=-0.06, tilt=12))] + glued(-1, rows, brow, 0.24, 0.8, tilt=-88) + \
        [K(0.92, hand(-1, out=0.02, up=-0.04, tilt=10), 'back'), K(d, hand(-1))]
    def heels(s):  # one foot at a time, so he never leaves the floor
        a, b = (0.06, 0.15) if s > 0 else (0.15, 0.24)
        return [K(0, foot(s)), K(a, foot(s)), K((a + b) / 2, foot(s, out=-0.03, up=0.06)), K(b, foot(s, out=-0.05), 'linear'),
                K(0.84 if s > 0 else 0.92, foot(s, out=-0.05)), K(0.89 if s > 0 else 0.97, foot(s, out=-0.02, up=0.05)),
                K(0.94 if s > 0 else 1.02, foot(s), 'linear'), K(d, foot(s))]
    return clip('emote_salute', d, False, 'focused', [[0.26, 'sparkles']], {
        'body': keys(rows), 'hand.R': snap,
        'hand.L': [K(0, hand(1)), K(0.24, hand(1, out=-0.04, up=-0.08, tilt=4), 'back'), K(0.8, hand(1, out=-0.04, up=-0.08, tilt=4)), K(d, hand(1))],
        'foot.L': heels(1), 'foot.R': heels(-1),
        'cap': [K(0, cap()), K(0.24, cap(loc=(0, 0.05, 0)), 'back'), K(0.4, cap(), 'bounce'), K(d, cap())],
    }, 'Ready!: dips, snaps tall (1.08) with a heel click and his right mitten flat at his brow, holds, snaps back down.')


def thumbsup():
    """You got this: winds back, thrusts two thumbs-up at the student, pumps them twice."""
    d = 1.0
    tu = lambda s, fwd: hand(s, out=-0.18, up=0.24, fwd=fwd, tilt=SIDEWAYS)  # mitten flat and pointing out: the thumb nub sticks up
    return clip('emote_thumbsup', d, False, 'happy', [[0.26, 'sparkles']], {
        'body': [K(0, body()), K(0.1, body(sy=0.93, rx=-6)), K(0.26, body(y=0.04, sy=1.07, rx=10), 'back'), K(0.4, body(y=0.02, sy=1.02, rx=7)),
                 K(0.5, body(y=0.04, sy=1.06, rx=10), 'back'), K(0.62, body(y=0.02, sy=1.02, rx=7)), K(0.78, body(y=0.02, sy=1.03, rx=6)), K(d, body())],
        **both(lambda s: [K(0, hand(s)), K(0.1, hand(s, up=-0.06, fwd=-0.1, tilt=18)), K(0.26, tu(s, 0.5), 'back'), K(0.4, tu(s, 0.4)),
                          K(0.5, tu(s, 0.52), 'back'), K(0.62, tu(s, 0.42)), K(0.78, tu(s, 0.44)), K(d, hand(s))]),
        'cap': [K(0, cap()), K(0.26, cap(rot=(6, 0, 0)), 'back'), K(0.5, cap(rot=(5, 0, 0))), K(d, cap())],
    }, 'You got this: winds back, thrusts two thumbs-up at the student with a lean-in, two pumps.')


EMOTES = [laugh, shy, doubletake, fistpump, facepalm, nod, headshake, love, salute, thumbsup]


def emote_clips():
    return [fn() for fn in EMOTES]


def main(path=OUT):
    new = emote_clips()
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    names = {c['name'] for c in new}
    data['extra'] = [c for c in data.get('extra', []) if c['name'] not in names] + new
    extra_names = {c['name'] for c in data['extra']}
    data['clips'] = [c for c in data['clips'] if c['name'] not in extra_names] + data['extra']
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    os.replace(tmp, path)
    print('wrote %d emotes (%d clips, %d extra) to %s' % (len(new), len(data['clips']), len(data['extra']), path))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else OUT)
