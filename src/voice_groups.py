"""Every line the site speaks, with who says it and how: shared by src/80_make_voice.py (Kokoro, fast) and
src/83_make_voice_cb.py (Chatterbox, expressive). Returns a list of jobs: (voice, text, char, mood).

Sources: site/mascot_lines.js (football and basketball sidekicks), site/coach_lines.js (chess coaches and opening
facts), PIP and PIP_POP in site/chess_template.html (Pip), and src/voice_lines.json (the tours and short chess calls).
"""
import json
import re

CHAR_VOICE = {"boot": "bm_george", "rita": "bf_emma", "bench": "am_puck", "rim": "am_michael", "clock": "am_eric", "sneak": "am_fenrir",
              "pip": "am_liam", "vera": "bf_isabella", "bea": "bf_alice"}
SPORT_CHARS = {"fb": ["boot", "rita", "bench"], "bb": ["rim", "clock", "sneak"], "ch": ["pip", "vera", "bea"]}
STR = re.compile(r'"((?:[^"\\]|\\.)*)"')


def _blocks(path, top_names):
    """Strings per (char, kind) from objects shaped { char: { kind: ["...", ...] } } at two-space indentation."""
    out, char = [], None
    for line in open(path, encoding="utf-8"):
        m = re.match(r"^  (\w+): \{", line)
        if m:
            char = m.group(1)
            continue
        if re.match(r"^\S", line):
            char = None
        k = re.match(r"^\s{4}(\w+): \[", line)
        if char and k:
            for t in STR.findall(line):
                if len(t) > 12:
                    out.append((char, k.group(1), t))
    return out


def jobs():
    J = []
    for char, kind, t in _blocks("site/mascot_lines.js", None):
        J.append((CHAR_VOICE[char], t, char, kind))
    for char, kind, t in _blocks("site/coach_lines.js", None):
        if char in CHAR_VOICE:
            J.append((CHAR_VOICE[char], t, char, kind))
    src = open("site/chess_template.html", encoding="utf-8").read()
    i = src.index("const PIP = {"); j = src.index("\n};", i)
    for m in re.finditer(r"^\s+(\w+): \[(.*)\],?$", src[i:j], re.M):
        for t in STR.findall(m.group(2)):
            J.append(("am_liam", t, "pip", m.group(1)))
    i = src.index("const PIP_POP = {"); j = src.index("};", i)
    for t in STR.findall(src[i:j]):
        if len(t) > 20:
            J.append(("am_liam", t, "pip", "pop"))
    facts = [t for t in STR.findall(open("site/coach_lines.js", encoding="utf-8").read()) if t.startswith("Fun fact:")]
    lines = json.load(open("src/voice_lines.json", encoding="utf-8"))
    for c in SPORT_CHARS["ch"]:
        J += [(CHAR_VOICE[c], t, c, "fact") for t in facts]
        J += [(CHAR_VOICE[c], t, c, "call") for t in lines.get("chess", [])]
    for c in SPORT_CHARS["fb"]:
        J += [(CHAR_VOICE[c], t, c, "tour") for t in lines.get("football_tour", [])]
    for c in SPORT_CHARS["bb"]:
        J += [(CHAR_VOICE[c], t, c, "tour") for t in lines.get("basketball_tour", [])]
    J += [("af_heart", t, "site", "tour") for g in ("football_tour", "basketball_tour", "chess") for t in lines.get(g, [])]
    seen, out = set(), []
    for v, t, c, k in J:
        t = " ".join(t.replace('\\"', '"').split())
        if (v, t) not in seen:
            seen.add((v, t)); out.append((v, t, c, k))
    return out


if __name__ == "__main__":
    J = jobs()
    from collections import Counter
    print(len(J), "lines;", dict(Counter(c for _, _, c, _ in J)))
