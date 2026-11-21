"""Splash first, then the heavy part.

The public football and basketball pages carry all their data inside the main <script> (16 MB and 4 MB), so the
browser had to download everything before it could show anything. split_main_script() moves that script into its own
content-hashed file (app.<hash>.js) and leaves a tiny loader in the page: the loading screen paints at once, the bar
shows real download progress, and the game starts the moment the file arrives. The hashed name never changes for the
same build, so the service worker (docs/sw.js) can keep it cache-first and repeat visits skip the download entirely.
"""
import glob
import hashlib
import os

LOADER = """<script>
(function () {
  var src = "%(name)s", size = %(size)d, bar = document.querySelector("#splash .sp-bar i"), done = false;
  if (bar) { bar.style.animation = "none"; bar.style.width = "3%%"; bar.style.transition = "width .3s ease"; }
  function show(k) { if (bar) bar.style.width = (3 + 94 * Math.min(1, k)).toFixed(1) + "%%"; }
  function run(code) { if (done) return; done = true; var s = document.createElement("script"); s.text = code; document.body.appendChild(s); if (bar) bar.style.width = "100%%"; }
  function plain() { if (done) return; done = true; var s = document.createElement("script"); s.src = src; document.body.appendChild(s); }
  if (!window.fetch || !window.TextDecoder || !window.ReadableStream) return plain();
  fetch(src).then(function (r) {
    if (!r.ok || !r.body) throw new Error("load");
    var rd = r.body.getReader(), dec = new TextDecoder(), parts = [], got = 0;
    return (function pump() { return rd.read().then(function (x) {
      if (x.done) { parts.push(dec.decode()); return parts.join(""); }
      got += x.value.length; parts.push(dec.decode(x.value, { stream: true })); show(got / size); return pump();
    }); })();
  }).then(run).catch(plain);
})();
</script>"""


def split_main_script(html, out_dir, marker="const DATA ="):
    """Move the <script> holding `marker` into out_dir/app.<hash>.js; return the page with a loader in its place."""
    i = html.index(marker)
    a = html.rfind("<script>", 0, i)
    b = html.index("</script>", i)
    body = html[a + len("<script>"):b]
    raw = body.encode("utf-8")
    name = f"app.{hashlib.sha1(raw).hexdigest()[:10]}.js"
    for old in glob.glob(os.path.join(out_dir, "app.*.js")):
        if os.path.basename(old) != name:
            os.remove(old)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, name), "wb") as f:
        f.write(raw)
    page = html[:a] + LOADER % {"name": name, "size": len(raw)} + html[b + len("</script>"):]
    print(f"split: page {len(page.encode()) / 1e6:.2f} MB + {name} {len(raw) / 1e6:.2f} MB")
    return page
