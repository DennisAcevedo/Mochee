"""Play-tab clips: basketball, soccer and jump rope (plain Python 3, no Blender needed).

  python blender/tutor/author_play.py

Merges the play_* clips into clips.json's "extra" list (and into "clips"), the
same way author_extra.py does, so an author_clips.py rerun keeps them and the
next build_tutor.py run exports them. Uses author_clips.py's pose helpers and
tassel simulation; axes are three.js (x right, y up, z toward the camera,
.L = his left = +x), model units, floor at y = 0, times in seconds (60 fps).

The ball, hoop and rope are NOT part of the character: the app adds them as
props and moves them in code. Every ball clip carries a "ball" block:

  follow  {bone, node, offset}: while the ball is held, its centre is the
          bone's position in the root frame plus `offset` (root frame, not
          rotated with the bone). node = the three.js name (GLTFLoader drops
          the '.'). The hands and feet are children of the root bone, so in
          three.js this is handR.position + offset when the ball is a child
          of the root node.
  events  [{kind, t, frame, pos, bone?}]: pos = ball centre (root frame) at t.
          grab/catch = attach to `follow`; release = detach and fly;
          push = dribble hand lets go downward; bounce = ball on the floor;
          contact = a foot strikes the ball; apex = top of a juggle arc.
  launch  suggested unit direction for the flight after a release/contact.

Hands and feet rest at REST below (build_tutor HAND/FOOT rest); every
position here is authored in that root frame, so event positions are exact
at their key times.
"""

import json
import os

from author_clips import OUT, UPRIGHT, K, body, cap, clip, foot, hand, looped, r3

FPS = 60
BALL_R = 0.2  # ball radius the offsets assume (model units; body radius 0.8)
REST = {'hand.L': (0.95, 0.72, 0.28), 'hand.R': (-0.95, 0.72, 0.28),
        'foot.L': (0.27, 0.085, 0.08), 'foot.R': (-0.27, 0.085, 0.08)}
GRIP = BALL_R + 0.11  # two-hand hold: hand centres sit this far either side of the ball centre...
GRIP_DY = 0.03  # ...and this far below it
PALM = BALL_R + 0.11  # palm-down hand on top of the ball: ball centre this far below the hand centre
PALM_DOWN = 100  # hand pitch that turns the mitten palm-down, fingers toward the camera
TOE = BALL_R + 0.08  # juggle: ball centre this far above the foot centre at a touch...
TOE_Z = 0.03  # ...and this far in front of it


def hand_at(s, p, pitch=0.0, yaw=0.0, tilt=0.0):
    """Hand centre at root-frame point p (s = +1 hand.L, -1 hand.R)."""
    rx, ry, rz = REST['hand.L' if s > 0 else 'hand.R']
    return hand(s, out=s * (p[0] - rx), up=p[1] - ry, fwd=p[2] - rz, pitch=pitch, yaw=yaw, tilt=tilt)


def foot_at(s, p, pitch=0.0, yaw=0.0):
    rx, ry, rz = REST['foot.L' if s > 0 else 'foot.R']
    return foot(s, out=s * (p[0] - rx), up=p[1] - ry, fwd=p[2] - rz, pitch=pitch, yaw=yaw)


def grip(s, c, pitch=0.0, yaw=90.0):
    """Two-hand hold of a ball centred at c: palms on its sides, thumbs toward the camera."""
    return hand_at(s, (c[0] + s * GRIP, c[1] - GRIP_DY, c[2]), pitch=pitch, yaw=yaw, tilt=UPRIGHT)


def palm(s, c):
    """Palm-down hand on top of a ball centred at c."""
    return hand_at(s, (c[0], c[1] + PALM, c[2]), pitch=PALM_DOWN, tilt=UPRIGHT)


def mirror(p):
    return (-p[0], p[1], p[2])


def ev(kind, t, pos=None, bone=None):
    out = {'kind': kind, 't': round(t, 4), 'frame': int(round(t * FPS))}
    if pos is not None:
        out['pos'] = r3(pos)
    if bone:
        out['bone'] = bone
    return out


def ball(follow, events, launch=None):
    out = {'radius': BALL_R, 'events': events}
    if follow:
        bone, offset = follow
        out['follow'] = {'bone': bone, 'node': bone.replace('.', ''), 'offset': r3(offset)}
    if launch:
        n = sum(c * c for c in launch) ** 0.5
        out['launch'] = r3([c / n for c in launch])
    return out


# ---------------------------------------------------------------------------
# Basketball

def play_shoot():
    """Jump shot: gather at the belly, deep crouch, jump, both hands push up and flick."""
    d = 1.2
    path = [(0.10, (0, 0.7, 1.08)), (0.22, (0, 0.62, 1.14)), (0.34, (0, 1.45, 1.08), 'linear'),
            (0.44, (0, 2.05, 0.98)), (0.50, (0, 2.5, 1.04), 'linear')]
    release = path[-1]

    def hands(s):
        keys = [K(0, hand(s)), K(0.05, hand_at(s, (s * 0.86, 0.72, 0.74), yaw=45, tilt=UPRIGHT))]
        keys += [K(p[0], grip(s, p[1]), p[2] if len(p) > 2 else None) for p in path]
        keys += [K(0.56, hand_at(s, (s * 0.22, 2.68, 1.06), pitch=60, yaw=90, tilt=UPRIGHT)),
                 K(0.66, hand_at(s, (s * 0.24, 2.6, 1.02), pitch=72, yaw=90, tilt=UPRIGHT)),
                 K(0.78, hand_at(s, (s * 0.8, 1.55, 0.6), pitch=20, yaw=40, tilt=UPRIGHT)),
                 K(0.92, hand_at(s, (s * 1.04, 0.9, 0.36), tilt=10)), K(d, hand(s))]
        return keys

    def feet(s):
        return [K(0, foot(s)), K(0.26, foot(s)), K(0.34, foot(s, up=0.2, pitch=25), 'linear'), K(0.48, foot(s, out=-0.03, up=0.4, pitch=12)),
                K(0.6, foot(s, out=-0.03, up=0.36, pitch=6)), K(0.72, foot(s, up=0.0, pitch=-10), 'linear'), K(0.76, foot(s), 'linear'), K(d, foot(s))]

    return clip('play_shoot', d, False, 'focused', [[0.76, 'ring']], {
        'body': [K(0, body()), K(0.1, body(sy=0.92, rx=4)), K(0.22, body(sy=0.8, rx=6)), K(0.3, body(y=0.12, sy=1.12, rx=-2), 'linear'),
                 K(0.4, body(y=0.36, sy=1.06, rx=-4)), K(0.5, body(y=0.45, sy=1.02, rx=-4)), K(0.6, body(y=0.42, rx=-2)),
                 K(0.72, body(sy=1.06), 'linear'), K(0.78, body(sy=0.84), 'linear'), K(0.9, body(y=0.03, sy=1.04), 'back'), K(d, body())],
        'hand.L': hands(1), 'hand.R': hands(-1), 'foot.L': feet(1), 'foot.R': feet(-1),
        'cap': [K(0, cap()), K(0.3, cap(loc=(0, -0.03, 0))), K(0.5, cap(loc=(0, 0.05, 0), rot=(-6, 0, 3)), 'back'),
                K(0.78, cap(loc=(0, -0.02, 0)), 'linear'), K(0.95, cap(), 'bounce'), K(d, cap())],
    }, 'Gather at the belly, crouch 0.80, jump 0.45, both hands push the ball up and flick at 0.50 s, land on a 0.84 squash.') | {
        'ball': ball(('hand.R', (GRIP, GRIP_DY, 0)), [ev('grab', 0.10, path[0][1]), ev('release', release[0], release[1])],
                     launch=(0, 7.5, 1.0))}


def play_dribble():
    """Loop: two dribbles at his left side (viewer right), knees bob, eyes on the ball."""
    d = 0.8
    lane = (1.18, 0.42)  # ball x, z
    top, low, high = 1.05, 0.76, 1.1  # hand centre heights: catch, push (lets go), recovery
    at = lambda y: palm(1, (lane[0], y - PALM, lane[1]))
    hand_keys = []
    for c0 in (0.0, 0.4):
        hand_keys += [K(c0, at(top)), K(c0 + 0.1, at(low), 'linear'), K(c0 + 0.28, at(high))]
    events = []
    for c0 in (0.0, 0.4):
        events += [ev('catch', c0, (lane[0], top - PALM, lane[1])), ev('push', c0 + 0.1, (lane[0], low - PALM, lane[1])),
                   ev('bounce', c0 + 0.2, (lane[0], BALL_R, lane[1]))]
    lean = dict(ry=10)
    return clip('play_dribble', d, True, 'happy', [], {
        'body': looped([K(0, body(rz=-4, **lean)), K(0.1, body(sy=0.93, rx=4, rz=-5, **lean)), K(0.28, body(y=0.012, sy=1.01, rz=-3, **lean)),
                        K(0.4, body(rz=-5, **lean)), K(0.5, body(sy=0.93, rx=4, rz=-6, **lean)), K(0.68, body(y=0.012, sy=1.01, rz=-3, **lean))], d),
        'hand.L': looped(hand_keys, d),
        'hand.R': looped([K(0, hand_at(-1, (-1.12, 0.9, 0.34), tilt=30)), K(0.2, hand_at(-1, (-1.13, 0.86, 0.36), tilt=34)),
                          K(0.4, hand_at(-1, (-1.12, 0.92, 0.34), tilt=28)), K(0.6, hand_at(-1, (-1.13, 0.86, 0.36), tilt=34))], d),
        'foot.L': looped([K(0, foot(1, out=0.08, yaw=8))], d),
        'foot.R': looped([K(0, foot(-1, out=0.05))], d),
        'cap': looped([K(0, cap(rot=(0, 0, -3))), K(0.2, cap(loc=(0, -0.01, 0), rot=(2, 0, -4))), K(0.4, cap(rot=(0, 0, -3))),
                       K(0.6, cap(loc=(0, -0.01, 0), rot=(2, 0, -5)))], d),
    }, 'Two dribbles per loop with his left hand (viewer right): the hand pushes down and lets go at 0.10/0.50 s, '
       'the ball bounces at 0.20/0.60 s and is back in the hand at 0.40/0.80 s.') | {
        'ball': ball(('hand.L', (0, -PALM, 0)), events, launch=(0, -1, 0))}


def play_dunk():
    """Two stutter steps palming the ball, deep gather, rocket jump, reach high and slam."""
    d = 1.5
    carry = [(0.1, (1.12, 0.84, 0.42)), (0.2, (1.14, 0.8, 0.48)), (0.32, (1.14, 0.84, 0.52)), (0.44, (1.08, 0.7, 0.55)),
             (0.58, (0.85, 1.75, 0.66), 'linear'), (0.72, (0.72, 3.3, 0.74)), (0.8, (0.8, 2.7, 0.9), 'linear')]
    grab, release = carry[0], carry[-1]
    ball_at = lambda p: (p[0], p[1] - PALM, p[2])
    hand_l = [K(0, hand(1))] + [K(c[0], palm(1, ball_at(c[1])), c[2] if len(c) > 2 else None) for c in carry]
    hand_l += [K(0.88, palm(1, ball_at((0.8, 2.64, 0.9)))), K(0.96, hand_at(1, (0.95, 2.05, 0.75), pitch=40, tilt=-10)),
               K(1.04, hand_at(1, (1.02, 1.25, 0.45), tilt=10)), K(1.2, hand_at(1, (1.06, 0.88, 0.32), tilt=15)), K(d, hand(1))]
    hand_r = [K(0, hand(-1)), K(0.2, hand_at(-1, (-1.0, 0.82, 0.48), pitch=-20, tilt=10)), K(0.32, hand_at(-1, (-1.12, 0.72, 0.12), pitch=20, tilt=15)),
              K(0.44, hand_at(-1, (-1.18, 0.66, 0.3), tilt=25)), K(0.58, hand_at(-1, (-0.85, 1.6, 0.5), tilt=-10), 'linear'),
              K(0.72, hand_at(-1, (-0.55, 2.62, 0.5), tilt=UPRIGHT)), K(0.8, hand_at(-1, (-0.5, 2.5, 0.56), pitch=20, tilt=UPRIGHT)),
              K(0.88, hand_at(-1, (-0.5, 2.46, 0.58), pitch=20, tilt=UPRIGHT)), K(1.04, hand_at(-1, (-1.02, 1.25, 0.45), tilt=10)),
              K(1.2, hand_at(-1, (-1.06, 0.88, 0.32), tilt=15)), K(d, hand(-1))]

    def feet(s, lift):
        f0 = 0.1 if s < 0 else 0.12  # where each step plants (fwd)
        planted = foot(s, fwd=f0)
        return [K(0, foot(s)), K(lift - 0.06, foot(s)), K(lift, foot(s, up=0.12, fwd=f0 * 0.6, pitch=20)), K(lift + 0.06, planted, 'linear'),
                K(0.5, planted), K(0.58, foot(s, up=0.28, fwd=f0, pitch=25), 'linear'),
                K(0.72, foot(s, out=-0.04, up=0.52 if s > 0 else 0.46, fwd=0.24 if s > 0 else 0.06, pitch=-15 if s > 0 else 20)),
                K(0.88, foot(s, out=-0.03, up=0.42, fwd=0.1, pitch=10)), K(0.96, foot(s, up=0.24, fwd=f0, pitch=5)),
                K(1.04, foot(s, fwd=f0), 'linear'), K(1.34 if s > 0 else 1.22, foot(s, fwd=f0)), K(1.39 if s > 0 else 1.27, foot(s, up=0.07, fwd=f0 * 0.5)),
                K(1.45 if s > 0 else 1.33, foot(s), 'linear'), K(d, foot(s))]

    return clip('play_dunk', d, False, 'happy', [[0.82, 'sparkles'], [1.06, 'ring']], {
        'body': [K(0, body()), K(0.1, body(z=0.02, rx=6)), K(0.14, body(y=0.07, sy=1.04, rx=8, z=0.05)), K(0.2, body(sy=0.94, rx=8, z=0.06)),
                 K(0.26, body(y=0.07, sy=1.04, rx=8, z=0.08)), K(0.32, body(sy=0.92, rx=8, z=0.08)), K(0.44, body(sy=0.76, rx=8, z=0.06)),
                 K(0.58, body(y=0.32, sy=1.16, rx=-4, z=0.04), 'linear'), K(0.72, body(y=0.62, sy=1.04, rx=-6)),
                 K(0.8, body(y=0.56, sy=1.06, rx=4, rz=-4)), K(0.88, body(y=0.5, sy=1.08, rx=2, rz=-3)), K(0.96, body(y=0.3, sy=1.04)),
                 K(1.04, body(sy=1.06), 'linear'), K(1.1, body(sy=0.8), 'linear'), K(1.22, body(y=0.04, sy=1.05), 'back'), K(d, body())],
        'hand.L': hand_l, 'hand.R': hand_r, 'foot.L': feet(1, 0.26), 'foot.R': feet(-1, 0.14),
        'cap': [K(0, cap()), K(0.58, cap(loc=(0, -0.03, 0))), K(0.72, cap(loc=(0, 0.06, 0), rot=(-8, 0, 4)), 'back'),
                K(0.8, cap(loc=(0, -0.02, 0.02), rot=(6, 0, -4)), 'linear'), K(1.1, cap(loc=(0, -0.03, 0)), 'linear'), K(1.3, cap(), 'bounce'), K(d, cap())],
    }, 'Palms the ball (his left hand), two stutter steps, gather 0.76, jump 0.62, reaches high and slams it down at 0.80 s, '
       'hangs a beat, lands on a 0.80 squash.') | {
        'ball': ball(('hand.L', (0, -PALM, 0)), [ev('grab', grab[0], ball_at(grab[1])), ev('release', release[0], ball_at(release[1]))],
                     launch=(1.0, -7.5, 2.0))}


# ---------------------------------------------------------------------------
# Soccer

def play_kick():
    """Plant, wind up, swing his left foot through the ball, follow through high."""
    d = 1.1
    spot = (0.3, BALL_R, 0.72)  # the ball waits here on the floor
    contact = 0.35
    return clip('play_kick', d, False, 'focused', [[contact, 'ring']], {
        'body': [K(0, body()), K(0.1, body(z=0.1, rx=5, rz=3, ry=4)), K(0.22, body(z=0.06, sy=0.96, rx=-2, rz=6, ry=8)),
                 K(contact, body(z=0.08, sy=0.94, rx=-4, rz=2), 'linear'), K(0.46, body(y=0.03, z=0.02, sy=1.04, rx=-10, ry=-14)),
                 K(0.56, body(y=0.02, z=0.02, sy=1.03, rx=-9, ry=-12)), K(0.76, body(z=0.08, sy=0.94, rx=4)), K(0.9, body(z=0.06, rx=2)), K(d, body())],
        'foot.L': [K(0, foot(1)), K(0.1, foot(1)), K(0.22, foot_at(1, (0.85, 0.34, -0.2), pitch=30)),
                   K(contact, foot_at(1, (0.3, 0.13, 0.38)), 'linear'), K(0.46, foot_at(1, (0.1, 0.6, 1.0), pitch=-45)),
                   K(0.56, foot_at(1, (0.08, 0.58, 0.97), pitch=-40)), K(0.7, foot_at(1, (0.27, 0.14, 0.42), pitch=-5)),
                   K(0.76, foot_at(1, (0.27, 0.085, 0.36)), 'linear'), K(0.9, foot_at(1, (0.27, 0.085, 0.36))),
                   K(0.98, foot_at(1, (0.27, 0.15, 0.2), pitch=10)), K(1.06, foot(1), 'linear'), K(d, foot(1))],
        'foot.R': [K(0, foot(-1)), K(0.05, foot_at(-1, (-0.25, 0.14, 0.25), pitch=15)), K(0.1, foot_at(-1, (-0.24, 0.085, 0.42)), 'linear'),
                   K(0.84, foot_at(-1, (-0.24, 0.085, 0.42))), K(0.9, foot_at(-1, (-0.26, 0.14, 0.25), pitch=15)),
                   K(0.96, foot(-1), 'linear'), K(d, foot(-1))],
        'hand.L': [K(0, hand(1)), K(0.1, hand_at(1, (1.02, 0.8, 0.3), tilt=15)), K(0.22, hand_at(1, (1.15, 0.95, 0.0), tilt=40)),
                   K(contact, hand_at(1, (1.12, 0.92, 0.18), tilt=35)), K(0.46, hand_at(1, (1.2, 1.05, -0.1), tilt=50), 'back'),
                   K(0.62, hand_at(1, (1.15, 1.0, 0.0), tilt=45)), K(0.85, hand_at(1, (1.0, 0.8, 0.25), tilt=15)), K(d, hand(1))],
        'hand.R': [K(0, hand(-1)), K(0.1, hand_at(-1, (-1.0, 0.8, 0.4), tilt=15)), K(0.22, hand_at(-1, (-0.95, 0.88, 0.62), pitch=-20, tilt=20)),
                   K(contact, hand_at(-1, (-1.0, 0.92, 0.5), tilt=30)), K(0.46, hand_at(-1, (-1.1, 1.08, 0.66), pitch=-25, tilt=45), 'back'),
                   K(0.62, hand_at(-1, (-1.08, 1.0, 0.6), pitch=-20, tilt=40)), K(0.85, hand_at(-1, (-1.0, 0.8, 0.4), tilt=15)), K(d, hand(-1))],
        'cap': [K(0, cap()), K(0.22, cap(rot=(-3, 0, 4))), K(contact, cap(loc=(0, -0.02, 0), rot=(4, 0, -2)), 'linear'),
                K(0.5, cap(loc=(0, 0.03, 0), rot=(-6, 0, 3)), 'back'), K(0.8, cap(), 'bounce'), K(d, cap())],
    }, 'Steps his right foot in beside the ball, swings his left foot out to the side, strikes at 0.35 s, follows through '
       'across his body'
       ' with a lean back and arms out, steps back to rest.') | {
        'ball': ball(None, [ev('rest', 0.0, spot), ev('contact', contact, spot, 'foot.L')], launch=(-0.25, 0.45, 0.86))}


def play_juggle():
    """Loop: keepy-uppy, alternating feet, the ball crossing in front of his belly."""
    d = 0.8
    touch = (0.36, 0.18, 0.9)  # foot.L centre at a touch; foot.R mirrors it
    seq = [(0.0, touch, -12, 'linear'), (0.05, (0.36, 0.23, 0.88), -18, None), (0.13, (0.32, 0.12, 0.42), 0, None),
           (0.2, (0.27, 0.085, 0.12), 0, 'linear'), (0.4, (0.27, 0.085, 0.12), 0, None), (0.6, (0.27, 0.085, 0.12), 0, None),
           (0.67, (0.31, 0.13, 0.5), 5, None), (0.75, (0.35, 0.15, 0.83), -8, None)]

    def feet(s, ph):
        keys = sorted(((t + ph) % d, p if s > 0 else mirror(p), pitch, e) for t, p, pitch, e in seq)
        keys = [K(t, foot_at(s, p, pitch=pitch), e) for t, p, pitch, e in keys]
        return keys + [K(d, keys[0][1], keys[0][2] if len(keys[0]) > 2 else None)]

    def ball_at(s):
        return (s * touch[0], touch[1] + TOE, touch[2] + TOE_Z)

    apex = round(touch[1] + TOE + 0.5 * 9.8 * 0.2 ** 2, 3)  # free flight: 0.2 s up, 0.2 s down
    events = [ev('contact', 0.0, ball_at(1), 'foot.L'), ev('apex', 0.2, (0, apex, touch[2] + TOE_Z)),
              ev('contact', 0.4, ball_at(-1), 'foot.R'), ev('apex', 0.6, (0, apex, touch[2] + TOE_Z))]
    over = dict(rx=8, z=-0.06)  # leans over the ball, base back: keeps his belly clear of it
    return clip('play_juggle', d, True, 'happy', [], {
        'body': looped([K(0, body(sy=0.97, rz=3, **over)), K(0.2, body(y=0.015, sy=1.02, **over)),
                        K(0.4, body(sy=0.97, rz=-3, **over)), K(0.6, body(y=0.015, sy=1.02, **over))], d),
        'foot.L': feet(1, 0.0), 'foot.R': feet(-1, 0.4),
        'hand.L': looped([K(0, hand_at(1, (1.1, 0.66, 0.22), tilt=35)), K(0.4, hand_at(1, (1.08, 0.95, 0.28), tilt=15))], d),
        'hand.R': looped([K(0, hand_at(-1, (-1.08, 0.95, 0.28), tilt=15)), K(0.4, hand_at(-1, (-1.1, 0.66, 0.22), tilt=35))], d),
        'cap': looped([K(0, cap(rot=(4, 0, 3))), K(0.4, cap(rot=(4, 0, -3)))], d),
    }, 'Keepy-uppy: his left foot taps the ball at 0, his right at 0.40 s; the ball arcs across in front of his belly '
       '(apex 0.66 at 0.20/0.60 s); he leans over it with arms out for balance.') | {
        'ball': ball(None, events, launch=(-2 * touch[0] / 0.4, 9.8 * 0.2, 0))}


# ---------------------------------------------------------------------------
# Catch and throw, jump rope

def play_catch_throw():
    """Hands up ready, catch at the belly, absorb, chest pass back toward the camera."""
    d = 1.3
    catch_at, absorb, cock, release = (0, 0.62, 1.18), (0, 0.56, 1.06), (0, 0.66, 1.04), (0, 0.72, 1.44)

    def hands(s):
        return [K(0, hand(s)), K(0.06, hand_at(s, (s * 0.98, 0.78, 0.55), tilt=10)), K(0.14, hand_at(s, (s * 0.55, 0.95, 1.0), pitch=-10, tilt=UPRIGHT), 'back'),
                K(0.24, hand_at(s, (s * 0.42, 0.7, 1.2), pitch=-10, tilt=UPRIGHT)), K(0.3, grip(s, catch_at), 'linear'),
                K(0.42, grip(s, absorb)), K(0.56, grip(s, cock)), K(0.65, grip(s, release), 'linear'),
                K(0.74, hand_at(s, (s * 0.32, 0.74, 1.62), pitch=-10, yaw=120, tilt=UPRIGHT)),
                K(0.86, hand_at(s, (s * 0.34, 0.74, 1.54), pitch=-10, yaw=115, tilt=UPRIGHT)),
                K(1.02, hand_at(s, (s * 0.8, 0.78, 0.6), yaw=30, tilt=10)), K(d, hand(s))]

    return clip('play_catch_throw', d, False, 'happy', [[0.3, 'ring']], {
        'body': [K(0, body()), K(0.14, body(sy=0.95, rx=4, z=0.03)), K(0.3, body(sy=0.96, rx=2, z=0.03)), K(0.42, body(sy=0.9, rx=-6, z=-0.05)),
                 K(0.56, body(sy=1.02, rx=-6, z=-0.08)), K(0.65, body(sy=1.04, rx=8, z=0.08), 'linear'), K(0.76, body(sy=0.98, rx=9, z=0.1)),
                 K(0.9, body(y=0.02, rx=4, z=0.06)), K(d, body())],
        'hand.L': hands(1), 'hand.R': hands(-1),
        'foot.R': [K(0, foot(-1)), K(0.56, foot(-1)), K(0.62, foot_at(-1, (-0.26, 0.15, 0.25), pitch=15)),
                   K(0.68, foot_at(-1, (-0.25, 0.085, 0.36)), 'linear'), K(1.0, foot_at(-1, (-0.25, 0.085, 0.36))),
                   K(1.08, foot_at(-1, (-0.26, 0.14, 0.2), pitch=10)), K(1.16, foot(-1), 'linear'), K(d, foot(-1))],
        'cap': [K(0, cap()), K(0.3, cap(loc=(0, 0.03, 0), rot=(-5, 0, 0)), 'back'), K(0.42, cap(rot=(4, 0, 0))),
                K(0.65, cap(rot=(-4, 0, 0)), 'linear'), K(0.9, cap(), 'bounce'), K(d, cap())],
    }, 'Hands up ready, catches the ball at his belly at 0.30 s (absorb squash 0.90), cocks it to his chest and '
       'chest-passes it back toward the camera, letting go at 0.65 s with a step in.') | {
        'ball': ball(('hand.R', (GRIP, GRIP_DY, 0)), [ev('catch', 0.3, catch_at), ev('release', 0.65, release)], launch=(0, 0.06, 0.4))}


def play_jumprope():
    """Loop: one skip per 0.5 s, feet together, hands turning small circles at his sides."""
    d = 0.5
    # Handle circles (y, z) around (0.66, 0.3): top at 0 (rope overhead), bottom at 0.25 (rope under his feet).
    ring = [(0.0, (0.75, 0.3), -15), (0.125, (0.66, 0.39), 0), (0.25, (0.57, 0.3), 15), (0.375, (0.66, 0.21), 0)]

    def hands(s):
        return looped([K(t, hand_at(s, (s * 1.08, y, z), pitch=p, tilt=10)) for t, (y, z), p in ring], d)

    def feet(s):
        return [K(0, foot(s, out=-0.05)), K(0.08, foot(s, out=-0.05)), K(0.25, foot(s, out=-0.05, up=0.14, pitch=18)),
                K(0.44, foot(s, out=-0.05), 'linear'), K(d, foot(s, out=-0.05))]

    return clip('play_jumprope', d, True, 'happy', [], {
        'body': [K(0, body(sy=0.9)), K(0.08, body(y=0.03, sy=1.06), 'linear'), K(0.25, body(y=0.16, sy=1.02)),
                 K(0.44, body(y=0.0, sy=1.05), 'linear'), K(d, body(sy=0.9), 'linear')],
        'hand.L': hands(1), 'hand.R': hands(-1), 'foot.L': feet(1), 'foot.R': feet(-1),
        'cap': looped([K(0, cap(loc=(0, -0.02, 0))), K(0.25, cap(loc=(0, 0.02, 0)))], d),
    }, 'Skips over a rope the app draws between his hands: hands at the top of their circles at 0 (rope overhead), '
       'at the bottom at 0.25 s while he is in the air (rope under his feet).') | {
        'rope': {'bones': ['hand.L', 'hand.R'], 'nodes': ['handL', 'handR'],
                 'events': [ev('rope_over', 0.0), ev('rope_under', 0.25)],
                 'phase': 'rope angle = 360 deg * t / 0.5 s, 0 = overhead, 180 = under his feet (front at 90 deg)'}}


def play_clips():
    return [play_shoot(), play_dribble(), play_dunk(), play_kick(), play_juggle(), play_catch_throw(), play_jumprope()]


def main():
    new = play_clips()
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
