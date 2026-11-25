"""Expressive voice clips with Chatterbox (Resemble AI, MIT licence) for every line in src/voice_groups.py.
Each character keeps their own voice: a short Kokoro sample of it (01_data_tts/ref/<voice>.wav) is the reference that
Chatterbox imitates, and its exaggeration setting gives the delivery: hyped characters higher, calm ones lower, deep lines
slower and softer. Chatterbox adds its own inaudible watermark (Perth) to every clip, as it is designed to.

Run in the background with:  .venv-cb/bin/python src/83_make_voice_cb.py
Resumable: lines that already have a Chatterbox clip are skipped. index.json is updated every few clips, so the site
picks up the new takes while it runs. Roughly 15 to 25 seconds a line on an Apple M4 GPU.
"""
import hashlib
import json
import os
import sys
import time

import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS

sys.path.insert(0, "src")
from voice_groups import jobs  # noqa: E402

OUT, SITE = "docs/voice", "af_heart"
STYLE = {"boot": 0.55, "rita": 0.4, "bench": 0.75, "rim": 0.55, "clock": 0.8, "sneak": 0.9, "pip": 0.6, "vera": 0.55, "bea": 0.4, "site": 0.45, "arteta": 0.4, "berserker": 0.85, "trader": 0.4, "escaped": 0.9}
HYPE = {"bighit", "streak", "best", "rankup", "brilliant", "great", "win"}
DEEP = {"deep", "brilliant_q", "brilliant_r", "brilliant_minor", "underpromo", "over", "rough_game", "loss"}
idx_path = os.path.join(OUT, "index.json")
J = jobs()
# a stopped run can leave up to 9 clips made but not yet in the index (it saves every 10); add them now so none go unused
_index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
_fix = {}
for v, t, c, k in J:
    name = "cb_" + hashlib.sha1(f"{v}|{t}".encode()).hexdigest()[:12] + ".mp3"
    key = t if v == SITE else f"{v}|{t}"
    if os.path.exists(os.path.join(OUT, name)) and _index.get(key) != name:
        _fix[key] = name
if _fix:
    _index.update(_fix); json.dump(_index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"indexed {len(_fix)} clips left over from a stopped run", flush=True)
# --rest N: pause N seconds after each line (gentler on a hot laptop; 15 is about half the load)
REST = float(sys.argv[sys.argv.index("--rest") + 1]) if "--rest" in sys.argv else 0
if "--index-only" in sys.argv:
    sys.exit(0)
dev = "mps" if torch.backends.mps.is_available() else "cpu"
model = ChatterboxTTS.from_pretrained(device=dev)
if REST:
    torch.set_num_threads(2)  # fewer CPU threads in gentle mode
todo = [(v, t, c, k) for v, t, c, k in J if not os.path.exists(os.path.join(OUT, "cb_" + hashlib.sha1(f"{v}|{t}".encode()).hexdigest()[:12] + ".mp3"))]
# --skip story: leave these kinds on their Kokoro clip (the long chess opening stories take twice as long each)
SKIP = set(sys.argv[sys.argv.index("--skip") + 1].split(",")) if "--skip" in sys.argv else set()
todo = [x for x in todo if x[3] not in SKIP]
print(f"{len(J)} lines, {len(todo)} to make on {dev}", flush=True)
t0, done = time.time(), 0
pending = {}
for v, t, c, k in todo:
    ex = STYLE.get(c, 0.5) + (0.15 if k in HYPE else -0.1 if k in DEEP else 0)
    cfg = 0.3 if k in DEEP else 0.45
    ref = f"01_data_tts/ref/{v}.wav"
    try:
        wav = model.generate(t, audio_prompt_path=ref if os.path.exists(ref) else None, exaggeration=max(0.25, min(1.0, ex)), cfg_weight=cfg)
    except Exception as e:
        print("  failed:", t[:60], e, flush=True); continue
    name = "cb_" + hashlib.sha1(f"{v}|{t}".encode()).hexdigest()[:12] + ".mp3"
    sf.write(os.path.join(OUT, name), wav.squeeze(0).cpu().numpy(), model.sr, format="MP3")
    pending[t if v == SITE else f"{v}|{t}"] = name; done += 1
    if REST:
        time.sleep(REST)  # cool-down between lines so the Mac does not run flat out
    if done % 10 == 0 or done == len(todo):
        index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
        index.update(pending); pending = {}
        json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        el = time.time() - t0
        print(f"  {done}/{len(todo)}  {el / done:.1f}s a line, about {el / done * (len(todo) - done) / 60:.0f} min left", flush=True)
print("done", flush=True)
