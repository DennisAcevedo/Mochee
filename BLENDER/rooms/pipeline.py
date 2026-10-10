"""After modelling: zone checks, the AO bake, vertex-colour shading, the
unlit material swap, the static merge, GLB export, the report and manifest,
and (preview.py) a render from the app's camera. A room script calls
common.build(root, path), which runs pipeline.build.
"""

import json
import os
import struct

import bpy
from mathutils import Matrix, Vector

from common import _STATE
from contract import *  # noqa: F403 (the contract's numbers, palettes and axis helpers)

# ---------------------------------------------------------------------------
# Checks


def _room_meshes(root):
    return [o for o in root.children_recursive if o.type == 'MESH']


def check_zones(root):
    """Warns about props inside the keep-out (CLEAR) or calm (CALM) boxes."""
    warnings = []
    for ob in _room_meshes(root):
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
                warnings.append('calm zone %r (behind a floating window): %s' % (zone, ob.name))
    for w in warnings:
        print('ROOM WARN', w)
    return warnings


# ---------------------------------------------------------------------------
# Bake, colour, merge


def bake_ao(root, *, samples=None, distance=None):
    """Cycles AO into a per-corner float colour layer `gg_ao` on every room mesh.
    Two passes: everything but the underlays, then the underlays with the decals
    hidden (else the planks 4 mm above would black out the seam base)."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples or SHADE['ao_samples']
    if scene.world is None:
        scene.world = bpy.data.worlds.new('bake')
    scene.world.light_settings.distance = distance or SHADE['ao_distance']
    scene.render.bake.target = 'VERTEX_COLORS'
    meshes = _room_meshes(root)
    for ob in meshes:
        me = ob.data
        attr = me.color_attributes.get('gg_ao') or me.color_attributes.new('gg_ao', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
    under = [o for o in meshes if o.get('gg_underlay')]
    rest = [o for o in meshes if not o.get('gg_underlay')]
    for targets, hidden in ((rest, under), (under, [o for o in meshes if o.get('gg_decal')])):
        if not targets:
            continue
        for o in hidden:
            o.hide_render = True
        bpy.ops.object.select_all(action='DESELECT')
        for o in targets:
            o.select_set(True)
        bpy.context.view_layer.objects.active = targets[0]
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for o in hidden:
            o.hide_render = False


def shade(root):
    """Writes the final colour of every face corner into `Col`: palette colour (or
    gradient) x tint, lifted by glows, pulled toward SHADOW by the AO, dimmed by
    the soft key light. Linear values; the layer is the only one exported."""
    light = T(*SHADE['light']).normalized()
    ink = hex_srgb(SHADOW)
    for ob in _room_meshes(root):
        me = ob.data
        ao = me.color_attributes.get('gg_ao')
        tint = me.attributes.get('gg_tint')
        col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        mw = ob.matrix_world
        rot = mw.to_3x3()
        world = [mw @ v.co for v in me.vertices]
        zmin, zmax = min(p.z for p in world), max(p.z for p in world)
        glows = [g for g in _STATE['glows'] if (g['objects'] is None and ob.get('gg_shell')) or (g['objects'] and ob.name in g['objects'])]
        # Corner normals: smooth across smooth faces, split at flat ones. AO is
        # averaged over the corners sharing a vertex and a normal, else sampling
        # noise would split every vertex in the export.
        normals = [(rot @ c.vector).normalized() for c in me.corner_normals]
        occ = None
        if ao is not None:
            acc, keys = {}, [None] * len(me.loops)
            for li, loop in enumerate(me.loops):
                k = keys[li] = (loop.vertex_index, tuple(round(c, 2) for c in normals[li]))
                s = acc.get(k, (0.0, 0))
                acc[k] = (s[0] + ao.data[li].color[0], s[1] + 1)
            occ = [1 - min(1.0, acc[k][0] / acc[k][1]) for k in keys]
        for poly in me.polygons:
            m = me.materials[poly.material_index]
            base, top = hex_srgb(m['gg_hex']), hex_srgb(m['gg_top']) if m.get('gg_top') else None
            t = tint.data[poly.index].value if tint else 1.0
            for li in poly.loop_indices:
                lam = 1 - SHADE['light_strength'] * (0.5 - 0.5 * normals[li].dot(light)) if m['gg_light'] else 1.0
                p = world[me.loops[li].vertex_index]
                c = lerp3(base, top, (p.z - zmin) / (zmax - zmin)) if top and zmax > zmin else base
                c = tuple(min(1.0, x * t) for x in c)
                q = from_blender(p)
                for g in glows:
                    d = Vector(((q - g['center'])[i] / g['radius'][i] for i in range(3))).length
                    c = lerp3(c, g['color'], g['amount'] * (1 - smoothstep(0, 1, d)))
                if occ is not None and m['gg_ao']:
                    c = lerp3(c, ink, SHADE['ao_strength'] * occ[li])
                lin = to_linear(c)
                col.data[li].color = (lin[0] * lam, lin[1] * lam, lin[2] * lam, 1.0)
        for name in ('gg_ao', 'gg_tint'):
            a = me.attributes.get(name)
            if a is not None:
                me.attributes.remove(a)
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = me.color_attributes.find('Col')


def _unlit(name, color_node):
    """An unlit material: color -> Emission behind the 'Is Camera Ray' trick, which
    the glTF exporter writes as KHR_materials_unlit (MeshBasicMaterial in three)."""
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    mix = nt.nodes.new('ShaderNodeMixShader')
    lp = nt.nodes.new('ShaderNodeLightPath')
    em = nt.nodes.new('ShaderNodeEmission')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    color_node(nt, em.inputs['Color'])
    return m


def vc_material():
    m = bpy.data.materials.get('room_vc')
    if m is None:
        def hook(nt, sock):
            ca = nt.nodes.new('ShaderNodeVertexColor')
            ca.layer_name = 'Col'
            nt.links.new(ca.outputs['Color'], sock)
        m = _unlit('room_vc', hook)
        m.use_backface_culling = True  # single-sided: nobody sees the outside of the room
    return m


def _keep_material(src):
    name = src.name + '_unlit'
    m = bpy.data.materials.get(name)
    if m is None:
        def hook(nt, sock):
            sock.default_value = (*hex_linear(src['gg_hex']), 1.0)
        m = _unlit(name, hook)
        m['gg_export_name'] = src.name
    return m


def swap_materials(root):
    """Every palette slot -> the shared unlit vertex-colour material; keep slots ->
    their own flat unlit material (renamed back to the palette name at export)."""
    vc = vc_material()
    for ob in _room_meshes(root):
        me = ob.data
        slots = [vc if not m.get('gg_keep') else _keep_material(m) for m in me.materials]
        uniq = list(dict.fromkeys(slots))
        remap = [uniq.index(s) for s in slots]
        idx = [0] * len(me.polygons)
        me.polygons.foreach_get('material_index', idx)
        me.polygons.foreach_set('material_index', [remap[i] for i in idx])
        me.materials.clear()
        for m in uniq:
            me.materials.append(m)


def merge_static(root):
    """Joins every mesh that is not a named node into `room_static`, and moves each
    named mesh's origin to its bounds centre (its node position in three)."""
    meshes = _room_meshes(root)
    static = [o for o in meshes if not o.get('gg_node')]
    if static:
        target = static[0]
        if len(static) > 1:
            with bpy.context.temp_override(active_object=target, object=target,
                                           selected_objects=static, selected_editable_objects=static):
                bpy.ops.object.join()
        target.name = 'room_static'
        target.data.name = 'room_static'
    for ob in _room_meshes(root):  # re-listed: the join removed the merged objects
        if ob.get('gg_node'):
            _origin_to_center(ob, ob.get('gg_origin'))


def _origin_to_center(ob, at=None):
    me = ob.data
    if at is not None:
        c = T(*at)
    else:
        pts = [ob.matrix_world @ v.co for v in me.vertices]
        c = Vector([(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)])
    local = ob.matrix_world.inverted() @ c
    me.transform(Matrix.Translation(-local))
    ob.matrix_world = ob.matrix_world @ Matrix.Translation(local)


def set_origin(ob, at):
    """A named mesh's pivot (room point) instead of its bounds centre, e.g. the net's top ring."""
    ob['gg_origin'] = tuple(at)


# ---------------------------------------------------------------------------
# Export and report


def out_path(room):
    return os.path.join(OUT_DIR, '%s_room.glb' % room)


def export_glb(root, path):
    """GLB of root and its children only: Y-up, transforms applied, unlit
    vertex-colour materials, no textures, no lights or cameras. Written to a
    temp name, then renamed, so the app never reads half a file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for m in bpy.data.materials:
        if m.get('gg_export_name'):
            want = m['gg_export_name']
            src = bpy.data.materials.get(want)
            if src is not None and src is not m:
                src.name = want + '_palette'
            m.name = want
    room = root.get('gg_room', 'room')
    used = {m for ob in root.children_recursive if ob.type == 'MESH' for m in ob.data.materials}
    for idb in [root] + list(root.children_recursive) + list(used):
        for k in [k for k in idb.keys() if k.startswith('gg_')]:
            del idb[k]
    for ob in [root] + list(root.children_recursive):
        for k in [k for k in ob.keys() if k.startswith('x_')]:
            ob[k[2:]] = ob[k]
            del ob[k]
    # The GLB describes itself (root extras), so the lab can check any file it is
    # handed. ID properties hold no nested lists, hence the JSON string.
    root['contract'] = CONTRACT
    root['room'] = room
    root['mount'] = [0.0, FLOOR_Y, 0.0]
    root['units'] = 'world (three.js), floor at y 0'
    root['layout'] = json.dumps({
        'nodes': NODES.get(room, {'required': [], 'optional': []}),
        'release': APP['release'],
        'rim': APP['hoop']['rim'],
        'shotApexMax': APP['shot_apex_max'],
        'clear': {k: v['box'] for k, v in CLEAR.items()},
        'calm': CALM,
    })
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root] + list(root.children_recursive):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    tmp = path[:-4] + '.tmp.glb'
    bpy.ops.export_scene.gltf(
        filepath=tmp,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=EXPORT['normals'],
        export_materials='EXPORT',
        export_vertex_color='MATERIAL',
        export_all_vertex_colors=False,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_morph=False,
    )
    os.replace(tmp, path)


def glb_report(path):
    """What three.js will see: nodes, meshes, draw calls, vertices, triangles, size."""
    with open(path, 'rb') as f:
        data = f.read()
    n = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + n])
    acc = gltf.get('accessors', [])
    prims = [p for m in gltf.get('meshes', []) for p in m['primitives']]
    return {
        'bytes': len(data),
        'nodes': [nd.get('name', '') for nd in gltf.get('nodes', [])],
        'meshes': len(gltf.get('meshes', [])),
        'drawCalls': len(prims),
        'materials': [m.get('name', '') for m in gltf.get('materials', [])],
        'extensions': gltf.get('extensionsUsed', []),
        'vertices': sum(acc[p['attributes']['POSITION']]['count'] for p in prims),
        'triangles': sum(acc[p['indices']]['count'] // 3 for p in prims if 'indices' in p),
        'colorPrims': sum('COLOR_0' in p['attributes'] for p in prims),  # primitives carrying baked colour
        'images': len(gltf.get('images', [])),
    }


def write_manifest(room, report, root_nodes):
    """Merges this room into public/models/rooms/rooms.manifest.json (the contract
    the app and lab/rooms.tsx read: mount, zones, named node positions)."""
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        with open(MANIFEST_PATH, encoding='utf-8') as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        manifest = {}
    manifest.update({
        'contract': CONTRACT,
        'mount': [0.0, FLOOR_Y, 0.0],
        'notes': [
            'Room frame = world x/z, y measured from the floor: add the mount to get world positions.',
            'Materials are KHR_materials_unlit with the colour in COLOR_0: set material.toneMapped = false to keep the palette.',
            'scoreboard_screen has 0..1 UVs (glTF convention): a CanvasTexture on it needs flipY = false.',
            'hoop_rim is the rim ring; its node position is the rim centre (matches PHYSICS.hoop.rim).',
        ],
        'clear': {k: v['box'] for k, v in CLEAR.items()},
        'calm': CALM,
        'release': APP['release'],
        'shotApexMax': APP['shot_apex_max'],
    })
    rooms = manifest.setdefault('rooms', {})
    rooms[room] = {
        'file': '/models/rooms/%s_room.glb' % room,
        'bytes': report['bytes'],
        'drawCalls': report['drawCalls'],
        'triangles': report['triangles'],
        'nodes': root_nodes,
    }
    tmp = MANIFEST_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    os.replace(tmp, MANIFEST_PATH)


def _node_positions(root):
    """Room position of every named node. Read before export_glb strips gg_node."""
    return {ob.name: [round(c, 4) for c in from_blender(ob.matrix_world.translation)]
            for ob in root.children_recursive if ob.get('gg_node')}


# ---------------------------------------------------------------------------


def build(root, path, *, room=None, bake=None, preview=None, manifest=True):
    """The whole pipeline after modelling: zone checks, AO bake, shading, material
    swap, merge, export, report (one `ROOM_REPORT {json}` line) and an optional
    preview. Script args: --no-bake, --preview <png>, --no-tutor, --no-ghosts, --guides,
    --pan <x>, --percent <n>."""
    room = room or root.get('gg_room', 'room')
    warnings = check_zones(root)
    if bake is None:
        bake = not flag('--no-bake')
    if bake:
        bake_ao(root)
    shade(root)
    swap_materials(root)
    merge_static(root)
    nodes = _node_positions(root)
    export_glb(root, path)
    report = glb_report(path)
    report['file'] = os.path.relpath(path, REPO).replace('\\', '/')
    want = NODES.get(room, {}).get('required', [])
    report['missing'] = [n for n in want if n not in report['nodes']]
    report['warnings'] = warnings
    if manifest and room in NODES:
        write_manifest(room, report, nodes)
    print('ROOM_REPORT ' + json.dumps({k: v for k, v in report.items() if k != 'nodes'} | {'named': nodes}))
    if report['bytes'] > 2_000_000:
        print('ROOM WARN %s is %.2f MB (budget ~2 MB)' % (report['file'], report['bytes'] / 1e6))
    preview = preview or arg('--preview')
    if preview:
        from preview import render_preview
        render_preview(preview, tutor=not flag('--no-tutor'), ghosts=not flag('--no-ghosts'),
                       guides=flag('--guides'), pan=float(arg('--pan', 0.0)), percent=int(arg('--percent', 100)))
    return report
