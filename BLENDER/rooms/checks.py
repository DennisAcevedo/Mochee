"""Build-time checks on a modelled room (before the bake): props in the
keep-out (CLEAR) or calm (CALM) boxes, props through a wall, the floating
window crossing a wall, and anything the lesson camera would draw over that
window. Each problem is one `ROOM WARN ...` line; the build carries on, so a
draft still exports.
"""

import math

from contract import *  # noqa: F403 (the contract's numbers and camera/window maths)

WINDOW_STATES = (('at rest', False), ('focused', True))


def check_zones(root):
    """Warns (ROOM WARN lines) about: props inside the keep-out (CLEAR) or calm
    (CALM) boxes, props poking through a wall, the window's outline crossing a
    wall (check_window_walls), and anything drawn over the floating window from
    the lesson camera, the walls and floor included (check_window)."""
    warnings = []
    meshes = [o for o in root.children_recursive if o.type == 'MESH']
    for ob in meshes:
        if ob.get('gg_shell') or ob.get('gg_decal'):
            continue
        pts = [from_blender(ob.matrix_world @ v.co) for v in ob.data.vertices]
        for zone, spec in CLEAR.items():
            lo, hi = spec['box']
            if any(ob.name.startswith(a) for a in spec['allow']):
                continue
            if any(all(lo[i] < p[i] < hi[i] for i in range(3)) for p in pts):
                warnings.append('clear zone %r: %s' % (zone, ob.name))
        for zone, (lo, hi) in CALM.items():
            if any(ob.name.startswith(a) for a in CALM_ALLOW):
                continue
            if any(all(lo[i] < p[i] < hi[i] for i in range(3)) for p in pts):
                warnings.append('calm zone %r (hidden by the floating window): %s' % (zone, ob.name))
        # Through a wall: hidden at rest, but a prop the app moves (a trophy's
        # level-up bounce) would show it cutting the wall.
        out = [max(BACK_Z - p.z, abs(p.x) - HALF_W) for p in pts]
        out = [d for d in out if d > 1e-3]
        if out:
            warnings.append('wall: %s has %d vertices behind a wall (up to %.3f)' % (ob.name, len(out), max(out)))
    warnings += check_window_walls()
    warnings += check_window(meshes)
    for w in warnings:
        print('ROOM WARN', w)
    return warnings


def check_window_walls():
    """The window's outline (the focus ring included when focused) against the
    walls' planes and the floor. A wall sits on its physics plane, so a window
    reaching past one is cut by it: the fix is the window's pose (APP['window'],
    from src/scene/layout3d.ts) or the physics room, never a wall moved off its
    plane. Pure contract: every room warns alike."""
    warnings = []
    for state, focused in WINDOW_STATES:
        pts = window_corners(focused)
        for plane, past in (('left wall (x %.2f)' % -HALF_W, -HALF_W - min(p.x for p in pts)),
                            ('right wall (x %.2f)' % HALF_W, max(p.x for p in pts) - HALF_W),
                            ('back wall (z %.2f)' % BACK_Z, BACK_Z - min(p.z for p in pts)),
                            ('floor (y 0)', -min(p.y for p in pts))):
            if past > 1e-4:
                warnings.append('window %s: its outline reaches %.3f past the %s, which hides that strip; '
                                'move the window (layout3d WINDOW / WINDOWS focus pose) or the physics room'
                                % (state, past, plane))
    return warnings


def _clip(poly, dist):
    """Sutherland-Hodgman: the part of convex polygon `poly` (room points) where
    the affine function dist(p) > 0, e.g. a signed distance to a plane."""
    out = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        da, db = dist(a), dist(b)
        if da > 0:
            out.append(a)
        if (da > 0) != (db > 0):
            out.append(a.lerp(b, da / (da - db)))
    return out


def _overlap(p, q, eps=1e-6):
    """Convex 2D polygons p, q [(x, y), ...] overlap by more than eps (separating
    axis test): sharing an edge or a corner does not count."""
    for poly in (p, q):
        for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
            nx, ny = ay - by, bx - ax
            length = math.hypot(nx, ny)
            if length < 1e-12:
                continue
            pa = [(nx * x + ny * y) / length for x, y in p]
            qa = [(nx * x + ny * y) / length for x, y in q]
            if min(max(pa), max(qa)) - max(min(pa), min(qa)) <= eps:
                return False
    return True


def check_window(meshes):
    """The floating window as the lesson camera sees it, at rest and focused
    (camera panned, window scaled, lifted and outlined): warns about every mesh,
    walls and floor included, with a triangle that hides part of the page. Each
    triangle is clipped to the camera's side of the window's plane (and in front
    of the near plane), projected, and tested for overlap with the window's
    outline, so a big face that covers the window with every vertex outside the
    outline still counts (the bookcase once hid its progress bar; the left wall
    cuts the focused window's ring)."""
    warnings = []
    near = APP['camera']['near']
    for state, focused in WINDOW_STATES:
        pan = window_pose(focused)[3]
        project = projector(pan)
        eye, fwd = camera_basis(pan)[:2]
        corners = window_corners(focused)
        quad = [project(c)[:2] for c in corners]
        bl, br, _, tl = corners
        n = (br - bl).cross(tl - bl).normalized()
        if n.dot(eye - bl) < 0:
            n = -n

        def front(p):  # metres in front of the window's plane, toward the camera
            return n.dot(p - bl) - 1e-4

        def seen(p):  # in front of the camera's near plane
            return (p - eye).dot(fwd) - near

        for ob in meshes:
            me = ob.data
            me.calc_loop_triangles()
            mw = ob.matrix_world
            pts = [from_blender(mw @ v.co) for v in me.vertices]
            ahead = [front(p) > 0 for p in pts]
            hit = 0
            for lt in me.loop_triangles:
                if not any(ahead[i] for i in lt.vertices):
                    continue
                poly = _clip(_clip([pts[i] for i in lt.vertices], front), seen)
                if len(poly) >= 3 and _overlap([project(p)[:2] for p in poly], quad):
                    hit += 1
            if hit:
                warnings.append('window %s: %s is drawn over it (%d triangles in front of it, inside its outline)'
                                % (state, ob.name, hit))
    return warnings
