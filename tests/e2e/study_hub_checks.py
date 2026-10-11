"""Round 3 study hub checks, called from study_play_e2e.py (docs visit) or run alone:

    python tests/e2e/study_hub_checks.py [--base http://localhost:5176] [--out tmp/round3/accept]

Covers every hub card (upload, quiz, chat, Start Tutor Session -> pack -> lesson,
Record a Lecture via a short WAV, Mini Apps), the class switch and Beat the Boss.
/api/tts is always routed to a 503.
"""
import argparse
import io
import json
import re
import sys
import time
import uuid
import wave
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tmp" / "fixtures" / "cs111-fcfs.pdf"


def _poll(fn, timeout_s: float, step: float = 0.25):
    end = time.time() + timeout_s
    while time.time() < end:
        try:
            v = fn()
        except Exception:
            v = None
        if v:
            return v
        time.sleep(step)
    return None


def _tid(page: Page, t: str):
    return page.locator(f'[data-testid="{t}"]')


def _wav_bytes() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)  # one second of silence
    return buf.getvalue()


def _home(page: Page) -> None:
    if _tid(page, "hub-back").count() and _tid(page, "hub-back").is_visible():
        _tid(page, "hub-back").click()
    _tid(page, "hub-home").wait_for(state="visible", timeout=8000)


def _open_learning(page: Page) -> None:
    btn = page.locator('button[aria-label="Open Learning"]')
    if btn.count() and btn.first.is_visible():
        btn.first.click()
    back = _tid(page, "hub-back")
    if _poll(lambda: back.count() and back.is_visible(), 2):
        back.click()
    _tid(page, "hub-home").wait_for(state="visible", timeout=10000)


TUMBLE_JS = "async () => (await import('/src/state/tumbles.ts')).useTumbles.getState().last?.cause ?? null"
PACK_JS = "async () => { const p = (await import('/src/lesson/packSession.ts')).useLessonPack.getState().pack; return p ? { title: p.title, n: p.sections.length, source: p.source } : null }"


def hub_section(page: Page, check, base: str, shot=None) -> None:
    """check(name, ok, detail) records one result; shot(page, name) saves a screenshot."""
    shot = shot or (lambda p, n: None)
    _open_learning(page)
    study = page.evaluate("() => window.__ggStudy || null")
    tutor_id = (study or {}).get("tutorId") or "cs111"
    cards = {t: _tid(page, t).count() for t in ("hub-boss", "hub-card-upload", "hub-card-quiz", "hub-card-chat", "hub-card-tutor", "hub-card-record", "hub-card-mini")}
    check("hub: Learning drawer home shows the boss hero and six cards", all(cards.values()), cards)
    shot(page, "r3_01_hub")

    # Upload Materials into the current class.
    _tid(page, "hub-card-upload").click()
    before = {d["id"] for d in page.request.get(f"{base}/api/documents?tutorId={tutor_id}").json()}
    page.locator('input[type="file"][accept*="pdf"]').first.set_input_files(str(FIXTURE))
    new_doc = _poll(lambda: next((d for d in page.request.get(f"{base}/api/documents?tutorId={tutor_id}").json() if d["id"] not in before), None), 90, 1)
    check("hub upload: fixture PDF saved in the current class", bool(new_doc) and new_doc.get("tutorId") == tutor_id,
          {"id": (new_doc or {}).get("id"), "tutorId": (new_doc or {}).get("tutorId"), "topics": len((new_doc or {}).get("topics") or [])})
    _home(page)

    # Create Quiz and Chat cards open their panes.
    _tid(page, "hub-card-quiz").click()
    quiz_ok = _poll(lambda: page.evaluate("() => window.__ggStudy?.view") == "quiz", 3)
    _home(page)
    _tid(page, "hub-card-chat").click()
    chat_ok = _poll(lambda: page.evaluate("() => window.__ggStudy?.view") == "chat", 3)
    check("hub: Create Quiz and Chat cards open their views", quiz_ok and chat_ok, {"quiz": quiz_ok, "chat": chat_ok})
    _home(page)

    # Mini Apps.
    _tid(page, "hub-card-mini").click()
    _tid(page, "mini-flash").click()
    flip = page.get_by_role("button", name=re.compile(r"show the key terms", re.I)).first
    flipped = False
    if flip.count():
        flip.dispatch_event("click")  # the card sits under the drawer's scroll shadow; a real click is intercepted
        flipped = bool(_poll(lambda: page.get_by_role("button", name=re.compile(r"show the topic", re.I)).count(), 3))
    _tid(page, "mini-timer").click()
    # Only the timer's own box: the lesson page has its own Start / Pause buttons.
    panel = page.locator('[role="timer"]').first.locator("xpath=..")
    start = panel.get_by_role("button", name=re.compile(r"^(start|resume)$", re.I)).first
    timer_ok = False
    if start.count():
        start.dispatch_event("click")
        pause = panel.get_by_role("button", name=re.compile(r"^pause$", re.I)).first
        timer_ok = bool(_poll(lambda: pause.count() and pause.is_visible(), 3))
        if timer_ok:
            pause.dispatch_event("click")
    _tid(page, "mini-terms").click()
    terms = page.locator('[role="tabpanel"] li').count()
    check("mini apps: flashcard flips, timer starts and pauses, key terms listed", flipped and timer_ok and terms > 0,
          {"flipped": flipped, "timer": timer_ok, "terms": terms})
    _home(page)

    # Record a Lecture via the file input.
    health = page.request.get(f"{base}/api/health").json()
    _tid(page, "hub-card-record").click()
    _tid(page, "record-file").set_input_files(files=[{"name": "e2e-lecture.wav", "mimeType": "audio/wav", "buffer": _wav_bytes()}])
    # The fixture is one second of silence: it must be refused, never saved as an invented lecture.
    msg = _poll(lambda: page.locator('[role="alert"]').count() and page.locator('[role="alert"]').first.inner_text(), 30)
    check("record: a silent WAV is refused with the no-speech message and nothing is saved",
          bool(msg) and "no speech" in str(msg).lower() and _tid(page, "record-saved").count() == 0,
          {"alert": msg, "saved": _tid(page, "record-saved").count(), "geminiConfigured": health.get("geminiConfigured")})
    _home(page)

    # Start Tutor Session on the uploaded doc.
    _tid(page, "hub-card-tutor").click()
    if new_doc:
        _tid(page, f"session-doc-{new_doc['id']}").click()
        ready = _poll(lambda: _tid(page, "session-start").count() or page.locator('[role="alert"]').count(), 75, 1)
        sections = page.locator('[data-testid^="session-section-"]').count()
        check("session: pack arrives and sections are listed", bool(ready) and sections > 0 and _tid(page, "session-start").count(),
              {"sections": sections, "alert": page.locator('[role="alert"]').all_inner_texts()})
        shot(page, "r3_02_session")
        if _tid(page, "session-start").count():
            _tid(page, "session-start").click()
            pack = _poll(lambda: page.evaluate(PACK_JS), 5)
            label = _poll(lambda: (lambda t: t if new_doc["title"] in t else None)(_tid(page, "walk-step-label").inner_text()), 8)
            check("session start: pack lesson running, step label has the doc title", bool(pack) and bool(label),
                  {"pack": pack, "label": label})
            time.sleep(2.5)
            shot(page, "r3_03_pack_lesson")
            _open_learning(page)

    # Class switch: the uploaded doc is not listed under another class.
    _tid(page, "class-switcher").click()
    others = [el.get_attribute("data-testid") for el in page.locator('[data-testid^="class-option-"]').all()]
    other = next((o for o in others if o != f"class-option-{tutor_id}"), None)
    if other:
        other_id = other.removeprefix("class-option-")
        page.locator(f'[data-testid="{other}"]').click()
        moved = _poll(lambda: page.url.rstrip("/").endswith(f"/tutor/{other_id}"), 8)
        listed = page.request.get(f"{base}/api/documents?tutorId={other_id}").json()
        absent = not any(d["id"] == (new_doc or {}).get("id") for d in listed)
        check("class switch: navigates; uploaded doc not listed under the other class", bool(moved) and absent,
              {"to": other_id, "url": page.url, "docs_there": len(listed)})
    else:
        page.keyboard.press("Escape")
        check("class switch: a second class exists", False, others)


def boss_section(page: Page, check, base: str, shot=None) -> None:
    shot = shot or (lambda p, n: None)
    _open_learning(page)
    _tid(page, "hub-boss").click()
    layer = _tid(page, "boss-layer")
    layer.wait_for(state="visible", timeout=8000)
    pick_doc = page.locator('[data-testid^="boss-doc-"]')
    if pick_doc.count():
        pick_doc.first.click()
    topic = page.locator('[data-testid^="boss-topic-"]')
    _poll(lambda: topic.count(), 20)
    topic.first.click()
    _poll(lambda: _tid(page, "boss-choice-0").count(), 30)
    shot(page, "r3_04_boss")
    hearts0 = int(_tid(page, "boss-hearts").get_attribute("data-hearts") or -1)
    got: dict = {"right": None, "wrong": None}
    try:
        # Answer one right and one wrong on purpose: a separate probe submit asks the
        # server for the correct choice (the page itself never has it before answering).
        for key in ("right", "wrong"):
            if not _poll(lambda: _tid(page, "boss-choice-0").count(), 20):
                break
            qid = page.locator("[data-question-id]").first.get_attribute("data-question-id")
            probe = page.request.post(f"{base}/api/quiz/submit", data={"questionId": qid, "choice": 0, "attemptId": f"e2e-probe-{uuid.uuid4().hex}"}).json()
            answer = int(probe["correctChoice"])
            n = _tid(page, "boss-choice-0").locator("xpath=..").locator('[data-testid^="boss-choice-"]').count()
            pick = answer if key == "right" else (answer + 1) % max(n, 2)
            before = int(_tid(page, "boss-hearts").get_attribute("data-hearts") or -1)
            _tid(page, f"boss-choice-{pick}").click()
            res = _tid(page, "boss-result")
            _poll(lambda: res.count(), 20)
            after = int(_tid(page, "boss-hearts").get_attribute("data-hearts") or -1)
            got[key] = {"hearts_before": before, "hearts_after": after, "correct": res.get_attribute("data-correct") == "true"}
            if _tid(page, "boss-next").count():
                _tid(page, "boss-next").first.click()
        wrong = got["wrong"] or {}
        right = got["right"] or {}
        cause = page.evaluate(TUMBLE_JS)
        check("boss: a wrong answer costs one heart", wrong.get("correct") is False and wrong["hearts_after"] == wrong["hearts_before"] - 1, {"start": hearts0, **got})
        check("boss: wrong answer knocks him into a 'boss' tumble", cause == "boss", cause)
        check("boss: a right answer keeps the hearts", right.get("correct") is True and right["hearts_after"] == right["hearts_before"], got["right"])
        shot(page, "r3_05_boss_after")
    finally:
        # Always close, so a failure here cannot leave the overlay over the hub checks.
        if _tid(page, "boss-close").count():
            _tid(page, "boss-close").click()
    check("boss: close removes the overlay", bool(_poll(lambda: not _tid(page, "boss-layer").count(), 4)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5176")
    ap.add_argument("--out", default=str(ROOT / "tmp" / "round3" / "accept"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []

    def check(name, ok, detail=None):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})
        print(("PASS " if ok else "FAIL ") + name + "  " + json.dumps(detail, default=str)[:220])
        return bool(ok)

    def shot(p, n):
        p.screenshot(path=str(out / f"{n}.png"))

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        page = b.new_page(viewport={"width": 1440, "height": 900})
        page.route_web_socket(re.compile(r".*"), lambda ws: None)  # no HMR reloads from other agents
        page.route("**/api/tts**", lambda r: r.fulfill(status=503, body="{}", content_type="application/json"))
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(a.base + "/tutor/cs111", wait_until="domcontentloaded")
        page.locator('[aria-label="Start lesson"]').click(timeout=30000)
        _poll(lambda: page.locator('button[aria-label="Open Learning"]').count(), 60, 0.5)
        for section in (boss_section, hub_section):
            try:
                section(page, check, a.base, shot)
            except Exception as e:  # report and carry on to the next section
                check(f"{section.__name__} ran without an exception", False, str(e)[:300])
                shot(page, f"r3_err_{section.__name__}")
        check("no page errors", not errors, errors[:5])
        b.close()
    failed = [c for c in checks if not c["ok"]]
    (out / "study_hub_report.json").write_text(json.dumps({"passed": len(checks) - len(failed), "failed": len(failed), "checks": checks}, indent=2, default=str), encoding="utf-8")
    print(f"\n{len(checks) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
