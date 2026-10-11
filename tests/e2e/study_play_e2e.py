"""End-to-end check of wave B on the lesson stage, in a real Chromium: the
Study / Play switch, physics play (drag and fling him, the ball and hoop),
topic mastery and the ability it teaches, the room that grows with it, the
return experiment, and the Learning drawer's study hub cards (upload,
grounded chat with citations, abstain, quiz). There is no Quest drawer.

Run against the dev server (npm run dev, http://localhost:5176):
    python tests/e2e/study_play_e2e.py [--base URL] [--out DIR] [--headed]

Same harness as lesson_e2e.py (fresh profile, mocked HMR socket, real
requests) and the same dev-only `window.__gg` hooks, plus the wave B ones:
    mode / drawers / growth / experiment / playBody   zustand stores
    play { toss, shoot, room }                        physics actions + the room's inner box
    loops                                             base loops the tutor switched to
Named 3D objects: tutor, physics-ball, physics-hoop, evo-book-<docId>,
evo-trophy-<topicId>, evo-ability-<abilityId>.

The voice is muted for the whole run: grounded answers vary, so speaking them
would bill new ElevenLabs characters on every run. Each run uploads the fixture
PDF once (the backend has no delete route, so .data/ keeps one copy per run).

Exit code 0 only if every check passes. Screenshots (sp_*.png) and
study_play_report.json land in --out.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

from lesson_e2e import Run, canvas_has_content, gesture_id, now_ms, screen_of, state, wait_for, wait_free, wait_gesture

ROOT = Path(__file__).resolve().parents[2]

CONFIG = {
    "base": "http://localhost:5176",
    "route": "/tutor/cs111",
    "out": ROOT / "tmp" / "e2e",
    "report": "study_play_report.json",
    "viewport": {"width": 1440, "height": 900},
    "phase_timeout_s": 40,
    "gesture_timeout_s": 4,
    "free_timeout_s": 8,  # a higher-priority one-shot finishes before we ask for another
    "quiet_s": 1.5,  # ...and nothing new starts for this long (a level-up lands 650 ms after its XP)
    # Drag: press on him, hold past the pick-up delay, sweep up-right, let go.
    "drag": {"hold_s": 0.25, "dx": 180, "dy": -175, "steps": 10, "move_s": 0.5},
    # Release -> back on his feet. ~6 s at 60 fps; headless swiftshader draws 4-6 fps and
    # PhysicsTutor clamps each frame to PHYSICS.maxDt (0.05 s), so his timers run ~4x slow here.
    "settle_timeout_s": 20,
    "shot_timeout_s": 10,
    "hoop_xp": 15,
    "mastery_timeout_s": 25,  # the feedback line ends, then the mastery beat
    "topic": "cs111-fcfs",
    "ability": "queue_juggle",
    "quiz_correct": 1,
    "race_start_s": 8,
    "race_end_s": 40,
    "no_rerun_watch_s": 5,
    "fixture": ROOT / "tmp" / "fixtures" / "cs111-fcfs.pdf",
    "upload_timeout_s": 90,
    "chat_timeout_s": 45,
    "quiz_timeout_s": 90,
    "console_allow": [r"speechSynthesis", r"AudioContext was not allowed", r"Download the React DevTools"],
}

GG = "window.__gg"


def gg(page: Page, expr: str, arg=None):
    """Evaluate `expr` with g = window.__gg (and a = arg)."""
    return page.evaluate(f"(a) => {{ const g = {GG}; return ({expr}) }}", arg)


def has_object(page: Page, name: str) -> bool:
    return gg(page, "!!g.scene.getObjectByName(a)", name)


def poll(fn, timeout_s: float, poll_s: float = 0.15):
    """Call fn until it returns something truthy or time runs out; returns the last value."""
    end = time.time() + timeout_s
    v = fn()
    while not v and time.time() < end:
        time.sleep(poll_s)
        v = fn()
    return v


def hub(page: Page, card: str) -> None:
    """Back to the study hub's cards (Learning drawer), then open hub-card-<card>."""
    back = page.get_by_test_id("hub-back")
    if back.count() and back.is_visible():
        back.click()
    page.get_by_test_id(f"hub-card-{card}").click()


def wait_quiet(page: Page, hold_s: float, timeout_s: float) -> bool:
    """Until the tutor has played no one-shot (and queued none) for hold_s in a row."""
    end, since = time.time() + timeout_s, None
    while time.time() < end:
        free = wait_free(page, 0.2)
        since = (since or time.time()) if free else None
        if since and time.time() - since >= hold_s:
            return True
        time.sleep(0.1)
    return False


class Tap:
    """Pass-through route that keeps each docs API reply. The request still goes
    to the live server (route.fetch); the body is read off that fetch, because
    Chromium's inspector cache evicts response bodies once the GLB has loaded."""

    def __init__(self, page: Page, globs: list[str], timeout_s: float):
        self.calls: list[dict] = []
        self.timeout_ms = timeout_s * 1000
        for g in globs:
            page.route(g, self._handle)

    def _handle(self, route) -> None:
        req = route.request
        try:
            resp = route.fetch(timeout=self.timeout_ms)
        except Exception:  # the page closed mid-request
            return
        call = {"method": req.method, "path": req.url.split("?")[0], "status": resp.status, "json": None, "post": None}
        try:
            call["json"] = resp.json()
        except Exception:
            pass
        try:
            call["post"] = req.post_data_json
        except Exception:
            pass
        self.calls.append(call)
        route.fulfill(response=resp)

    def next(self, page: Page, since: int, test, timeout_s: float):
        """First call after index `since` that passes test(call), or None."""
        def hit():
            page.evaluate("() => 0")  # lets Playwright run the route handlers
            return next((c for c in self.calls[since:] if test(c)), None)
        return poll(hit, timeout_s, 0.2)


def go_live(page: Page, r: Run, url: str, label: str) -> bool:
    page.goto(url, wait_until="domcontentloaded")
    start = page.locator('[aria-label="Start lesson"]')
    start.wait_for(state="visible", timeout=20000)
    start.click()
    s = wait_for(page, lambda s: s["phase"] == "live", CONFIG["phase_timeout_s"])
    ok = r.check(f"{label}: intro reaches live phase", s and s["phase"] == "live", s and s["phase"])
    if ok:
        gg(page, "g.walkthrough.getState().setMuted(true)")
    return ok


# Logs the play body's state changes and every effect burst, from now on.
WATCH_JS = """() => {
  const g = window.__gg
  if (window.__sp) window.__sp.off.forEach(f => f())
  const sp = { states: [], fx: [], off: [] }
  sp.off.push(g.playBody.subscribe((s, p) => { if (s.state !== p.state) sp.states.push({ s: s.state, t: performance.now() }) }))
  sp.off.push(g.director.subscribe((s, p) => { if (s.fx !== p.fx) for (const f of s.fx || []) sp.fx.push({ kind: f.kind, t: performance.now() }) }))
  window.__sp = sp
}"""


def run(base: str, out: Path, headed: bool) -> int:
    out.mkdir(parents=True, exist_ok=True)
    r = Run(out)
    allow = [re.compile(p, re.I) for p in CONFIG["console_allow"]]
    url = base + CONFIG["route"]

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not headed,
            args=["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
        )
        ctx = browser.new_context(viewport=CONFIG["viewport"])  # fresh profile: no growth, XP 0

        def on_console(m) -> None:
            if m.type == "error" and not any(a.search(m.text) for a in allow):
                r.console_errors.append(m.text)

        def open_page() -> Page:
            p = ctx.new_page()
            # Shared dev server: mock Vite's HMR socket so other agents' saves can't
            # hot-swap stores or reload mid-run (see lesson_e2e.py).
            p.route_web_socket(re.compile(r".*"), lambda ws: None)
            p.on("console", on_console)
            p.on("pageerror", lambda e: r.page_errors.append(str(e)))
            p.on("response", lambda resp: r.responses.append((resp.url, resp.status)))
            return p

        page = open_page()

        if not go_live(page, r, url, "first visit"):
            return finish(r, browser)
        hooks = gg(page, "['mode','drawers','growth','experiment','playBody','play','loops'].filter(k => !(k in g))")
        if not r.check("wave B hooks on window.__gg", not hooks, f"missing={hooks}"):
            return finish(r, browser)
        # Hold the guided lesson so the director doesn't walk him mid-drag.
        page.evaluate("() => { const w = window.__gg.walkthrough.getState(); if (!w.started) w.start(); w.pause() }")
        time.sleep(1.5)
        ok, detail = canvas_has_content(r.shot(page, "sp_01_live"))
        r.check("canvas renders content", ok, detail)
        window = screen_of(page, "notes-window")
        vw = CONFIG["viewport"]["width"]
        r.check("Learning drawer starts folded: the browser window in view", window and 0 < window["x"] < vw
                and screen_of(page, "board-window") is None
                and not gg(page, "g.drawers.getState().learningOpen"), {"window": window})
        quest = page.get_by_role("button", name=re.compile(r"\bquest\b", re.I)).count() + page.locator("#drawer-handle-quest, #drawer-dock-quest").count()
        r.check("no Quest drawer: no Quest handle, tab or dock button", quest == 0 and "questOpen" not in gg(page, "Object.keys(g.drawers.getState())"),
                {"quest_controls": quest})
        r.check("room evolution: no trophy before mastery", not has_object(page, f"evo-trophy-{CONFIG['topic']}"))
        page.evaluate(WATCH_JS)

        # 1. Mode pill: Play, then back to Study.
        play_radio = page.get_by_role("radio", name=re.compile(r"^play$", re.I))
        study_radio = page.get_by_role("radio", name=re.compile(r"^study$", re.I))
        if not r.check("mode switch mounted (Study / Play radios)", play_radio.count() == 1 and study_radio.count() == 1,
                       {"play": play_radio.count(), "study": study_radio.count()}):
            return finish(r, browser)
        play_radio.click()
        r.check("mode pill -> play", poll(lambda: gg(page, "g.mode.getState().mode") == "play", 2), gg(page, "g.mode.getState().mode"))
        time.sleep(1.0)
        r.shot(page, "sp_02_play")

        # 2. Physics drag: press, hold, sweep up-right, release; held -> flying/recovering -> idle.
        tutor = screen_of(page, "tutor")
        D = CONFIG["drag"]
        if r.check("tutor projected on screen", tutor, tutor):
            t0 = now_ms(page)
            page.mouse.move(tutor["x"], tutor["y"])
            page.mouse.down()
            time.sleep(D["hold_s"])
            for i in range(1, D["steps"] + 1):
                page.mouse.move(tutor["x"] + D["dx"] * i / D["steps"], tutor["y"] + D["dy"] * i / D["steps"])
                time.sleep(D["move_s"] / D["steps"])
            held = poll(lambda: gg(page, "g.playBody.getState().state") == "held", 1.5)
            r.shot(page, "sp_03_held")
            page.mouse.up()
            t_up = time.time()
            idle = poll(lambda: gg(page, "g.playBody.getState().state === 'idle' && window.__sp.states.some(x => x.s !== 'held' && x.s !== 'idle')"),
                        CONFIG["settle_timeout_s"])
            settled_s = round(time.time() - t_up, 2)
            seq = [x["s"] for x in gg(page, "window.__sp.states.filter(x => x.t >= a)", t0)]
            r.check("drag picks him up (held)", held and "held" in seq, seq)
            r.check("release -> flying/recovering -> idle", idle and seq[-1:] == ["idle"] and any(x in seq for x in ("flying", "recovering")),
                    {"states": seq, "settled_s": settled_s})
            loops = [x["clip"] for x in gg(page, "g.loops.filter(x => x.t >= a)", t0)]
            played = [x["clip"] for x in gg(page, "g.played.filter(x => x.t >= a)", t0)]
            r.check("tutor plays dragged (or listen) while held", "dragged" in loops or "listen" in loops, loops)
            r.check("tutor plays recover (or hop) on landing", "recover" in played or "hop" in played,
                    {"played": played, "drops": gg(page, "g.drops.filter(x => x.t >= a)", t0)})
            pos, room = gg(page, "[...g.playBody.getState().position]"), gg(page, "g.play.room")
            inside = (abs(pos[0]) <= room["halfW"] and room["floorY"] <= pos[1] <= room["ceilY"] and room["backZ"] <= pos[2] <= room["frontZ"])
            r.check("he lands inside the room", inside, {"pos": [round(v, 2) for v in pos], "room": room})
            time.sleep(0.6)
            r.shot(page, "sp_04_landed")

        # 3. Toys: ball and hoop in play mode; a scored basket -> confetti + XP + hoop count.
        r.check("toys: physics-ball and physics-hoop in play mode", has_object(page, "physics-ball") and has_object(page, "physics-hoop"))
        s0, t0 = state(page), now_ms(page)
        hoops0 = gg(page, "g.playBody.getState().hoops")
        shot = gg(page, "g.play.shoot()")
        scored = poll(lambda: gg(page, "g.playBody.getState().hoops") > hoops0, CONFIG["shot_timeout_s"])
        s1 = wait_for(page, lambda s: s["xp"] >= s0["xp"] + CONFIG["hoop_xp"], 2)
        fx = [x["kind"] for x in gg(page, "window.__sp.fx.filter(x => x.t >= a)", t0)]
        r.check("shootBall scores through the hoop", shot and scored, {"shot": shot, "hoops": [hoops0, gg(page, "g.playBody.getState().hoops")]})
        r.check("basket -> confetti + XP", "confetti" in fx and s1["xp"] >= s0["xp"] + CONFIG["hoop_xp"], {"fx": sorted(set(fx)), "xp": [s0["xp"], s1["xp"]]})
        r.shot(page, "sp_05_basket")
        study_radio.click()
        back = poll(lambda: gg(page, "g.mode.getState().mode") == "study", 2)
        gone = poll(lambda: not has_object(page, "physics-ball"), 3)
        r.check("mode pill -> study (toys put away)", back and gone, {"mode": gg(page, "g.mode.getState().mode"), "ball": not gone})

        # 4. Mastery: the walkthrough quiz, right on the first try.
        quiz_index = gg(page, "g.steps.findIndex(s => s.wait === 'quiz')")
        gg(page, "g.walkthrough.getState().goTo(a)", quiz_index)
        s = wait_for(page, lambda s: s["mode"] == "quiz", 8)
        time.sleep(1.5)
        right = screen_of(page, f"quiz-option-{CONFIG['quiz_correct']}")
        if r.check("walkthrough reaches the quiz with options on screen", s["mode"] == "quiz" and right, {"step": quiz_index, "option": right}):
            page.mouse.click(right["x"], right["y"])
            seen = {"caption": None}

            def mastered():
                c = gg(page, "g.director.getState().caption") or ""
                if "learned" in c.lower():
                    seen["caption"] = c
                g = gg(page, "({ t: g.growth.getState().topics[a], ab: g.growth.getState().abilities.map(x => x.id) })", CONFIG["topic"])
                return seen["caption"] and g["t"] and g["t"]["mastered"] and CONFIG["ability"] in g["ab"]

            poll(mastered, CONFIG["mastery_timeout_s"], 0.1)
            g = gg(page, "({ t: g.growth.getState().topics[a], ab: g.growth.getState().abilities.map(x => x.id) })", CONFIG["topic"])
            r.check(f"topic {CONFIG['topic']} mastered on the first try", g["t"] and g["t"]["mastered"] and g["t"]["attempts"] == 1, g["t"])
            r.check(f"ability {CONFIG['ability']} learned", CONFIG["ability"] in g["ab"], g["ab"])
            r.check("caption says he learned it", seen["caption"], seen["caption"])
            r.check("mastery invites play (celebrate + invite card)", gg(page, "g.mode.getState().mode") == "celebrate"
                    and page.get_by_test_id("mastery-invite").is_visible(), gg(page, "g.mode.getState().mode"))
            r.shot(page, "sp_06_mastery")

            # The new move, from the mastery invite's 'Show me'.
            show_me = page.get_by_test_id("mastery-invite").get_by_role("button", name=re.compile(r"^show me$", re.I))
            show_me.wait_for(state="visible", timeout=5000)
            gg(page, "g.walkthrough.getState().pause()")  # he stays put: one-shots wait while he walks
            # The mastery celebrate (60) and the level-up that finishing the lesson earns
            # (80, after PLAY.levelUpDelayMs) both rightly outrank a hop (50): let them play out.
            wait_quiet(page, CONFIG["quiet_s"], CONFIG["free_timeout_s"] * 2)
            s0, t0 = state(page), now_ms(page)
            show_me.click()
            props = poll(lambda: has_object(page, f"evo-ability-{CONFIG['ability']}"), 3)
            cap = poll(lambda: "juggle" in (gg(page, "g.director.getState().caption") or "").lower() and gg(page, "g.director.getState().caption"), 3)
            g1 = wait_gesture(page, gesture_id(s0), CONFIG["gesture_timeout_s"])
            hop = poll(lambda: gg(page, "g.played.find(x => x.clip === 'hop' && x.t >= a)", t0), 4)
            r.check("'Show me' performs the ability: props + caption + clip", props and cap and g1 and hop,
                    {"props": props, "caption": cap, "gesture": g1, "played": bool(hop),
                     "drops": gg(page, "g.drops.filter(x => x.t >= a)", t0), "anim": gg(page, "g.anim")})
            time.sleep(0.6)
            r.shot(page, "sp_07_ability")
            # The handle stays clickable beside the open panel (not under the canvas).
            page.get_by_role("button", name=re.compile(r"^open learning", re.I)).click(timeout=5000)
            opened = poll(lambda: gg(page, "g.drawers.getState().learningOpen") is True, 3)
            page.get_by_role("button", name=re.compile(r"^collapse learning", re.I)).click(timeout=5000)
            r.check("open drawer's 'Collapse Learning' handle closes it", opened and poll(lambda: gg(page, "g.drawers.getState().learningOpen") is False, 3),
                    {"opened": opened, "open_after": gg(page, "g.drawers.getState().learningOpen")})

        # 5. Room evolution: a trophy for the mastered topic (books come only from uploads, checked below).
        names = [f"evo-trophy-{CONFIG['topic']}"]
        present = {n: has_object(page, n) for n in names}
        r.check("room evolution: trophy", all(present.values()), present)
        page.get_by_role("button", name=re.compile(r"keep studying", re.I)).first.click()
        r.shot(page, "sp_08_room")

        # 6. Return experiment: back the next "day" (?return=1), same profile.
        if go_live(page, r, url + "?return=1", "return visit"):
            began = poll(lambda: "scheduler race" in (gg(page, "g.director.getState().caption") or "").lower(), CONFIG["race_start_s"], 0.1)
            # Held back, or paused if it got going first (the race's scene mounts a beat later).
            waiting = gg(page, "!!g.experiment.getState().run && !(g.walkthrough.getState().started && g.walkthrough.getState().playing)")
            r.check("return experiment: 'scheduler race' caption", began, gg(page, "g.director.getState().caption"))
            r.check("lesson waits while the experiment runs", waiting)
            time.sleep(3.0)
            r.shot(page, "sp_09_race")
            ended = poll(lambda: gg(page, "!g.experiment.getState().run"), CONFIG["race_end_s"], 0.3)
            exp = gg(page, "g.growth.getState().experiments.find(e => e.topicId === a) || null", CONFIG["topic"])
            r.check("experiment runs to the end and is marked seen", ended and exp and exp["seenAt"], exp)
            r.check("lesson plays once the experiment ends", poll(lambda: gg(page, "g.walkthrough.getState().started && g.walkthrough.getState().playing"), 5))

        if go_live(page, r, url + "?return=1", "second return visit"):
            rerun = poll(lambda: gg(page, "!!g.experiment.getState().run") or "scheduler race" in (gg(page, "g.director.getState().caption") or "").lower(),
                         CONFIG["no_rerun_watch_s"], 0.1)
            r.check("a seen experiment does not run again", not rerun)
            page.evaluate("() => { const w = window.__gg.walkthrough.getState(); if (!w.started) w.start(); w.pause() }")

        # 7. Docs, in a fresh tab of the same profile: after three loads of the
        # GLB, Chromium's inspector cache starts evicting response bodies.
        page.close()
        page = open_page()
        if not go_live(page, r, url, "docs visit"):
            return finish(r, browser)
        page.evaluate("() => { const w = window.__gg.walkthrough.getState(); if (!w.started) w.start(); w.pause() }")
        # The upload is not tapped (a re-sent binary body is not byte-exact): its status
        # comes off the page's response log, the document off the app and GET /api/documents.
        tap = Tap(page, ["**/api/quiz", "**/api/quiz/submit"], CONFIG["quiz_timeout_s"])
        page.get_by_role("button", name=re.compile(r"^open learning", re.I)).click()
        hub(page, "upload")
        n = len(r.responses)
        page.locator('input[type="file"][accept*="pdf"]').set_input_files(str(CONFIG["fixture"]))
        sent = poll(lambda: next((st for u, st in r.responses[n:] if u.split("?")[0].endswith("/api/documents") and st != 200), None)
                    or (page.evaluate("() => 0") and None), CONFIG["upload_timeout_s"], 0.3)
        doc_id = poll(lambda: gg(page, "g.drawers.getState().documentId"), 5)
        listed = page.request.get(base + "/api/documents")
        doc = next((d for d in (listed.json() if listed.ok else []) if d.get("id") == doc_id), {}) if doc_id else {}
        topics = doc.get("topics") or []
        r.check("upload -> 201 DocumentInfo with topics", sent == 201 and doc.get("id") and topics,
                {"status": sent, "title": doc.get("title"), "pages": doc.get("pageCount"), "topics": [t.get("title") for t in topics]})
        if doc.get("id"):
            row = page.get_by_role("button", name=re.compile(re.escape(doc["title"]), re.I)).first
            chips = row.locator("span[class*=chip]").count() if row.count() else 0
            r.check("document listed with topic chips", row.count() and row.is_visible() and chips >= 1, {"chips": chips})
            r.check("room gets the new document's book", poll(lambda: has_object(page, f"evo-book-{doc['id']}"), 6), doc["id"])
            r.shot(page, "sp_10_upload")

            # Quiz on the document: question -> submit -> result with a citation; a replayed submit is idempotent.
            hub(page, "quiz")
            n = len(tap.calls)
            page.get_by_role("button", name=re.compile(r"start the quiz", re.I)).click()
            q = tap.next(page, n, lambda c: c["path"].endswith("/api/quiz"), CONFIG["quiz_timeout_s"]) or {}
            qset = q.get("json") or {}
            r.check("quiz: questions served", q.get("status") == 200 and len(qset.get("questions") or []) >= 1, {"status": q.get("status"), "n": len(qset.get("questions") or [])})
            choice = page.get_by_role("radiogroup", name=re.compile(r"choices", re.I)).get_by_role("radio").first
            if r.check("quiz: question with choices shown", poll(lambda: choice.count() and choice.is_visible(), 8)):
                choice.click()
                n = len(tap.calls)
                page.get_by_role("button", name=re.compile(r"check answer", re.I)).click()
                sub = tap.next(page, n, lambda c: c["path"].endswith("/api/quiz/submit"), CONFIG["chat_timeout_s"]) or {}
                result, body = sub.get("json") or {}, sub.get("post")
                quiz_chip = page.get_by_role("button", name=re.compile(r"^p\.\s*\d+")).last
                r.check("quiz: submit -> result with a citation chip", sub.get("status") == 200 and "correct" in result and result.get("citation")
                        and poll(lambda: quiz_chip.count() and quiz_chip.is_visible(), 5), {"status": sub.get("status"), "correct": result.get("correct")})
                r.shot(page, "sp_13_quiz")
                again = page.request.post(base + "/api/quiz/submit", data=body)
                same = again.status == 200 and again.json() == result
                r.check("quiz: same attemptId resubmitted -> same result", same, {"status": again.status, "attemptId": (body or {}).get("attemptId")})

        # No errors anywhere.
        bad = [f"{st} {u}" for u, st in r.responses if st >= 400 and not u.endswith("favicon.ico")]
        r.check("no failed requests", not bad, bad[:5])
        r.check("no page errors", not r.page_errors, r.page_errors[:5])
        r.check("no console errors", not r.console_errors, r.console_errors[:5])
        return finish(r, browser)


def finish(r: Run, browser) -> int:
    for ctx in browser.contexts:
        for p in ctx.pages:
            p.unroute_all(behavior="ignoreErrors")
    browser.close()
    failed = [c for c in r.checks if not c["ok"]]
    report = {"passed": len(r.checks) - len(failed), "failed": len(failed), "checks": r.checks}
    (r.out / CONFIG["report"]).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"\n{report['passed']} passed, {report['failed']} failed. Shots + report: {r.out}")
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=CONFIG["base"])
    ap.add_argument("--out", default=str(CONFIG["out"]))
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    sys.exit(run(a.base, Path(a.out), a.headed))
