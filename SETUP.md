# Setup guide

Two one-time jobs: connect the Google Sheet (the database) and publish the site on GitHub Pages.

## Part A: Google Sheet + script

1. Open [sheets.google.com](https://sheets.google.com) with the Google account that should own the league data, and create a **Blank spreadsheet**.
2. Click the title "Untitled spreadsheet" (top left) and rename it to **SWU Slovenia League**.
3. In the menu choose **Extensions → Apps Script**. A new tab opens with a file called `Code.gs` that contains `function myFunction() {}`.
4. Click into that code, press **Ctrl+A**, then **Delete**, so the editor is empty.
5. In VS Code open `apps-script/Code.gs`, press **Ctrl+A** then **Ctrl+C**, go back to the Apps Script tab and press **Ctrl+V**.
6. Click "Untitled project" at the top and rename it to **SWU League backend**. Press **Ctrl+S** to save.
7. Go back to the spreadsheet tab and reload it (**F5**). After a few seconds a new menu **SWU League** appears next to "Help".
8. Click **SWU League → 1. Set up sheet tabs**. Google asks for permission the first time:
   - Click **Continue**, then pick your Google account.
   - You'll see "Google hasn't verified this app". This appears for every personal script. Click **Advanced**, then **Go to SWU League backend (unsafe)**, then **Allow**.
   - If nothing happens after allowing, click **SWU League → 1. Set up sheet tabs** again.
   - A message says "The sheet is ready". The tabs Seasons, Players, Events, Results, Matches and Calendar now exist.
9. Click **SWU League → 2. Set editor password**, type the password you want for the website editor (6+ characters) and click **OK**.
10. Switch to the Apps Script tab and click the blue **Deploy** button (top right), then **New deployment**.
11. Click the gear icon next to "Select type" and choose **Web app**. Fill in:
    - Description: `v1`
    - Execute as: **Me**
    - Who has access: **Anyone**
12. Click **Deploy**. If Google asks for permission again, repeat the steps from point 8.
13. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy…/exec`. This link goes into `js/config.js` as `apiUrl`.

The spreadsheet itself can stay private; don't share it. The website reads the data through the script, and changes need the editor password.

### Updating the script later

When `Code.gs` changes, paste the new version into the Apps Script editor and save it. Then:

1. Click **Deploy → Manage deployments**.
2. Click the pencil icon.
3. Under **Version**, choose **New version**.
4. Click **Deploy**.

This keeps the same URL. Creating a *new* deployment would give a different URL.

## Part B: GitHub Pages

1. In VS Code open a terminal (**Terminal → New Terminal**) and run:

   ```
   git push -u origin main
   ```

2. A "Connect to GitHub" window opens. Choose **Sign in with your browser**, log in as **AndrejPerse** and click **Authorize**. The terminal then finishes uploading.
3. On GitHub, open the repository **AndrejPerse/swu-slovenia** and go to **Settings → Pages** (left menu).
4. Under "Build and deployment", set:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**

   Then click **Save**.
5. After 1–2 minutes, refresh the page. It shows **Your site is live at https://andrejperse.github.io/swu-slovenia/**.

Every later `git push` updates the site within a minute or two.

## When a new set comes out

Run these to refresh the leader and base lists. The second one needs Pillow: `pip install pillow`.

```
python tools/build_cards.py
python tools/build_base_icons.py
```

The second command creates icons for new rare bases. Icons for new common bases (a new color group) have to be added by hand to `assets/bases/`.
