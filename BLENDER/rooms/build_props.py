"""A room's props without its shell, for the app's white-box room.

The white box (src/scene/room/WhiteBoxRoom.tsx) draws the walls, floor and
ceiling; this runs build_study_room.py or build_play_room.py unchanged and,
just before the pipeline bakes and exports, deletes the room's own walls and
floor (the objects flagged gg_shell) plus anything listed in DROP. What is
left (furniture, wall finish the props stand on, the hoop, the rack, the
scoreboard, the court paint) bakes against nothing and exports as
public/models/rooms/<room>_props.glb. Same frame and mount as the full room.

  blender --background --factory-startup --python BLENDER/rooms/build_props.py -- --room study|play [--list]

--list prints every shell object and its size, and exits without building.
"""
import os
import runpy
import shutil
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOM = ARGS[ARGS.index('--room') + 1] if '--room' in ARGS else 'study'
LIST = '--list' in ARGS

# Shell objects to KEEP: the rails (the back one is the ledge the books and the
# mug stand on). Everything else flagged gg_shell goes, the study's wainscot
# mouldings (the white panel frames) included.
KEEP_PREFIX = ('rail_',)
# Non-shell objects to drop: the room's own rug (the white box has one under his
# spot), the study bookcase and plant, and the Play foam blocks and purple
# court paint. The ledge's books are ledge_book_*, so 'book_' leaves them.
DROP_PREFIX = {
    'study': ('rug', 'bookcase', 'book_', 'pot', 'leaf_'),
    'play': ('rug', 'block_', 'court_lane', 'court_centre'),
}

REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
TMP = os.path.join(REPO, 'tmp', 'rooms')
OUT = os.path.join(REPO, 'public', 'models', 'rooms', '%s_props.glb' % ROOM)

_orig_build = C.build


def _size(ob):
    d = ob.dimensions
    return '%.2f x %.2f x %.2f' % (d.x, d.y, d.z)


def build(root, path, **kw):
    gone = []
    for ob in list(bpy.data.objects):
        shell = bool(ob.get('gg_shell'))
        name = ob.name
        if LIST and shell:
            print('PROPS shell %-28s %s' % (name, _size(ob)))
        drop = (shell and not name.startswith(KEEP_PREFIX)) or name.startswith(DROP_PREFIX.get(ROOM, ('rug',)))
        if drop and not LIST:
            gone.append(name)
            bpy.data.objects.remove(ob, do_unlink=True)
    if LIST:
        print('PROPS listed, nothing built')
        return {}
    print('PROPS dropped %d: %s' % (len(gone), ', '.join(sorted(gone))))
    os.makedirs(TMP, exist_ok=True)
    tmp = os.path.join(TMP, '%s_props.glb' % ROOM)
    report = _orig_build(root, tmp, **kw)  # a tmp/ path: the pipeline leaves rooms.manifest.json alone
    shutil.copyfile(tmp, OUT)
    print('PROPS wrote', OUT)
    return report


C.build = build
sys.argv = [sys.argv[0]] + [a for a in ARGS if a not in ('--room', ROOM, '--list')]
runpy.run_path(os.path.join(HERE, 'build_%s_room.py' % ROOM), run_name='__main__')
