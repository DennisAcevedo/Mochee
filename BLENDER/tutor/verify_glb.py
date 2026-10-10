"""Checks public/models/tutor.glb against the tutor contract (plain Python 3).

  python blender/tutor/verify_glb.py

Parses the GLB's JSON chunk and asserts: every clip in clips.json is a glTF
animation with that exact name and a matching duration, every bone and face
node exists with the right parent, the cap and sneaker materials exist, the
v2 clips in clips.json's "extra" list are built too, and each animation drives
every bone. Exits non-zero on the first failure.
"""

import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
GLB = os.path.join(REPO, 'public', 'models', 'tutor.glb')
MANIFEST = os.path.join(REPO, 'public', 'models', 'tutor.manifest.json')
CLIPS = os.path.join(HERE, 'clips.json')

BONES = ['root', 'body', 'cap', 'tassel', 'hand.L', 'hand.R', 'foot.L', 'foot.R']
PARENT = {'body': 'root', 'cap': 'body', 'tassel': 'cap', 'hand.L': 'root', 'hand.R': 'root', 'foot.L': 'root', 'foot.R': 'root'}
FACE_NODES = ['eye.L', 'eye.R', 'happy.L', 'happy.R', 'brow.L', 'brow.R', 'smile', 'mouth', 'cheek.L', 'cheek.R']
DURATION_TOL = 1.0 / 30  # seconds


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2 and length == len(data), 'not a GLB v2'
    clen, ctype = struct.unpack_from('<II', data, 12)
    assert ctype == 0x4E4F534A, 'first chunk is not JSON'
    return json.loads(data[20:20 + clen].decode('utf-8')), len(data)


def main():
    gltf, size = read_glb(GLB)
    with open(CLIPS, encoding='utf-8') as f:
        data = json.load(f)
    clips = data['clips']
    extra = [c['name'] for c in data.get('extra', [])]
    missing_extra = [n for n in extra if n not in {c['name'] for c in clips}]
    assert not missing_extra, 'extra clips not in clips: %s' % missing_extra
    nodes = gltf['nodes']
    names = [n.get('name', '') for n in nodes]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    idx = {n: i for i, n in enumerate(names)}

    for b in BONES + FACE_NODES:
        assert names.count(b) == 1, 'node %r missing or duplicated' % b
    for b, p in PARENT.items():
        assert names[parent[idx[b]]] == p, '%s parent is %s, want %s' % (b, names[parent[idx[b]]], p)
    for f in FACE_NODES:
        assert names[parent[idx[f]]] == 'body', '%s must ride on body' % f
    for mat in ('cap', 'sneaker'):
        assert any(m.get('name') == mat for m in gltf['materials']), 'no material named %r' % mat
    assert not gltf.get('cameras') and 'KHR_lights_punctual' not in gltf.get('extensions', {}), 'cameras/lights exported'

    anims = {a['name']: a for a in gltf.get('animations', [])}
    bone_ids = {idx[b] for b in BONES}
    for c in clips:
        a = anims.get(c['name'])
        assert a is not None, 'animation %r missing' % c['name']
        dur = max(gltf['accessors'][s['input']]['max'][0] for s in a['samplers'])
        assert abs(dur - c['duration']) <= DURATION_TOL, '%s: duration %.3f, want %.3f' % (c['name'], dur, c['duration'])
        driven = {ch['target']['node'] for ch in a['channels']}
        assert bone_ids <= driven, '%s: bones not driven: %s' % (c['name'], [names[i] for i in bone_ids - driven])
        assert driven <= bone_ids, '%s: drives non-bones: %s' % (c['name'], [names[i] for i in driven - bone_ids])
        print('  %-13s %5.2fs  %-4s %d channels%s' % (c['name'], dur, 'loop' if c['loop'] else 'once', len(a['channels']),
                                                     '  (extra)' if c['name'] in extra else ''))
    unexpected = sorted(set(anims) - {c['name'] for c in clips})
    assert not unexpected, 'unexpected animations: %s' % unexpected

    with open(MANIFEST, encoding='utf-8') as f:
        man = json.load(f)
    assert [c['name'] for c in man['clips']] == [c['name'] for c in clips], 'manifest clips out of sync'
    assert man['bones'] == BONES and man['faceNodes'] == FACE_NODES
    assert man.get('capMaterial') == 'cap' and man.get('sneakerMaterial') == 'sneaker', 'manifest material names'

    tris = 0
    for m in gltf['meshes']:
        for p in m['primitives']:
            tris += gltf['accessors'][p['indices']]['count'] // 3
    print('OK: %d animations (%d extra), %d nodes, %d triangles, %.2f MB, height %.3f' % (len(anims), len(extra), len(nodes), tris, size / 1e6, man['height']))


if __name__ == '__main__':
    try:
        main()
    except AssertionError as e:
        print('FAIL:', e)
        sys.exit(1)
