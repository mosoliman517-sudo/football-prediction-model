/* ---------- AI voice (Kokoro, voice af_heart) ----------
   Every line the site speaks is fixed text, so the clips are made once by src/80_make_voice.py and served as MP3s
   from /voice/ (index.json maps the exact text to a file). A line with no clip, or a page opened without /voice/,
   falls back to the device's own voice. */
const AIVoice = (() => {
  const BASE = "../voice/";
  let map = null, cur = null;
  const load = () => map || (map = fetch(BASE + "index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  const norm = (t) => String(t).replace(/\s+/g, " ").trim();
  const generic = (t) => norm(t).replace(/^Welcome[^.]*\./, "Welcome.");   // the tour greets you by name; the clip does not
  function stop() { if (cur) { try { cur.pause(); } catch (e) { /* gone */ } cur = null; } }
  /* resolves to the Audio element, or null when there is no clip for this text */
  async function play(text, o = {}) {
    const m = await load(), f = m[norm(text)] || m[generic(text)]; if (!f) return null;
    stop(); const a = new Audio(BASE + f); a.volume = o.volume == null ? 1 : o.volume; cur = a;
    const end = () => { if (cur === a) cur = null; if (o.onend) o.onend(); };
    a.onended = end; a.onerror = end;
    if (!o.paused) a.play().catch(end);
    return a;
  }
  return { play, stop, pause() { if (cur) cur.pause(); }, resume() { if (cur) cur.play().catch(() => {}); }, preload: load };
})();
