"""Writes site/bot_lines.js from src/bot_lines.json (the lines the playable characters speak)."""
import json, re
V = {'arteta': 'bm_daniel', 'berserker': 'am_adam', 'trader': 'am_onyx', 'escaped': 'bm_fable', 'pip': 'am_liam', 'bea': 'bf_alice', 'vera': 'bf_isabella'}
d = json.load(open("src/bot_lines.json", encoding="utf-8"))
clean = lambda t: " ".join(re.sub(r"\[[a-z ]+\]", " ", t).split())   # [laugh] and friends are for the voice only
d = {who: {kind: [[x[0], clean(x[1])] if isinstance(x, list) else clean(x) for x in ls] for kind, ls in kinds.items()} for who, kinds in d.items()}
open("site/bot_lines.js", "w", encoding="utf-8").write("/* generated from src/bot_lines.json: what each playable character says. Edit the JSON, then run python3 src/bot_lines_js.py */\nconst BOT_LINES = " + json.dumps(d, ensure_ascii=False) + ";\nconst BOT_VOICE = " + json.dumps(V) + ";\n")
