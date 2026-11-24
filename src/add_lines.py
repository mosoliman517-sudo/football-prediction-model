"""One-off: append the new lines in src/new_lines_sports.py and src/new_lines_chess.py to the sidekick line files.
Safe to re-run: a line already present is skipped."""
import json, re, sys
sys.path.insert(0, "src")
import importlib


def add(path, start, end, data, flat=False):
    s = open(path, encoding="utf-8").read(); i = s.index(start); j = s.index(end, i) if end else len(s)
    seg = s[i:j].split("\n"); char = None; added = 0; done = set()
    for n, line in enumerate(seg):
        m = re.match(r"^  (\w+): \{", line)
        if m and not flat: char = m.group(1); continue
        k = re.match(r"^(  (\w+): \[)(.*?)(\],?)\s*$", line) if flat else re.match(r"^(\s{4}(\w+): \[)(.*?)(\],?)\s*$", line)
        if flat: char = "pip"
        if char in data and k and k.group(2) in data[char] and (char, k.group(2)) not in done:
            done.add((char, k.group(2))); new = [t for t in data[char][k.group(2)] if json.dumps(t, ensure_ascii=False) not in line]
            if new:
                seg[n] = k.group(1) + k.group(3) + ", " + ", ".join(json.dumps(t, ensure_ascii=False) for t in new) + k.group(4); added += len(new)
    open(path, "w", encoding="utf-8").write(s[:i] + "\n".join(seg) + s[j:])
    miss = [(c, k) for c in data for k in data[c] if (c, k) not in done]
    print(path, "added", added, "missing", miss)


PIP_COACH = ("win", "loss", "draw", "forced")
for suffix in ("", "2"):
    SP = importlib.import_module("new_lines_sports" + suffix).NEW; CH = importlib.import_module("new_lines_chess" + suffix).NEW
    add("site/mascot_lines.js", "const MASCOT_LINES", None, SP)
    add("site/coach_lines.js", "const COACH_LINES", "const OPEN_FACTS", {c: CH[c] for c in ("vera", "bea")} | {"pip": {k: v for k, v in CH["pip"].items() if k in PIP_COACH}})
    add("site/chess_template.html", "const PIP = {", "\n};", {"pip": {k: v for k, v in CH["pip"].items() if k not in PIP_COACH}}, flat=True)
