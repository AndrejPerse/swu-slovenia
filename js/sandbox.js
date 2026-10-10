// Sandbox mode: add ?sandbox to a preview address (e.g. http://localhost:8080/?sandbox).
// The real backend code (apps-script/Code.gs) then runs inside the browser on practice data,
// so the editor can be tried freely. Never active on the live site.
(function () {
  SWU.sandbox = new URLSearchParams(location.search).has("sandbox") && location.hostname !== SWU.config.liveHost;
  if (!SWU.sandbox) return;
  // Written synchronously so these run before the rest of the site starts.
  document.write(
    '<script src="sandbox/fake-google.js"><\/script>' +
    '<script src="apps-script/Code.gs"><\/script>' +
    '<script src="sandbox/start.js"><\/script>'
  );
})();
