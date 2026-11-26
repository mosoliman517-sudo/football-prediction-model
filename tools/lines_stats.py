"""A stats page about the voice lines: python3 tools/lines_stats.py OUT.html [BASE_COMMIT]
Counts every line from src/voice_groups.py now and as it was at BASE_COMMIT, and which clips exist."""
import collections
import html
import json
import os
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, "src")
from voice_groups import jobs  # noqa: E402

OUT, BASE = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "HEAD"
NAMES = {"escaped": "The Escaped", "arteta": "Mikel Arteta", "berserker": "The Berserker", "trader": "The Trader", "pip": "Pip", "bea": "Bishop Bea", "vera": "Queen Vera", "council": "The Council",
         "boot": "Old Boot", "rita": "Ref Rita", "bench": "Bench", "rim": "Rim", "clock": "Shot Clock", "sneak": "Sneak", "site": "Site tours"}
FILES = ["src/voice_groups.py", "src/voice_lines.json", "src/bot_lines.json", "site/mascot_lines.js", "site/coach_lines.js", "site/chess_template.html", "site/opening_stories.js"]


def before():
    with tempfile.TemporaryDirectory() as d:
        for f in FILES:
            os.makedirs(os.path.join(d, os.path.dirname(f)), exist_ok=True)
            open(os.path.join(d, f), "wb").write(subprocess.run(["git", "show", f"{BASE}:{f}"], capture_output=True, check=True).stdout)
        code = "import sys,json;sys.path.insert(0,'src');from voice_groups import jobs;print(json.dumps(jobs()))"
        return json.loads(subprocess.run([sys.executable, "-c", code], cwd=d, capture_output=True, check=True, text=True).stdout)


now, old = jobs(), {(v, t) for v, t, c, k in before()}
index = json.load(open("docs/voice/index.json", encoding="utf-8"))
chars = collections.defaultdict(lambda: collections.Counter())
for v, t, c, k in now:
    x = chars[c]
    x["all"] += 1
    x["new"] += (v, t) not in old
    clip = index.get(t if v == "af_heart" else f"{v}|{t}")
    if clip and os.path.exists("docs/voice/" + clip):
        x["tb" if clip.startswith("tb_") else "cb" if clip.startswith("cb_") else "ko"] += 1
bots = json.load(open("src/bot_lines.json", encoding="utf-8"))
GROUPS = [("Sacrifices", ["u_sac_good", "u_sac_dubious", "u_sac_blunder", "u_sac_taken", "my_sac", "my_sac_taken", "my_sac_declined"]),
          ("Great moves and blunders", ["u_brilliant", "u_blunder", "my_blunder"]),
          ("Captures", ["take", "ouch", "trade", "took_queen", "lost_queen"]),
          ("Checks", ["give_check", "check", "escape"]),
          ("How the game is going", ["comeback", "collapse", "ahead", "behind", "defend", "tense"]),
          ("Phases", ["start", "rival", "open", "mid", "endgame"]),
          ("Your style", ["u_aggressive", "u_passive", "u_weird", "castle_u"]),
          ("Promotion", ["promo_u", "promo_me"]),
          ("Endings", ["win", "win_mate", "win_time", "lose", "lose_mate", "lose_time", "draw", "stalemate"]),
          ("Banter", ["trait", "taunt", "story"])]
LABEL = {"u_sac_good": "You sacrifice, soundly", "u_sac_dubious": "You sacrifice, doubtfully", "u_sac_blunder": "You just hang it", "u_sac_taken": "They take yours", "my_sac": "They offer one", "my_sac_taken": "You take theirs", "my_sac_declined": "You decline theirs",
         "u_brilliant": "Your only strong move", "u_blunder": "Your blunder", "my_blunder": "Their blunder", "take": "They win a piece", "ouch": "They lose a piece", "trade": "Even trade", "took_queen": "They take your queen", "lost_queen": "They lose their queen",
         "give_check": "They give check", "check": "They are in check", "escape": "They escape check", "comeback": "Comeback", "collapse": "Lead thrown away", "ahead": "Far ahead", "behind": "Far behind", "defend": "Only defence found", "tense": "Close game",
         "start": "Greeting", "rival": "Your coach on them", "open": "Opening", "mid": "Middlegame", "endgame": "Endgame", "u_aggressive": "You attack", "u_passive": "You shuffle", "u_weird": "Odd move", "castle_u": "You castle",
         "promo_u": "You promote", "promo_me": "They promote", "win": "They win", "win_mate": "They mate you", "win_time": "You run out of time", "lose": "They lose", "lose_mate": "They are mated", "lose_time": "Their time runs out", "draw": "Draw", "stalemate": "Stalemate",
         "trait": "Signature move", "taunt": "Trash talk", "story": "Stories"}
ORDER = ["escaped", "arteta", "berserker", "trader", "pip", "bea", "vera", "council"]
e = html.escape
total, new = sum(x["all"] for x in chars.values()), sum(x["new"] for x in chars.values())
have = sum(x["tb"] + x["cb"] + x["ko"] for x in chars.values())
order = sorted(chars, key=lambda c: -chars[c]["new"])
top = max(chars[c]["all"] for c in chars)
bars = "".join(f'<tr><th scope="row">{e(NAMES.get(c, c))}</th><td class="bar"><span style="width:{100 * (chars[c]["all"] - chars[c]["new"]) / top:.1f}%"></span><span class="n" style="width:{100 * chars[c]["new"] / top:.1f}%"></span></td><td>{chars[c]["all"]:,}</td><td class="new">+{chars[c]["new"]:,}</td></tr>' for c in order)
voices = "".join(f'<tr><th scope="row">{e(NAMES.get(c, c))}</th><td>{chars[c]["tb"] or "·"}</td><td>{chars[c]["cb"] or "·"}</td><td>{chars[c]["ko"] or "·"}</td><td>{chars[c]["all"] - chars[c]["tb"] - chars[c]["cb"] - chars[c]["ko"] or "·"}</td></tr>' for c in order)
rows = ""
for group, kinds in GROUPS:
    rows += f'<tr class="g"><th colspan="{len(ORDER) + 1}">{e(group)}</th></tr>'
    for k in kinds:
        cells = ""
        for b in ORDER:
            n = len(bots[b].get(k, []))
            cells += f'<td style="--a:{min(n, 10) * 7}%">{n or "·"}</td>'
        rows += f'<tr><th scope="row">{e(LABEL.get(k, k))}</th>{cells}</tr>'
squad = sorted({k.split(":", 1)[1] for k in bots["arteta"] if ":" in k})
head = "".join(f"<th>{e(NAMES[b].replace('The ', '').replace('Mikel ', '').replace('Bishop ', '').replace('Queen ', ''))}</th>" for b in ORDER)
page = f"""<title>Voice Line Stats</title>
<style>
/* layout: one column; three tables, widest scrolls inside itself */
:root{{--bg:#f6f3ee;--panel:#fff;--ink:#1c1a22;--dim:#66616f;--line:#e2ddd4;--old:#b9b2c4;--hot:#a3226b}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#141219;--panel:#1d1a24;--ink:#f1eef6;--dim:#a49db1;--line:#302b3a;--old:#57506a;--hot:#ff6db3;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#141219;--panel:#1d1a24;--ink:#f1eef6;--dim:#a49db1;--line:#302b3a;--old:#57506a;--hot:#ff6db3;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding-block:28px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
main{{max-width:900px;margin:0 auto;display:grid;gap:26px;grid-template-columns:minmax(0,1fr)}}
h1{{font:800 34px/1.1 Georgia,serif;margin:0}} h2{{font:700 20px Georgia,serif;margin:0 0 8px}} p{{margin:6px 0;color:var(--dim);max-width:65ch}}
.big{{display:flex;flex-wrap:wrap;gap:26px;margin-top:14px}} .big b{{display:block;font:800 34px/1 Georgia,serif;font-variant-numeric:tabular-nums}} .big div:nth-child(2) b{{color:var(--hot)}} .big span{{color:var(--dim)}}
.scroll{{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:6px 12px}}
table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}} th,td{{padding:5px 8px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}} th[scope=row],tr.g th{{text-align:left;font-weight:500}} thead th{{color:var(--dim);font-size:12px}}
tr.g th{{font-weight:800;padding-top:14px;color:var(--hot)}} .matrix td{{text-align:center;background:color-mix(in srgb,var(--hot) var(--a),transparent)}} .matrix thead th{{text-align:center}}
.bar{{width:100%;min-width:90px;text-align:left}} .bar span{{display:inline-block;height:11px;background:var(--old);vertical-align:middle}} .bar span.n{{background:var(--hot)}} .new{{color:var(--hot);font-weight:700}}
</style>
<main>
<header><h1>Voice Line Stats</h1><p>ballknowledge characters and sidekicks, counted {time.strftime("%-d %B %Y, %H:%M")} from the project files. A snapshot, not live.</p>
<div class="big"><div><b>{total:,}</b><span>lines in all</span></div><div><b>+{new:,}</b><span>added in this update</span></div><div><b>{have:,}</b><span>have a recording</span></div><div><b>{total - have:,}</b><span>still to record</span></div></div></header>
<section><h2>Lines per character</h2><p>Grey is what was there before, pink is new. Coaches also carry the shared opening stories.</p><div class="scroll"><table><thead><tr><th></th><th></th><th>Total</th><th>New</th></tr></thead><tbody>{bars}</tbody></table></div></section>
<section><h2>Who reacts to what</h2><p>Number of lines each chess opponent has for each situation. A dot means none (signature moves differ by character).</p><div class="scroll"><table class="matrix"><thead><tr><th></th>{head}</tr></thead><tbody>{rows}</tbody></table></div>
<p>Arteta also has lines by player name for his own pieces: {e(", ".join(squad))}.</p></section>
<section><h2>Which voice engine</h2><p>Turbo is Chatterbox Turbo (can laugh and sigh), used for the Escaped and Arteta. Chatterbox is the earlier expressive run. Kokoro is the quick voice.</p><div class="scroll"><table><thead><tr><th></th><th>Turbo</th><th>Chatterbox</th><th>Kokoro</th><th>Not yet</th></tr></thead><tbody>{voices}</tbody></table></div></section>
</main>"""
open(OUT, "w", encoding="utf-8").write(page)
print(f"{total} lines, {new} new, {have} recorded")
