"""Live stats for the Chatterbox voice run, on this Mac only: http://localhost:8779
Progress, speed, time left, chip and battery temperature (read from the Mac's own sensors), load, power and the latest clips.
Start it from the project folder: python3 tools/voice_dashboard.py"""
import glob, hashlib, json, os, re, subprocess, sys, time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, "src")
from voice_groups import jobs  # noqa: E402

NAMES = {"boot": "Old Boot", "rita": "Rita", "bench": "Bench", "rim": "Rim", "clock": "Shot Clock", "sneak": "Sneak", "pip": "Pip",
         "vera": "Queen Vera", "bea": "Bishop Bea", "site": "Site tours", "arteta": "Arteta", "berserker": "Berserker",
         "trader": "Trader", "escaped": "The Escaped"}
J = [(c, t, "cb_" + hashlib.sha1(f"{v}|{t}".encode()).hexdigest()[:12] + ".mp3") for v, t, c, k in jobs()]
BYNAME = {n: (c, t) for c, t, n in J}
TEMPS = deque(maxlen=720)   # one sample every few seconds while the page is open


def sh(*cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return ""


def build_tools():
    if not os.path.exists("tools/temps"):
        sh("clang", "-O2", "-o", "tools/temps", "tools/temps.c", "-framework", "IOKit", "-framework", "CoreFoundation")
    if not os.path.exists("tools/thermalstate"):
        open("tools/thermalstate.swift", "w").write("import Foundation\nprint(ProcessInfo.processInfo.thermalState.rawValue)\n")
        sh("swiftc", "-O", "tools/thermalstate.swift", "-o", "tools/thermalstate")


def temps():
    die, batt, ssd = [], [], []
    for line in sh("tools/temps").splitlines():
        name, _, v = line.partition("\t")
        try:
            v = float(v)
        except ValueError:
            continue
        if not 0 < v < 130:
            continue
        if "tdie" in name:
            die.append(v)
        elif "battery" in name:
            batt.append(v)
        elif "NAND" in name:
            ssd.append(v)
    avg = lambda a: round(sum(a) / len(a), 1) if a else None
    return {"hot": max(die) if die else None, "chip": avg(die), "battery": avg(batt), "ssd": avg(ssd)}


def process():
    for line in sh("ps", "-axo", "pid=,%cpu=,rss=,etime=,command=").splitlines():
        p = line.split(None, 4)
        if len(p) == 5 and "83_make_voice_cb.py" in p[4] and not p[4].startswith("caffeinate") and "Python" in p[4]:
            secs, parts = 0, p[3].replace("-", ":").split(":")
            for k, x in enumerate(reversed(parts)):
                secs += int(x) * (1, 60, 3600, 86400)[k]
            return {"cpu": float(p[1]), "mem": round(int(p[2]) / 1048576, 2), "up": secs}
    return None


def other_queue():
    """The ultimateball queue (pipelines/make_voices_cb.py in ~/games-platform), which waits for this job and records after it."""
    try:
        q = json.load(open(os.path.expanduser("~/games-platform/voice_cb_status.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return None
    q["running"] = subprocess.run(["pgrep", "-f", "make_voices_cb.py"], capture_output=True).returncode == 0
    names = {"bongi": "Bongi", "mic": "Maknae Mic", "pocha": "Pocha", "neko": "Neko", "pin": "Pin", "tock": "Tock", "dumpling": "Dumpling", "dogear": "Dog-ear"}
    q["chars"] = sorted(([names.get(c, NAMES.get(c, c)), d, t] for c, (d, t) in q.get("chars", {}).items()), key=lambda x: (x[1] / x[2], -x[2]))
    return q


SOURCES = ("src/bot_lines.json", "site/coach_lines.js", "site/mascot_lines.js", "site/chess_template.html", "site/opening_stories.js")
SEEN = [None]


def refresh_lines():   # lines can be added while the page is open: read the list again when a source file changes
    global J, BYNAME
    stamp = tuple(os.path.getmtime(f) for f in SOURCES if os.path.exists(f))
    if stamp != SEEN[0]:
        SEEN[0] = stamp
        J = [(c, t, "cb_" + hashlib.sha1(f"{v}|{t}".encode()).hexdigest()[:12] + ".mp3") for v, t, c, k in jobs()]
        BYNAME = {n: (c, t) for c, t, n in J}


def stats():
    refresh_lines()
    now = time.time()
    have, missing = [], []
    for c, t, n in J:
        try:
            have.append((os.path.getmtime("docs/voice/" + n), c, t, n))
        except OSError:
            missing.append((c, t, n))
    have.sort()
    proc = process()
    try:
        log = open("01_data_tts/cb_run.log", encoding="utf-8", errors="ignore").read()
    except OSError:
        log = ""
    m = re.search(r"(\d+) lines, (\d+) to make", log)
    run_total = int(m.group(2)) if m else len(missing)
    start = now - proc["up"] if proc else None
    run = [h for h in have if start and h[0] >= start]
    gaps = [(b[0] - a[0], len(b[2]), b[0]) for a, b in zip(run, run[1:]) if 0 < b[0] - a[0] < 600]
    last = gaps[-30:]
    per_line = sum(g[0] for g in last) / len(last) if last else None
    per_char = sum(g[0] for g in last) / sum(g[1] for g in last) if last else None
    eta = per_char * sum(len(t) for _, t, _ in missing) if per_char and proc else None
    chars = {}
    for c, t, n in J:
        chars.setdefault(c, [0, 0])[1] += 1
    for _, c, _, _ in have:
        chars[c][0] += 1
    tm = temps()
    if tm["hot"]:
        TEMPS.append([round(now), tm["hot"], tm["chip"]])
    batt = sh("pmset", "-g", "batt")
    pct = re.search(r"(\d+)%", batt)
    state = sh("tools/thermalstate").strip()
    return {
        "queue": other_queue(), "total": len(J), "done": len(have), "left": len(missing), "runTotal": run_total, "runDone": max(0, run_total - len(missing)),
        "running": bool(proc), "proc": proc, "perLine": per_line, "eta": eta, "speeds": [round(g[0], 1) for g in gaps[-90:]],
        "temps": tm, "tempHist": list(TEMPS)[-180:], "thermal": int(state) if state.isdigit() else None,
        "battery": int(pct.group(1)) if pct else None, "ac": "AC Power" in batt,
        "chars": sorted(([NAMES.get(c, c), d, t] for c, (d, t) in chars.items()), key=lambda x: (x[1] / x[2], -x[2])),
        "recent": [{"who": NAMES.get(c, c), "text": t, "file": n, "ago": round(now - mt)} for mt, c, t, n in reversed(have[-8:])],
    }


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, kind):
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/stats":
            return self.send(json.dumps(stats()).encode(), "application/json")
        m = re.fullmatch(r"/clip/(cb_[0-9a-f]{12}\.mp3)", path)
        if m and m.group(1) in BYNAME and os.path.exists("docs/voice/" + m.group(1)):
            return self.send(open("docs/voice/" + m.group(1), "rb").read(), "audio/mpeg")
        if path == "/":
            return self.send(open("tools/voice_dashboard.html", "rb").read(), "text/html; charset=utf-8")
        self.send_error(404)


if __name__ == "__main__":
    build_tools()
    ThreadingHTTPServer(("127.0.0.1", 8779), H).serve_forever()
