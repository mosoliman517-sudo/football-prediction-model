"""Fast voice clips with Kokoro-82M for every line in src/voice_groups.py: docs/voice/<hash>.mp3 + docs/voice/index.json.
Every line gets a clip in seconds; src/83_make_voice_cb.py then replaces them with expressive Chatterbox takes.

Run with:  .venv-tts/bin/python src/80_make_voice.py
Needs 01_data_tts/kokoro-v1.0.int8.onnx and voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx, release model-files-v1.0).
index.json keys are the text (site voice, af_heart) or "voice|text"; a Chatterbox take for the same key wins.
"""
import hashlib
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

sys.path.insert(0, "src")
from voice_groups import jobs  # noqa: E402

SPEED, OUT, SITE = 1.05, "docs/voice", "af_heart"
PACE = {"boot": 0.95, "bench": 1.12, "clock": 1.18, "sneak": 1.1, "pip": 1.12, "vera": 0.95, "bea": 0.9, "berserker": 1.16, "trader": 1.08, "escaped": 1.18}   # how fast each character talks
os.makedirs(OUT, exist_ok=True)
idx_path = os.path.join(OUT, "index.json")
index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
k = Kokoro("01_data_tts/kokoro-v1.0.int8.onnx", "01_data_tts/voices-v1.0.bin")
made = 0
for voice, t, char, kind in jobs():
    if char in ("escaped", "arteta"):
        continue   # these two are acted by src/85_make_voice_special.py
    key = t if voice == SITE else f"{voice}|{t}"
    if key in index and os.path.exists(os.path.join(OUT, index[key])):
        continue   # already has a clip (Kokoro or Chatterbox)
    speed = PACE.get(char, SPEED)
    name = hashlib.sha1(f"{voice}|{speed}|{t}".encode()).hexdigest()[:12] + ".mp3"
    if not os.path.exists(os.path.join(OUT, name)):
        samples, sr = k.create(t, voice=voice, speed=speed, lang="en-gb" if voice.startswith("b") else "en-us")
        sf.write(os.path.join(OUT, name), samples, sr, format="MP3"); made += 1
    index[key] = name
latest = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}   # the Chatterbox job may have added takes meanwhile: keep them
for k2, v2 in index.items():
    if k2 not in latest or not str(latest[k2]).startswith(("cb_", "tb_")):
        latest[k2] = v2
json.dump(latest, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{len(index)} keys, {made} new Kokoro clips")
