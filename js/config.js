window.SWU = window.SWU || {};

SWU.config = {
  // Paste the Google Apps Script web app URL here once it is deployed.
  // While this is empty the site shows the bundled sample data.
  apiUrl: "https://script.google.com/macros/s/AKfycbyRnzjWrncIMhiXBIRzGggJPRhVIduFvtCbAzvrOZ4cOMyQIvgBCmQExtUBgLlcxG1h/exec",

  leagueName: "SWU Slovenia",

  // The live site. Anywhere else (local file, preview server) a "Preview" banner is shown.
  liveHost: "andrejperse.github.io",

  // Path to the league logo. Empty = text-only brand.
  logo: "assets/logo.png",

  // The calendar cannot be scrolled back before this month.
  calendarStart: "2026-10",

  // Points every player gets for attending an event, on top of their Melee points.
  participationPoints: 1,

  // How many players at the top of the standings qualify for the end-of-season playoffs.
  playoffSpots: 4,

  formats: ["Premier", "Eternal", "Sealed", "Draft"],
  eventTypes: ["Weekly", "Showdown"],
  calendarTypes: ["Weekly", "Showdown", "Playoffs"],

  // Default start time for new weekly calendar entries.
  weeklyTime: "17:30",

  // Meta table: count top-cut matches in wins/losses/draws (league points never include them).
  metaIncludesTopCut: true,
};
