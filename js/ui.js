// Small rendering helpers shared by all views.
(function () {
  const ui = (SWU.ui = {});

  const ASPECT_CLASS = { Vigilance: "vig", Command: "cmd", Aggression: "agg", Cunning: "cun", Heroism: "her", Villainy: "vil" };

  ui.esc = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  };

  ui.isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  ui.today = () => ui.isoDate(new Date());

  ui.parseDate = (iso) => new Date(`${iso}T12:00:00`);

  ui.formatDate = function (iso, opts = { day: "numeric", month: "short", year: "numeric" }) {
    return ui.parseDate(iso).toLocaleDateString("en-GB", opts);
  };

  ui.playerName = function (key) {
    const p = SWU.store.player(key);
    return p ? p.name : key;
  };

  ui.playerLink = function (key) {
    const p = SWU.store.player(key);
    if (!p) return `<span class="muted">${ui.esc(key)}</span>`;
    const nick = p.nickname ? ` <span class="nick">“${ui.esc(p.nickname)}”</span>` : "";
    return `<a class="player-link" href="#/player/${encodeURIComponent(key)}">${ui.esc(p.name)}</a>${nick}`;
  };

  ui.aspectDots = function (aspects) {
    return `<span class="aspects">${aspects.map((a) => `<i class="aspect aspect--${ASPECT_CLASS[a] || "none"}" title="${ui.esc(a)}"></i>`).join("")}</span>`;
  };

  const COLOR_VARS = { Vigilance: "--vig", Command: "--cmd", Aggression: "--agg", Cunning: "--cun" };

  // Inline CSS variables for a leader's color tint. Heroism/Villainy are ignored;
  // a two-color leader gets both colors (split half-half by the .aspect-tint class).
  ui.leaderStyle = function (leader) {
    const colors = [...new Set(leader.aspects.filter((a) => COLOR_VARS[a]))].map((a) => `var(${COLOR_VARS[a]})`);
    return colors.length ? `--c1: ${colors[0]}; --c2: ${colors[1] || colors[0]};` : "";
  };

  // Shown when a leader or base hasn't been recorded (yet). It can be filled in later in the editor.
  ui.unknown = (what) => `<span class="unknown" title="Not recorded yet">Unknown ${what}</span>`;

  ui.leader = function (id, { compact = false } = {}) {
    const l = id && SWU.store.leader(id);
    if (!l) return ui.unknown("leader");
    return `<span class="leader aspect-tint${compact ? " leader--compact" : ""}" style="${ui.leaderStyle(l)}" title="${ui.esc(`${l.name}, ${l.subtitle}`)}">
      <img class="leader-thumb" src="${ui.esc(l.thumb)}" alt="" loading="lazy">
      <span class="leader-text"><span class="leader-name">${ui.esc(l.name)}</span><span class="leader-sub">${ui.esc(l.subtitle)}</span></span>
    </span>`;
  };

  // Icon from assets/bases/<id>.png; a colored diamond is shown if the file is missing.
  ui.baseIcon = function (id, cls = "base-icon") {
    return `<img class="${cls}" src="assets/bases/${ui.esc(id)}.png" alt="" loading="lazy"
      onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'base-dot' }))">`;
  };

  ui.base = function (id, { large = false } = {}) {
    const b = id && SWU.store.base(id);
    if (!b) return ui.unknown("base");
    const color = (b.color || "none").toLowerCase();
    const title = b.kind === "common" ? `${b.name}: ${b.cards.join(", ")}` : `${b.name} (${b.hp} HP)`;
    return `<span class="base base--${color}${large ? " base--large" : ""}" title="${ui.esc(title)}">${ui.baseIcon(b.id)}<span>${ui.esc(b.name)}</span></span>`;
  };

  ui.typeBadge = function (type) {
    return `<span class="badge badge--${type === "Showdown" ? "showdown" : "weekly"}">${ui.esc(type)}</span>`;
  };

  ui.outcomeBadge = function (outcome) {
    const cls = { W: "win", L: "loss", D: "draw", BYE: "bye" }[outcome];
    return `<span class="outcome outcome--${cls}">${outcome}</span>`;
  };

  ui.record = (w, l, d) => `${w}-${l}-${d}`;

  ui.percent = (value) => `${Math.round(value * 100)}%`;

  ui.empty = function (title, text) {
    return `<div class="empty"><h3>${ui.esc(title)}</h3><p>${ui.esc(text)}</p></div>`;
  };
})();
