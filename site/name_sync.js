/* One display name everywhere. Football, basketball and chess keep their own profile tables (public, nba, chess schemas in the
   same Supabase project), so a rename used to change only one of them and each page kept showing its own old name. Now:
   - a rename in any sport is saved to all three;
   - the football (public) name is the master: every page reads it after signing in and adopts it if its own copy differs;
   - nobody gets a name made from their email without being asked: with no name yet, a small window asks you to pick one
     (your email's first part is only the suggestion). Shared by all three pages (each build includes this file). */
const NameSync = {
  hdr(cfg, t, schema) { const h = { apikey: cfg.key, Authorization: "Bearer " + t, "Content-Type": "application/json" }; if (schema !== "public") { h["Accept-Profile"] = schema; h["Content-Profile"] = schema; } return h; },
  async master(cfg, t) { try { const r = await fetch(`${cfg.url}/rest/v1/profiles?select=nick`, { headers: this.hdr(cfg, t, "public") }); if (!r.ok) return null; const j = await r.json(); return (j && j[0] && j[0].nick) || null; } catch (e) { return null; } },
  async own(cfg, t, schema) { try { const r = await fetch(`${cfg.url}/rest/v1/profiles?select=nick`, { headers: this.hdr(cfg, t, schema) }); if (!r.ok) return null; const j = await r.json(); return (j && j[0] && j[0].nick) || null; } catch (e) { return null; } },
  /* saves the name in all three sports; returns each schema's answer ("ok", "taken", "invalid" or null when unreachable) */
  async setAll(cfg, t, nick) {
    const out = {}; await Promise.all(["public", "chess", "nba"].map(async (s) => { try { const r = await fetch(`${cfg.url}/rest/v1/rpc/set_nickname`, { method: "POST", headers: this.hdr(cfg, t, s), body: JSON.stringify({ p_nick: nick }) }); out[s] = r.ok ? await r.json() : null; } catch (e) { out[s] = null; } }));
    try { localStorage.setItem("bk_name_all", nick); } catch (e) { /* storage blocked */ }
    return out;
  },
  suggest(email) { return ((email || "player").split("@")[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "player").padEnd(3, "x"); },
  /* asks for a name; save(nick) must return { ok } or { error } */
  ask(suggestion, save) {
    if (document.getElementById("nsAsk")) return; const m = document.createElement("div"); m.id = "nsAsk";
    m.innerHTML = `<div class="nsbox" role="dialog" aria-label="Choose your display name"><h2>Pick your name</h2><p>This is how you appear on leaderboards, in lobbies and to friends, in every sport. You can change it later in your profile.</p><input id="nsIn" maxlength="16" value="${String(suggestion).replace(/[^A-Za-z0-9 _.-]/g, "")}" aria-label="Display name"><div class="nsmsg" id="nsMsg"></div><div class="nsrow"><button type="button" id="nsGo">Save my name</button></div></div>`;
    document.body.appendChild(m); const inp = m.querySelector("#nsIn"); setTimeout(() => { inp.focus(); inp.select(); }, 50);
    const go = async () => { const v = inp.value.trim(), msg = m.querySelector("#nsMsg"); if (!/^[A-Za-z0-9 _.-]{3,16}$/.test(v)) { msg.textContent = "Use 3 to 16 letters, numbers, spaces, dots, dashes or underscores."; return; } msg.textContent = "Saving…"; const r = await save(v); if (r && r.ok) { m.remove(); } else msg.textContent = (r && r.error) || "That name is taken. Try another."; };
    m.querySelector("#nsGo").onclick = go; inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  },
};
(() => { const s = document.createElement("style"); s.textContent = "#nsAsk{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:16px;animation:nsIn .25s ease-out}#nsAsk .nsbox{width:min(420px,100%);background:#141b17;color:#f4f1ea;border:2px solid var(--accent,var(--gold,#f2c14e));border-radius:20px;padding:22px;box-shadow:0 24px 60px -20px #000}#nsAsk h2{margin:0 0 6px;font-size:26px}#nsAsk p{margin:0 0 12px;opacity:.8;font-size:14px;line-height:1.45}#nsAsk input{width:100%;box-sizing:border-box;font:700 20px inherit;padding:12px 14px;border-radius:12px;border:1px solid var(--line,#ffffff33);background:rgba(0,0,0,.25);color:inherit}#nsAsk .nsmsg{min-height:20px;font-size:13px;margin:8px 0;color:#ff9a8a}#nsAsk .nsrow{display:flex;justify-content:flex-end}#nsAsk button{font:700 15px inherit;padding:10px 18px;border-radius:12px;border:0;background:var(--accent,var(--gold,#f2c14e));color:#111;cursor:pointer}@keyframes nsIn{from{opacity:0}}"; document.head.appendChild(s); })();
