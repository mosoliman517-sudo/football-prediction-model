"""Packs the lines that still need a Chatterbox take for a free cloud GPU (Google Colab or Kaggle).
Writes cloud_voice/voices_cloud.zip (jobs + voice reference samples) and cloud_voice/chatterbox_colab.ipynb.
The cloud works from the END of the list while the Mac works from the start, so they meet in the middle."""
import hashlib, json, os, sys, zipfile

sys.path.insert(0, "src")
from voice_groups import jobs  # noqa: E402

name = lambda v, t: "cb_" + hashlib.sha1(f"{v}|{t}".encode()).hexdigest()[:12] + ".mp3"
STYLE = {"boot": 0.55, "rita": 0.4, "bench": 0.75, "rim": 0.55, "clock": 0.8, "sneak": 0.9, "pip": 0.6, "vera": 0.55, "bea": 0.4, "site": 0.45, "arteta": 0.4, "berserker": 0.85, "trader": 0.4, "escaped": 0.9}
HYPE = {"bighit", "streak", "best", "rankup", "brilliant", "great", "win"}
DEEP = {"deep", "brilliant_q", "brilliant_r", "brilliant_minor", "underpromo", "over", "rough_game", "loss"}
todo = []
for v, t, c, k in jobs():
    if not os.path.exists(os.path.join("docs/voice", name(v, t))):
        ex = STYLE.get(c, 0.5) + (0.15 if k in HYPE else -0.1 if k in DEEP else 0)
        todo.append({"v": v, "t": t, "file": name(v, t), "ex": max(0.25, min(1.0, ex)), "cfg": 0.3 if k in DEEP else 0.45})
todo.reverse()
os.makedirs("cloud_voice", exist_ok=True)
with zipfile.ZipFile("cloud_voice/voices_cloud.zip", "w") as z:
    z.writestr("jobs.json", json.dumps(todo, ensure_ascii=False))
    for f in os.listdir("01_data_tts/ref"):
        z.write(os.path.join("01_data_tts/ref", f), "ref/" + f)

RUN = '''import json, os, time, soundfile as sf
from chatterbox.tts import ChatterboxTTS
jobs = json.load(open("jobs.json", encoding="utf-8")); os.makedirs("out", exist_ok=True)
model = ChatterboxTTS.from_pretrained(device="cuda"); t0 = time.time(); n = 0
for j in jobs:
    p = "out/" + j["file"]
    if os.path.exists(p): continue
    ref = "ref/" + j["v"] + ".wav"
    try:
        wav = model.generate(j["t"], audio_prompt_path=ref if os.path.exists(ref) else None, exaggeration=j["ex"], cfg_weight=j["cfg"])
    except Exception as e:
        print("failed", j["t"][:50], e); continue
    sf.write(p, wav.squeeze(0).cpu().numpy(), model.sr, format="MP3"); n += 1
    if n % 20 == 0: print(n, "done,", round((time.time() - t0) / n, 1), "s a line,", len(jobs) - len(os.listdir("out")), "left")
print("finished")'''
cell = lambda src, kind="code": {"cell_type": kind, "metadata": {}, "source": src.splitlines(True), **({"outputs": [], "execution_count": None} if kind == "code" else {})}
nb = {"nbformat": 4, "nbformat_minor": 5, "metadata": {"accelerator": "GPU", "kernelspec": {"name": "python3", "display_name": "Python 3"}}, "cells": [
    cell("# Chatterbox voice lines on a free GPU\n1. Runtime > Change runtime type > **T4 GPU**.\n2. Run the cells in order; upload `voices_cloud.zip` when asked.\n3. Run the last cell any time (stop the big cell first) to download what is finished.", "markdown"),
    cell("!pip install -q chatterbox-tts soundfile"),
    cell("from google.colab import files\nfiles.upload()\n!unzip -oq voices_cloud.zip"),
    cell(RUN),
    cell("!cd out && zip -qr ../cloud_done.zip .\nfrom google.colab import files\nfiles.download('cloud_done.zip')")]}
json.dump(nb, open("cloud_voice/chatterbox_colab.ipynb", "w"), indent=1)
print(len(todo), "lines packed")
