/* Share a result as a link (football and basketball; each build includes this file).
   - Player links: https://…/football/#player-Name opens that player's card (rating, season place, last results) over the home page,
     with Add friend and Challenge buttons, so a link replaces a screenshot. Your own link is on your profile ("Copy my link"), and
     on every finished two-player or ranked match.
   - Solo results: the "Copy result link" button on the end screen shares the existing beat-this link (it opens the same game at the
     same difficulty with "beat <name>'s score"), through the phone's share sheet when there is one, otherwise it copies.
   The link carries only a display name, a game and a score; nothing private. */
const SL = {
  base() { return location.origin + location.pathname.replace(/[^/]*$/, ""); },
  nick() { try { return (prof().nick || "").replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 16); } catch (e) { return ""; } },
  playerLink(nick) { return `${this.base()}#player-${encodeURIComponent(nick || this.nick())}`; },
  async send(text, url) {
    try { if (navigator.share) { await navigator.share({ title: "ballknowledge", text, url }); return; } } catch (e) { return; }   /* cancelled */
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied. Send it to a friend."); } catch (e) { prompt("Copy this link and send it:", url); }
  },
  /* a result link for the end screen: solo -> beat-this, duel or ranked -> my player card */
  forFinale(o) {
    const solo = o.winner == null, sc = o.players && o.players[0] ? Math.round(o.players[0].score) || 0 : 0;
    if (solo && S.game && typeof beatLink === "function" && typeof GAME_IDS !== "undefined" && GAME_IDS.includes(S.game === "value" ? "pvalue" : S.game)) return { text: `I scored ${sc.toLocaleString()} in ${typeof gameName === "function" ? gameName(S.game) : "a game"} on ballknowledge. Beat it:`, url: beatLink(S.game, sc) };
    if (!solo && this.nick()) return { text: `${o.verdict ? String(o.verdict).replace(/<[^>]+>/g, "") : "Good game"}. Challenge me on ballknowledge:`, url: this.playerLink() };
    return null;
  },
};
setTimeout(() => {
  if (typeof finale === "function") { const f0 = finale; try { finale = function (o) { let x = o; try { const r = SL.forFinale(o); if (r) { window.__slLast = r; x = { ...o, buttons: (o.buttons || "") + '<button type="button" class="btn ghost" data-sharelink="1">Copy result link</button>' }; } } catch (e) { /* plain finale */ } return f0.call(this, x); }; } catch (e) { /* skip */ } }
  if (typeof route === "function") { const r0 = route; try { route = function (ev) { const m = /^#player-(.+)$/.exec(location.hash); if (m) { const nick = decodeURIComponent(m[1]).slice(0, 16); history.replaceState(null, "", location.pathname); r0.call(this, ev); setTimeout(() => { try { PCard.open(nick); } catch (e) { /* no card yet */ } }, 500); return; } return r0.apply(this, arguments); }; } catch (e) { /* skip */ } }
  if (/^#player-/.test(location.hash)) setTimeout(() => route(), 900);
}, 0);
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-sharelink],[data-mylink],[data-pcchal]"); if (!b) return;
  if (b.dataset.sharelink && window.__slLast) { e.stopPropagation(); SL.send(window.__slLast.text, window.__slLast.url); }
  else if (b.dataset.mylink) { e.stopPropagation(); if (!SL.nick()) return toast("Pick a display name first (Profile → Edit profile)."); SL.send("Here's my ballknowledge profile. Add me or challenge me:", SL.playerLink()); }
  else if (b.dataset.pcchal) { e.stopPropagation(); try { closeModal(); } catch (x) { /* none open */ } setTimeout(() => { try { challengeModal(b.dataset.pcchal); } catch (x) { toast("Sign in to challenge someone."); } }, 80); }
}, true);
(() => { const s = document.createElement("style"); s.textContent = ".pcLink{margin-top:10px}"; document.head.appendChild(s); })();
