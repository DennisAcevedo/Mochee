You are a senior character animator and game-feel designer. Help me design animations, effects and a play/level-up system for "Gemini Guy", the 3D tutor mascot in my web app. Your output will be fed straight into a Blender build script, so follow the output format exactly.

## The product
GeminiGuy is a study app for college students. A student uploads lecture PDFs and Gemini Guy teaches them. He walks the student through the material, answers questions out loud and runs quick quizzes. The lesson screen is a bright white-box room seen in one-point perspective, with bold multicoloured accents (teal #12a4b4, coral #ff6b5b, sun #ffc83d, violet #7c5cf2, lime #4cc76a, pink #ff6fae, indigo #3d5ad6). He stands in the middle of the floor. Two small 3D browser windows (Chrome-style, with tabs) float in the room:
- LEFT window = the student's notes (PDF pages; lines get highlighted while he explains them).
- RIGHT window = his board (a Gantt chart that builds step by step) and a "Quick check" quiz tab.
He walks between three spots (left, centre, right), points at the windows and reacts to the student. Students can also PLAY with him to earn XP and level him up: tickle him by tapping him, high-five him, play catch with a ball, feed him a snack and start a dance party. Each level unlocks new dances, effects and cosmetics. Learning also earns XP (finishing steps, getting quiz answers right). The vibe is joyful and snappy: fast reactions and expressive squash-and-stretch, but never distracting while he is teaching.

## The character
A small, friendly mascot: a white gumdrop-shaped body (sphere, radius 0.8 units, flattened flared base) that is also his head. He has big glossy black eyes with white highlights, thin brows, a small smile, an open mouth with a pink tongue when talking, and pink cheek blush. He wears an indigo-to-violet graduation cap with a gold button and a tassel. He has NO arms or legs: two floating mitten hands and two small floating rounded feet, in the Rayman style. Total height is about 2.6 units, from the floor to the top of the cap.

## The rig
These are the bones you can animate. All parts are rigid and parented to bones.
- `root`: at the floor origin. It must never translate in X or Z (the app moves him around the room). A vertical bob or hop on `root` or `body` is fine.
- `body`: the body centre. Use it for squash/stretch, lean and bob. The face and cap ride on it.
- `cap` (child of body) and `tassel` (child of cap), for follow-through.
- `hand.L`, `hand.R`, `foot.L`, `foot.R`: they float freely as children of root. `.L` is HIS left, which is the viewer's RIGHT.

The face is driven in code, so per clip you only choose a face state: neutral, happy (eyes become ∩∩ arcs), closed, surprised or focused. The mouth opens automatically while he talks, and he blinks automatically.

Coordinates use three.js axes: x to the viewer's right, y up, z toward the camera. `loc` values are OFFSETS from the bone's rest position, in model units (body radius = 0.8). `rot` is in degrees (x = pitch, y = yaw, z = roll) and is added to the rest pose. `scale` is a multiplier.

Clips that already exist (improve them or add new ones):
- Loops: idle, talk, think, listen, point_left, point_right, walk, sleep.
- One-shots: wave, hop, shrug, celebrate, dance_bounce, dance_spin, dance_robot, giggle, highfive, catch, yum, levelup, wake.

Effects the app can fire at a given time inside a clip: confetti, sparkles, hearts, stars, ring, levelup.

## What I want from you
1. 10–14 animation clips: new dances to encourage the student, play reactions, teaching gestures and transitions. Each needs a short reason it works, then FULL keyframes in the JSON format below. Use anticipation, overshoot, squash and stretch, and follow-through on the hands, feet and tassel. Loops must loop seamlessly (first key = last key). One-shots should run 0.8–2.6 s. Keep everything snappy at 30 fps.
2. A level 1–10 progression: what unlocks at each level (dances, effects, cosmetics such as cap colours and accessories, room party lights), plus XP amounts per action that feel fair and stop spam-farming.
3. 4–6 play mini-interactions beyond tickle, high-five, catch, snack and dance. For each one, give: how the student triggers it, what he does, which clip(s) it uses, which effect it fires and the XP it gives.
4. 5 ideas for camera moves or room effects during the lesson (for example when he walks to a window or nails a quiz celebration), described in one or two lines each.

## Output format (strict)
Return ONE fenced ```json block containing:
{
  "fps": 30,
  "clips": [
    {
      "name": "snake_case_name",
      "loop": false,
      "duration": 1.6,
      "face": "happy",
      "fx": [[0.9, "confetti"]],
      "keys": {
        "body":   [[0.0, {"loc": [0, 0, 0], "rot": [0, 0, 0], "scale": [1, 1, 1]}], [0.3, {"loc": [0, -0.12, 0], "scale": [1.12, 0.85, 1.12]}, "bezier"]],
        "hand.R": [[0.0, {"loc": [0, 0, 0]}], [0.4, {"loc": [0.1, 0.6, 0.1], "rot": [0, 0, -40]}, "back"]]
      },
      "trigger": "when this plays in the app",
      "notes": "why it works"
    }
  ],
  "levels": [{"level": 2, "xp_total": 60, "unlocks": ["dance_spin"]}],
  "xp": {"poke": 5},
  "interactions": [{"name": "", "trigger": "", "clips": [], "fx": "", "xp": 0}],
  "camera_and_room": ["..."]
}
Each key is `[time_seconds, channels, ease]`. The ease is optional and is one of linear, bezier, constant, back, bounce or elastic. It sets the interpolation of the segment that starts at that key. Leave out any channel you are not changing. Only use the bone names above. After the JSON block, add at most 8 bullet points of design rationale.
