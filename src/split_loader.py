"""Splash first, then the heavy part.

The public football and basketball pages carry all their data inside the main <script> (16 MB and 4 MB), so the
browser had to download everything before it could show anything. split_main_script() moves that script into its own
content-hashed file (app.<hash>.js) and leaves a tiny loader in the page: the loading screen paints at once, the bar
shows real download progress, and the game starts the moment the file arrives. The hashed name never changes for the
same build, so the service worker (docs/sw.js) can keep it cache-first and repeat visits skip the download entirely.

The data (matches, quiz players, crests: most of the size) goes into its own data.<hash>.js. Code changes far more often
than data, and before this every code change renamed the one big file, so returning players downloaded everything again.
Now a code-only build re-downloads only the small app file; the data file keeps its name until the data itself changes.
"""
import glob
import hashlib
import json
import os

LOADER = """<script>
(function () {
  var files = %(files)s, size = %(size)d, bar = document.querySelector("#splash .sp-bar i, #csBar"), done = false, got = 0;
  if (bar) { bar.style.animation = "none"; bar.style.width = "3%%"; bar.style.transition = "width .3s ease"; }
  function show() { if (bar) bar.style.width = (3 + 94 * Math.min(1, got / size)).toFixed(1) + "%%"; }
  function run(codes) { if (done) return; done = true; codes.forEach(function (code) { var s = document.createElement("script"); s.text = code; document.body.appendChild(s); }); if (bar) bar.style.width = "100%%"; }
  function plain() { if (done) return; done = true; (function next(i) { if (i >= files.length) return; var s = document.createElement("script"); s.src = files[i]; s.onload = function () { next(i + 1); }; document.body.appendChild(s); })(0); }
  function one(src) { return fetch(src).then(function (r) {
    if (!r.ok || !r.body) throw new Error("load");
    var rd = r.body.getReader(), dec = new TextDecoder(), parts = [];
    return (function pump() { return rd.read().then(function (x) {
      if (x.done) { parts.push(dec.decode()); return parts.join(""); }
      got += x.value.length; parts.push(dec.decode(x.value, { stream: true })); show(); return pump();
    }); })(); }); }
  if (!window.fetch || !window.TextDecoder || !window.ReadableStream || !window.Promise) return plain();
  Promise.all(files.map(one)).then(run).catch(plain);
})();
</script>"""


def _json_end(text, start):
    """index just past the JSON object/array that starts at text[start] (string-aware brace matching)"""
    depth, i, n, ins = 0, start, len(text), False
    while i < n:
        c = text[i]
        if ins:
            if c == "\\": i += 2; continue
            if c == '"': ins = False
        elif c == '"': ins = True
        elif c in "{[": depth += 1
        elif c in "}]":
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise ValueError("unterminated JSON")


def _write_hashed(out_dir, prefix, raw):
    name = f"{prefix}.{hashlib.sha1(raw).hexdigest()[:10]}.js"
    for old in glob.glob(os.path.join(out_dir, f"{prefix}.*.js")):
        if os.path.basename(old) != name:
            os.remove(old)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, name), "wb") as f:
        f.write(raw)
    return name


def split_main_script(html, out_dir, marker="const DATA ="):
    """Move the <script> holding `marker` into out_dir/app.<hash>.js, its data literal into out_dir/data.<hash>.js;
    return the page with a loader in its place."""
    i = html.index(marker)
    a = html.rfind("<script>", 0, i)
    b = html.index("</script>", i)
    body = html[a + len("<script>"):b]
    files, total = [], 0
    m = body.index(marker) + len(marker)
    while body[m] == " ":
        m += 1
    if body[m] in "{[":
        e = _json_end(body, m)
        data = ("window.__BK_DATA=" + body[m:e] + ";").encode("utf-8")
        body = body[:m] + "window.__BK_DATA" + body[e:]
        dname = _write_hashed(out_dir, "data", data); files.append(dname); total += len(data)
        print(f"split: {dname} {len(data) / 1e6:.2f} MB")
    raw = body.encode("utf-8")
    name = _write_hashed(out_dir, "app", raw); files.append(name); total += len(raw)
    page = html[:a] + LOADER % {"files": json.dumps(files), "size": total} + html[b + len("</script>"):]
    print(f"split: page {len(page.encode()) / 1e6:.2f} MB + {name} {len(raw) / 1e6:.2f} MB")
    return page
