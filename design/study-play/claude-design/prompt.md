# Gemini Guy rooms: a Study room and a Play room (two 3D scene frames)

I am building a study app whose whole screen is a live 3D scene (three.js). The mascot, "Gemini Guy", stands centre stage and the app UI floats on top of the room. The app has two modes behind a Study / Play pill, and each mode gets its own room. Please design both rooms as polished, full-screen key art I can rebuild in three.js.

## Deliverable

Two separate frames, each exactly 1440 x 810 (16:9), side by side or stacked on one canvas, each labelled:

1. STUDY ROOM
2. PLAY ROOM

Plus a small palette legend under each frame listing every colour you used as hex values with a one-word role (wall, floor, trim, accent, etc).

Build it as HTML/CSS/SVG (no external images). Keep it as a single page.

## Shared look (both rooms)

- A 3D, toy-like interior in a consistent flat-shaded / soft clay style: chunky rounded shapes, soft ambient light, gentle contact shadows, no textures, no photo realism, no gradients beyond soft lighting falloff.
- Camera: straight on, slightly raised, one-point perspective. We look at the back wall; the floor recedes toward a horizon line about 58 to 62 percent down the frame; the two side walls are visible as narrow angled strips at the left and right edges.
- Centre stage, on the floor, a round low platform (a disc about 260 px wide in the frame) with a thin rainbow rim. Gemini Guy stands on it: a round white marshmallow-like character, big glossy black eyes, pink cheeks, small round hands and feet, a purple graduation cap (mortarboard). He is about 220 px tall. Keep the area around him clear so he is always the focus.
- Kids-friendly but NOT babyish: think a premium edtech app for teens and adults who like cute things. No cartoon suns with faces, no clutter, no glitter, no sparkles.
- Keep geometry simple enough to rebuild in three.js from boxes, cylinders, spheres and rounded boxes: big shapes, few materials (aim for 8 to 12 colours per room).

## UI chrome to show lightly over each scene

Show the app UI as thin, slightly translucent overlays so the composition clearly leaves room for it (they are not the subject, the room is):

- Top bar across the full width (about 56 px): left "Tutor · CS111", right a two-segment pill "Study | Play" with the active mode filled.
- Bottom: a caption box centred (about 760 px wide, 64 px tall) reading a short line of tutor speech.
- STUDY only: a bottom lesson bar under the caption (lesson title + progress dots).
- PLAY only: a HUD row of five play buttons along the bottom: Shoot hoops, Dribble, Kick, Juggle, Dance.

## 1. STUDY ROOM: a bright, calm, cosy classroom / study nook

Mood: quiet morning light, calm, focused, tidy. Muted pale blues and creams so the floating windows carry the colour.

- Back wall: pale cool blue-grey, with a wainscot / chair rail and a lower cream panel.
- A big window on the back wall (upper right of centre is fine) with soft daylight coming through, sky visible, a light cast patch on the floor.
- A chalk rail or long shelf along the back wall.
- A bookshelf on the left: a "LIBRARY" shelf of colourful lecture books (spines in a few muted tones, a small "LIBRARY" label plate on it).
- A small trophy shelf with two or three simple trophies (cups, a star) on the right side wall or back wall.
- Floor: pale wood or soft cream floor with a round or rectangular rug under the platform.
- Two floating browser-style windows (white cards with a header bar and three window dots): NOTES on the left (about 380 x 300 px, upper left) and a LESSON BOARD on the right (about 400 x 300 px, upper right). Leave space for both; they hover in front of the wall, not attached to it. Teal outline for Notes, indigo outline for the Board.
- Maybe a small plant or a desk lamp in a corner. Nothing else busy.

## 2. PLAY ROOM: a loud, sunny indoor gym / playroom

Mood: energetic, warm, sunny, fun, but uncluttered around the centre.

- Back wall: bold horizontal colour stripes, from the top: orange, sky blue, purple, over a big warm yellow lower wall.
- Floor: a wooden basketball court (honey wood) with white court lines and a painted key / arc on the right.
- A basketball hoop with a backboard, orange rim and white net on the right, mounted on a pole or the wall.
- A ball rack on the left with several basketballs (and maybe a couple of other balls).
- A scoreboard high on the back wall, centred or slightly left, dark panel reading "SHOTS" over "7 / 10" in bright digits.
- Optional: low bleachers along one side wall, or a short climbing wall with coloured holds; a few big soft toy blocks (cubes with rounded edges) in a corner.
- Keep the zone around Gemini Guy and the arc toward the hoop clear: the ball flies from him to the hoop.

## Notes

- Please keep both rooms in the same art style and the same camera so switching modes feels like a swap of set, not a different app.
- After the frames, add a short list per room: each element with its rough position (left / centre / right, wall / floor / ceiling) and its colour hex, so a developer can rebuild it in 3D.
