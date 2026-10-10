"""Authors the v3 dances into clips.json's "extra" list (plain Python 3, no Blender needed).

  python blender/tutor/author_dances.py

Five fast, snappy one-shots for the dance picker and the right-answer
celebrations: a beat every 0.15-0.25 s, poses arrive with a 'back' overshoot.
Same rig, helpers and tassel simulation as author_clips.py; the clips land
under "extra" like author_extra.py's, so a later author_clips.py rerun keeps
them. Rebuild the GLB with build_tutor.py afterwards.

Hands and feet hang off the root, not the body: when the body slides
(shuffle) or sinks (twist) their keys carry the same offset. at() and step()
place them by position (body centre / floor, three axes), which keeps the
clearance against the body (radius 0.8, narrower near the base) easy to read.
"""

import json
import math
import os

from author_clips import OUT, K, body, cap, clip, foot, hand

HAND_REST = (0.95, -0.28, 0.28)  # build_tutor HAND['rest']: hand.L centre from the body centre
FOOT_REST = (0.27, 0.08)  # build_tutor FOOT['rest'] x, z on the floor


def at(s, x, y, z, **rot):
    """Hand s (+1 = hand.L) centred at (x, y, z) from the body centre at rest; x = viewer right."""
    return hand(s, out=s * x - HAND_REST[0], up=y - HAND_REST[1], fwd=z - HAND_REST[2], **rot)


def step(s, x, z=FOOT_REST[1], up=0.0, **rot):
    """Foot s at floor point (x, z), lifted by `up`."""
    return foot(s, out=s * x - FOOT_REST[0], up=up, fwd=z - FOOT_REST[1], **rot)


def sorted_keys(keys):
    assert all(a[0] < b[0] for a, b in zip(keys, keys[1:])), [k[0] for k in keys]
    return keys


def dance_shuffle():
    """Side-step shuffle: two steps right, two back, two left, two back, fists pumping."""
    d = 2.4
    beats = [0.15 + 0.25 * i for i in range(8)]
    xs = [0.14, 0.28, 0.14, 0.0, -0.14, -0.28, -0.14, 0.0]  # where the body has slid to on each beat
    tada = beats[-1] + 0.17
    b = [K(0, body())]
    h = {s: [K(0, hand(s))] for s in (1, -1)}
    f = {s: [K(0, foot(s))] for s in (1, -1)}
    for i, (t, x) in enumerate(zip(beats, xs)):
        x0 = xs[i - 1] if i else 0.0
        go = 1 if x > x0 else -1
        b.append(K(t, body(x=x, sy=0.88, ry=16 * go, rz=-6 * go), 'linear'))  # land on the beat
        if i < len(beats) - 1:
            b.append(K(t + 0.12, body(x=x, y=0.05, sy=1.05, ry=10 * go, rz=-3 * go)))  # rebound
        for s in (1, -1):
            fwd = (i + (s > 0)) % 2 == 0  # fists pump in turn
            pose = at(s, x + s * 0.9, 0.08, 0.66, pitch=-35, tilt=18) if fwd else at(s, x + s * 1.08, -0.3, 0.08, pitch=20, tilt=26)
            h[s].append(K(t, pose, 'back'))
            # Lead foot (the travel side) steps out before the beat, the other closes after it.
            lift, land = (t - 0.11, t - 0.02) if s == go else (t + 0.02, t + 0.11)
            fx0, fx1 = x0 + s * FOOT_REST[0], x + s * FOOT_REST[0]
            f[s] += [K(lift, step(s, fx0)), K((lift + land) / 2, step(s, (fx0 + fx1) / 2, up=0.1, pitch=-12)), K(land, step(s, fx1), 'linear')]
    b += [K(tada, body(y=0.07, sy=1.08, rx=-5), 'back'), K(d, body())]
    for s in (1, -1):
        h[s] += [K(tada, at(s, s * 1.08, 0.36, 0.42, tilt=-28), 'back'), K(d, hand(s))]
        f[s].append(K(d, foot(s)))
    return clip('dance_shuffle', d, False, 'happy', [[0.4, 'ring'], [tada, 'stars']], {
        'body': sorted_keys(b), 'hand.L': sorted_keys(h[1]), 'hand.R': sorted_keys(h[-1]),
        'foot.L': sorted_keys(f[1]), 'foot.R': sorted_keys(f[-1]),
    }, 'Side-step shuffle on 0.25 s beats: lead foot out, trail foot closes, bounce, fists pump, jazz-hands finish.')


def dance_floss():
    """The floss: both arms whip side to side low in front, hips swing the other way."""
    d = 2.0
    beats = [0.12 + 0.2 * i for i in range(8)]
    tada = beats[-1] + 0.2
    wide = lambda s, a: at(s, a * 1.2, -0.42, 0.14, tilt=40)  # the hand on the side the arms swing to
    cross = lambda s, a: at(s, a * 0.3, -0.48, 0.9, tilt=-14)  # the other one, across the belly
    b = [K(0, body())]
    h = {s: [K(0, hand(s))] for s in (1, -1)}
    f = {s: [K(0, foot(s))] for s in (1, -1)}
    h[-1].append(K(beats[0] / 2, at(-1, -0.62, -0.38, 0.95)))  # hand.R reaches round the front for the first cross
    for i, t in enumerate(beats):
        a = 1 if i % 2 == 0 else -1  # arms to viewer right, then left
        b.append(K(t, body(x=-0.08 * a, sy=0.95, ry=10 * a, rz=-9 * a), 'back'))
        for s in (1, -1):
            h[s].append(K(t, wide(s, a) if s == a else cross(s, a), 'back'))
            if i < len(beats) - 1:  # swing around the front of the belly, never through it
                h[s].append(K(t + 0.1, at(s, a * (0.65 if s == a else -0.62), -0.36, 0.95, tilt=10), 'linear'))
            elif s != a:  # the crossed hand comes back round the front for the finish
                h[s].append(K(t + 0.1, at(s, s * 0.55, -0.2, 1.0), 'linear'))
            heel = s == a  # the foot on the arm side rides up on its toe
            f[s].append(K(t, step(s, s * FOOT_REST[0], up=0.03 if heel else 0.0, pitch=18 if heel else 0.0), 'back'))
        if i < len(beats) - 1:
            b.append(K(t + 0.1, body(y=0.025, sy=1.02)))
    b += [K(tada, body(y=0.07, sy=1.08, rx=-5), 'back'), K(d, body())]
    for s in (1, -1):
        h[s] += [K(tada, at(s, s * 1.1, 0.52, 0.34, tilt=-30), 'back'), K(d, hand(s))]
        f[s] += [K(tada, foot(s)), K(d, foot(s))]
    return clip('dance_floss', d, False, 'happy', [[0.12, 'ring'], [tada, 'stars']], {
        'body': sorted_keys(b), 'hand.L': sorted_keys(h[1]), 'hand.R': sorted_keys(h[-1]),
        'foot.L': sorted_keys(f[1]), 'foot.R': sorted_keys(f[-1]),
    }, 'Floss on 0.2 s beats: arms whip side to side in front, hips counter-swing, heel pops, hands-up finish.')


def dance_disco():
    """Disco point: up and out, down and across, four times a hand, the free hand on his hip."""
    d = 2.4
    beats = [0.15 + 0.25 * i for i in range(8)]
    up = lambda p: at(p, p * 0.92, 1.28, 0.4, tilt=-4)  # high and out, clear of the board
    down = lambda p: at(p, -p * 0.42, -0.6, 0.9, pitch=-20, tilt=14)
    sweep = lambda p: at(p, p * 0.3, 0.25, 1.08, tilt=6)  # the arc in front of him between up and down
    hip = lambda s: at(s, s * 0.97, -0.32, 0.18, pitch=8, tilt=46)
    finish = beats[-1] + 0.2
    b = [K(0, body())]
    # hand.L points on beats 0-3 then rests on his hip; hand.R the other way round.
    h = {1: [K(0, hand(1))], -1: [K(0, hand(-1)), K(beats[0], hip(-1), 'back'), K(beats[4] - 0.12, hip(-1))]}
    f = {s: [K(0, foot(s))] for s in (1, -1)}
    for i, t in enumerate(beats):
        p = 1 if i < 4 else -1  # his left hand (viewer right) points first, then the other
        hi = i % 2 == 0
        b.append(K(t, body(y=0.04, sy=1.06, rx=-4, ry=12 * p, rz=-8 * p) if hi else body(sy=0.9, rx=7, ry=-10 * p, rz=5 * p), 'back'))
        h[p].append(K(t, up(p) if hi else down(p), 'back'))
        if i == 3:  # down, then round the front to his hip (never through the body)
            h[p] += [K(t + 0.12, at(p, p * 0.6, -0.5, 0.88, tilt=20), 'linear'), K(beats[4], hip(p), 'back')]
        else:
            h[p].append(K(t + 0.12, sweep(p), 'linear'))
        tap = p if hi else -p  # toe tap under the pointing hand
        f[tap] += [K(t - 0.06, step(tap, tap * FOOT_REST[0])), K(t, step(tap, tap * FOOT_REST[0], up=0.06, pitch=18 if hi else -15), 'back'),
                   K(t + 0.1, step(tap, tap * FOOT_REST[0]), 'linear')]
    h[-1].append(K(finish, up(-1), 'back'))  # one last point up and hold
    b += [K(finish, body(y=0.08, sy=1.1, rx=-5, ry=-12, rz=8), 'back'), K(d, body())]
    h[1] += [K(finish, hip(1)), K(d, hand(1))]
    h[-1].append(K(d, hand(-1)))
    for s in (1, -1):
        f[s].append(K(d, foot(s)))
    return clip('dance_disco', d, False, 'happy', [[0.15, 'stars'], [1.15, 'ring'], [finish, 'confetti']], {
        'body': sorted_keys(b), 'hand.L': sorted_keys(h[1]), 'hand.R': sorted_keys(h[-1]),
        'foot.L': sorted_keys(f[1]), 'foot.R': sorted_keys(f[-1]),
    }, 'Disco point on 0.25 s beats: up-out, down-across, four per hand, free hand on hip, toe taps, point-up finish.')


def dance_twist():
    """The twist: hips snap +-28 deg every 0.15 s while he sinks low and comes back up."""
    d = 2.2
    beats = [0.12 + 0.15 * i for i in range(12)]
    pop = beats[-1] + 0.2

    def swing(s, a, depth):
        # Hands at his sides, swung against the hips (rotated about the body axis; the
        # chord between two swings cuts inside the arc, hence the 1.1 radius).
        phi = math.radians(-22 * a)
        x, z = s * 1.02, 0.42
        return at(s, x * math.cos(phi) + z * math.sin(phi), -0.18 - 0.1 * depth, -x * math.sin(phi) + z * math.cos(phi), pitch=-25, tilt=15)

    b = [K(0, body())]
    h = {s: [K(0, hand(s))] for s in (1, -1)}
    f = {s: [K(0, foot(s))] for s in (1, -1)}
    for i, t in enumerate(beats):
        a = 1 if i % 2 == 0 else -1
        depth = math.sin(math.pi * i / (len(beats) - 1))  # down low mid-dance, back up by the end
        b.append(K(t, body(sy=1 - 0.14 * depth, rx=5 * depth, ry=28 * a, rz=-3 * a), 'back'))
        for s in (1, -1):
            h[s].append(K(t, swing(s, a, depth), 'back'))
            heel = s == a
            f[s].append(K(t, step(s, s * FOOT_REST[0], up=0.03 if heel else 0.0, pitch=15 if heel else 0.0, yaw=s * a * 22), 'back'))
    b += [K(pop, body(y=0.07, sy=1.08, rx=-5), 'back'), K(d, body())]
    for s in (1, -1):
        h[s] += [K(pop, at(s, s * 1.1, 0.4, 0.4, tilt=-25), 'back'), K(d, hand(s))]
        f[s] += [K(pop, foot(s)), K(d, foot(s))]
    return clip('dance_twist', d, False, 'happy', [[0.9, 'ring'], [pop, 'stars']], {
        'body': sorted_keys(b), 'hand.L': sorted_keys(h[1]), 'hand.R': sorted_keys(h[-1]),
        'foot.L': sorted_keys(f[1]), 'foot.R': sorted_keys(f[-1]),
    }, 'Twist on 0.15 s beats: hips snap +-28 deg, hands swing against them, feet swivel, sinks low and pops back up.')


def dance_wave():
    """Arm wave: arms out, a ripple runs hand -> body -> cap -> other hand, four passes."""
    d = 2.4
    passes = [0.25 + 0.42 * k for k in range(4)]
    tada = passes[-1] + 0.55
    out = lambda s: at(s, s * 1.32, 0.1, 0.26, tilt=58)
    lift = lambda s: at(s, s * 1.24, 0.46, 0.26, tilt=12)
    b = [K(0, body())]
    h = {s: [K(0, hand(s)), K(0.16, out(s), 'back')] for s in (1, -1)}
    c = [K(0, cap())]
    for k, t in enumerate(passes):
        f = -1 if k % 2 == 0 else 1  # first pass starts at hand.R (viewer left)
        h[f] += [K(t, lift(f), 'back'), K(t + 0.1, out(f))]
        h[-f] += [K(t + 0.24, lift(-f), 'back'), K(t + 0.34, out(-f))]
        b += [K(t + 0.08, body(y=0.03, sy=1.03, rz=9 * f)), K(t + 0.17, body(y=0.03, sy=1.03, rz=-9 * f)), K(t + 0.3, body(sy=0.96))]
        c += [K(t + 0.12, cap(rot=(0, 0, 7 * f))), K(t + 0.22, cap(rot=(0, 0, -7 * f)), 'back')]
    b += [K(tada, body(y=0.07, sy=1.08, rx=-5), 'back'), K(d, body())]
    c += [K(tada, cap(loc=(0, 0.05, 0)), 'back'), K(d, cap())]
    for s in (1, -1):
        h[s] += [K(tada, at(s, s * 1.0, 0.62, 0.36, tilt=-32), 'back'), K(d, hand(s))]
    return clip('dance_wave', d, False, 'happy', [[0.25, 'ring'], [tada, 'hearts']], {
        'body': sorted_keys(b), 'hand.L': sorted_keys(h[1]), 'hand.R': sorted_keys(h[-1]), 'cap': sorted_keys(c),
    }, 'Arm wave: arms out, a ripple rolls hand -> body -> cap -> hand, four passes 0.42 s apart, hands-up finish.')


def main():
    new = [dance_shuffle(), dance_wave(), dance_floss(), dance_disco(), dance_twist()]
    with open(OUT, encoding='utf-8') as fh:
        data = json.load(fh)
    names = {c['name'] for c in new}
    data['extra'] = [c for c in data.get('extra', []) if c['name'] not in names] + new
    extra_names = {c['name'] for c in data['extra']}
    data['clips'] = [c for c in data['clips'] if c['name'] not in extra_names] + data['extra']
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, separators=(',', ':'))
    os.replace(tmp, OUT)
    print('wrote %d clips (%d extra) to %s' % (len(data['clips']), len(data['extra']), OUT))


if __name__ == '__main__':
    main()
