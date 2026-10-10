// Sandbox: the first time, fill the practice sheet with the sample data; then point the site at it.
(function () {
  if (!FAKE.loaded) {
    const data = window.SWU_SAMPLE_DATA;
    const tabs = { Seasons: "seasons", Players: "players", Events: "events", Results: "results", Matches: "matches", Calendar: "calendar" };
    Object.entries(tabs).forEach(([tab, key]) => writeTab(tab, data[key]));
    FAKE.save();
  }
  FAKE.props.EDITOR_PASSWORD = "sandbox";
  SWU.config.apiUrl = FAKE_API;
  SWU.config.cacheKey = "swu-sandbox-cache";
})();
