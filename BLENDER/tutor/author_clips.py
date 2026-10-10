"""Authors blender/tutor/clips.json (plain Python 3, no Blender needed).

  python blender/tutor/author_clips.py

Clips are written with small pose helpers (body squash keeps his base planted,
hands/feet are mirrored by side) and the tassel's follow-through is simulated
as a damped pendulum hanging off the cap, driven by the body's motion. The
JSON it writes is the data contract build_tutor.py reads; clips added to the
JSON by hand (e.g. from the ChatGPT brief) survive a rerun if they are listed
under "extra" in clips.json.

Axes are three.js (x right, y up, z toward the camera); .L = his left = +x.
"""

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'clips.json')

RIG = {
    'bottom': 0.68,  # body centre to the flattened base (build_tutor MODEL)
    'tassel_at': (0.649, 0.855, -0.053),  # tassel bone head relative to the body centre
}
TASSEL = {
    'stiffness': 60.0,  # rad/s^2 per rad (classic TASSEL)
    'damping': 5.0,
    'gain': 0.9,  # rad/s^2 per unit/s^2 of attach-point acceleration
    'max': 70.0,  # deg
    'key_hz': 30,
    'sub': 8,  # integration substeps per key
    'warm_loops': 3,  # loops are simulated this many times before recording
    'settle': 0.25,  # one-shots blend back to rest over this tail (s)
}
FPS = 60

UPRIGHT = -26  # hand tilt that stands the mitten straight up (rest leans out 26 deg)
SIDEWAYS = 64  # hand tilt that lays it flat, pointing out
OVERHEAD = 1.32  # hand lift that clears the cap with the hands close together (out -0.45)


# ---------------------------------------------------------------------------
# Pose helpers -> channel dicts

def r3(v):
    return [round(float(c), 4) for c in v]


def body(y=0.0, x=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, sy=1.0):
    """y = lift of his base; sy squashes (<1) or stretches (>1) about the base, volume kept."""
    sxz = 1.0 / math.sqrt(sy)
    return {'loc': r3([x, y - (1.0 - sy) * RIG['bottom'], z]), 'rot': r3([rx, ry, rz]), 'scale': r3([sxz, sy, sxz])}


def hand(s, out=0.0, up=0.0, fwd=0.0, pitch=0.0, yaw=0.0, tilt=0.0):
    """s = +1 hand.L (+x), -1 hand.R. out = away from the body, tilt = top leans out (deg)."""
    return {'loc': r3([s * out, up, fwd]), 'rot': r3([pitch, s * yaw, -s * tilt])}


def foot(s, out=0.0, up=0.0, fwd=0.0, pitch=0.0, yaw=0.0):
    return {'loc': r3([s * out, up, fwd]), 'rot': r3([pitch, s * yaw, 0.0])}


def cap(loc=(0, 0, 0), rot=(0, 0, 0)):
    return {'loc': r3(loc), 'rot': r3(rot)}


def K(t, ch, ease=None):
    return [round(t, 4), ch, ease] if ease else [round(t, 4), ch]


def sides(fn):
    """Same key list for both hands/feet: fn(s) -> keys."""
    return fn(1), fn(-1)


# ---------------------------------------------------------------------------
# Tassel follow-through

def ease_fn(name):
    if name == 'linear':
        return lambda u: u
    if name == 'constant':
        return lambda u: 0.0 if u < 1 else 1.0
    if name == 'back':
        c1 = 2.2
        c3 = c1 + 1
        return lambda u: 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2
    if name in ('bounce', 'elastic'):
        return lambda u: 1 - (1 - u) ** 3
    return lambda u: u * u * (3 - 2 * u)


def sample(keys, ch, t, rest):
    """Channel value at t from a key list (approximate eases)."""
    vals = [(k[0], k[1].get(ch, rest), k[2] if len(k) > 2 else 'bezier') for k in keys]
    if t <= vals[0][0]:
        return vals[0][1]
    for (t0, v0, _), (t1, v1, e) in zip(vals, vals[1:]):
        if t <= t1:
            u = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            f = ease_fn(e)(u)
            return [a + (b - a) * f for a, b in zip(v0, v1)]
    return vals[-1][1]


def rot_xyz(rx, ry, rz, v):
    """three.js Euler XYZ (deg) applied to v: Rx @ Ry @ Rz @ v."""
    x, y, z = v
    c, s = math.cos(math.radians(rz)), math.sin(math.radians(rz))
    x, y = c * x - s * y, s * x + c * y
    c, s = math.cos(math.radians(ry)), math.sin(math.radians(ry))
    x, z = c * x + s * z, -s * x + c * z
    c, s = math.cos(math.radians(rx)), math.sin(math.radians(rx))
    y, z = c * y - s * z, s * y + c * z
    return (x, y, z)


def rot_xyz_inv(rx, ry, rz, v):
    x, y, z = v
    c, s = math.cos(math.radians(-rx)), math.sin(math.radians(-rx))
    y, z = c * y - s * z, s * y + c * z
    c, s = math.cos(math.radians(-ry)), math.sin(math.radians(-ry))
    x, z = c * x + s * z, -s * x + c * z
    c, s = math.cos(math.radians(-rz)), math.sin(math.radians(-rz))
    x, y = c * x - s * y, s * x + c * y
    return (x, y, z)


def tassel_keys(body_keys, duration, loop):
    """Damped pendulum on the cap's tassel point, driven by the body's motion."""
    def attach(t):
        tt = t % duration if loop else min(max(t, 0.0), duration)
        loc = sample(body_keys, 'loc', tt, [0, 0, 0])
        rot = sample(body_keys, 'rot', tt, [0, 0, 0])
        sc = sample(body_keys, 'scale', tt, [1, 1, 1])
        a = [c * k for c, k in zip(RIG['tassel_at'], sc)]
        w = rot_xyz(*rot, a)
        return [loc[i] + w[i] for i in range(3)], rot

    dt = 1.0 / (TASSEL['key_hz'] * TASSEL['sub'])
    h = 1.0 / 240
    th = [0.0, 0.0]  # (x swing, z swing) rad
    om = [0.0, 0.0]
    lim = math.radians(TASSEL['max'])
    per = int(round(duration * TASSEL['key_hz'])) * TASSEL['sub']  # substeps per clip length
    start_i = per * (TASSEL['warm_loops'] if loop else 0)
    out = []
    for i in range(start_i + per + 1):
        t = i * dt
        if i >= start_i and (i - start_i) % TASSEL['sub'] == 0:
            out.append([(i - start_i) * dt, math.degrees(th[0]), math.degrees(th[1])])
        p0, _ = attach(t - h)
        p1, rot = attach(t)
        p2, _ = attach(t + h)
        acc = [(p2[k] - 2 * p1[k] + p0[k]) / (h * h) for k in range(3)]
        al = rot_xyz_inv(*rot, acc)  # acceleration in the body's frame
        k_eff = TASSEL['stiffness'] * max(0.2, 1 + al[1] / 9.8)
        # Gravity keeps him hanging: counter the body's pitch and roll.
        tgt = [-math.radians(rot[0]), -math.radians(rot[2])]
        drive = [TASSEL['gain'] * al[2], -TASSEL['gain'] * al[0]]
        for j in range(2):
            acc_j = k_eff * (tgt[j] - th[j]) - TASSEL['damping'] * om[j] + drive[j]
            om[j] += acc_j * dt
            th[j] = max(-lim, min(lim, th[j] + om[j] * dt))
    if loop:  # remove drift so the last key equals the first
        d0, d1 = out[-1][1] - out[0][1], out[-1][2] - out[0][2]
        for r in out:
            f = r[0] / duration
            r[1] -= d0 * f
            r[2] -= d1 * f
        out[-1][1], out[-1][2] = out[0][1], out[0][2]
    else:  # settle to rest over the tail
        for r in out:
            f = max(0.0, (r[0] - (duration - TASSEL['settle'])) / TASSEL['settle'])
            f = f * f * (3 - 2 * f)
            r[1] *= 1 - f
            r[2] *= 1 - f
        out[-1][1] = out[-1][2] = 0.0
    out[-1][0] = duration
    return [[round(t, 4), {'rot': r3([x, 0, z])}, 'linear'] if i else [round(t, 4), {'rot': r3([x, 0, z])}]
            for i, (t, x, z) in enumerate(out)]


# ---------------------------------------------------------------------------
# Clips

def dedupe(keys):
    """Drop keys that share a time with the key after them (the later one wins)."""
    return [k for i, k in enumerate(keys) if i + 1 == len(keys) or keys[i + 1][0] > k[0] + 1e-6]


def clip(name, duration, loop, face, fx, keys, notes):
    keys = {b: dedupe(k) for b, k in keys.items() if k}
    if 'body' in keys:
        keys['tassel'] = tassel_keys(keys['body'], duration, loop)
    return {'name': name, 'loop': loop, 'duration': duration, 'face': face, 'fx': fx, 'keys': keys, 'notes': notes}


def looped(keys, duration):
    """Close a loop: append the first key (channels and arrival ease) at `duration`."""
    return keys + [K(duration, keys[0][1], keys[0][2] if len(keys[0]) > 2 else None)]


def idle():
    d = 3.0
    return clip('idle', d, True, 'neutral', [], {
        'body': looped([K(0, body()), K(0.75, body(y=0.012, sy=1.012, rz=1.2)), K(1.5, body(y=0.03, sy=1.022)),
                        K(2.25, body(y=0.012, sy=1.012, rz=-1.2))], d),
        'hand.L': looped([K(0, hand(1, up=0.02)), K(1.2, hand(1, up=0.06, out=0.015, tilt=-5)), K(2.4, hand(1, up=-0.005, tilt=3))], d),
        'hand.R': looped([K(0, hand(-1, up=0.03)), K(0.9, hand(-1, up=-0.005, tilt=3)), K(2.1, hand(-1, up=0.055, out=0.015, tilt=-5))], d),
    }, 'Breathing float: slow bob and sway, hands drift out of phase.')


def talk():
    d = 1.6
    return clip('talk', d, True, 'neutral', [], {
        'body': looped([K(0, body()), K(0.2, body(y=0.025, sy=1.03, rx=-3, ry=5)), K(0.4, body(sy=0.97, rx=2, ry=3)),
                        K(0.8, body(y=0.025, sy=1.03, rx=-3, ry=-4, rz=2)), K(1.0, body(sy=0.97, rx=2, ry=-2)),
                        K(1.2, body(y=0.01, rx=-1))], d),
        'hand.L': looped([K(0, hand(1, out=-0.12, up=0.3, fwd=0.18, pitch=-20, tilt=-10)),
                          K(0.25, hand(1, out=-0.05, up=0.42, fwd=0.22, pitch=-30, yaw=25, tilt=5), 'back'),
                          K(0.5, hand(1, out=-0.14, up=0.26, fwd=0.2, pitch=-15, tilt=-12)),
                          K(0.85, hand(1, out=-0.02, up=0.45, fwd=0.16, pitch=-25, yaw=30, tilt=10), 'back'),
                          K(1.15, hand(1, out=-0.1, up=0.3, fwd=0.2, pitch=-20, tilt=-5))], d),
        'hand.R': looped([K(0, hand(-1, up=0.05, fwd=0.06, tilt=5)),
                          K(0.6, hand(-1, out=-0.05, up=0.16, fwd=0.14, pitch=-15, yaw=20), 'back'),
                          K(1.1, hand(-1, up=0.08, fwd=0.08))], d),
    }, 'Explaining: nods on the beat, his left hand (viewer right) gestures, the other bobs.')


def think():
    d = 3.2
    # The body pitches up 10-12 deg, which lifts his chin ~0.15: the root-parented hand follows it up.
    chin = hand(-1, out=-0.69, up=0.1, fwd=0.6, pitch=-35, tilt=-50)
    tap = hand(-1, out=-0.69, up=0.13, fwd=0.6, pitch=-38, tilt=-50)
    prop = hand(1, out=-0.62, up=-0.2, fwd=0.42, pitch=-50, tilt=50)
    return clip('think', d, True, 'focused', [], {
        'body': looped([K(0, body(rx=-10, ry=-10, rz=6)), K(0.8, body(y=0.01, rx=-12, ry=-12, rz=8)),
                        K(1.6, body(rx=-9, ry=-8, rz=5, sy=1.01)), K(2.4, body(y=0.012, rx=-12, ry=-11, rz=7))], d),
        'hand.R': looped([K(0, chin), K(1.6, chin), K(1.75, tap), K(1.9, chin), K(2.05, tap), K(2.2, chin)], d),
        'hand.L': looped([K(0, prop), K(1.6, hand(1, out=-0.62, up=-0.18, fwd=0.43, pitch=-50, tilt=48))], d),
        'cap': looped([K(0, cap(rot=(0, 0, 4))), K(1.6, cap(rot=(0, 0, 7)))], d),
    }, 'Hand on chin (taps it), looks up and to the viewer left.')


def listen():
    d = 2.4
    tilt = dict(ry=6, rz=9)
    return clip('listen', d, True, 'neutral', [], {
        'body': looped([K(0, body(**tilt)), K(0.3, body(rx=5, y=-0.005, **tilt)), K(0.6, body(**tilt)),
                        K(0.9, body(rx=5, **tilt)), K(1.2, body(y=0.012, **tilt))], d),
        'hand.L': looped([K(0, hand(1, out=-0.05, up=0.5, fwd=-0.2, yaw=-50, tilt=-20)),
                          K(1.2, hand(1, out=-0.05, up=0.53, fwd=-0.18, yaw=-48, tilt=-18))], d),
        'hand.R': looped([K(0, hand(-1, up=0.04)), K(1.2, hand(-1, up=0.0, tilt=3))], d),
    }, 'Head tilted, two little nods, hand cupped up by his side.')


def point(name, s):
    """s = +1 points to the viewer's right (his left hand), -1 to the viewer's left."""
    d = 1.6
    arm = 'hand.L' if s > 0 else 'hand.R'
    other = 'hand.R' if s > 0 else 'hand.L'
    ext = lambda out: hand(s, out=out, up=0.32, fwd=-0.1, tilt=SIDEWAYS)
    turn = lambda **k: body(ry=18 * s, rz=-4 * s, rx=-2, **k)
    return clip(name, d, True, 'neutral', [], {
        'body': looped([K(0, turn()), K(0.2, body(ry=20 * s, rz=-5 * s, rx=-2, y=0.012)), K(0.5, turn()),
                        K(0.7, body(ry=20 * s, rz=-5 * s, rx=-2, y=0.012)), K(1.0, turn())], d),
        arm: looped([K(0, ext(0.28)), K(0.2, ext(0.4), 'back'), K(0.4, ext(0.28)), K(0.7, ext(0.4), 'back'), K(0.9, ext(0.28))], d),
        other: looped([K(0, hand(-s, out=-0.04, up=-0.04, fwd=0.06, tilt=10)), K(0.8, hand(-s, out=-0.04, up=-0.015, fwd=0.06, tilt=8))], d),
    }, 'Points %s (%s window) with two pokes per loop.' % ('viewer right' if s > 0 else 'viewer left', 'board' if s > 0 else 'notes'))


def walk():
    d = 0.8

    def step(s, ph):
        # Contact, mid stance, toe-off (planted, linear = constant slide), then swing.
        seq = [(0.0, foot(s, fwd=0.13, pitch=-12), None), (0.2, foot(s, fwd=0.0), 'linear'), (0.4, foot(s, fwd=-0.13, pitch=8), 'linear'),
               (0.5, foot(s, fwd=-0.08, up=0.09, pitch=20), None), (0.6, foot(s, fwd=0.03, up=0.13), None),
               (0.7, foot(s, fwd=0.12, up=0.06, pitch=-15), None)]
        shifted = sorted(((t + ph) % d, ch, e) for t, ch, e in seq)
        keys = [K(t, ch, e) for t, ch, e in shifted]
        if keys[0][0] > 0:  # wrap: the key at 0 is the phase-shifted copy of the last one before d
            keys.insert(0, K(0, shifted[-1][1]))
        return looped(keys, d)

    swing = lambda s, f: hand(s, fwd=f, up=0.03 + 0.03 * abs(f) / 0.17, pitch=-150 * f)
    return clip('walk', d, True, 'neutral', [], {
        'body': looped([K(0, body(y=-0.01, sy=0.96, rx=6)), K(0.2, body(y=0.06, sy=1.03, rx=5, rz=-4)),
                        K(0.4, body(y=-0.01, sy=0.96, rx=6)), K(0.6, body(y=0.06, sy=1.03, rx=5, rz=4))], d),
        'foot.L': step(1, 0.0),
        'foot.R': step(-1, 0.4),
        'hand.L': looped([K(0, swing(1, -0.16)), K(0.4, swing(1, 0.17))], d),
        'hand.R': looped([K(0, swing(-1, 0.17)), K(0.4, swing(-1, -0.16))], d),
    }, 'Two steps per loop along his facing (+z); the app moves and turns the root.')


SLEEP_BODY = body(y=-0.04, sy=0.93, rx=10, rz=7)
SLEEP_HAND = {1: hand(1, out=-0.08, up=-0.3, fwd=0.12, pitch=-10, tilt=40), -1: hand(-1, out=-0.08, up=-0.28, fwd=0.15, tilt=40)}
SLEEP_FOOT = {1: foot(1, out=0.03, yaw=10), -1: foot(-1, out=0.03, yaw=10)}
SLEEP_CAP = cap(loc=(0, -0.02, 0.02), rot=(14, 0, 10))


def sleep():
    d = 3.2
    return clip('sleep', d, True, 'closed', [], {
        'body': looped([K(0, SLEEP_BODY), K(1.6, body(y=-0.03, sy=0.97, rx=8, rz=6))], d),
        'hand.L': looped([K(0, SLEEP_HAND[1]), K(1.6, hand(1, out=-0.08, up=-0.27, fwd=0.12, pitch=-10, tilt=38))], d),
        'hand.R': looped([K(0, SLEEP_HAND[-1]), K(1.8, hand(-1, out=-0.08, up=-0.25, fwd=0.15, tilt=38))], d),
        'foot.L': looped([K(0, SLEEP_FOOT[1])], d),
        'foot.R': looped([K(0, SLEEP_FOOT[-1])], d),
        'cap': looped([K(0, SLEEP_CAP), K(1.6, cap(loc=(0, -0.015, 0.015), rot=(12, 0, 9)))], d),
    }, 'Slumped and breathing, cap slid over his eyes.')


def wave():
    d = 1.4
    up = lambda out, tilt: hand(1, out=out, up=0.82, fwd=0.08, tilt=tilt)
    return clip('wave', d, False, 'happy', [], {
        'body': [K(0, body()), K(0.12, body(sy=0.94, rz=3)), K(0.32, body(y=0.04, sy=1.05, rz=-6, ry=6), 'back'),
                 K(0.5, body(rz=-4, ry=6)), K(0.7, body(rz=-7, ry=6)), K(0.9, body(rz=-4, ry=6)), K(1.1, body(rz=-6, ry=4)), K(d, body())],
        'hand.L': [K(0, hand(1)), K(0.12, hand(1, up=-0.06, fwd=0.02, tilt=10)), K(0.34, up(0.1, UPRIGHT), 'back'),
                   K(0.48, up(0.14, 6)), K(0.62, up(0.04, -55)), K(0.76, up(0.14, 6)), K(0.9, up(0.04, -55)),
                   K(1.04, hand(1, out=0.12, up=0.78, fwd=0.08, tilt=0)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.3, hand(-1, up=0.06, fwd=0.05, tilt=8)), K(d, hand(-1))],
    }, 'Big friendly wave with his left hand (viewer right), little dip first.')


def hop():
    d = 0.9
    f = lambda s: [K(0, foot(s)), K(0.14, foot(s)), K(0.26, foot(s, up=0.22, pitch=25), 'linear'), K(0.42, foot(s, out=0.04, up=0.42, pitch=-10)),
                   K(0.52, foot(s, up=0.3)), K(0.6, foot(s, up=0.02, pitch=-10), 'linear'), K(0.66, foot(s), 'linear'), K(d, foot(s))]
    h = lambda s: [K(0, hand(s)), K(0.14, hand(s, up=-0.12, fwd=-0.05, tilt=20)), K(0.3, hand(s, out=0.1, up=0.62, tilt=-10), 'back'),
                   K(0.52, hand(s, out=0.12, up=0.55)), K(0.66, hand(s, out=0.06, up=0.05, tilt=25)), K(d, hand(s))]
    return clip('hop', d, False, 'happy', [[0.64, 'ring']], {
        'body': [K(0, body()), K(0.14, body(sy=0.8)), K(0.26, body(y=0.35, sy=1.14), 'linear'), K(0.42, body(y=0.52)),
                 K(0.52, body(y=0.38, sy=1.04)), K(0.6, body(y=0.0, sy=1.08), 'linear'), K(0.66, body(sy=0.8), 'linear'),
                 K(0.78, body(y=0.02, sy=1.05)), K(d, body())],
        'foot.L': f(1), 'foot.R': f(-1), 'hand.L': h(1), 'hand.R': h(-1),
    }, 'Crouch, spring up, squash on landing, rebound.')


def shrug():
    d = 1.2
    h = lambda s: [K(0, hand(s)), K(0.12, hand(s, up=-0.05)), K(0.34, hand(s, out=0.16, up=0.3, fwd=0.14, pitch=-70, tilt=50), 'back'),
                   K(0.85, hand(s, out=0.14, up=0.28, fwd=0.14, pitch=-65, tilt=45)), K(d, hand(s))]
    return clip('shrug', d, False, 'surprised', [], {
        'body': [K(0, body()), K(0.12, body(sy=0.95)), K(0.34, body(y=0.07, sy=1.06, rx=-5), 'back'),
                 K(0.6, body(y=0.05, sy=1.03, rx=-4, rz=6)), K(0.85, body(y=0.04, rx=-3, rz=-5)), K(d, body())],
        'hand.L': h(1), 'hand.R': h(-1),
        'cap': [K(0, cap()), K(0.34, cap(loc=(0, 0.04, 0), rot=(-4, 0, 0)), 'back'), K(0.85, cap(rot=(0, 0, 3))), K(d, cap())],
    }, 'Palms up and out with a little lift: gentle "hmm, try again".')


def celebrate():
    d = 2.0
    b = lambda **k: body(ry=360, **k)
    over = lambda s, lift: hand(s, out=-0.45, up=OVERHEAD + lift, fwd=0.05, tilt=-35)  # hands ride the jump
    h = lambda s: [K(0, hand(s)), K(0.15, hand(s, out=-0.02, up=-0.15, tilt=20)), K(0.32, over(s, 0.42), 'back'),
                   K(0.5, over(s, 0.56)), K(0.66, over(s, 0.36)), K(0.76, over(s, 0.0)), K(0.84, hand(s, up=0.6, tilt=-20)),
                   K(0.95, hand(s, out=0.02, up=1.0, tilt=-40), 'back'), K(1.1, hand(s, up=0.78, tilt=-30)),
                   K(1.25, hand(s, out=0.02, up=1.0, tilt=-40)), K(1.4, hand(s, up=0.78, tilt=-30)), K(1.55, hand(s, out=0.02, up=0.98, tilt=-38)), K(d, hand(s))]
    f = lambda s: [K(0, foot(s)), K(0.15, foot(s)), K(0.32, foot(s, up=0.25, pitch=20), 'linear'), K(0.5, foot(s, out=-0.18, up=0.45)),
                   K(0.66, foot(s, out=-0.12, up=0.3)), K(0.76, foot(s, up=0.02), 'linear'), K(0.82, foot(s), 'linear'), K(d, foot(s))]
    return clip('celebrate', d, False, 'happy', [[0.3, 'confetti'], [1.25, 'stars']], {
        'body': [K(0, body()), K(0.15, body(sy=0.8)), K(0.32, body(y=0.42, sy=1.15), 'linear'),
                 K(0.5, body(y=0.56, sy=1.02, ry=165), 'linear'), K(0.66, body(y=0.36, sy=1.04, ry=330), 'linear'),
                 K(0.76, b(y=0.0, sy=1.06), 'linear'), K(0.82, b(sy=0.82), 'linear'), K(0.95, b(y=0.07, sy=1.06), 'back'),
                 K(1.1, b(sy=0.95)), K(1.25, b(y=0.07, sy=1.06, rz=4)), K(1.4, b(sy=0.95)), K(1.55, b(y=0.05, sy=1.04, rz=-4)), K(d, b())],
        'hand.L': h(1), 'hand.R': h(-1), 'foot.L': f(1), 'foot.R': f(-1),
        'cap': [K(0, cap()), K(0.32, cap()), K(0.5, cap(loc=(0, 0.06, 0), rot=(0, 0, -8))), K(0.82, cap(rot=(6, 0, 4)), 'back'), K(1.2, cap()), K(d, cap())],
    }, 'Crouch, jump with a full twirl under raised hands, land, pump both fists.')


def dance_bounce():
    d = 2.4
    counts = [0.15 + 0.3 * i for i in range(8)]
    body_keys = [K(0, body())]
    for i, c in enumerate(counts):
        k = i + 1
        ry = 12 if k in (1, 2, 5, 6) else -12
        body_keys.append(K(c, body(sy=0.88, rz=6 * (-1) ** k, ry=ry), 'linear'))
        if k < 8:
            body_keys.append(K(c + 0.15, body(y=0.06, sy=1.05, ry=ry)))
    body_keys.append(K(d, body()))

    def hands(s):
        keys = [K(0, hand(s))]
        for i, c in enumerate(counts):
            if i % 2 == 0:  # open wide on 1, 3, 5, 7
                keys.append(K(c, hand(s, out=0.14, up=0.45, fwd=0.12, tilt=-10), 'back'))
            else:  # clap on 2, 4, 6, 8: hands meet in front of his chest
                keys.append(K(c, hand(s, out=-0.84, up=0.02, fwd=0.62, yaw=90, tilt=UPRIGHT), 'linear'))
                if c + 0.2 < d:
                    keys.append(K(c + 0.1, hand(s, out=-0.66, up=0.08, fwd=0.6, yaw=80, tilt=-20)))
        keys.append(K(d, hand(s)))
        return keys

    def feet(s, beats):
        keys = [K(0, foot(s))]
        for c in beats:  # step out on c, back in on c + 0.3
            keys += [K(c - 0.15, foot(s)), K(c - 0.08, foot(s, out=0.05, up=0.08)), K(c, foot(s, out=0.12), 'linear'),
                     K(c + 0.15, foot(s, out=0.06, up=0.08)), K(c + 0.3, foot(s), 'linear')]
        keys.append(K(d, foot(s)))
        return keys

    return clip('dance_bounce', d, False, 'happy', [[0.45, 'sparkles'], [1.65, 'sparkles'], [2.25, 'stars']], {
        'body': body_keys, 'hand.L': hands(1), 'hand.R': hands(-1),
        'foot.L': feet(1, [counts[0], counts[4]]), 'foot.R': feet(-1, [counts[2], counts[6]]),
    }, '8-count groove: bounce on every count, sway, step-touch, clap on 2-4-6-8.')


def dance_spin():
    d = 2.0
    h = lambda s: [K(0, hand(s)), K(0.28, hand(s, out=-0.42, fwd=0.42, tilt=-10)), K(0.45, hand(s, out=0.32, up=0.3, tilt=SIDEWAYS), 'back'),
                   K(0.88, hand(s, out=0.35, up=0.32, tilt=SIDEWAYS))]
    hL = h(1) + [K(1.12, hand(1, out=0.15, up=0.95, tilt=-20), 'back'), K(1.6, hand(1, out=0.15, up=0.92, tilt=-18)), K(d, hand(1))]
    hR = h(-1) + [K(1.12, hand(-1, out=0.3, up=0.12, fwd=0.1, tilt=55), 'back'), K(1.6, hand(-1, out=0.3, up=0.1, fwd=0.1, tilt=52)), K(d, hand(-1))]
    f = lambda s: [K(0, foot(s)), K(0.28, foot(s)), K(0.45, foot(s, out=-0.16, up=0.15)), K(0.88, foot(s, out=-0.16, up=0.1)), K(1.0, foot(s), 'linear')]
    return clip('dance_spin', d, False, 'happy', [[1.0, 'ring'], [1.15, 'sparkles']], {
        'body': [K(0, body()), K(0.28, body(sy=0.86, ry=-40, rz=5)), K(0.38, body(sy=0.9, ry=-45, rz=5)),
                 K(0.55, body(y=0.12, sy=1.1, ry=100), 'linear'), K(0.72, body(y=0.18, sy=1.12, ry=250), 'linear'),
                 K(0.88, body(y=0.1, sy=1.05, ry=375), 'linear'), K(1.0, body(sy=0.88, ry=372, rz=-6), 'linear'),
                 K(1.12, body(y=0.04, sy=1.06, ry=370, rz=-9), 'back'), K(1.6, body(y=0.03, sy=1.04, ry=368, rz=-8)), K(d, body(ry=360))],
        'hand.L': hL, 'hand.R': hR,
        'foot.L': f(1) + [K(1.12, foot(1)), K(d, foot(1))],
        'foot.R': f(-1) + [K(1.12, foot(-1, out=0.08, pitch=-15), 'back'), K(1.6, foot(-1, out=0.08, pitch=-15)), K(d, foot(-1))],
        'cap': [K(0, cap()), K(0.72, cap(rot=(0, 0, -8))), K(1.12, cap(rot=(0, 0, 6)), 'back'), K(d, cap())],
    }, 'Wind-up, a full 360 with arms out, overshoot, ta-da pose.')


def dance_robot():
    d = 2.4
    up = lambda s: hand(s, out=0.02, up=0.52, fwd=0.1, tilt=UPRIGHT)
    side = lambda s: hand(s, out=0.3, up=0.25, tilt=SIDEWAYS)
    fwd = lambda s: hand(s, out=-0.45, up=0.22, fwd=0.6, pitch=-90)
    hi = lambda s: hand(s, out=0.25, up=0.45, tilt=20)
    lo = lambda s: hand(s, out=0.25, up=0.0, tilt=50)
    limp = lambda s: hand(s, out=-0.05, up=-0.25, fwd=0.1, tilt=30)
    # (time, body, hand.L, hand.R): each pose pops in over 0.07 s and locks.
    poses = [
        (0.2, body(ry=20), up(1), side(-1)),
        (0.5, body(ry=-20), side(1), up(-1)),
        (0.8, body(rx=5), fwd(1), fwd(-1)),
        (1.05, body(rx=5, rz=-10), fwd(1), fwd(-1)),
        (1.25, body(rx=5, rz=10), fwd(1), fwd(-1)),
        (1.45, body(y=-0.04, sy=0.95), hi(1), lo(-1)),
        (1.65, body(), lo(1), hi(-1)),
        (1.85, body(sy=0.86, rx=14), limp(1), limp(-1)),
    ]
    tracks = {'body': [K(0, body())], 'hand.L': [K(0, hand(1))], 'hand.R': [K(0, hand(-1))]}
    for t, b, hl, hr in poses:
        for name, ch in (('body', b), ('hand.L', hl), ('hand.R', hr)):
            tracks[name].append(K(t, tracks[name][-1][1]))
            tracks[name].append(K(t + 0.07, ch, 'back'))
    tracks['body'].append(K(2.08, tracks['body'][-1][1]))
    tracks['body'].append(K(d, body(), 'elastic'))
    tracks['hand.L'] += [K(2.08, limp(1)), K(d, hand(1), 'elastic')]
    tracks['hand.R'] += [K(2.08, limp(-1)), K(d, hand(-1), 'elastic')]

    def stomps(s, times):
        keys = [K(0, foot(s))]
        for t in times:
            keys += [K(t, foot(s)), K(t + 0.04, foot(s, up=0.07), 'linear'), K(t + 0.1, foot(s), 'linear')]
        return keys + [K(d, foot(s))]

    tracks['foot.L'] = stomps(1, [0.2, 0.8, 1.45])
    tracks['foot.R'] = stomps(-1, [0.5, 1.25, 1.65])
    return clip('dance_robot', d, False, 'focused', [[1.2, 'sparkles']], tracks,
                'Pop-and-lock: arms snap between poses, head ticks, power-down slump, elastic reboot.')


def giggle():
    d = 1.4
    body_keys = [K(0, body())]
    t = 0.1
    i = 0
    while t < 1.12:
        body_keys.append(K(t, body(y=0.02 * (i % 2), sy=1.04 if i % 2 else 0.95, rx=-6, rz=7 * (-1) ** i)))
        t += 0.1
        i += 1
    body_keys.append(K(d, body()))
    cover = lambda s, up: hand(s, out=-0.74, up=up, fwd=0.62, pitch=-20, tilt=-30)
    h = lambda s: [K(0, hand(s)), K(0.12, cover(s, 0.06), 'back'), K(0.3, cover(s, 0.09)), K(0.5, cover(s, 0.05)),
                   K(0.7, cover(s, 0.09)), K(0.9, cover(s, 0.05)), K(1.05, cover(s, 0.07)), K(d, hand(s))]
    f = lambda s, t0: [K(0, foot(s)), K(t0, foot(s)), K(t0 + 0.08, foot(s, up=0.07, pitch=-20)), K(t0 + 0.16, foot(s)), K(d, foot(s))]
    return clip('giggle', d, False, 'happy', [[0.15, 'hearts']], {
        'body': body_keys, 'hand.L': h(1), 'hand.R': h(-1), 'foot.L': f(1, 0.3), 'foot.R': f(-1, 0.6),
    }, 'Tickled: fast wiggle, hands over his mouth, little kicks.')


def highfive():
    d = 1.2
    return clip('highfive', d, False, 'happy', [[0.42, 'stars']], {
        'body': [K(0, body()), K(0.18, body(sy=0.95, ry=-8, rz=4)), K(0.4, body(y=0.04, sy=1.06, ry=10, rx=8, rz=-5), 'back'),
                 K(0.46, body(sy=0.96, ry=8, rx=6)), K(0.75, body(y=0.03, sy=1.03, ry=8, rx=4)), K(d, body())],
        'hand.L': [K(0, hand(1)), K(0.18, hand(1, out=0.05, up=0.35, fwd=-0.12, pitch=15, tilt=-15)),
                   K(0.4, hand(1, out=-0.25, up=0.65, fwd=0.9, pitch=-35, tilt=UPRIGHT), 'linear'),
                   K(0.46, hand(1, out=-0.24, up=0.62, fwd=0.8, pitch=-25, tilt=UPRIGHT)),
                   K(0.75, hand(1, out=-0.22, up=0.6, fwd=0.82, pitch=-30, tilt=UPRIGHT)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.4, hand(-1, out=0.08, up=0.08, tilt=20)), K(d, hand(-1))],
    }, 'Wind back and slap a high five toward the camera (his left hand, viewer right).')


def catch():
    d = 1.4
    h = lambda s: [K(0, hand(s)), K(0.2, hand(s, out=-0.5, up=0.38, fwd=0.55, pitch=-40, tilt=-10), 'back'),
                   K(0.45, hand(s, out=-0.6, up=0.22, fwd=0.45, pitch=-55), 'linear'), K(0.55, hand(s, out=-0.62, up=0.12, fwd=0.4, pitch=-55)),
                   K(0.85, hand(s, out=-0.58, up=0.75, fwd=0.3, pitch=-30, tilt=-20), 'back'), K(1.1, hand(s, out=-0.58, up=0.7, fwd=0.3, pitch=-30, tilt=-20)),
                   K(d, hand(s))]
    return clip('catch', d, False, 'surprised', [[0.45, 'ring']], {
        'body': [K(0, body()), K(0.2, body(y=0.02, rx=-5)), K(0.45, body(sy=0.88, rx=8), 'linear'), K(0.6, body(sy=1.04)),
                 K(0.85, body(y=0.06, sy=1.05, rx=-6), 'back'), K(1.1, body(y=0.04, rx=-4)), K(d, body())],
        'hand.L': h(1), 'hand.R': h(-1),
    }, 'Hands ready, catch at 0.45 s (absorb), then hold it up proudly.')


def yum():
    d = 1.6
    rub = lambda s, out, up: hand(s, out=out, up=up, fwd=0.53, pitch=-30, tilt=-10)
    body_keys = [K(0, body()), K(0.22, body(rx=-6))]
    for i, t in enumerate([0.3, 0.38, 0.46, 0.54, 0.62]):
        body_keys.append(K(t, body(sy=0.95 if i % 2 == 0 else 1.03, rx=-2 if i % 2 == 0 else -5)))
    body_keys += [K(0.8, body(y=0.02, rz=5)), K(0.95, body(rz=-5)), K(1.1, body(y=0.02, rz=5)), K(1.25, body(rz=-4)), K(d, body())]
    return clip('yum', d, False, 'happy', [[0.55, 'hearts']], {
        'body': body_keys,
        'hand.L': [K(0, hand(1)), K(0.22, hand(1, out=-0.72, up=0.12, fwd=0.6, pitch=-20, tilt=-40), 'back'),
                   K(0.45, hand(1, out=-0.6, up=0.05, fwd=0.55, pitch=-20, tilt=-30)), K(0.8, rub(1, -0.55, -0.22)),
                   K(0.95, rub(1, -0.5, -0.18)), K(1.1, rub(1, -0.6, -0.25)), K(1.25, rub(1, -0.5, -0.2)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.45, hand(-1, up=0.04)), K(0.8, rub(-1, -0.5, -0.25)), K(0.95, rub(-1, -0.6, -0.2)),
                   K(1.1, rub(-1, -0.5, -0.27)), K(1.25, rub(-1, -0.58, -0.2)), K(d, hand(-1))],
    }, 'Snack to the mouth, chomp-chomp squash, happy belly rub.')


def levelup():
    d = 2.6
    b = lambda **k: body(ry=360, **k)
    over = lambda s, lift: hand(s, out=-0.45, up=OVERHEAD + lift, tilt=-35)  # hands ride the jump
    h = lambda s: [K(0, hand(s)), K(0.22, hand(s, out=-0.1, up=-0.2, fwd=0.1, tilt=25)), K(0.4, over(s, 0.6), 'back'),
                   K(0.58, over(s, 0.82)), K(0.78, over(s, 0.84)), K(0.92, over(s, 0.5)), K(1.04, over(s, 0.0)),
                   K(1.1, hand(s, out=0.05, up=0.55, tilt=-10)),
                   K(1.26, hand(s, out=0.12, up=0.95, tilt=-35), 'back'), K(1.42, hand(s, out=0.12, up=0.86, tilt=-30)),
                   K(1.6, hand(s, out=0.12, up=1.0, tilt=-38)), K(1.78, hand(s, out=0.12, up=0.85, tilt=-30)),
                   K(1.96, hand(s, out=0.12, up=1.0, tilt=-38)), K(2.25, hand(s, out=0.05, up=0.3)), K(d, hand(s))]
    f = lambda s, stomp: [K(0, foot(s)), K(0.22, foot(s)), K(0.4, foot(s, up=0.3, pitch=25), 'linear'), K(0.58, foot(s, out=-0.16, up=0.7)),
                          K(0.78, foot(s, out=-0.16, up=0.72)), K(0.92, foot(s, out=-0.1, up=0.4)), K(1.04, foot(s, up=0.02), 'linear'),
                          K(1.1, foot(s), 'linear'), K(stomp - 0.1, foot(s)), K(stomp, foot(s, up=0.08, pitch=-15)),
                          K(stomp + 0.1, foot(s), 'linear'), K(d, foot(s))]
    return clip('levelup', d, False, 'happy', [[0.15, 'ring'], [0.6, 'levelup'], [0.75, 'confetti'], [1.5, 'stars']], {
        'body': [K(0, body()), K(0.22, body(sy=0.74)), K(0.4, body(y=0.6, sy=1.2), 'linear'), K(0.58, body(y=0.82, sy=1.05, ry=150), 'linear'),
                 K(0.78, body(y=0.84, sy=1.02, ry=300)), K(0.92, b(y=0.5, sy=1.04)), K(1.04, b(y=0.0, sy=1.08), 'linear'),
                 K(1.1, b(sy=0.76), 'linear'), K(1.26, b(y=0.06, sy=1.08), 'back'), K(1.42, b(y=0.03, sy=1.03)),
                 K(1.6, b(y=0.07, sy=1.06, rz=4)), K(1.78, b(y=0.03, rz=-4)), K(1.96, b(y=0.07, sy=1.06, rz=3)),
                 K(2.25, b()), K(d, b())],
        'hand.L': h(1), 'hand.R': h(-1), 'foot.L': f(1, 1.6), 'foot.R': f(-1, 1.96),
        'cap': [K(0, cap()), K(0.4, cap()), K(0.58, cap(loc=(0, 0.22, 0), rot=(0, 60, 14)), 'back'),
                K(0.78, cap(loc=(0, 0.3, 0), rot=(0, 170, 8))), K(0.95, cap(loc=(0, 0.18, 0), rot=(0, 280, -6))),
                K(1.12, cap(rot=(0, 360, 0)), 'bounce'), K(d, cap(rot=(0, 360, 0)))],
    }, 'Deep crouch, rocket jump with a spin, cap pops off and twirls back on, power pose, fist pumps, stomps.')


def wake():
    d = 1.6
    h = lambda s: [K(0, SLEEP_HAND[s]), K(0.18, SLEEP_HAND[s]), K(0.34, hand(s, out=0.28, up=0.35, fwd=0.1, tilt=40), 'back'),
                   K(0.55, hand(s, out=-0.4, up=OVERHEAD + 0.03, tilt=-40)), K(0.85, hand(s, out=-0.36, up=OVERHEAD + 0.06, tilt=-45)),
                   K(1.1, hand(s, out=0.05, up=0.15, tilt=10)), K(d, hand(s))]
    f = lambda s: [K(0, SLEEP_FOOT[s]), K(0.18, SLEEP_FOOT[s]), K(0.34, foot(s, up=0.18, pitch=15), 'back'), K(0.5, foot(s), 'linear'), K(d, foot(s))]
    return clip('wake', d, False, 'surprised', [[0.3, 'sparkles']], {
        'body': [K(0, SLEEP_BODY), K(0.18, body(y=-0.05, sy=0.9, rx=12, rz=7)), K(0.34, body(y=0.2, sy=1.14, rx=-6), 'back'),
                 K(0.5, body(y=0.03, sy=1.12, rx=-8)), K(0.85, body(y=0.04, sy=1.13, rx=-9, rz=3)), K(1.0, body(sy=0.95, rz=-6)),
                 K(1.12, body(sy=1.02, rz=6)), K(1.24, body(rz=-4)), K(d, body())],
        'hand.L': h(1), 'hand.R': h(-1), 'foot.L': f(1), 'foot.R': f(-1),
        'cap': [K(0, SLEEP_CAP), K(0.18, SLEEP_CAP), K(0.34, cap(loc=(0, 0.12, 0), rot=(-6, 0, -4)), 'back'), K(0.6, cap(rot=(0, 0, 3)), 'bounce'), K(d, cap())],
    }, 'Starts from the sleep pose: startle hop, big stretch, shake it off.')


DOC = [
    'Authored by author_clips.py (rerun it after editing the helpers); build_tutor.py reads this file.',
    'keys[bone] = [[t, {loc, rot, scale}, ease?], ...] in three.js axes; .L = his left = +x.',
    'loc = offset from the bone rest position (model units, body radius 0.8); rot = degrees (Euler XYZ) added to rest; scale = multiplier.',
    'A channel used by any key of a bone is keyed at every key of that bone; a key that omits it is at rest there.',
    'ease = how motion ARRIVES at the key: linear | bezier | constant | back | bounce | elastic.',
    'Rotations between consecutive keys must differ by < 180 deg per axis (split big spins).',
    'Loops: first key == last key. Never translate root in x/z.',
]


def main():
    clips = [idle(), talk(), think(), listen(), point('point_left', -1), point('point_right', 1), walk(), sleep(),
             wave(), hop(), shrug(), celebrate(), dance_bounce(), dance_spin(), dance_robot(), giggle(), highfive(),
             catch(), yum(), levelup(), wake()]
    extra = []
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            extra = json.load(f).get('extra', [])
    names = {c['name'] for c in clips}
    clips += [c for c in extra if c['name'] not in names]
    data = {'_doc': DOC, 'fps': FPS, 'clips': clips, 'extra': extra}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    print('wrote %d clips to %s (%.0f KB)' % (len(clips), OUT, os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
