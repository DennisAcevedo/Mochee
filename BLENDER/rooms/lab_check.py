"""Opens a room GLB in lab/rooms.html (the app's camera, platform, window and
tutor) in headless Chromium, saves a screenshot and prints window.__rooms as
one `LAB_REPORT {json}` line. Exit 1 if the page failed, a required node is
missing, or the page threw (pageerror) or logged a console error. Needs the
dev server on :5176 (never started or restarted from here).

Any local .glb works: the page asks for /__rooms/<name> and the route answers
from disk, so files under tmp/ (which Vite will not serve) load too.

  python BLENDER/rooms/lab_check.py tmp/rooms/smoke.glb --out tmp/rooms/smoke.png [--query "guides=1&pan=notes"]
"""

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

LAB = 'http://localhost:5176/lab/rooms.html'
VIEW = {'width': 1456, 'height': 785}  # the viewport the contract's camera frame was measured at
FAKE = '/__rooms/'
TTS = '/api/tts'  # routed to a 503 on purpose (billed): its failed load is not a page error
# After the room is in: the tutor GLB, then the window, which suspends until
# its text fonts are parsed (about 5 s on a cold dev server; 3 s missed them).
SETTLE_MS = 8000


def _expected(m):
    """A console error the check itself causes: the TTS route's 503."""
    url = (m.location or {}).get('url') or ''
    return urlsplit(url).path == TTS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb')
    ap.add_argument('--out', required=True)
    ap.add_argument('--query', default='', help='extra lab params, e.g. "guides=1&pan=notes"')
    ap.add_argument('--ui', action='store_true', help='keep the lab panel in the shot')
    a = ap.parse_args()
    glb = Path(a.glb).resolve()
    body = glb.read_bytes()
    url = '%s?file=%s%s%s%s' % (LAB, FAKE, glb.name, '' if a.ui else '&ui=0', '&' + a.query if a.query else '')
    logs, errors = [], []

    def on_console(m):
        logs.append('%s: %s' % (m.type, m.text))
        if m.type == 'error' and not _expected(m):
            errors.append('console error: %s' % m.text)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=VIEW)
        # Routes go in before the first navigation: TTS is billed, so it never gets through.
        page.route('**' + TTS, lambda r: r.fulfill(status=503, body='lab: no tts'))
        # Matched on the path: a glob would also catch the page itself (its query names the file).
        page.route(lambda u: urlsplit(u).path.startswith(FAKE),
                   lambda r: r.fulfill(status=200, body=body, headers={'content-type': 'model/gltf-binary'}))
        page.on('console', on_console)
        page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
        tries = 5  # the dev server restarts itself on server/** edits: retry a reset a few times
        for attempt in range(tries):
            try:
                page.goto(url, wait_until='domcontentloaded')
                break
            except PlaywrightError:
                if attempt == tries - 1:
                    raise
                page.wait_for_timeout(3000)
        page.wait_for_function('window.__rooms && (window.__rooms.ready || window.__rooms.error)', timeout=60000)
        page.wait_for_timeout(SETTLE_MS)
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=a.out)
        report = page.evaluate('window.__rooms')
        browser.close()
    print('LAB_REPORT ' + json.dumps(report))
    for line in logs:
        if '[rooms]' in line:
            print(line)
    for line in errors:
        print('LAB ERROR', line)
    return 0 if report.get('ready') and not report.get('missing') and not errors else 1


if __name__ == '__main__':
    sys.exit(main())
