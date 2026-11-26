"""The Escaped and Mikel Arteta, acted with Chatterbox Turbo (Resemble AI, MIT licence), which can really laugh,
chuckle, gasp and sigh. Each imitates a made-up reference voice built here from Kokoro samples: neither is a copy of a
real person. Turbo adds its own inaudible watermark (Perth) to every clip.

  .venv-tts/bin/python src/85_make_voice_special.py --refs      build the candidate reference voices (Kokoro)
  .venv-cb/bin/python  src/85_make_voice_special.py --samples   one test clip per candidate, into voice_samples/
  .venv-cb/bin/python  src/85_make_voice_special.py             record every line (resumable); --max N, --rest N
Which candidate each character uses is PICK below.
"""
import gc
import hashlib
import json
import os
import sys
import time

import soundfile as sf

sys.path.insert(0, "src")
from voice_groups import TAGGED, jobs  # noqa: E402

REF, OUT, SAMPLES = "01_data_tts/ref_special", "docs/voice", "voice_samples"
SCRIPT = {
    "escaped": "Oh, hello, hello! Come in, sit down, no, not there, that chair bites. I have so many things to give you! A horse, a bishop, a little secret. Do not tell the others. They are listening. They are always listening!",
    "arteta": "Good. Everybody sit down and listen to me. We keep the structure, we keep our patience, and we trust the work. One detail will decide this game, and I want that detail to belong to us. Is that clear? Very good.",
}
# candidate name: (character, Kokoro voice or blend, Kokoro speed, pitch shift in semitones)
CANDIDATES = {
    "escaped_A": ("escaped", "bm_fable", 1.15, 1.5),
    "escaped_B": ("escaped", "am_fenrir", 1.1, -1.0),
    "escaped_C": ("escaped", "am_santa+bm_fable", 1.2, 0.5),
    "arteta_A": ("arteta", "em_alex", 1.0, 0.0),
    "arteta_B": ("arteta", "em_alex+bm_daniel", 1.0, 0.0),
    "arteta_C": ("arteta", "em_alex", 1.0, 0.0),   # reference built from Spanish sounds, for a clear accent
}
PICK = {"escaped": "escaped_A", "arteta": "arteta_C"}
TEST = {
    "escaped": "[laugh] TAKE him! Take him, he talks too much! [gasp] No, give him back. No. Keep him. [chuckle]",
    "arteta": "[sigh] That is a brave sacrifice, and annoyingly it is also a good one. Back into shape, everybody.",
}


def refs():
    """arteta_C.raw.wav is made once from Spanish phonemes (see the note in CANDIDATES) and is not rebuilt here."""
    import numpy as np
    from kokoro_onnx import Kokoro
    os.makedirs(REF, exist_ok=True)
    k = Kokoro("01_data_tts/kokoro-v1.0.int8.onnx", "01_data_tts/voices-v1.0.bin")
    for name, (char, voice, speed, _) in CANDIDATES.items():
        if name == "arteta_C" and os.path.exists(f"{REF}/{name}.raw.wav"):
            continue
        style = np.mean([k.get_voice_style(v) for v in voice.split("+")], axis=0)
        samples, sr = k.create(SCRIPT[char], voice=style, speed=speed, lang="en-us")
        sf.write(f"{REF}/{name}.raw.wav", samples, sr)
    print("references built")


def load():
    import torch
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    return ChatterboxTurboTTS.from_pretrained(device=dev), torch, dev


def reference(name):
    """The Kokoro sample with the candidate's pitch shift applied."""
    import librosa
    path = f"{REF}/{name}.wav"
    if not os.path.exists(path):
        y, sr = librosa.load(f"{REF}/{name}.raw.wav", sr=None)
        steps = CANDIDATES[name][3]
        sf.write(path, librosa.effects.pitch_shift(y, sr=sr, n_steps=steps) if steps else y, sr)
    return path


def speak(model, text, char):
    wild = char == "escaped"
    return model.generate(text, temperature=0.95 if wild else 0.65, repetition_penalty=1.2).squeeze(0).numpy()


def samples():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    os.makedirs(SAMPLES, exist_ok=True)
    model, _, _ = load()
    for name, (char, *_rest) in CANDIDATES.items():
        if only and name != only:
            continue
        model.prepare_conditionals(reference(name))
        sf.write(f"{SAMPLES}/{name}.mp3", speak(model, TEST[char], char), model.sr, format="MP3")
        print("sample", name, flush=True)


def record():
    idx_path = os.path.join(OUT, "index.json")
    todo = []
    for v, t, c, k in jobs():
        if c in PICK:
            name = "tb_" + hashlib.sha1(f"{PICK[c]}|{v}|{t}".encode()).hexdigest()[:12] + ".mp3"
            todo.append((v, t, c, name))

    def save():
        index = json.load(open(idx_path, encoding="utf-8"))
        index.update({f"{v}|{t}": n for v, t, c, n in todo if os.path.exists(os.path.join(OUT, n))})
        json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)

    left = [x for x in todo if not os.path.exists(os.path.join(OUT, x[3]))]
    if "--max" in sys.argv:
        left = left[:int(sys.argv[sys.argv.index("--max") + 1])]
    rest = float(sys.argv[sys.argv.index("--rest") + 1]) if "--rest" in sys.argv else 0
    print(f"{len(todo)} lines for {', '.join(PICK)}, {len(left)} to make", flush=True)
    if left:
        model, torch, dev = load()
        current, t0 = None, time.time()
        for n, (v, t, c, name) in enumerate(sorted(left, key=lambda x: x[2]), 1):
            if c != current:
                model.prepare_conditionals(reference(PICK[c]))
                current = c
            try:
                wav = speak(model, TAGGED.get((v, t), t), c)
                sf.write(os.path.join(OUT, name), wav, model.sr, format="MP3")
            except Exception as e:   # leave it for the next run
                print("  failed:", t[:60], str(e)[:120], flush=True)
            gc.collect()
            if dev == "mps":
                torch.mps.empty_cache()
            time.sleep(rest)
            if n % 10 == 0 or n == len(left):
                save()
                each = (time.time() - t0) / n
                print(f"  {n}/{len(left)}  {each:.1f}s a line, about {each * (len(left) - n) / 60:.0f} min left", flush=True)
    save()
    print("done", flush=True)


if __name__ == "__main__":
    refs() if "--refs" in sys.argv else samples() if "--samples" in sys.argv else record()
