"""One-off: append the new lines in src/new_lines_sports.py and src/new_lines_chess.py to the sidekick line files.
Safe to re-run: a line already present is skipped."""
import json, re, sys
sys.path.insert(0, "src")
from new_lines_sports import NEW as SP
from new_lines_chess import NEW as CH


def add(path, start, end, data, kinds_only=None):
    s = open(path, encoding="utf-8").read(); i = s.index(start); j = s.index(end, i) if end else len(s)
    seg = s[i:j].split("\n"); char = None; added = 0; done = set()
    for n, line in enumerate(seg):
        m = re.match(r"^  (\w+): \{", line)
        if m: char = m.group(1); continue
        k = re.match(r"^(\s{4}(\w+): \[)(.*?)(\],?)\s*$", line)
        if char in data and k and k.group(2) in data[char] and (char, k.group(2)) not in done:
            done.add((char, k.group(2))); new = [t for t in data[char][k.group(2)] if json.dumps(t, ensure_ascii=False) not in line]
            if new:
                seg[n] = k.group(1) + k.group(3) + ", " + ", ".join(json.dumps(t, ensure_ascii=False) for t in new) + k.group(4); added += len(new)
    open(path, "w", encoding="utf-8").write(s[:i] + "\n".join(seg) + s[j:])
    miss = [(c, k) for c in data for k in data[c] if (c, k) not in done]
    print(path, "added", added, "missing", miss)


add("site/mascot_lines.js", "const MASCOT_LINES", None, SP)
add("site/coach_lines.js", "const COACH_LINES", "const OPEN_FACTS", {c: CH[c] for c in ("vera", "bea")} | {"pip": {k: CH["pip"][k] for k in ("win", "loss", "draw")}})
add("site/chess_template.html", "const PIP = {", "\n};", {"pip": {k: v for k, v in CH["pip"].items() if k not in ("win", "loss", "draw")}})
