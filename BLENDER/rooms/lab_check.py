"""Opens a room GLB in lab/rooms.html (the app's camera, platform, windows and
tutor) in headless Chromium, saves a screenshot and prints window.__rooms as
one `LAB_REPORT {json}` line. Exit 1 if the page failed or a required node is
missing. Needs the dev server on :5176 (never started or restarted from here).

Any local .glb works: the page asks for /__rooms/<name> and the route answers
from disk, so files under tmp/ (which Vite will not serve) load too.

  python BLENDER/rooms/lab_check.py tmp/rooms/smoke.glb --out tmp/rooms/smoke.png [--query "guides=1&pan=board"]
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
SETTLE_MS = 3000  # the tutor GLB, the window fonts and a few frames after the room is in


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('glb')
    ap.add_argument('--out', required=True)
    ap.add_argument('--query', default='', help='extra lab params, e.g. "guides=1&pan=board"')
    ap.add_argument('--ui', action='store_true', help='keep the lab panel in the shot')
    a = ap.parse_args()
    glb = Path(a.glb).resolve()
    body = glb.read_bytes()
    url = '%s?file=%s%s%s%s' % (LAB, FAKE, glb.name, '' if a.ui else '&ui=0', '&' + a.query if a.query else '')
    logs = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=VIEW)
        # Routes go in before the first navigation: TTS is billed, so it never gets through.
        page.route('**/api/tts', lambda r: r.fulfill(status=503, body='lab: no tts'))
        # Matched on the path: a glob would also catch the page itself (its query names the file).
        page.route(lambda u: urlsplit(u).path.startswith(FAKE),
                   lambda r: r.fulfill(status=200, body=body, headers={'content-type': 'model/gltf-binary'}))
        page.on('console', lambda m: logs.append('%s: %s' % (m.type, m.text)))
        for attempt in range(2):  # the dev server restarts itself on server/** edits: retry a reset once
            try:
                page.goto(url, wait_until='domcontentloaded')
                break
            except PlaywrightError:
                if attempt:
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
        if '[rooms]' in line or line.startswith('error'):
            print(line)
    return 0 if report.get('ready') and not report.get('missing') else 1


if __name__ == '__main__':
    sys.exit(main())
