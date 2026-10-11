"""Preview render of a built room from the app's own lesson camera (dev only,
run after export so nothing here lands in the GLB): the tutor GLB on his
spot for scale, a ghost of the floating window (in its focused pose, with
its focus outline, when the camera is panned: --pan -0.9), and optionally
the ball's flight to the hoop.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from contract import *  # noqa: F403 (the contract's numbers, palettes and axis helpers)
from pipeline import _unlit

# ---------------------------------------------------------------------------
# Preview: the room from the app's camera (dev only, after export)


def look_at(eye, target):
    q = (target - eye).normalized().to_track_quat('-Z', 'Y')
    return Matrix.Translation(eye) @ q.to_matrix().to_4x4()


def frustum(viewport=None, frame=None):
    """Tangent extents (left, right, top, bottom) of the full canvas as CameraRig
    projects it: the 16:9 frame at fov, widened by setViewOffset to the window."""
    cam = APP['camera']
    vw, vh = viewport or cam['viewport']
    fx, fy, fw, fh = frame or cam['frame']
    tv = math.tan(math.radians(cam['fov'] / 2))
    a = fw / fh
    left = -tv * a * (1 + 2 * fx / fw)
    right = left + 2 * tv * a * vw / fw
    top = tv * (1 + 2 * fy / fh)
    bottom = top - 2 * tv * vh / fh
    return left, right, top, bottom


def app_camera(*, pan=0.0, viewport=None, frame=None):
    """A Blender camera matching the app's lesson camera on a full window (lens +
    shift reproduce the view offset); sets the scene resolution to the window."""
    cam = APP['camera']
    vw, vh = viewport or cam['viewport']
    left, right, top, bottom = frustum(viewport, frame)
    data = bpy.data.cameras.new('app_camera')
    data.sensor_fit = 'HORIZONTAL'
    data.sensor_width = 36.0
    data.lens = data.sensor_width / (right - left)
    data.shift_x = (left + right) / 2 / (right - left)
    data.shift_y = (top + bottom) / 2 / (right - left)
    data.clip_start, data.clip_end = cam['near'], cam['far']
    ob = bpy.data.objects.new('app_camera', data)
    bpy.context.scene.collection.objects.link(ob)
    p, t = cam['position'], cam['target']
    ob.matrix_world = look_at(T(p[0] + pan, p[1], p[2]), T(t[0] + pan, t[1], t[2]))
    scene = bpy.context.scene
    scene.camera = ob
    scene.render.resolution_x, scene.render.resolution_y = vw, vh
    return ob


def _preview_mat(name, hex_, alpha=1.0):
    def hook(nt, sock):
        sock.default_value = (*hex_linear(hex_), 1.0)
    m = _unlit(name, hook)
    if alpha < 1:
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        mix.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(out.inputs['Surface'].links[0].from_socket, mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def _add_tutor():
    """public/models/tutor.glb on his centre spot at TUTOR_SCALE, for scale."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=TUTOR_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    holder = bpy.data.objects.new('preview_tutor', None)
    bpy.context.scene.collection.objects.link(holder)
    holder.location = T(*APP['tutor']['spot'])
    s = APP['tutor']['scale']
    holder.scale = (s, s, s)
    for o in new:
        if o.parent is None:
            o.parent = holder
        if o.name.startswith('happy'):
            o.hide_render = True
    return holder


def _quads(name, quads, material):
    """One preview mesh of flat quads, each four room points."""
    bm = bmesh.new()
    for q in quads:
        bm.faces.new([bm.verts.new(T(*p)) for p in q])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    bpy.context.scene.collection.objects.link(bpy.data.objects.new(name, me))


def _add_ghosts(focused=False):
    """The floating window (contract APP['window']) ghosted in: at rest, or
    focused (turned, scaled, lifted) with its teal focus outline, to match a
    render from the focused camera (--pan -0.9)."""
    w = APP['window']
    bl, br, tr, tl = window_corners(focused, ring=False)
    n = (br - bl).cross(tl - bl).normalized()  # toward the camera
    _quads('ghost_window', [(bl, br, tr, tl)], _preview_mat('ghost_window', '#FFFFFF', PREVIEW['ghost']))
    # Header bar in the accent along the top, a hair in front, so the ghost reads as a window.
    k = 1 - 0.18 / w['size'][1]
    lo_l, lo_r = bl.lerp(tl, k) + n * 0.005, br.lerp(tr, k) + n * 0.005
    edge = _preview_mat('ghost_bar', PREVIEW['ghost_edge'], 0.8)
    _quads('ghost_bar', [(lo_l, lo_r, tr + n * 0.005, tl + n * 0.005)], edge)
    if focused:
        # The outline: a stroke from ring_gap out to ring round the window.
        outer = window_corners(True, ring=True)
        inner = [c.lerp(o, w['ring_gap'] / w['ring']) for c, o in zip((bl, br, tr, tl), outer)]
        _quads('ghost_ring', [(inner[i], inner[(i + 1) % 4], outer[(i + 1) % 4], outer[i]) for i in range(4)], edge)


def shot_arc(n=40, apex=None):
    """The ball's flight from the release point to the rim centre as room points,
    a parabola peaking at `apex` (default 0.2 under the app's apex cap)."""
    s, e = Vector(APP['release']), Vector(APP['hoop']['rim'])
    k = (apex or APP['shot_apex_max'] - 0.2) - s.y
    m = e.y - s.y
    b = 2 * k + 2 * math.sqrt(max(0.0, k * (k - m)))
    a = b - m
    return [Vector((s.x + (e.x - s.x) * u, s.y + b * u - a * u * u, s.z + (e.z - s.z) * u)) for u in (i / n for i in range(n + 1))]


def _add_guides():
    cu = bpy.data.curves.new('guide_arc', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.025
    sp = cu.splines.new('POLY')
    pts = shot_arc()
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (*T(*q), 1)
    ob = bpy.data.objects.new('guide_arc', cu)
    ob.data.materials.append(_preview_mat('guide', PREVIEW['guide']))
    bpy.context.scene.collection.objects.link(ob)


def render_preview(path, *, tutor=True, ghosts=True, guides=False, pan=0.0, percent=100):
    """Eevee render of the scene from the app camera at 1456 x 785 (Standard view
    transform, so the unlit room shows its exact sRGB palette, as in the app)."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    try:
        scene.eevee.taa_render_samples = PREVIEW['samples']
    except AttributeError:
        pass
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.film_transparent = False
    scene.render.resolution_percentage = percent
    world = bpy.data.worlds.new('preview')
    if world.node_tree is None:
        world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*hex_linear(PREVIEW['background']), 1)
    bg.inputs['Strength'].default_value = PREVIEW['world']
    scene.world = world
    sun = bpy.data.lights.new('preview_sun', 'SUN')
    sun.energy = PREVIEW['sun']
    sun.angle = math.radians(20)
    so = bpy.data.objects.new('preview_sun', sun)
    scene.collection.objects.link(so)
    so.matrix_world = look_at(T(*SHADE['light']), T(0, 0, 0))
    app_camera(pan=pan)
    if tutor and os.path.exists(TUTOR_GLB):
        _add_tutor()
    if ghosts:
        _add_ghosts(focused=bool(pan))
    if guides:
        _add_guides()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    scene.render.filepath = os.path.abspath(path)
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print('ROOM PREVIEW', os.path.abspath(path))
