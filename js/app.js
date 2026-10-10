// Hash router + page-level event handling.
(function () {
  const app = document.getElementById("app");
  const seasonSelect = document.getElementById("season-select");

  SWU.state = {
    season: null,
    metaFormat: null,
    metaSort: { col: "events", dir: "desc" },
    calMonth: null,
  };

  const ROUTES = {
    standings: SWU.views.standings,
    player: SWU.views.player,
    meta: SWU.views.meta,
    calendar: (params) => (params[0] ? SWU.views.calendarEntry(params) : SWU.views.calendar()),
    event: SWU.views.event,
    editor: SWU.editor.render,
  };

  function currentRoute() {
    const [name, ...params] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    return { name: ROUTES[name] ? name : "standings", params };
  }

  function render({ keepScroll = false } = {}) {
    const route = currentRoute();
    const y = window.scrollY;
    app.innerHTML = ROUTES[route.name](route.params);
    if (route.name === "editor") SWU.editor.mount(app);
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const navFor = a.dataset.nav;
      a.classList.toggle("active", navFor === route.name || (navFor === "standings" && route.name === "player"));
    });
    if (keepScroll) window.scrollTo(0, y);
  }

  function fillSeasonSelect() {
    const current = SWU.store.currentSeasonId();
    seasonSelect.innerHTML = [...SWU.store.seasons()]
      .reverse()
      .map((s) => `<option value="${SWU.ui.esc(s.id)}">${SWU.ui.esc(s.name)}${s.id === current ? " (current)" : ""}</option>`)
      .join("");
    seasonSelect.value = SWU.state.season;
  }

  function setSeason(id, { silent = false } = {}) {
    SWU.state.season = id;
    seasonSelect.value = id;
    if (!silent) render();
  }
  SWU.setSeason = setSeason;

  seasonSelect.addEventListener("change", () => setSeason(seasonSelect.value));

  // Called after the editor saves something: seasons may have been added, renamed or removed.
  SWU.onDataChanged = function () {
    if (!SWU.store.season(SWU.state.season)) SWU.state.season = SWU.store.currentSeasonId();
    fillSeasonSelect();
  };

  app.addEventListener("click", (e) => {
    const sortTh = e.target.closest("[data-sort]");
    if (sortTh) {
      SWU.views.metaToggleSort(sortTh.dataset.sort);
      return render({ keepScroll: true });
    }
    const tab = e.target.closest("[data-format]");
    if (tab) {
      SWU.state.metaFormat = tab.dataset.format;
      return render({ keepScroll: true });
    }
    const monthBtn = e.target.closest("[data-month]");
    if (monthBtn) {
      SWU.views.shiftMonth(Number(monthBtn.dataset.month));
      return render({ keepScroll: true });
    }
    const seasonBtn = e.target.closest("[data-season]");
    if (seasonBtn) return setSeason(seasonBtn.dataset.season);

    // Whole table rows are clickable; real links inside them still work normally.
    const row = e.target.closest("[data-href]");
    if (row && !e.target.closest("a")) location.hash = row.dataset.href;
  });

  window.addEventListener("hashchange", () => {
    const { name, params } = currentRoute();
    // Selecting an event on the player page shouldn't jump to the top of the page.
    const sameplayer = name === "player" && SWU.state.lastPlayer === params[0];
    SWU.state.lastPlayer = name === "player" ? params[0] : null;
    render({ keepScroll: sameplayer });
    if (sameplayer && window.innerWidth < 900) {
      const detail = document.getElementById("event-detail");
      if (detail) detail.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!sameplayer) {
      window.scrollTo(0, 0);
    }
  });

  async function start() {
    try {
      await SWU.store.load(() => {
        fillSeasonSelect();
        render({ keepScroll: true });
      });
    } catch (err) {
      app.innerHTML = SWU.ui.empty("Couldn't load the league data", err.message);
      return;
    }
    SWU.state.season = SWU.store.currentSeasonId();
    const thisMonth = SWU.ui.today().slice(0, 7);
    SWU.state.calMonth = thisMonth < SWU.config.calendarStart ? SWU.config.calendarStart : thisMonth;
    document.getElementById("sample-banner").hidden = !SWU.store.isSample();
    document.getElementById("preview-banner").hidden = location.hostname === SWU.config.liveHost;
    if (SWU.config.logo) {
      document.querySelector(".brand-mark").innerHTML = `<img src="${SWU.ui.esc(SWU.config.logo)}" alt="">`;
    }
    fillSeasonSelect();
    SWU.state.lastPlayer = currentRoute().name === "player" ? currentRoute().params[0] : null;
    render();
  }

  start();
})();
