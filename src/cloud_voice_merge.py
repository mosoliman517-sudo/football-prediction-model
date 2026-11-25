"""Adds the clips from a cloud run (cloud_done.zip) to the site: python3 src/cloud_voice_merge.py ~/Downloads/cloud_done.zip
Only files named like our clips are taken; clips the Mac already made are left as they are. Then it updates the index."""
import os, re, subprocess, sys, zipfile

added = 0
with zipfile.ZipFile(sys.argv[1]) as z:
    for n in z.namelist():
        if re.fullmatch(r"cb_[0-9a-f]{12}\.mp3", n) and not os.path.exists(os.path.join("docs/voice", n)):
            open(os.path.join("docs/voice", n), "wb").write(z.read(n)); added += 1
print(added, "clips added")
subprocess.run([".venv-cb/bin/python", "src/83_make_voice_cb.py", "--index-only"], check=True)
