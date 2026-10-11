"""End-to-end check of the lesson stage: intro -> guided walkthrough -> quiz ->
real Gemini answer -> play actions -> a coin purchase, all in a real Chromium.

Run against the dev server (npm run dev, http://localhost:5176):
    python tests/e2e/lesson_e2e.py [--base URL] [--out DIR] [--headed]

It drives the app the way a student does (clicks on the start button, on the
3D quiz options inside the canvas, on the HUD buttons, typing in the ask box)
and reads state through the dev-only `window.__gg` hooks:
    director / tutor / progress / walkthrough  zustand stores (getState)
    steps                                      the walkthrough step data
    model                                      { loaded, clips[] } of tutor.glb
    screenOf(name)                             viewport px {x, y} of a named 3D object, or null
Named 3D objects: tutor, notes-window (the one browser window, left of the tutor), quiz-option-<i>.

Exit code 0 only if every check passes. Screenshots and report.json land in --out.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageStat
from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[2]

CONFIG = {
    "base": "http://localhost:5176",
    "route": "/tutor/cs111",
    "out": ROOT / "tmp" / "e2e",
    "viewport": {"width": 1440, "height": 900},
    "phase_timeout_s": 30,
    "model_timeout_s": 20,
    "step_settle_s": 0.9,
    "gesture_timeout_s": 4,
    "play_timeout_s": 3,  # gesture asked -> the tutor's state machine actually starts the clip
    "free_timeout_s": 8,  # a higher-priority one-shot (e.g. a purchase's equip) finishes before we tickle
    "ask_timeout_s": 25,
    "ask_question": "What is the convoy effect?",
    "quiz_correct": 1,
    "quiz_wrong": 0,
    # The canvas must show real content: a blank or single-colour frame fails.
    "min_colours": 400,
    "min_stddev": 12.0,
    "required_clips": [
        "idle", "talk", "think", "listen", "point_left", "point_right", "walk", "sleep",
        "wave", "hop", "shrug", "celebrate", "dance_bounce", "dance_spin", "dance_robot",
        "giggle", "highfive", "catch", "yum", "levelup", "equip", "wake",
    ],
    # Console noise that is not an app error (headless has no audio/voices).
    "console_allow": [r"speechSynthesis", r"AudioContext was not allowed", r"Download the React DevTools"],
}

STATE_JS = """() => {
  const g = window.__gg
  if (!g) return null
  const d = g.director.getState(), t = g.tutor.getState(), p = g.progress.getState(), w = g.walkthrough.getState()
  return {
    phase: t.phase, mode: t.mode, mic: t.mic, answer: t.answer ?? null,
    lines: (t.lines || []).map(l => ({ who: l.who ?? l.speaker ?? l.role ?? null, text: l.text ?? String(l) })),
    spot: d.spot, focus: d.focus, loop: d.loop, gesture: d.gesture, notesTab: d.notesTab,
    highlight: d.highlight, boardReveal: Number.isFinite(d.boardReveal) ? d.boardReveal : 'all',
    caption: d.caption, fx: (d.fx || []).map(f => f.kind),
    coins: p.coins, owned: [...(p.owned || [])], purchaseId: p.lastPurchase ? p.lastPurchase.id : 0,
    step: w.index, started: w.started, playing: w.playing,
    model: g.model ? { loaded: !!g.model.loaded, clips: [...(g.model.clips || [])] } : null,
  }
}"""


class Run:
    def __init__(self, out: Path):
        self.out = out
        self.checks: list[dict] = []
        self.console_errors: list[str] = []
        self.page_errors: list[str] = []
        self.responses: list[tuple[str, int]] = []

    def check(self, name: str, ok: object, detail: object = "") -> bool:
        self.checks.append({"name": name, "ok": bool(ok), "detail": detail})
        print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail not in ("", None) else ""))
        return bool(ok)

    def shot(self, page: Page, name: str) -> Path:
        path = self.out / f"{name}.png"
        page.screenshot(path=str(path))
        return path


def state(page: Page) -> dict:
    return page.evaluate(STATE_JS)


def wait_for(page: Page, predicate, timeout_s: float, poll_s: float = 0.15):
    """Poll app state until predicate(state) is truthy; returns the last state."""
    end = time.time() + timeout_s
    s = state(page)
    while time.time() < end:
        if s and predicate(s):
            return s
        time.sleep(poll_s)
        s = state(page)
    return s


def wait_gesture(page: Page, after_id: int, timeout_s: float):
    """Next one-shot gesture fired after `after_id`, or None."""
    s = wait_for(page, lambda s: s["gesture"] and s["gesture"]["id"] > after_id, timeout_s)
    return s["gesture"] if s and s["gesture"] and s["gesture"]["id"] > after_id else None


def now_ms(page: Page) -> float:
    return page.evaluate("() => performance.now()")


VARIANTS_JS = """async (c) => {
  try { const m = await import('/src/character/blender/config.ts'); return [...((m.CLIP_VARIANTS || {})[c] || [])] } catch { return [] }
}"""


def played_on_tutor(page: Page, clip: str, since_ms: float, timeout_s: float):
    """The director only records what was asked for; the tutor's animation state
    machine may queue or drop it. True once the tutor really started `clip`, or
    one of its CLIP_VARIANTS (a reaction asked for with { vary: true })."""
    clips = [clip, *page.evaluate(VARIANTS_JS, clip)]
    end = time.time() + timeout_s
    while True:
        hit = page.evaluate("([cs, t]) => ((window.__gg && window.__gg.played) || []).find(p => cs.includes(p.clip) && p.t >= t) || null", [clips, since_ms])
        if hit or time.time() >= end:
            return hit
        time.sleep(0.1)


def drops_since(page: Page, since_ms: float) -> list:
    return page.evaluate("(t) => ((window.__gg && window.__gg.drops) || []).filter(d => d.t >= t)", since_ms)


def check_played(r: "Run", page: Page, name: str, g, since_ms: float) -> None:
    clip = g["clip"] if g else None
    hit = played_on_tutor(page, clip, since_ms, CONFIG["play_timeout_s"]) if clip else None
    detail = {"clip": clip, "drops": drops_since(page, since_ms)}
    if not hit:  # what he was doing instead, for the report
        detail["played"] = page.evaluate("(t) => window.__gg.played.filter(p => p.t >= t - 3000)", since_ms)
        detail["anim"] = page.evaluate("() => window.__gg.anim")
    r.check(f"{name}: tutor plays it", hit, detail)


def shop_pick(page: Page, name: str):
    """Opens the shop (if shut) on its Animations tab, scrolls it to the item whose name matches
    `name` and returns its action button ("Play it" or "Buy")."""
    shop = page.get_by_role("dialog", name="Shop")
    if not shop.count():
        page.get_by_role("button", name=re.compile(r"^show shop$", re.I)).click()
        shop.wait_for(timeout=5000)
    current = shop.get_by_test_id("shop-current")
    for _ in range(24):
        if re.fullmatch(name, current.inner_text().strip(), re.I):
            break
        page.keyboard.press("ArrowDown")
        time.sleep(0.12)
    return shop.get_by_test_id("shop-act")


def wait_free(page: Page, timeout_s: float) -> bool:
    """Until the tutor plays no one-shot and has none queued: a tickle (priority 50)
    is rightly dropped while a purchase's equip (70) plays or waits its turn."""
    end = time.time() + timeout_s
    while time.time() < end:
        if page.evaluate("() => { const a = window.__gg && window.__gg.anim; return !a || (!a.oneShot && !a.queued) }"):
            return True
        time.sleep(0.1)
    return False


def gesture_id(s: dict) -> int:
    return s["gesture"]["id"] if s and s["gesture"] else -1


def window_closed(page: Page) -> bool:
    return bool(page.evaluate("() => window.__gg.windows.store.getState().closed"))


def screen_of(page: Page, name: str):
    return page.evaluate("(n) => window.__gg && window.__gg.screenOf(n)", name)


def canvas_has_content(img_path: Path) -> tuple[bool, str]:
    img = Image.open(img_path).convert("RGB")
    small = img.resize((img.width // 4, img.height // 4))
    colours = len(set(small.getdata()))
    stddev = sum(ImageStat.Stat(small).stddev) / 3
    ok = colours >= CONFIG["min_colours"] and stddev >= CONFIG["min_stddev"]
    return ok, f"colours={colours} stddev={stddev:.1f}"


def run(base: str, out: Path, headed: bool) -> int:
    out.mkdir(parents=True, exist_ok=True)
    r = Run(out)
    allow = [re.compile(p, re.I) for p in CONFIG["console_allow"]]

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not headed,
            args=["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
        )
        ctx = browser.new_context(viewport=CONFIG["viewport"])  # fresh profile: XP starts at 0
        page = ctx.new_page()
        # The dev server is shared with agents still editing src/: mock Vite's HMR
        # socket (the app opens no sockets of its own) so their saves can't hot-swap
        # stores or reload the page mid-run. Every request still hits the live server.
        page.route_web_socket(re.compile(r".*"), lambda ws: None)
        def on_console(m) -> None:
            if m.type == "error" and not any(a.search(m.text) for a in allow):
                r.console_errors.append(m.text)

        page.on("console", on_console)
        page.on("pageerror", lambda e: r.page_errors.append(str(e)))
        page.on("response", lambda resp: r.responses.append((resp.url, resp.status)))

        # 1. Start screen -> intro -> live.
        page.goto(base + CONFIG["route"], wait_until="domcontentloaded")
        start = page.locator('[aria-label="Start lesson"]')
        start.wait_for(state="visible", timeout=15000)
        r.shot(page, "00_start")
        start.click()
        s = wait_for(page, lambda s: s["phase"] == "live", CONFIG["phase_timeout_s"])
        if not r.check("intro reaches live phase", s and s["phase"] == "live", s and s["phase"]):
            return finish(r, browser)

        # 2. Blender tutor loaded with every contract clip.
        glb = [st for url, st in r.responses if url.split("?")[0].endswith("/models/tutor.glb")]
        r.check("tutor.glb served", any(st in (200, 304) for st in glb), glb)
        s = wait_for(page, lambda s: s["model"] and s["model"]["loaded"], CONFIG["model_timeout_s"])
        clips = set((s["model"] or {}).get("clips", [])) if s else set()
        missing = [c for c in CONFIG["required_clips"] if c not in clips]
        r.check("tutor model loaded with all clips", s and s["model"] and s["model"]["loaded"] and not missing, f"missing={missing}")

        # 3. The room renders: real pixels, one browser window left of the tutor, the right side free.
        time.sleep(1.0)
        ok, detail = canvas_has_content(r.shot(page, "01_live"))
        r.check("canvas renders content", ok, detail)
        tutor, window = (screen_of(page, n) for n in ("tutor", "notes-window"))
        vw, vh = CONFIG["viewport"]["width"], CONFIG["viewport"]["height"]
        on_screen = all(p and 0 <= p["x"] <= vw and 0 <= p["y"] <= vh for p in (tutor, window))
        r.check("tutor + the window on screen", on_screen, {"tutor": tutor, "window": window})
        if on_screen:
            r.check("the window stands left of the tutor", window["x"] < tutor["x"], {"window": window, "tutor": tutor})
        r.check("only one browser window", screen_of(page, "board-window") is None)
        lights = page.evaluate("() => [...document.querySelectorAll('[data-light]')].map(b => b.getAttribute('aria-label'))")
        r.check("one set of traffic lights", lights == ["Close browser window", "Minimize browser window", "Maximize browser window"], lights)

        # 4. Guided walkthrough, step by step, up to the quiz.
        steps = page.evaluate("() => (window.__gg.steps || []).length")
        r.check("walkthrough has 8+ steps", steps >= 8, steps)
        page.evaluate("() => { const w = window.__gg.walkthrough.getState(); if (!w.started) w.start(); w.pause() }")
        bar = page.get_by_text(re.compile(r"Step\s+\d+\s+of\s+\d+", re.I)).first
        r.check("walkthrough bar shows 'Step N of M'", bar.is_visible())
        seen = {"spots": set(), "focus": set(), "loops": set(), "highlights": set(), "reveals": set(), "tabs": set(), "captions": 0}
        quiz_step = None
        closed_at = None  # the step the red light closed the window on, until the lesson brings it back
        i = 0
        for i in range(steps):
            time.sleep(CONFIG["step_settle_s"])
            s = state(page)
            if closed_at is not None and not window_closed(page):
                r.check("the lesson reopens the closed window when it next needs a tab", True, {"closed_at": closed_at, "reopened_at": i})
                closed_at = None
            elif closed_at is not None and i - closed_at > 3:
                r.check("the lesson reopens the closed window when it next needs a tab", False, {"closed_at": closed_at, "still_closed_at": i})
                closed_at = None
            seen["spots"].add(s["spot"]); seen["focus"].add(s["focus"]); seen["loops"].add(s["loop"])
            seen["tabs"].add(s["notesTab"]); seen["reveals"].add(s["boardReveal"])
            if s["highlight"]:
                seen["highlights"].add(s["highlight"])
            if s["caption"]:
                seen["captions"] += 1
            if i in (1, 4, 7):
                r.shot(page, f"02_step{s['step']:02d}")
            if s["mode"] == "quiz":
                quiz_step = s["step"]
                break
            if i == 3:
                # Red light: the window animates out and is gone, with no restore chip (yellow is the chip).
                page.locator('[data-light="close"]').click(timeout=4000)
                end = time.time() + 2
                while time.time() < end and not window_closed(page):
                    time.sleep(0.1)
                time.sleep(0.5)
                chips = page.evaluate("() => [...document.querySelectorAll('button[aria-label^=\"Restore\"]')].filter(b => getComputedStyle(b).visibility === 'visible' && Number(getComputedStyle(b).opacity) > 0.5).length")
                r.check("red light closes the window with no restore chip", window_closed(page) and chips == 0, {"closed": window_closed(page), "visibleChips": chips})
                r.shot(page, "02_closed")
                closed_at = i
            if i == 2:
                page.get_by_role("button", name=re.compile(r"^next", re.I)).first.click()  # the real button, once
            else:
                page.evaluate("() => window.__gg.walkthrough.getState().next()")
        r.check("tutor walked from the centre to the window", {"center", "left"} <= seen["spots"], sorted(seen["spots"]))
        r.check("focused the notes and the board tabs", {"notes", "board"} <= seen["focus"], sorted(seen["focus"]))
        r.check("pointed at the window", "point_left" in seen["loops"], sorted(seen["loops"]))
        r.check("highlighted 3+ notes lines", len(seen["highlights"]) >= 3, sorted(seen["highlights"]))
        r.check("switched notes tabs", len(seen["tabs"]) >= 2, sorted(map(str, seen["tabs"])))
        r.check("revealed the board in steps", len([v for v in seen["reveals"] if v != "all"]) >= 3, sorted(map(str, seen["reveals"])))
        r.check("every step has a caption", seen["captions"] >= min(steps, i + 1) - 1, seen["captions"])
        if closed_at is not None:
            r.check("the lesson reopens the closed window when it next needs a tab", not window_closed(page), {"closed_at": closed_at})
        if not r.check("walkthrough reaches the quiz", quiz_step is not None):
            return finish(r, browser)

        # 5. Quiz by clicking the 3D options in the canvas: wrong -> shrug, right -> dance + confetti + XP.
        time.sleep(1.2)
        r.shot(page, "03_quiz")
        wrong = screen_of(page, f"quiz-option-{CONFIG['quiz_wrong']}")
        right = screen_of(page, f"quiz-option-{CONFIG['quiz_correct']}")
        r.check("quiz options projected on screen", wrong and right, {"wrong": wrong, "right": right})
        if wrong and right:
            s0, t0 = state(page), now_ms(page)
            page.mouse.click(wrong["x"], wrong["y"])
            g = wait_gesture(page, gesture_id(s0), CONFIG["gesture_timeout_s"])
            r.check("wrong answer -> shrug", g and g["clip"] == "shrug", g)
            check_played(r, page, "wrong answer", g, t0)
            s1, t1 = state(page), now_ms(page)
            page.mouse.click(right["x"], right["y"])
            g = wait_gesture(page, gesture_id(s1), CONFIG["gesture_timeout_s"])
            r.check("right answer -> dance/celebrate", g and (g["clip"].startswith("dance_") or g["clip"] == "celebrate"), g)
            check_played(r, page, "right answer", g, t1)
            s2 = wait_for(page, lambda s: s["coins"] >= s1["coins"] + 15, 3)
            r.check("right answer pays 15 coins", s2["coins"] >= s1["coins"] + 15, f"{s1['coins']} -> {s2['coins']}")
            r.check("confetti burst", "confetti" in s2["fx"] or "confetti" in state(page)["fx"], s2["fx"])
            time.sleep(0.4)
            r.shot(page, "04_quiz_right")

        # 6. Finish the lesson.
        s_before = state(page)
        for _ in range(steps):
            s = state(page)
            if s["step"] >= steps - 1:
                break
            page.evaluate("() => window.__gg.walkthrough.getState().next()")
            time.sleep(0.4)
        s = wait_for(page, lambda s: s["coins"] >= s_before["coins"] + 50, 4)
        r.check("lesson completion pays 50 coins", s["coins"] >= s_before["coins"] + 50, f"{s_before['coins']} -> {s['coins']}")
        r.shot(page, "05_done")

        # 7. Ask box -> server proxy -> real Gemini answer, spoken + captioned.
        box = page.get_by_placeholder(re.compile("Ask a question", re.I))
        box.fill(CONFIG["ask_question"])
        with page.expect_response(lambda resp: "/api/ask" in resp.url, timeout=CONFIG["ask_timeout_s"] * 1000) as info:
            box.press("Enter")
        resp = info.value
        body = {}
        try:
            body = resp.json()
        except Exception:
            pass
        answer = body.get("answer", "") if isinstance(body, dict) else ""
        r.check("/api/ask returns a Gemini answer", resp.status == 200 and len(answer) > 20 and "error" not in body, f"status={resp.status} answer={answer[:90]!r}")
        if answer:
            probe = answer.replace("**", "")[:24]
            s = wait_for(page, lambda s: any(probe in (l["text"] or "").replace("**", "") for l in s["lines"]) or probe in (s["caption"] or "").replace("**", ""), 6)
            r.check("answer shown in transcript/caption", any(probe in (l["text"] or "").replace("**", "") for l in s["lines"]) or probe in (s["caption"] or "").replace("**", ""))
        r.shot(page, "06_gemini")

        # 8. Play: tickle by clicking him, then every HUD action.
        wait_free(page, CONFIG["free_timeout_s"])
        tutor = screen_of(page, "tutor")
        if tutor:
            s0, t0 = state(page), now_ms(page)
            page.mouse.click(tutor["x"], tutor["y"])
            g = wait_gesture(page, gesture_id(s0), CONFIG["gesture_timeout_s"])
            r.check("click tutor -> giggle", g and g["clip"] == "giggle", g)
            check_played(r, page, "tickle", g, t0)
            time.sleep(1.2)
        for label, expect in ((r"high.?five", {"highfive"}), (r"catch", {"catch"}), (r"snack", {"yum"}), (r"dance", None)):
            s0, t0 = state(page), now_ms(page)
            shop_pick(page, label).click()
            g = wait_gesture(page, gesture_id(s0), CONFIG["gesture_timeout_s"])
            good = g and (g["clip"] in expect if expect else g["clip"].startswith("dance_"))
            time.sleep(1.0)  # past the action's own beat (the catch lands, the snack is eaten)
            s1 = state(page)
            r.check(f"HUD {label} -> {expect or 'dance_*'}, no coins", good and s1["coins"] == s0["coins"], {"gesture": g, "coins": [s0["coins"], s1["coins"]]})
            check_played(r, page, f"HUD {label}", g, t0)
            time.sleep(0.5)
            if label == r"catch":
                r.shot(page, "07_play_catch")
            time.sleep(1.6)

        # 9. A purchase: enough coins for the Disco dance (80), bought in the animation shop;
        #    he owns it, plays 'equip' and the "Unlocked" banner shows.
        page.evaluate("() => { const p = window.__gg.progress.getState(); if (p.coins < 80) p.award('bossWin', 80 - p.coins) }")
        s0, t0 = state(page), now_ms(page)
        if "dance_disco" not in s0["owned"]:
            shop_pick(page, r"disco dance").click()
        s1 = wait_for(page, lambda s: s["purchaseId"] > s0["purchaseId"], 3)
        r.check("bought the Disco dance", "dance_disco" in s1["owned"] and s1["coins"] == s0["coins"] - 80, {"owned": s1["owned"], "coins": [s0["coins"], s1["coins"]]})
        g = wait_gesture(page, gesture_id(s0), CONFIG["gesture_timeout_s"])
        r.check("equip clip plays", g and g["clip"] == "equip", g)
        check_played(r, page, "purchase", {"clip": "equip"}, t0)
        banner = page.get_by_text(re.compile(r"unlocked:\s*disco dance", re.I)).first
        r.check("unlock banner visible", banner.is_visible())
        time.sleep(0.5)
        r.shot(page, "08_unlocked")

        # 10. The tutor spoke with the ElevenLabs voice (proxy served audio at least once).
        tts = [st for u, st in r.responses if u.split("?")[0].endswith("/api/tts")]
        r.check("ElevenLabs voice served (/api/tts 200)", 200 in tts, tts[:8])

        # 11. No errors anywhere.
        bad = [f"{st} {u}" for u, st in r.responses if st >= 400 and not u.endswith("favicon.ico")]
        r.check("no failed requests", not bad, bad[:5])
        r.check("no page errors", not r.page_errors, r.page_errors[:5])
        r.check("no console errors", not r.console_errors, r.console_errors[:5])
        return finish(r, browser)


def finish(r: Run, browser) -> int:
    browser.close()
    failed = [c for c in r.checks if not c["ok"]]
    report = {"passed": len(r.checks) - len(failed), "failed": len(failed), "checks": r.checks}
    (r.out / "report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"\n{report['passed']} passed, {report['failed']} failed. Shots + report: {r.out}")
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=CONFIG["base"])
    ap.add_argument("--out", default=str(CONFIG["out"]))
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    sys.exit(run(a.base, Path(a.out), a.headed))
