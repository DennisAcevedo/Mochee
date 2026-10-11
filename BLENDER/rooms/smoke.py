"""Smoke test for the room kit: a bare shell, a plank floor, one bevelled box
and one of each kind of named node, through the whole pipeline (AO bake,
shading, merge, export, preview). Writes tmp/rooms/smoke.glb (not under
public/: it is never shipped) and tmp/rooms/smoke_blender.png.

  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --factory-startup
      --python BLENDER/rooms/smoke.py [-- --no-bake]

Then open it in the lab (lab/rooms.html?file=...; tmp/ is not served by Vite,
so the Playwright check routes the URL to this file on disk).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

OUT = os.path.join(C.REPO, 'tmp', 'rooms')

root = C.new_room('smoke')
wall = C.mat('smoke_wall', C.STUDY['wall'], light=False)
band = C.mat('smoke_band', C.PLAY['purple'], light=False)
C.walls([(0, C.TOP, wall), (2.4, 3.0, band)])
C.plank_floor(C.mat('smoke_plank', C.STUDY['floor'], light=False), C.mat('smoke_seam', C.STUDY['seam'], light=False))
C.floor_ring('smoke_rug', (0, 0.7), 0, 2.0, C.mat('smoke_rug', C.STUDY['rug'], light=False), scale=(1, 0.55),
             lift=C.LIFT['under_platform'])

# The one box: front left, on the floor, with a contact shadow to bake.
C.floor_box('smoke_box', -3.0, 1.2, (1.2, 0.9, 0.7), C.mat('smoke_wood', C.STUDY['wood']))

# One of each named kind: an empty, a keep-material screen with UVs, a ring mesh.
C.node('tutor_spot', C.APP['tutor']['spot'])
C.quad('scoreboard_screen', (-1.6, 3.4, C.BACK_Z + 0.02), (2.2, 0.9), C.mat('scoreboard_screen', C.PLAY['navy'], ao=False, light=False, keep=True),
       uv=True, node=True)
h = C.APP['hoop']
C.torus('hoop_rim', h['rim'], h['rim_radius'], h['tube'], C.mat('smoke_rim', C.PLAY['ball']), node=True)
# Nested nodes: a slot group whose children must land on their own room points.
C.slots('ball_rack_slots', [(-2.9, 0.75, -6.5), (-2.4, 0.75, -6.5)], extras={'radius': C.APP['ball_radius']})

C.build(root, os.path.join(OUT, 'smoke.glb'), manifest=False, preview=os.path.join(OUT, 'smoke_blender.png'))
