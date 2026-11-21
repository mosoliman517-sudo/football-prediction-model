"""Makes the AI voice clips (Kokoro-82M, voice af_heart) for every line the site speaks: docs/voice/<hash>.mp3 + index.json.

Run with the separate venv:  .venv-tts/bin/python src/80_make_voice.py
Needs 01_data_tts/kokoro-v1.0.int8.onnx and voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx, release model-files-v1.0).
The lines live in src/voice_lines.json. The tour lines include numbers from the data, so after a rebuild that changes
them, dump them again in the browser console on /football/ and /basketball/:
  [...new Set(['quiz','predict','both'].flatMap(p => buildScenes(p, '').map(s => s.say.replace(/\\s+/g, ' ').trim())))]
A line without a clip is not an error: the page falls back to the device voice. Old clips no longer listed are removed.
"""
import glob
import hashlib
import json
import os

import soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED = "af_heart", 1.05
OUT = "docs/voice"
lines = json.load(open("src/voice_lines.json", encoding="utf-8"))
# each character speaks in their own voice; the tours are also made in each sidekick's voice
GROUP_VOICE = {"pip": "af_heart", "boot": "bm_george", "rita": "bf_emma", "bench": "am_puck", "rim": "am_michael"}
TOUR_VOICES = {"football_tour": ["af_heart", "bm_george", "bf_emma", "am_puck"], "basketball_tour": ["af_heart", "am_michael"]}
jobs = {}
for group, items in lines.items():
    for voice in TOUR_VOICES.get(group, [GROUP_VOICE.get(group, VOICE)]):
        for t in items:
            jobs.setdefault((voice, " ".join(t.split())), True)
texts = sorted(jobs)
os.makedirs(OUT, exist_ok=True)
k = Kokoro("01_data_tts/kokoro-v1.0.int8.onnx", "01_data_tts/voices-v1.0.bin")
index, made = {}, 0
for voice, t in texts:
    name = hashlib.sha1(f"{voice}|{SPEED}|{t}".encode()).hexdigest()[:12] + ".mp3"
    index[t if voice == VOICE else f"{voice}|{t}"] = name
    path = os.path.join(OUT, name)
    if os.path.exists(path):
        continue
    samples, sr = k.create(t, voice=voice, speed=SPEED, lang="en-gb" if voice.startswith("b") else "en-us")
    sf.write(path, samples, sr, format="MP3")
    made += 1
    print(f"{name}  {len(samples) / sr:5.1f}s  {t[:70]}")
for f in glob.glob(os.path.join(OUT, "*.mp3")):
    if os.path.basename(f) not in index.values():
        os.remove(f)
json.dump(index, open(os.path.join(OUT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in index.values())
print(f"{len(index)} clips ({made} new), {size / 1e6:.2f} MB in {OUT}/")
