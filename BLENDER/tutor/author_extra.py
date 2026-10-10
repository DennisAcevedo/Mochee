"""Authors the v2 clips into clips.json's "extra" list (plain Python 3, no Blender needed).

  python blender/tutor/author_extra.py

Uses author_clips.py's pose helpers and tassel simulation, then writes the
clips under "extra" (and into "clips"), so a later author_clips.py rerun keeps
them. Squash/stretch values follow the concept sheet: squash 0.82-0.94,
stretch 1.06-1.14, wobble tilts within +-10 deg.

dragged / tumble are loops the physics layer holds while he is grabbed or
flying; recover / surprise / hint / equip are one-shots. read is the
studying loop that goes with the book node.
"""

import json
import os

from author_clips import OUT, OVERHEAD, UPRIGHT, K, body, cap, clip, foot, hand, looped


def dragged():
    """Held up by the cursor: stretched, swinging, feet kicking, hands flapping."""
    d = 1.0
    hang = lambda **k: body(y=0.1, sy=1.1, rx=-5, **k)
    flap = lambda s, hi: hand(s, out=0.18, up=0.72 if hi else 0.52, fwd=0.06, tilt=-28 if hi else 12)

    def kick(s, ph):
        # Dangle below rest and kick on alternating half-beats.
        fwd = lambda u: foot(s, up=-0.04, fwd=0.14, pitch=-32) if u else foot(s, up=0.02, fwd=-0.08, pitch=22)
        keys = [K(0, fwd(ph)), K(0.25, fwd(not ph)), K(0.5, fwd(ph)), K(0.75, fwd(not ph))]
        return looped(keys, d)

    return clip('dragged', d, True, 'surprised', [], {
        'body': looped([K(0, hang(rz=7)), K(0.25, body(y=0.13, sy=1.06, rx=-7)), K(0.5, hang(rz=-7)),
                        K(0.75, body(y=0.13, sy=1.06, rx=-7))], d),
        'hand.L': looped([K(0, flap(1, True)), K(0.25, flap(1, False), 'back'), K(0.5, flap(1, True)), K(0.75, flap(1, False), 'back')], d),
        'hand.R': looped([K(0, flap(-1, False)), K(0.25, flap(-1, True), 'back'), K(0.5, flap(-1, False)), K(0.75, flap(-1, True), 'back')], d),
        'foot.L': kick(1, True),
        'foot.R': kick(-1, False),
        'cap': looped([K(0, cap(rot=(0, 0, -6))), K(0.5, cap(rot=(0, 0, 6)))], d),
    }, 'Grabbed and lifted: stretched 1.10, swings +-7 deg, hands flap, feet dangle and kick (whee!).')


def tumble():
    """Tucked ball while the physics body spins him; limbs stay clear of the body."""
    d = 0.6
    tuck = lambda sy: body(y=0.05, sy=sy, rx=12)
    hug = lambda s, up: hand(s, out=-0.34, up=up - 0.02, fwd=0.55, pitch=-30, tilt=-12)
    feet_in = lambda s, up: foot(s, out=-0.06, up=up, fwd=0.26, pitch=-35)
    return clip('tumble', d, True, 'closed', [], {
        'body': looped([K(0, tuck(0.9)), K(0.15, tuck(0.94)), K(0.3, tuck(0.9)), K(0.45, tuck(0.94))], d),
        'hand.L': looped([K(0, hug(1, -0.1)), K(0.3, hug(1, -0.07))], d),
        'hand.R': looped([K(0, hug(-1, -0.07)), K(0.3, hug(-1, -0.1))], d),
        'foot.L': looped([K(0, feet_in(1, 0.18)), K(0.3, feet_in(1, 0.21))], d),
        'foot.R': looped([K(0, feet_in(-1, 0.21)), K(0.3, feet_in(-1, 0.18))], d),
        'cap': looped([K(0, cap(loc=(0, -0.03, 0.02), rot=(10, 0, 0)))], d),
    }, 'Tucked into a ball (squash 0.90-0.94), hands hug the front, feet pulled up, eyes squeezed shut.')


def recover():
    """Lands dizzy, wobbles, shakes it off, ta-da."""
    d = 0.9
    flop = lambda s, out, up: hand(s, out=out, up=up, fwd=0.06, tilt=28)
    tada = lambda s: hand(s, out=0.26, up=0.82, fwd=0.06, tilt=-32)

    def hands(s):
        return [K(0, flop(s, 0.1, -0.1)), K(0.12, flop(s, 0.18, -0.02 if s > 0 else -0.14)), K(0.24, flop(s, 0.12, -0.14 if s > 0 else -0.02)),
                K(0.36, flop(s, 0.16, -0.06)), K(0.48, hand(s, out=0.2, up=0.1, tilt=-10)), K(0.54, hand(s, out=0.06, up=0.0, tilt=30)),
                K(0.6, hand(s, out=0.2, up=0.1, tilt=-10)), K(0.66, hand(s, out=0.0, up=-0.1, fwd=0.04, tilt=25)),
                K(0.76, tada(s), 'back'), K(0.84, hand(s, out=0.24, up=0.78, fwd=0.06, tilt=-28)), K(d, hand(s))]

    def feet(s, t0):
        return [K(0, foot(s)), K(t0, foot(s)), K(t0 + 0.06, foot(s, out=0.06, up=0.08, pitch=-15)), K(t0 + 0.12, foot(s, out=0.04), 'linear'),
                K(0.66, foot(s, out=0.04)), K(0.72, foot(s, out=0.06, up=0.05), 'back'), K(0.78, foot(s, out=0.04), 'linear'), K(d, foot(s))]

    return clip('recover', d, False, 'happy', [[0.05, 'stars'], [0.76, 'sparkles']], {
        'body': [K(0, body(sy=0.88, rz=9)), K(0.12, body(y=0.02, sy=1.02, rx=5, rz=-9, ry=8)), K(0.24, body(sy=0.97, rx=-4, rz=8, ry=-6)),
                 K(0.36, body(y=0.01, sy=1.01, rx=3, rz=-5, ry=4)), K(0.48, body(ry=14)), K(0.54, body(ry=-14), 'linear'),
                 K(0.6, body(ry=10), 'linear'), K(0.66, body(sy=0.9), 'linear'), K(0.76, body(y=0.07, sy=1.1, rx=-6), 'back'),
                 K(0.84, body(y=0.04, sy=1.04, rx=-4)), K(d, body())],
        'hand.L': hands(1), 'hand.R': hands(-1),
        'foot.L': feet(1, 0.1), 'foot.R': feet(-1, 0.28),
        'cap': [K(0, cap(loc=(0.03, -0.02, 0), rot=(0, 0, -16))), K(0.24, cap(loc=(-0.02, 0, 0), rot=(0, 0, 10))),
                K(0.42, cap(rot=(0, 0, -8))), K(0.56, cap(rot=(0, 0, 6))), K(0.76, cap(loc=(0, 0.06, 0)), 'back'), K(d, cap())],
    }, 'Lands dizzy (cap askew, stars), wobbles in a circle, head-shake, ta-da with arms up.')


def surprise():
    """Startle: jumps back, hands up, eyes wide."""
    d = 0.7
    back = -0.2  # how far he jumps back (model units, away from the camera)
    up = lambda s, z: hand(s, out=0.18, up=0.68, fwd=z, tilt=-30)

    def feet(s):
        return [K(0, foot(s)), K(0.06, foot(s, up=0.04)), K(0.16, foot(s, up=0.16, fwd=back * 0.7, pitch=22)), K(0.28, foot(s, fwd=back), 'linear'),
                K(0.5, foot(s, fwd=back)), K(0.58 if s > 0 else 0.62, foot(s, up=0.07, fwd=back * 0.5)), K(d, foot(s))]

    return clip('surprise', d, False, 'surprised', [], {
        'body': [K(0, body()), K(0.06, body(y=0.06, z=back * 0.3, sy=1.12, rx=-10), 'linear'), K(0.16, body(y=0.18, z=back * 0.8, sy=1.06, rx=-12)),
                 K(0.28, body(z=back, sy=0.86, rx=-6), 'linear'), K(0.38, body(y=0.02, z=back, sy=1.04, rx=-4), 'back'),
                 K(0.52, body(z=back, rx=-3)), K(d, body())],
        'hand.L': [K(0, hand(1)), K(0.08, up(1, back * 0.4), 'back'), K(0.28, up(1, back)), K(0.5, hand(1, out=0.16, up=0.6, fwd=back, tilt=-24)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.08, up(-1, back * 0.4), 'back'), K(0.28, up(-1, back)), K(0.5, hand(-1, out=0.16, up=0.6, fwd=back, tilt=-24)), K(d, hand(-1))],
        'foot.L': feet(1), 'foot.R': feet(-1),
        'cap': [K(0, cap()), K(0.08, cap(loc=(0, 0.14, 0), rot=(-10, 0, 4)), 'back'), K(0.3, cap(loc=(0, 0.02, 0)), 'bounce'), K(d, cap())],
    }, 'Startle stretch 1.12, hops back 0.2, lands on a 0.86 squash, hands up palms out, cap pops.')


def hint():
    """'Aha!': mitten shoots up like a raised finger, then he leans in and wags it."""
    d = 1.1
    finger = lambda out, up, fwd, tilt, pitch=0.0: hand(1, out=out, up=up, fwd=fwd, pitch=pitch, tilt=tilt)
    return clip('hint', d, False, 'happy', [[0.28, 'ring']], {
        'body': [K(0, body()), K(0.12, body(sy=0.94, rx=4)), K(0.28, body(y=0.06, sy=1.07, rx=-6, rz=-4), 'back'), K(0.46, body(y=0.04, sy=1.03, rx=-5, rz=-3)),
                 K(0.6, body(z=0.08, sy=0.98, rx=12, rz=-2)), K(0.84, body(z=0.08, sy=0.99, rx=11, rz=2)), K(d, body())],
        'hand.L': [K(0, hand(1)), K(0.12, hand(1, up=-0.06, tilt=10)), K(0.28, finger(0.08, 0.84, 0.24, UPRIGHT), 'back'),
                   K(0.46, finger(0.1, 0.87, 0.24, UPRIGHT - 6)), K(0.62, finger(-0.04, 0.62, 0.46, UPRIGHT, -25)),
                   K(0.72, finger(-0.04, 0.64, 0.46, UPRIGHT + 12, -25)), K(0.82, finger(-0.04, 0.62, 0.46, UPRIGHT - 12, -25)),
                   K(0.92, finger(-0.04, 0.63, 0.46, UPRIGHT, -25)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.28, hand(-1, out=0.04, up=-0.04, fwd=-0.06, tilt=22)), K(0.84, hand(-1, out=0.04, up=-0.02, fwd=-0.04, tilt=20)), K(d, hand(-1))],
        'cap': [K(0, cap()), K(0.28, cap(loc=(0, 0.06, 0), rot=(-5, 0, -4)), 'back'), K(0.6, cap(rot=(4, 0, 0))), K(d, cap())],
    }, 'Anticipation dip, "aha!" with the mitten raised like a finger beside the cap, leans in 12 deg and wags it.')


def equip():
    """Grabs something from above, pulls it onto the cap, proud pose."""
    d = 1.0
    above = lambda s, lift, out=-0.42: hand(s, out=out, up=OVERHEAD + lift, fwd=0.06, tilt=-35)
    press = lambda s, up: hand(s, out=-0.18, up=up, fwd=0.06, tilt=UPRIGHT)
    proud = lambda s: hand(s, out=0.02, up=-0.04, fwd=-0.1, pitch=8, tilt=46)

    def hands(s):
        return [K(0, hand(s)), K(0.1, hand(s, up=-0.08, tilt=16)), K(0.28, above(s, 0.28), 'back'), K(0.38, above(s, 0.22, -0.5)),
                K(0.48, above(s, 0.02, -0.4)), K(0.56, press(s, 1.04)), K(0.64, press(s, 1.08)),
                K(0.76, proud(s), 'back'), K(0.92, proud(s)), K(d, hand(s))]

    return clip('equip', d, False, 'happy', [[0.6, 'sparkles']], {
        'body': [K(0, body()), K(0.1, body(sy=0.93)), K(0.28, body(y=0.1, sy=1.12, rx=-8), 'back'), K(0.38, body(y=0.08, sy=1.08, rx=-6)),
                 K(0.56, body(sy=0.94, rx=-2)), K(0.64, body(y=0.02, sy=1.02)), K(0.76, body(y=0.04, sy=1.06, rx=-9, rz=3), 'back'),
                 K(0.92, body(y=0.03, sy=1.04, rx=-8, rz=3)), K(d, body())],
        'hand.L': hands(1), 'hand.R': hands(-1),
        'foot.L': [K(0, foot(1)), K(0.76, foot(1)), K(0.82, foot(1, up=0.07, pitch=-15)), K(0.88, foot(1), 'linear'), K(d, foot(1))],
        'cap': [K(0, cap()), K(0.48, cap()), K(0.56, cap(loc=(0, -0.06, 0))), K(0.64, cap(loc=(0, 0.04, 0), rot=(-4, 0, 0)), 'back'),
                K(0.76, cap(rot=(0, 0, -5)), 'bounce'), K(d, cap())],
    }, 'Reaches up and grabs, pulls it down onto the cap (sparkles), chest-out proud pose with a heel tap.')


def read():
    """Studying: both mittens hold the open book (build_tutor BOOK), head bowed and centred.

    Deliberately still: no side-to-side scan, only a slow breath and a tiny
    page-corner lift, all eased (bezier). The cursor look is off while it plays.
    """
    d = 4.0
    lean = dict(rx=9)  # bowed toward the book
    grip = lambda s, up=0.0, fwd=0.0: hand(s, out=-0.54, up=-0.03 + up, fwd=0.66 + fwd, pitch=-30, tilt=-20)
    return clip('read', d, True, 'focused', [], {
        'body': looped([K(0, body(**lean)), K(2.0, body(y=0.008, sy=1.008, **lean))], d),
        'hand.L': looped([K(0, grip(1)), K(2.0, grip(1, up=0.008))], d),
        # His right mitten (viewer left) lifts a touch at the page corner.
        'hand.R': looped([K(0, grip(-1)), K(2.0, grip(-1, up=0.008)), K(2.6, grip(-1, up=0.03, fwd=0.02)), K(3.3, grip(-1, up=0.004))], d),
        'cap': looped([K(0, cap(rot=(4, 0, 0))), K(2.0, cap(rot=(4.5, 0, 0)))], d),
    }, 'Holding the open book in both mittens, bowed 9 deg, head centred and still: slow breath, small page-corner lift.')


def main():
    new = [dragged(), tumble(), recover(), surprise(), hint(), equip(), read()]
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
    print('wrote %d clips (%d extra) to %s' % (len(data['clips']), len(data['extra']), OUT))


if __name__ == '__main__':
    main()
