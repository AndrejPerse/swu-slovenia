// Talks to the Google Apps Script web app for everything the editor does.
(function () {
  const api = (SWU.api = {});
  const PASS_KEY = "swu-editor-password";
  let memoryPassword = "";

  function setPassword(value) {
    memoryPassword = value;
    try { sessionStorage.setItem(PASS_KEY, value); } catch (e) { /* storage unavailable */ }
  }

  api.password = function () {
    try { return sessionStorage.getItem(PASS_KEY) || memoryPassword; } catch (e) { return memoryPassword; }
  };

  api.loggedIn = () => !!api.password();

  api.logout = function () {
    memoryPassword = "";
    try { sessionStorage.removeItem(PASS_KEY); } catch (e) { /* storage unavailable */ }
  };

  // Sent as text/plain so the browser doesn't need a CORS preflight, which Apps Script can't answer.
  // Exactly one request per call: nothing is retried automatically. On failure the error is
  // shown in the editor and the user decides whether to try again.
  api.call = async function (action, payload = {}) {
    if (!SWU.config.apiUrl) throw new Error("The Google Sheet isn't connected yet (apiUrl in js/config.js is empty).");
    let response;
    try {
      response = await fetch(SWU.config.apiUrl, {
        method: "POST",
        body: JSON.stringify({ ...payload, action, password: api.password() }),
      });
    } catch (e) {
      throw new Error("Couldn't reach the Google Sheet. Check your internet connection and try again.");
    }
    let out;
    try {
      out = await response.json();
    } catch (e) {
      // Google sometimes answers with an HTML error page (e.g. when it's busy or the script timed out).
      throw new Error(`The Google script didn't answer properly (status ${response.status}). Wait a moment and try again.`);
    }
    if (!out.ok) {
      const err = new Error(out.error || "Something went wrong.");
      err.code = out.code;
      if (out.code === "auth") api.logout();
      throw err;
    }
    if (out.data) {
      SWU.store.setData(out.data);
      if (SWU.onDataChanged) SWU.onDataChanged();
    }
    return out;
  };

  api.login = async function (password) {
    setPassword(password);
    try {
      await api.call("check");
    } catch (e) {
      api.logout();
      throw e;
    }
  };
})();
