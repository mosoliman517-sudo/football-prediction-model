/* ---------- AI voice (Kokoro, voice af_heart) ----------
   Every line the site speaks is fixed text, so the clips are made once by src/80_make_voice.py and served as MP3s
   from /voice/ (index.json maps the exact text to a file). A line with no clip, or a page opened without /voice/,
   falls back to the device's own voice. */
const AIVoice = (() => {
  const BASE = "../voice/";
  let map = null, cur = null, seq = 0, el = null, opened = false;
  /* one player for every line. Safari and phones only let a page start sound from a tap, so the player is opened on the first
     tap or key press and can then speak whenever a character has something to say */
  const player = () => el || (el = new Audio());
  const open = () => { if (opened || cur) return; opened = true; const a = player(); a.src = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA=="; a.play().catch(() => { opened = false; }); };
  ["pointerdown", "keydown", "touchend"].forEach((k) => addEventListener(k, open, true));
  const load = () => map || (map = fetch(BASE + "index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  const generic = (t) => norm(t).replace(/^Welcome[^.]*\./, "Welcome.");   // the tour greets you by name; the clip does not
  function stop() { seq++; if (cur) { try { cur.pause(); } catch (e) { /* gone */ } cur = null; } }
  /* resolves to the Audio element, or null when there is no clip for this text */
  async function play(text, o = {}) {
    const m = await load(), v = o.voice ? o.voice + "|" : "", f = (v && (m[v + norm(text)] || m[v + generic(text)])) || (!o.voice || o.voice === "af_heart" ? m[norm(text)] || m[generic(text)] : null); if (!f) return null;   // each character has its own voice
    stop(); const my = seq, a = player(); a.onended = a.onerror = null; a.src = BASE + f; a.volume = o.volume == null ? 1 : o.volume; cur = a;
    const end = () => { if (my !== seq) return; cur = null; if (o.onend) o.onend(); };   /* a line cut off by the next one says nothing */
    a.onended = end; a.onerror = end;
    if (!o.paused) a.play().catch(end);
    return a;
  }
  return { play, stop, pause() { if (cur) cur.pause(); }, resume() { if (cur) cur.play().catch(() => {}); }, preload: load };
})();
