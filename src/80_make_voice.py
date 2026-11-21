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
os.makedirs(OUT, exist_ok=True)
idx_path = os.path.join(OUT, "index.json")
index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
k = Kokoro("01_data_tts/kokoro-v1.0.int8.onnx", "01_data_tts/voices-v1.0.bin")
made = 0
for voice, t, char, kind in jobs():
    key = t if voice == SITE else f"{voice}|{t}"
    if key in index and os.path.exists(os.path.join(OUT, index[key])):
        continue   # already has a clip (Kokoro or Chatterbox)
    name = hashlib.sha1(f"{voice}|{SPEED}|{t}".encode()).hexdigest()[:12] + ".mp3"
    if not os.path.exists(os.path.join(OUT, name)):
        samples, sr = k.create(t, voice=voice, speed=SPEED, lang="en-gb" if voice.startswith("b") else "en-us")
        sf.write(os.path.join(OUT, name), samples, sr, format="MP3"); made += 1
    index[key] = name
json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{len(index)} keys, {made} new Kokoro clips")
