"""Tumble variants, one clip per knock cause (plain Python 3, no Blender needed).

  python blender/tutor/author_tumbles.py

Writes the clips under "extra" (and into "clips") in clips.json, like
author_extra.py, so an author_clips.py rerun keeps them. Causes are
src/state/tumbles.ts TumbleCause:

  boss    -> tumble_knockback  hit in the chest, flies back onto his back, legs kick, rocks back up
  thrown  -> tumble_spin       cartwheel hop toward his right, lands wobbling, windmills
  dropped -> tumble_splat      pancake splat, coin-wobble flat on the floor, pops up, jelly settle
  bonk    -> tumble_bonk       head snaps back (stars), rubs his head through dizzy circles, legs give, plops on his bottom
  shaken  -> tumble_dizzy      drunk circles, lurches to his right, flops onto his side, twitches
  flicked -> tumble_faceplant  front flip toward the camera into a faceplant, feet flutter

The two that fall sideways also come mirrored (tumble_spin_l, tumble_dizzy_l)
for TumbleEvent.dir = -1 (falls to his left).

Hand-off: every clip starts at rest and ENDS exactly on the first frame of the
'tumble' loop (tucked ball, a small hop off the floor), so 'recover' blends
from its end the way it blends from 'tumble' today. 'tumble' and 'recover'
are read here, never changed.

How it works: a clip is a set of tracks over a few character parameters
(whole-body turn about his middle, squash, travel, air, limb poses in his own
frame). assemble() turns one sample into bone channels: hands and feet hang off
the root, not the body, so whole-body turns are applied to them rigidly, and
every sample is grounded (his lowest point, from a coarse copy of the meshes,
sits on the floor plus the authored air). The last stretch blends into the
tumble pose. Channels are sampled at SAMPLE_HZ and thinned; the tassel is
simulated as in author_clips, against true gravity, and lies on the floor rather than
dipping through it.

Axes are three.js (x right, y up, z toward the camera); .L = his left = +x.
His right (TumbleEvent.dir = 1) is -x, and a turn with +rz tips his top that way.
"""

import json
import math
import os

from author_clips import OUT, TASSEL, cap, foot, hand, r3
from author_extra import tumble as _tumble_loop

SAMPLE_HZ = 60  # channel samples per second before thinning (= the export rate: fast turns stay exact)
KEEP = {'loc': 0.003, 'rot': 0.5, 'scale': 0.003, 'gap': 0.2, 'turn': 12.0}  # thinning: max error, max key gap (s), max turn per segment (deg)
HOP_EASE = 'out3'  # the closing hop into the tumble pose decelerates to its apex

# Rest rig, mirrored from build_tutor.py (MODEL, CAP, HAND, FOOT, rig_points()).
# The proof build asserts these against the built armature.
RIG = {
    'body_y': 1.0, 'body_r': 0.8, 'flare': 0.1, 'flat_y': -0.58, 'flat_k': 0.45, 'bottom': 0.68,
    'hand': (0.95, -0.28, 0.28), 'hand_tilt': (-0.25, 0.0, 0.45), 'hand_r': 0.15, 'hand_len': 0.06, 'hand_flat': 0.74,
    'thumb': ((-0.135, -0.04, 0.05), 0.07),
    'foot': (0.27, 0.085, 0.08), 'toe_out': 0.2, 'foot_r': 0.11, 'foot_len': 0.1, 'foot_scale': (1.05, 0.72, 1.0),
    'cap_offset': (0.02, -0.02, 0.0), 'cap_tilt': (-0.06, 0.0, -0.12), 'cap_pivot_y': 0.66, 'tassel_at': (0.52, 0.945, 0.0),
    'skull': (0.47, 0.52, 0.24, 0.77), 'board': (0.55, 0.025, 0.91, math.pi / 4), 'button_y': 0.97, 'emblem': (0.0, 0.77, 0.5),
    'tassel_len': 0.43, 'tassel_r': 0.056,  # tassel head to the bottom of its bulb, bulb radius (CAP string/knot/bulb)
}
ROOT_KIDS = ('body', 'hand.L', 'hand.R', 'foot.L', 'foot.R')
OUT_BONES = ROOT_KIDS + ('cap',)


# ---------------------------------------------------------------------------
# 3x3 maths (three axes; Euler 'XYZ' = Rx @ Ry @ Rz, degrees at the edges)

I3 = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
ONE = (1.0, 1.0, 1.0)


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, b):
    return (a[0] * b[0], a[1] * b[1], a[2] * b[2])


def mm(a, b):
    return tuple(tuple(a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] for j in range(3)) for i in range(3))


def mv(m, v):
    return (m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2])


def mt(m):
    return tuple(tuple(m[j][i] for j in range(3)) for i in range(3))


def euler_m(e, rad=False):
    x, y, z = e if rad else (math.radians(a) for a in e)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rx = ((1, 0, 0), (0, cx, -sx), (0, sx, cx))
    ry = ((cy, 0, sy), (0, 1, 0), (-sy, 0, cy))
    rz = ((cz, -sz, 0), (sz, cz, 0), (0, 0, 1))
    return mm(mm(rx, ry), rz)


def m_euler(m, near=None):
    """Degrees; with `near`, the equivalent Euler closest to it (keeps keys continuous)."""
    s = max(-1.0, min(1.0, m[0][2]))
    y = math.asin(s)
    if abs(s) < 0.9999999:
        x, z = math.atan2(-m[1][2], m[2][2]), math.atan2(-m[0][1], m[0][0])
    else:
        x, z = math.atan2(m[2][1], m[1][1]), 0.0
    sols = [(x, y, z), (x + math.pi, math.pi - y, z + math.pi)]
    if near is None:
        return tuple(math.degrees(a) for a in sols[0])
    n = [math.radians(a) for a in near]
    fit = [tuple(a + 2 * math.pi * round((b - a) / (2 * math.pi)) for a, b in zip(sol, n)) for sol in sols]
    best = min(fit, key=lambda c: sum(abs(a - b) for a, b in zip(c, n)))
    return tuple(math.degrees(a) for a in best)


def m_quat(m):
    tr = m[0][0] + m[1][1] + m[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        return (0.25 * s, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s)
    if m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2
        return ((m[2][1] - m[1][2]) / s, 0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s)
    if m[1][1] > m[2][2]:
        s = math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2
        return ((m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s)
    s = math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2
    return ((m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s)


def quat_m(q):
    w, x, y, z = q
    return ((1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
            (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
            (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)))


def slerp_m(a, b, u):
    qa, qb = m_quat(a), m_quat(b)
    d = sum(p * q for p, q in zip(qa, qb))
    if d < 0:
        qb, d = tuple(-c for c in qb), -d
    if d > 0.9995:
        q = tuple(p + (q - p) * u for p, q in zip(qa, qb))
    else:
        th = math.acos(d)
        wa, wb = math.sin((1 - u) * th) / math.sin(th), math.sin(u * th) / math.sin(th)
        q = tuple(wa * p + wb * q for p, q in zip(qa, qb))
    n = math.sqrt(sum(c * c for c in q))
    return quat_m(tuple(c / n for c in q))


# ---------------------------------------------------------------------------
# Rest heads and a coarse copy of the meshes (bone-local offsets) for grounding

def _cap_frame():
    by = RIG['body_y']
    o = add((0.0, by, 0.0), RIG['cap_offset'])
    return o, euler_m(RIG['cap_tilt'], rad=True)


CAP_O, CAP_R = _cap_frame()
HEADS = {
    'body': (0.0, RIG['body_y'], 0.0),
    'hand.L': (RIG['hand'][0], RIG['body_y'] + RIG['hand'][1], RIG['hand'][2]),
    'hand.R': (-RIG['hand'][0], RIG['body_y'] + RIG['hand'][1], RIG['hand'][2]),
    'foot.L': RIG['foot'],
    'foot.R': (-RIG['foot'][0], RIG['foot'][1], RIG['foot'][2]),
    'cap': add(CAP_O, mv(CAP_R, (0.0, RIG['cap_pivot_y'], 0.0))),
}
TASSEL_HEAD = add(CAP_O, mv(CAP_R, RIG['tassel_at']))
PIVOT = HEADS['body']  # whole-body turns happen about his middle


def _ring(nu, nv, r):
    for j in range(nv + 1):
        th = math.pi * j / nv
        y, rr = r * math.cos(th), r * math.sin(th)
        for i in range(nu if 0 < j < nv else 1):
            ph = 2 * math.pi * i / nu
            yield rr * math.cos(ph), y, rr * math.sin(ph)


def _body_shape():
    out = []
    r = RIG['body_r']
    for x, y, z in _ring(40, 24, r):
        if y < 0:
            k = 1 + RIG['flare'] * (-y / r)
            x, z = x * k, z * k
        if y < RIG['flat_y']:
            y = RIG['flat_y'] + (y - RIG['flat_y']) * RIG['flat_k']
        out.append((x, y, z))
    return out


def _capsule(r, half):
    pts = []
    for x, y, z in _ring(12, 8, r):
        if abs(y) < 1e-9:
            pts += [(x, half, z), (x, -half, z)]
        else:
            pts.append((x, y + math.copysign(half, y), z))
    return pts


def _hand_shape(s):
    tilt = euler_m((RIG['hand_tilt'][0], RIG['hand_tilt'][1], -s * RIG['hand_tilt'][2]), rad=True)
    pts = [(x, y, z * RIG['hand_flat']) for x, y, z in _capsule(RIG['hand_r'], RIG['hand_len'] / 2)]
    (tx, ty, tz), tr = RIG['thumb']
    pts += [add((s * tx, ty, tz), d) for d in ((tr, 0, 0), (-tr, 0, 0), (0, tr, 0), (0, -tr, 0), (0, 0, tr), (0, 0, -tr))]
    return [mv(tilt, p) for p in pts]


def _foot_shape(s):
    sx, sy, sz = RIG['foot_scale']
    yaw = euler_m((0.0, s * RIG['toe_out'], 0.0), rad=True)
    return [mv(yaw, (x * sx, -z * sy, y * sz)) for x, y, z in _capsule(RIG['foot_r'], RIG['foot_len'] / 2)]  # long axis y -> z


def _cap_shape():
    rt, rb, h, yc = RIG['skull']
    pts = []
    for i in range(12):
        a = 2 * math.pi * i / 12
        pts += [(rb * math.cos(a), yc - h / 2, rb * math.sin(a)), (rt * math.cos(a), yc + h / 2, rt * math.sin(a))]
    half, thick, by, yaw = RIG['board']
    c, s = math.cos(yaw), math.sin(yaw)
    for dx in (-half, half):
        for dz in (-half, half):
            for dy in (-thick, thick):
                pts.append((dx * c + dz * s, by + dy, -dx * s + dz * c))
    pts += [(0.0, RIG['button_y'], 0.0), RIG['emblem']]
    return [sub(add(CAP_O, mv(CAP_R, p)), HEADS['cap']) for p in pts]  # relative to the cap head


SHAPES = {'body': _body_shape(), 'cap': _cap_shape(), 'hand.L': _hand_shape(1), 'hand.R': _hand_shape(-1),
          'foot.L': _foot_shape(1), 'foot.R': _foot_shape(-1)}


def world_points(ch):
    """(part, world point) for the coarse meshes of a posed sample."""
    b_loc, b_R, b_S = ch['body']
    bh = HEADS['body']
    base = add(bh, b_loc)

    def on_body(v):
        return add(base, mv(b_R, mul(b_S, v)))

    for v in SHAPES['body']:
        yield 'body', on_body(v)
    c_loc, c_R, _ = ch['cap']
    c_rel = add(sub(HEADS['cap'], bh), c_loc)
    for v in SHAPES['cap']:
        yield 'cap', on_body(add(c_rel, mv(c_R, v)))
    for name in ROOT_KIDS[1:]:
        loc, R, _ = ch[name]
        head = add(HEADS[name], loc)
        for v in SHAPES[name]:
            yield name, add(head, mv(R, v))


def lowest(ch):
    return min(p[1] for _, p in world_points(ch))


# ---------------------------------------------------------------------------
# Character parameters -> bone channels

def squash(q):
    """(qx, qy, qz) volume-kept squash factors along his own axes -> bone scale."""
    qx, qy, qz = q
    return (qx / math.sqrt(qy * qz), qy / math.sqrt(qx * qz), qz / math.sqrt(qx * qy))


def mirror(ch):
    """Mirror across x (his left <-> right): channels swap sides."""
    M = ((-1, 0, 0), (0, 1, 0), (0, 0, 1))
    swap = {'hand.L': 'hand.R', 'hand.R': 'hand.L', 'foot.L': 'foot.R', 'foot.R': 'foot.L'}
    return {swap.get(n, n): [(-l[0], l[1], l[2]), mm(mm(M, R), M), S] for n, (l, R, S) in ch.items()}


HN, FN, CN = (0.0,) * 6, (0.0,) * 5, (0.0,) * 6  # rest hand / foot / cap tuples


def params(rot=(0, 0, 0), q=ONE, x=0.0, z=0.0, h=0.0, hL=HN, hR=None, fL=FN, fR=None, cp=CN):
    """rot = whole-body Euler (deg) about his middle; q = squash; x, z = travel; h = air above grounded;
    hL/hR = hand() args (out, up, fwd, pitch, yaw, tilt); fL/fR = foot() args (out, up, fwd, pitch, yaw);
    cp = cap (loc xyz, rot xyz). Limbs are in his own frame, before the whole-body turn."""
    return {'rot': rot, 'q': q, 'x': x, 'z': z, 'h': h, 'hL': hL, 'hR': hR or hL, 'fL': fL, 'fR': fR or fL, 'cp': cp}


def assemble(p, flip=False):
    sc = squash(p['q'])
    R = euler_m(p['rot'])
    move = (p['x'], 0.0, p['z'])

    def place(name, loc, Rl, S):
        rel = sub(add(HEADS[name], loc), PIVOT)
        head = add(add(PIVOT, mv(R, rel)), move)
        return [sub(head, HEADS[name]), mm(R, Rl), S]

    ch = {'body': place('body', (0.0, -(1.0 - sc[1]) * RIG['bottom'], 0.0), I3, sc)}  # squash keeps his base where it was
    for s, n, k in ((1, 'hand.L', 'hL'), (-1, 'hand.R', 'hR')):
        c = hand(s, *p[k])
        ch[n] = place(n, c['loc'], euler_m(c['rot']), ONE)
    for s, n, k in ((1, 'foot.L', 'fL'), (-1, 'foot.R', 'fR')):
        c = foot(s, *p[k])
        ch[n] = place(n, c['loc'], euler_m(c['rot']), ONE)
    c = cap(loc=p['cp'][:3], rot=p['cp'][3:])
    ch['cap'] = [tuple(c['loc']), euler_m(c['rot']), ONE]
    if flip:
        ch = mirror(ch)
    lift = LOWEST_REST - lowest(ch) + p['h']  # grounded: lowest point on the floor, plus air
    for n in ROOT_KIDS:
        l = ch[n][0]
        ch[n][0] = (l[0], l[1] + lift, l[2])
    return ch


def _rest():
    ch = {n: [(0.0, 0.0, 0.0), I3, ONE] for n in OUT_BONES}
    return ch


LOWEST_REST = lowest(_rest())


def _end_pose():
    """First frame of the 'tumble' loop: where every variant lands."""
    keys = _tumble_loop()['keys']
    ch = {}
    for n in OUT_BONES:
        k = keys[n][0][1]
        ch[n] = [tuple(k.get('loc', (0, 0, 0))), euler_m(k.get('rot', (0, 0, 0))), tuple(k.get('scale', ONE))]
    euler = {n: tuple(keys[n][0][1].get('rot', (0, 0, 0))) for n in OUT_BONES}
    return ch, euler, tuple(keys['tassel'][0][1]['rot'])


END, END_EULER, END_TASSEL = _end_pose()


def blend(a, b, u):
    return {n: [tuple(p + (q - p) * u for p, q in zip(a[n][0], b[n][0])), slerp_m(a[n][1], b[n][1], u),
                tuple(p + (q - p) * u for p, q in zip(a[n][2], b[n][2]))] for n in a}


# ---------------------------------------------------------------------------
# Tracks

EASE = {
    'lin': lambda u: u,
    'smooth': lambda u: u * u * (3 - 2 * u),
    'in': lambda u: u * u,
    'out': lambda u: 1 - (1 - u) ** 2,
    'in3': lambda u: u ** 3,
    'out3': lambda u: 1 - (1 - u) ** 3,
    'back': lambda u: 1 + 3.2 * (u - 1) ** 3 + 2.2 * (u - 1) ** 2,  # overshoots ~10% then settles
}


class Track:
    """(t, value, ease?) keys; ease is how motion ARRIVES at the key (default smooth). Values: number or tuple."""

    def __init__(self, *keys):
        self.keys = [(k[0], k[1], k[2] if len(k) > 2 else 'smooth') for k in keys]

    def __call__(self, t):
        ks = self.keys
        if t <= ks[0][0]:
            return ks[0][1]
        for (t0, v0, _), (t1, v1, e) in zip(ks, ks[1:]):
            if t <= t1:
                f = EASE[e]((t - t0) / (t1 - t0))
                if isinstance(v0, tuple):
                    return tuple(a + (b - a) * f for a, b in zip(v0, v1))
                return v0 + (v1 - v0) * f
        return ks[-1][1]


def seg(t, a, b):
    return min(1.0, max(0.0, (t - a) / (b - a)))


def hump(u):
    return math.sin(math.pi * min(1.0, max(0.0, u)))


# ---------------------------------------------------------------------------
# Clip assembly: sample, thin, tassel

class Tumble:
    def __init__(self, name, duration, hop_at, face, fx, fn, notes, flip=False):
        self.name, self.duration, self.hop_at, self.face, self.fx, self.fn, self.notes, self.flip = (
            name, duration, hop_at, face, fx, fn, notes, flip)
        self._hop = assemble(fn(hop_at), flip)
        self._cache = {}

    def pose(self, t):
        """Bone channels {bone: [loc, R, scale]} at t (seconds)."""
        t = min(max(t, 0.0), self.duration)
        key = round(t, 6)
        if key not in self._cache:
            if t <= self.hop_at:
                self._cache[key] = assemble(self.fn(t), self.flip)
            else:
                self._cache[key] = blend(self._hop, END, EASE[HOP_EASE](seg(t, self.hop_at, self.duration)))
        return self._cache[key]

    def bone_keys(self):
        d = self.duration
        n = int(round(d * SAMPLE_HZ))
        times = [i / SAMPLE_HZ for i in range(n)] + [d]
        out = {}
        for b in OUT_BONES:
            rows, prev = [], None
            for t in times:
                loc, R, S = self.pose(t)[b]
                e = m_euler(R, prev)
                prev = e
                rows.append((t, loc, e, S))
            # The last key is the tumble pose itself: same numbers, up to whole turns.
            t, loc, e, S = rows[-1]
            e = tuple(f + 360.0 * round((g - f) / 360.0) for f, g in zip(END_EULER[b], e))
            rows[-1] = (t, END[b][0], e, END[b][2])
            keys = []
            for i in thin(rows):
                t, loc, e, S = rows[i]
                ch = {'loc': r3(loc), 'rot': r3(e)}
                if b == 'body':
                    ch['scale'] = r3(S)
                keys.append([round(t, 4), ch, 'linear'] if keys else [round(t, 4), ch])
            out[b] = keys
        return out

    def tassel_keys(self):
        """Damped pendulum (author_clips TASSEL constants) under true gravity; settles onto the tumble pose's tassel."""
        d = self.duration
        hz = SAMPLE_HZ  # keyed at the export rate (then thinned) so it cannot cut through the floor between keys
        sub_ = max(1, TASSEL['key_hz'] * TASSEL['sub'] // hz)  # same sim step as author_clips
        dt, h = 1.0 / (hz * sub_), 1.0 / 240
        lim = math.radians(TASSEL['max'])

        def frame(t):
            ch = self.pose(t)
            b_loc, b_R, b_S = ch['body']
            c_loc, c_R, _ = ch['cap']
            bh = HEADS['body']
            rel = add(add(sub(HEADS['cap'], bh), c_loc), mv(c_R, sub(TASSEL_HEAD, HEADS['cap'])))
            return add(add(bh, b_loc), mv(b_R, mul(b_S, rel))), mm(b_R, c_R)

        th, om, rows = [0.0, 0.0], [0.0, 0.0], []
        for i in range(int(round(d * hz)) * sub_ + 1):
            t = i * dt
            if i % sub_ == 0:
                rows.append([t, math.degrees(th[0]), math.degrees(th[1])])
            p0, _ = frame(t - h)
            p1, R = frame(t)
            p2, _ = frame(t + h)
            acc = [(p2[k] - 2 * p1[k] + p0[k]) / (h * h) for k in range(3)]
            Rt = mt(R)
            al = mv(Rt, acc)  # attach-point acceleration in the cap's frame
            g = mv(Rt, (0.0, -1.0, 0.0))  # gravity in the cap's frame: where he hangs
            tgt = [max(-lim, min(lim, math.atan2(-g[2], -g[1]))), max(-lim, min(lim, math.asin(max(-1.0, min(1.0, g[0])))))]
            k_eff = TASSEL['stiffness'] * max(0.2, 1 + al[1] / 9.8)
            drive = [TASSEL['gain'] * al[2], -TASSEL['gain'] * al[0]]
            for j in range(2):
                om[j] += (k_eff * (tgt[j] - th[j]) - TASSEL['damping'] * om[j] + drive[j]) * dt
                th[j] += om[j] * dt
                if abs(th[j]) > lim:
                    th[j], om[j] = math.copysign(lim, th[j]), 0.0
            on = on_floor(p1, R, th)
            if on != th:  # it would dip under the floor: it lies there instead
                th, om = on, [0.0, 0.0]
        ex, _, ez = END_TASSEL
        for r in rows:
            f = max(0.0, (r[0] - (d - TASSEL['settle'])) / TASSEL['settle'])
            f = f * f * (3 - 2 * f)
            r[1], r[2] = r[1] * (1 - f) + ex * f, r[2] * (1 - f) + ez * f
            p1, R = frame(r[0])
            r[1], r[2] = (math.degrees(a) for a in on_floor(p1, R, [math.radians(r[1]), math.radians(r[2])]))
        rows[-1] = [d, ex, ez]
        keep = thin([(t, (0.0, 0.0, 0.0), (x, 0.0, z), ONE) for t, x, z in rows])
        return [[round(rows[k][0], 4), {'rot': r3([rows[k][1], 0, rows[k][2]])}] + (['linear'] if i else [])
                for i, k in enumerate(keep)]

    def clip(self):
        keys = self.bone_keys()
        keys['tassel'] = self.tassel_keys()
        return {'name': self.name, 'loop': False, 'duration': self.duration, 'face': self.face, 'fx': self.fx,
                'keys': keys, 'notes': self.notes}


def on_floor(attach, R, th):
    """Tassel angles (rad, cap frame) kept above the floor: one that would dip under it lies along it."""
    L = RIG['tassel_len']
    dw = mv(R, mv(euler_m((th[0], 0.0, th[1]), rad=True), (0.0, -1.0, 0.0)))
    lo = -(attach[1] - LOWEST_REST - RIG['tassel_r']) / L  # the lowest the tassel may point (world d.y)
    if dw[1] >= lo or lo <= -1.0:
        return th
    lo = min(lo, 1.0)
    side = math.sqrt(max(0.0, 1.0 - lo * lo))
    hz = math.hypot(dw[0], dw[2])
    dw = (dw[0] * side / hz, lo, dw[2] * side / hz) if hz > 1e-6 else (side, lo, 0.0)
    g = mv(mt(R), dw)
    return [math.atan2(-g[2], -g[1]), math.asin(max(-1.0, min(1.0, g[0])))]


def thin(rows):
    """Indices of the samples to key: drop what linear interpolation reproduces within KEEP."""
    def err(i, a, b):
        u = (rows[i][0] - rows[a][0]) / (rows[b][0] - rows[a][0])
        worst = 0.0
        for k, tol in ((1, KEEP['loc']), (2, KEEP['rot']), (3, KEEP['scale'])):
            for p, q, v in zip(rows[a][k], rows[b][k], rows[i][k]):
                worst = max(worst, abs(p + (q - p) * u - v) / tol)
        return worst

    keep, stack = {0, len(rows) - 1}, [(0, len(rows) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        worst, wi = max((err(i, a, b), i) for i in range(a + 1, b))
        long_ = rows[b][0] - rows[a][0] > KEEP['gap'] + 1e-9 or max(abs(p - q) for p, q in zip(rows[a][2], rows[b][2])) > KEEP['turn']
        if worst > 1.0 or long_:
            m = wi if worst > 1.0 else (a + b) // 2
            keep.add(m)
            stack += [(a, m), (m, b)]
    return sorted(keep)


# ---------------------------------------------------------------------------
# The six variants. Hand tuples: (out, up, fwd, pitch, yaw, tilt); feet: (out, up, fwd, pitch, yaw);
# cap: (x, y, z, rx, ry, rz). Limbs are in his own frame (they turn with him).

HUG_L, HUG_R = (-0.34, -0.12, 0.55, -30, 0, -12), (-0.34, -0.09, 0.55, -30, 0, -12)  # the tumble loop's hug
TUCK_L, TUCK_R = (-0.06, 0.18, 0.26, -35, 0), (-0.06, 0.21, 0.26, -35, 0)  # and its tucked feet
CAP_TUCK = (0.0, -0.03, 0.02, 10, 0, 0)


def knockback():
    """boss: chest hit, flies back, lands on his back, legs kick up, rocks back up."""
    d, hop = 1.4, 1.2
    rot = Track((0, (0, 0, 0)), (0.06, (-16, 0, 0), 'out'), (0.40, (-92, 0, 5)), (0.46, (-84, 0, -2), 'out'),
                (0.56, (-94, 0, 3)), (0.68, (-87, 0, -3)), (0.80, (-91, 0, 0)), (1.02, (18, 0, 0)), (1.12, (6, 0, 0)),
                (hop, (10, 0, 0)))
    q = Track((0, ONE), (0.06, (1, 1.02, 0.8), 'out'), (0.16, (1, 1.06, 0.98)), (0.38, (1, 1.02, 1)),
              (0.43, (1.04, 1, 0.76), 'out'), (0.51, (1, 1, 1.06)), (0.6, (1, 1, 0.97)), (0.7, ONE), (0.98, (1, 1.04, 1)),
              (1.06, (1, 0.88, 1), 'out'), (1.13, (1, 1.03, 1)), (hop, (1, 0.86, 1)))
    z = Track((0, 0.0), (0.06, -0.05, 'out'), (0.42, -0.62, 'out'), (0.8, -0.62), (1.06, -0.06), (hop, 0.0))
    air = Track((0, 0.0), (0.06, 0.0), (0.22, 0.36, 'out'), (0.41, 0.0, 'in'))

    def arms(ph):  # lying on his back, his "fwd" points up: the hands flail skyward
        return Track((0, HN), (0.06, (0.05, 0.12, 0.35, -40, 0, -10), 'out'), (0.2, (0.14, 0.45, 0.25, -10, 0, -45)),
                     (0.4, (0.14, 0.25, 0.35, 0, 0, -20)), (0.47 + ph, (0.18, 0.2, 0.62, -20, 0, -50), 'out'),
                     (0.56 + ph, (0.12, 0.25, 0.32, 0, 0, -10)), (0.64 + ph, (0.18, 0.2, 0.6, -20, 0, -45)),
                     (0.72 + ph, (0.12, 0.25, 0.32, 0, 0, -12)), (0.82, (0.12, 0.25, 0.5, -10, 0, -30)),
                     (1.0, (-0.24, 0.0, 0.45, -25, 0, -10)), (hop, HUG_L))

    def legs(ph, tuck):
        return Track((0, FN), (0.06, FN), (0.2, (0.02, 0.15, 0.35, -40, 0), 'out'), (0.4, (0.04, 0.2, 0.4, -30, 0)),
                     (0.48 + ph, (0.04, 0.1, 0.68, -65, 0), 'out'), (0.56 + ph, (0.04, 0.28, 0.32, -5, 0)),
                     (0.64 + ph, (0.04, 0.1, 0.68, -65, 0), 'out'), (0.72 + ph, (0.04, 0.28, 0.32, -5, 0)),
                     (0.82, (0.04, 0.15, 0.55, -50, 0)), (0.98, tuck), (hop, tuck))

    cp = Track((0, CN), (0.06, (0, 0.02, 0.06, 12, 0, 0), 'out'), (0.22, (0, 0.06, -0.02, -14, 0, 6)),
               (0.43, (0, -0.02, -0.04, -10, 0, 0), 'out'), (0.6, CN), (1.1, CAP_TUCK), (hop, CAP_TUCK))
    aL, aR, lL, lR = arms(0.0), arms(0.04), legs(0.0, TUCK_L), legs(0.04, TUCK_R)

    def fn(t):
        return params(rot=rot(t), q=q(t), z=z(t), h=air(t), hL=aL(t), hR=aR(t), fL=lL(t), fR=lR(t), cp=cp(t))

    return Tumble('tumble_knockback', d, hop, 'surprised', [[0.42, 'ring']], fn,
                  'boss: chest hit (squash), flies back 0.6 onto his back (ring), legs kick at the sky, rocks back up, hops into the tumble tuck.')


def spin(flip=False):
    """thrown: cartwheel hop toward his right, lands, windmills to keep his balance."""
    d, hop = 1.2, 1.0
    rot = Track((0, (0, 0, 0)), (0.07, (0, 0, -10), 'out'), (0.5, (0, 0, 372), 'out'), (0.62, (0, 0, 352)),
                (0.74, (0, 0, 364)), (0.84, (0, 0, 357)), (0.93, (0, 0, 361)), (hop, (6, 0, 360)))
    q = Track((0, ONE), (0.07, (1, 0.8, 1), 'out'), (0.15, (1, 1.08, 1)), (0.4, ONE), (0.5, (1, 0.82, 1), 'out'),
              (0.6, (1, 1.06, 1)), (0.7, (1, 0.96, 1)), (0.8, ONE), (hop, (1, 0.86, 1)))
    x = Track((0, 0.0), (0.07, 0.02), (0.5, -0.34, 'out'), (0.62, -0.06), (0.74, -0.23), (0.84, -0.13), (0.93, -0.19),
              (hop, -0.12))
    air = Track((0, 0.0), (0.07, 0.0), (0.27, 0.55, 'out'), (0.47, 0.0, 'in'))
    hands = Track((0, HN), (0.07, (0.2, 0.25, 0.05, 0, 0, -30), 'out'), (0.17, HUG_L, 'out'), (0.45, HUG_L),
                  (0.56, (0.3, 0.38, 0.05, 0, 0, 55), 'back'), (0.68, (0.22, 0.12, 0.08, 0, 0, 30)),
                  (0.8, (0.28, 0.32, 0.05, 0, 0, 50)), (0.92, (0.12, 0.05, 0.1, 0, 0, 20)), (hop, (-0.1, -0.05, 0.3, -20, 0, 0)))
    windL = Track((0, 0.0), (0.56, 0.0), (0.66, 0.12), (0.78, -0.1), (0.9, 0.0))  # windmill: one up, one down
    feetL = Track((0, FN), (0.07, FN), (0.17, TUCK_L, 'out'), (0.45, TUCK_L), (0.5, (0.1, 0, 0, 0, 10), 'out'),
                  (0.6, (0.12, 0.0, 0.0, 0, 12)), (0.7, (0.12, 0.1, -0.02, -15, 12)), (0.78, (0.1, 0, 0, 0, 10), 'lin'),
                  (hop, (0.02, 0, 0.04, -8, 0)))
    feetR = Track((0, FN), (0.07, FN), (0.17, TUCK_R, 'out'), (0.45, TUCK_R), (0.5, (0.1, 0, 0, 0, 10), 'out'),
                  (0.58, (0.1, 0.12, 0.02, -15, 10)), (0.66, (0.12, 0, 0, 0, 12), 'lin'), (hop, (0.02, 0, 0.04, -8, 0)))
    cp = Track((0, CN), (0.17, (0, 0.03, 0, 0, 0, -14), 'out'), (0.45, (0, 0, 0, 0, 0, -10)),
               (0.53, (0, 0.04, 0, 0, 0, 14), 'back'), (0.7, (0, 0, 0, 0, 0, -6)), (0.88, CN), (hop, CAP_TUCK))

    def fn(t):
        hl, w = hands(t), windL(t)
        hL = (hl[0], hl[1] + w, *hl[2:])
        hR = (hl[0], hl[1] - w, *hl[2:])
        return params(rot=rot(t), q=q(t), x=x(t), h=air(t), hL=hL, hR=hR, fL=feetL(t), fR=feetR(t), cp=cp(t))

    name = 'tumble_spin_l' if flip else 'tumble_spin'
    side = 'his left' if flip else 'his right'
    return Tumble(name, d, hop, 'closed', [[0.5, 'ring']], fn,
                  'thrown: cartwheel hop toward %s (full turn in the screen plane, tucked), lands with a ring, windmills, hops into the tuck.' % side, flip)


def splat():
    """dropped: flattens into a pancake, wobbles flat like a settling coin, pops up, jelly settle."""
    d, hop = 1.1, 0.9
    flat = 0.5
    q = Track((0, ONE), (0.06, (1, flat, 1), 'out'), (0.12, (1, 0.56, 1)), (0.19, (1, 0.47, 1)), (0.27, (1, 0.53, 1)),
              (0.36, (1, flat, 1)), (0.5, (1, flat, 1)), (0.54, (1, 0.44, 1)), (0.62, (1, 1.24, 1), 'out'),
              (0.69, (1, 1.06, 1)), (0.75, (1, 0.82, 1), 'out'), (0.81, (1, 1.08, 1)), (0.86, (1, 0.97, 1)),
              (hop, (1, 0.88, 1)))
    air = Track((0, 0.0), (0.54, 0.0), (0.65, 0.3, 'out'), (0.74, 0.0, 'in'))
    jelly = Track((0, 0.0), (0.74, 0.0), (0.79, 5.0), (0.84, -4.0), (hop, 1.0))
    # Splayed flat: his feet ride up to his base so the pancake lies on the floor between them.
    hands = Track((0, HN), (0.06, (0.62, -0.26, 0.05, 0, 0, 70), 'out'), (0.5, (0.62, -0.24, 0.05, 0, 0, 70)),
                  (0.54, (0.6, -0.2, 0.05, 0, 0, 60)), (0.62, (-0.02, 0.35, 0.02, 0, 0, -25), 'back'),
                  (0.75, (0.25, 0.0, 0.05, 0, 0, 40), 'out'), (0.84, (0.1, 0.05, 0.08, 0, 0, 20)), (hop, (-0.1, -0.05, 0.3, -20, 0, 0)))
    feet = Track((0, FN), (0.06, (0.9, 0.28, 0.12, 0, 40), 'out'), (0.5, (0.9, 0.28, 0.12, 0, 40)),
                 (0.54, (0.8, 0.26, 0.1, 0, 35)), (0.62, (0.0, 0.0, 0.0, 20, 0), 'out'), (0.74, (0.06, 0, 0, 0, 10), 'in'),
                 (hop, (0.02, 0, 0.03, -6, 0)))
    cp = Track((0, CN), (0.06, (0, -0.04, 0.02, 6, 0, 0), 'out'), (0.14, (0, 0.06, 0, -6, 0, 4)), (0.24, CN),
               (0.62, (0, 0.1, 0, -8, 0, 0), 'out'), (0.75, (0, -0.04, 0.02, 8, 0, 0), 'out'), (0.84, CN), (hop, CAP_TUCK))

    def fn(t):
        u = seg(t, 0.06, 0.5)
        amp = 9.0 * (1 - u) ** 1.5 * min(1.0, u * 5)
        ph = 2 * math.pi * (1.4 * u + 1.6 * u * u)  # coin on a table: faster as it settles
        rot = (amp * math.sin(ph), 0.0, amp * math.cos(ph) + jelly(t))
        return params(rot=rot, q=q(t), h=air(t), hL=hands(t), fL=feet(t), cp=cp(t))

    return Tumble('tumble_splat', d, hop, 'surprised', [[0.04, 'ring']], fn,
                  'dropped: splats to a 0.5 pancake (ring), wobbles flat like a settling coin, pops up tall, jelly settle, hops into the tuck.')


def bonk():
    """bonk: head snaps back (stars), dizzy circles, legs give way, plops onto his bottom."""
    d, hop = 1.3, 1.1
    rot = Track((0, (0, 0, 0)), (0.05, (-28, 0, 14), 'out'), (0.16, (10, 0, -6), 'out'), (0.26, (-3, 0, 3)),
                (0.72, (0, 0, 0)), (0.86, (-12, 0, 0), 'in'), (0.93, (-5, 0, 0), 'out'), (hop, (4, 0, 0)))
    q = Track((0, ONE), (0.05, (1.06, 1.04, 0.8), 'out'), (0.14, (1, 1, 1.06)), (0.22, ONE), (0.74, ONE),
              (0.84, (1, 1.05, 1)), (0.89, (1, 0.8, 1), 'out'), (0.96, (1, 1.05, 1)), (1.02, (1, 0.97, 1)), (hop, (1, 0.88, 1)))
    z = Track((0, 0.0), (0.05, -0.08, 'out'), (0.26, -0.12), (0.72, -0.05), (hop, 0.0))
    air = Track((0, 0.0), (0.05, 0.12, 'out'), (0.14, 0.0, 'in'))

    def arms(ph):
        return Track((0, HN), (0.05, (0.2, 0.55, 0.05, 0, 0, -35), 'out'), (0.2, (0.15, 0.22, 0.1, 0, 0, 10)),
                     (0.34 + ph, (0.2, 0.08, 0.1, 0, 0, 30)), (0.46 + ph, (0.12, 0.3, 0.06, 0, 0, -10)),
                     (0.58 + ph, (0.2, 0.08, 0.1, 0, 0, 30)), (0.72, (0.14, 0.28, 0.06, 0, 0, -10)),
                     (0.88, (0.14, -0.06, 0.12, 0, 0, 35), 'in'), (1.0, (0.12, -0.04, 0.14, 0, 0, 30)),
                     (hop, (-0.05, -0.05, 0.3, -20, 0, 0)))

    def legs(t0, kick):
        k = [(0, FN), (0.05, kick, 'out'), (0.16, FN)]
        k += [(t0, FN), (t0 + 0.05, (0.02, 0.09, -0.04, 12, 0), 'out'), (t0 + 0.1, (0.03, 0, -0.02, 0, 0), 'in')]
        k += [(0.72, FN), (0.86, (0.1, 0.3, 0.58, -35, 10), 'in'), (0.98, (0.1, 0.3, 0.56, -50, 10)),
              (1.04, (0.1, 0.3, 0.56, -28, 10)), (hop, (0.06, 0.3, 0.5, -35, 6))]
        return Track(*k)

    rub = Track((0, HN), (0.05, (0.2, 0.55, 0.05, 0, 0, -35), 'out'), (0.2, (-0.18, 0.74, 0.06, 0, 0, -60)),
                (0.32, (-0.15, 0.78, 0.1, -10, 0, -55)), (0.44, (-0.2, 0.72, 0.02, 10, 0, -65)),
                (0.56, (-0.15, 0.78, 0.1, -10, 0, -55)), (0.72, (-0.18, 0.74, 0.06, 0, 0, -60)),
                (0.88, (0.14, -0.06, 0.12, 0, 0, 35), 'in'), (1.0, (0.12, -0.04, 0.14, 0, 0, 30)),
                (hop, (-0.05, -0.05, 0.3, -20, 0, 0)))
    cp = Track((0, CN), (0.05, (0, 0.12, -0.05, -24, 0, 6), 'out'), (0.18, (0, 0, 0.02, 8, 0, -4), 'back'),
               (0.3, (0.03, -0.02, 0, 0, 0, -16)), (0.72, (0.03, -0.02, 0, 0, 0, -16)), (0.89, (0.03, -0.05, 0, 6, 0, -22), 'out'),
               (hop, (0.02, -0.04, 0.02, 8, 0, -12)))
    aL, aR = arms(0.0), rub
    lL, lR = legs(0.3, (0, 0.12, 0.05, -25, 0)), legs(0.46, FN)

    def fn(t):
        u = seg(t, 0.24, 0.72)
        env = math.sin(math.pi * u)
        ph = 2 * math.pi * 1.5 * u
        u2 = seg(t, 0.92, hop)
        env2 = math.sin(math.pi * u2) * 0.6
        ph2 = 2 * math.pi * 1.0 * u2
        r = rot(t)
        rr = (r[0] + 14 * env * math.sin(ph) + 6 * env2 * math.sin(ph2), r[1] + 10 * env * math.sin(ph * 0.5),
              r[2] + 14 * env * math.cos(ph) + 6 * env2 * math.cos(ph2))
        x = 0.08 * env * math.sin(ph)
        return params(rot=rr, q=q(t), x=x, z=z(t), h=air(t), hL=aL(t), hR=aR(t), fL=lL(t), fR=lR(t), cp=cp(t))

    return Tumble('tumble_bonk', d, hop, 'closed', [[0.04, 'stars']], fn,
                  'bonk: smack, head snaps back with the cap popping (stars), recoils, rubs his head through dizzy circles, legs give, plops onto his bottom, hops into the tuck.')


def dizzy(flip=False):
    """shaken: drunk circles, lurches to his right, flops onto his side, twitches."""
    d, hop = 1.6, 1.44
    base = Track((0, (0, 0, 0)), (0.08, (0, 0, -8), 'out'), (0.86, (0, 0, 0)), (1.0, (0, 0, 32), 'smooth'),
                 (1.12, (0, 0, 90), 'in'), (1.17, (0, 0, 84), 'out'), (1.23, (0, 0, 89)), (1.3, (0, 0, 88)),
                 (hop, (8, 0, 6), 'out'))
    yaw = Track((0, 0.0), (0.08, 0.0), (0.3, 18.0), (0.55, -14.0), (0.8, 10.0), (0.95, 0.0), (hop, 0.0))
    q = Track((0, ONE), (0.08, (1, 0.9, 1), 'out'), (0.16, (1, 1.04, 1)), (0.86, ONE), (1.0, (1, 1.03, 1)),
              (1.14, (0.82, 1, 1), 'out'), (1.21, (1.04, 1, 1)), (1.3, ONE), (hop, (1, 0.88, 1)))
    x = Track((0, 0.0), (0.86, 0.0), (1.0, -0.2), (1.12, -0.32, 'in'), (1.3, -0.32), (hop, -0.06, 'out'))
    flail = Track((0, HN), (0.08, (0.2, 0.42, 0.05, 0, 0, -30), 'out'), (0.86, (0.2, 0.3, 0.05, 0, 0, -10)),
                  (0.98, (0.25, 0.5, 0.1, 0, 0, -40)), (hop, (-0.05, -0.05, 0.3, -20, 0, 0)))
    # Lying on his right side: hand.R tucks in front of his belly, hand.L flops in the air.
    under = Track((0, 0.0), (1.0, 0.0), (1.12, 1.0, 'out'), (1.3, 1.0), (hop, 0.0))
    limp = Track((0, 0.0), (1.12, 0.0), (1.18, 1.0, 'out'), (1.24, 0.6), (1.3, 1.0), (hop, 0.0))

    def stepper(times, lean):
        k = [(0, FN)]
        for t0 in times:
            k += [(t0, (0.04, 0, 0, 0, 0)), (t0 + 0.06, (0.06 + lean, 0.1, 0.04, -15, 0), 'out'), (t0 + 0.12, (0.05 + lean, 0, 0.02, 0, 0), 'in')]
        return k

    feetL = Track(*(stepper((0.12, 0.42, 0.72), 0.04) + [(0.92, (0.0, 0, 0.02, 0, 0)), (1.12, (-0.05, 0.08, 0.1, -10, 0)),
                                                       (1.2, (0.0, 0.22, 0.05, 30, 0), 'out'), (1.26, (-0.05, 0.08, 0.1, -10, 0)),
                                                       (hop, (-0.04, 0.12, 0.2, -25, 0))]))
    feetR = Track(*(stepper((0.27, 0.57), 0.04) + [(0.9, (0.04, 0, 0, 0, 0)), (0.97, (0.2, 0.12, 0.02, -15, 0), 'out'),
                                                   (1.04, (0.24, 0.0, 0.02, 0, 0), 'in'), (1.12, (0.1, 0.06, 0.1, -10, 0)),
                                                   (hop, (-0.04, 0.12, 0.2, -25, 0))]))
    cp = Track((0, CN), (0.08, (0, 0.04, 0, 0, 0, 10), 'out'), (0.3, (0, 0, 0, 0, 0, -12)), (0.55, (0, 0, 0, 0, 0, 12)),
               (0.8, (0, 0, 0, 0, 0, -10)), (1.0, (0.02, 0.03, 0, -4, 0, -12)), (1.14, (0.04, -0.03, 0, 0, 0, 16), 'out'),
               (hop, CAP_TUCK))

    def fn(t):
        u = seg(t, 0.08, 0.86)
        env = hump(u * 1.3) * min(1.0, u * 6)  # circles fade in fast, die out by ~75% of the stretch
        ph = 2 * math.pi * 2.0 * u
        b = base(t)
        rot = (b[0] + 18 * env * math.sin(ph), b[1] + yaw(t), b[2] + 18 * env * math.cos(ph))
        fl = flail(t)
        side = math.sin(ph) * env  # lean side: the high hand flings up, the low one down
        hL = (fl[0], fl[1] + 0.18 * side, *fl[2:])
        hR = (fl[0], fl[1] - 0.18 * side, *fl[2:])
        w = under(t)
        tuck = (-0.42, -0.14, 0.58, -30, 0, -14)
        hR = tuple(a + (b_ - a) * w for a, b_ in zip(hR, tuck))
        lw = limp(t)
        hL = tuple(a + (b_ - a) * lw for a, b_ in zip(hL, (0.12, 0.05 + 0.1 * lw, 0.12, 0, 0, 45)))
        drift = 0.1 * env
        return params(rot=rot, q=q(t), x=x(t) + drift * math.cos(ph), z=drift * math.sin(ph), hL=hL, hR=hR,
                      fL=feetL(t), fR=feetR(t), cp=cp(t))

    name = 'tumble_dizzy_l' if flip else 'tumble_dizzy'
    side = 'his left' if flip else 'his right'
    return Tumble(name, d, hop, 'focused', [[0.1, 'stars'], [1.13, 'ring']], fn,
                  'shaken: two drunk circles with stumbling steps (stars), lurches to %s, flops onto that side (ring), feet twitch, pops up into the tuck.' % side, flip)


def faceplant():
    """flicked: front flip toward the camera into a faceplant, feet flutter in the air."""
    d, hop = 1.2, 1.04
    rot = Track((0, (0, 0, 0)), (0.05, (-14, 0, 0), 'out'), (0.4, (425, 0, 0), 'lin'), (0.45, (438, 0, 0), 'out'),
                (0.52, (430, 0, 0)), (0.86, (431, 0, 0)), (1.0, (366, 0, 0), 'out'), (hop, (370, 0, 0)))
    q = Track((0, ONE), (0.05, (1, 0.8, 1), 'out'), (0.12, (1, 1.12, 1)), (0.3, ONE), (0.4, ONE), (0.45, (1.08, 1, 0.78), 'out'),
              (0.52, (1, 1, 1.05)), (0.6, (1, 1, 0.97)), (0.7, ONE), (0.9, ONE), (0.98, (1, 1.06, 1)), (hop, (1, 0.88, 1)))
    z = Track((0, 0.0), (0.05, -0.03), (0.4, 0.4, 'lin'), (0.46, 0.46, 'out'), (0.86, 0.46), (hop, 0.1))
    air = Track((0, 0.0), (0.05, 0.0), (0.22, 0.62, 'out'), (0.4, 0.0, 'in'))

    def arms(ph):  # face down, his "fwd" points at the floor: the hands pat it
        k = [(0, HN), (0.05, (0.1, 0.3, -0.05, 0, 0, -30), 'out'), (0.14, HUG_L, 'out'), (0.37, HUG_L),
             (0.44, (0.3, 0.45, 0.24, -20, 0, -30), 'out')]
        for i, t0 in enumerate((0.52, 0.6, 0.68, 0.76, 0.84)):
            k.append((t0 + ph, (0.3, 0.45, 0.02 if i % 2 == 0 else 0.24, -20, 0, -30), 'out' if i % 2 == 0 else 'in'))
        k += [(0.94, (0.1, -0.05, 0.4, -40, 0, 0)), (hop, (-0.2, -0.1, 0.5, -30, 0, -12))]
        return Track(*k)

    def legs(ph):  # face down, his "back" points up: the feet flutter above him
        k = [(0, FN), (0.05, FN), (0.14, TUCK_L, 'out'), (0.38, TUCK_L), (0.41, (0.1, 0.02, -0.6, 30, 0), 'lin'),
             (0.44, (0.18, 0.62, -1.2, 50, 0)), (0.47, (0.22, 1.25, -1.12, 60, 0), 'out')]
        for i, t0 in enumerate((0.52, 0.58, 0.64, 0.7, 0.76, 0.82)):
            k.append((t0 + ph, (0.22, 1.36, -1.0, 85, 0) if i % 2 == 0 else (0.22, 1.14, -1.22, 35, 0)))
        k += [(0.9, (0.1, 0.45, -0.95, 40, 0)), (0.96, (0.04, 0.0, -0.45, 10, 0)), (1.0, (0.0, 0.02, 0.1, -10, 0)), (hop, TUCK_L)]
        return Track(*k)

    cp = Track((0, CN), (0.05, (0, 0.04, 0, -6, 0, 0)), (0.2, (0, 0.03, -0.02, -14, 0, 0)), (0.4, (0, 0.02, -0.02, -12, 0, 0)),
               (0.46, (0, -0.05, 0.04, 16, 0, 0), 'out'), (0.6, CN), (0.94, CN), (hop, CAP_TUCK))
    aL, aR, lL, lR = arms(0.0), arms(0.04), legs(0.0), legs(0.03)

    def fn(t):
        return params(rot=rot(t), q=q(t), z=z(t), h=air(t), hL=aL(t), hR=aR(t), fL=lL(t), fR=lR(t), cp=cp(t))

    return Tumble('tumble_faceplant', d, hop, 'surprised', [[0.43, 'stars']], fn,
                  'flicked: crouch, front flip toward the camera, faceplant (squash, stars), hands pat the floor, feet flutter above him, pops up into the tuck.')


CAUSE = {'boss': 'tumble_knockback', 'thrown': 'tumble_spin', 'dropped': 'tumble_splat',
         'bonk': 'tumble_bonk', 'shaken': 'tumble_dizzy', 'flicked': 'tumble_faceplant'}
MIRRORED = {'tumble_spin': 'tumble_spin_l', 'tumble_dizzy': 'tumble_dizzy_l'}  # dir = -1 (falls to his left)


def tumbles():
    """The Tumble objects (poses at any t, for proofs)."""
    return [knockback(), spin(), spin(flip=True), splat(), bonk(), dizzy(), dizzy(flip=True), faceplant()]


def tumble_clips():
    """clips.json entries, in the author_extra format."""
    return [t.clip() for t in tumbles()]


def main():
    new = tumble_clips()
    with open(OUT, encoding='utf-8') as f:
        data = json.load(f)
    names = {c['name'] for c in new}
    data['extra'] = [c for c in data.get('extra', []) if c['name'] not in names] + new
    extra_names = {c['name'] for c in data['extra']}
    data['clips'] = [c for c in data['clips'] if c['name'] not in extra_names] + data['extra']
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    os.replace(tmp, OUT)
    print('wrote %d clips (%d tumbles) to %s' % (len(data['clips']), len(new), OUT))


if __name__ == '__main__':
    main()
