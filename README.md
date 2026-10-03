# KADIWA Formal 2026

Banner-themed personal QR passes, table assignments, program, reminders and guest self-check-in. GitHub Pages hosts the public site; a Google Apps Script web app reads the seating list and saves arrivals in **Event Passes**.

The source has 170 people: 150 across 15 tables, and 20 with table `0`, displayed as **Registration desk**. The public site never includes the full guest list. The sample preview uses fictitious people and does not save real attendance.

## Connect Google Sheets

1. Open the attendee spreadsheet and select **Extensions > Apps Script** using an account that can edit it.
2. Replace `Code.gs` with [apps-script/Code.gs](apps-script/Code.gs).
3. Add an HTML file named **Bridge**, or replace your existing one, with [apps-script/Bridge.html](apps-script/Bridge.html).
4. In **Project Settings**, enable **Show appsscript.json manifest file in editor**. Use [apps-script/appsscript.json](apps-script/appsscript.json) for that file. If you already installed this manifest, leave it unchanged. Save.
5. Reload the spreadsheet. Choose **KADIWA Formal > Set up guest passes** and authorize the script. No volunteer password is needed. Existing pass tokens and arrival records are preserved; the seating list is not changed.
6. Choose **Deploy > New deployment > Web app**, with **Execute as: Me** and **Who has access: Anyone**. Deploy and copy the URL ending in `/exec`. If your organization does not allow **Anyone**, ask its administrator.
7. Put the URL in `backendUrl` in [site-config.json](site-config.json), then commit to `main`.

For an existing deployment, use **Deploy > Manage deployments > Edit > New version > Deploy** to keep the same URL. Saving code alone does not update a live deployment.

## Generate QR Passes

1. In the spreadsheet choose **KADIWA Formal > Print / download guest passes**.
2. **Save pass** under a guest downloads their personal PNG for sharing.
3. **Download printable passes** downloads an HTML file containing all QR passes. Open it in a browser and choose **Print**, then **Save as PDF** or your printer. QR images are embedded so this file does not need internet to print.
4. **Invitation links CSV** exports the private list of personal links. Links also appear in the **Personal Invitation Link** column of **Event Passes**.

QR images are generated on your device, without sending guest details to a QR service. Keep the spreadsheet, CSV, printable file and guest links private. Send each guest only their own pass. Anyone with a personal link can see that guest's name, congregation, role and table, and check in as them.

After adding guests or changing tables, use **KADIWA Formal > Refresh guest passes from seating list** before generating passes. Table changes preserve tokens. Names plus congregations identify guests; correcting capitalization or spaces preserves a pass, but changing a name's spelling or congregation creates a new one. Reissue that person's pass. Do not sort or edit **Event Passes** while arrivals are being recorded.

The private pass menu is available only to spreadsheet editors. There is no public roster, volunteer login or scanner dashboard.

## Guest Self-Check-In

Guests scan their QR code using their phone's camera, or open their personal link. They see their name and table, then tap **I'm here** when they arrive. Opening a pass alone does not record attendance.

The arrival time appears on their pass and in **Checked In At**, with **Self check-in** in **Checked In By**. Repeat taps preserve the first arrival time. Internet is required. On a timeout, use the refresh icon to check whether the arrival was recorded before retrying.

This is an honor-based arrival system, not proof of physical presence. It does not collect location or require an account. Organizers monitor arrivals directly in **Event Passes**. For a guest without a working phone, an organizer can open that guest's personal link on another device.

## Test Before Distribution

- Open a real guest link on a phone and confirm the name, table and QR.
- Tap **I'm here** and confirm the arrival cells in **Event Passes**.
- Refresh the pass and verify the original arrival time is unchanged.
- Check a table-zero guest sees **Registration desk**.
- Change a test guest's table in **Seating Arrangement** and refresh their existing link.
- Clear only the test guest's **Checked In At** and **Checked In By** cells before the event, then refresh their pass.

## Publish and Update

The **Publish Event Website** GitHub Actions workflow deploys commits to `main`. Under **Settings > Pages**, the source should be **GitHub Actions**.

Live site: https://edrienneching-ehc.github.io/kadiwaformal2026/

Sample preview: https://edrienneching-ehc.github.io/kadiwaformal2026/?demo=1

The public event information works before the Google connection is configured, but real guest passes and attendance require it. Never distribute demo passes. The Google bridge accepts only the live site's origin.

Edit [site-config.json](site-config.json) for confirmed program items, reminders and event details. The event starts October 4, 2026 at 5:00 PM Singapore time; the ending time is unconfirmed. The supplied MRT walking guides are under `assets/guides/`.

## Development

```sh
npm ci
npm test
npm run build
npm run dev
npm run test:browser
```

Local sample: http://127.0.0.1:4173/?demo=1

Browser tests check desktop/mobile layouts, self-check-in, repeated refresh, QR images, private pass exports, downloads, directions and the unconfigured state. They use installed Chrome on macOS, or Playwright Chromium elsewhere.

Only `dist/` is uploaded to GitHub Pages. It contains public content, the banner, guides and browser libraries. Apps Script source, real guest names, QR tokens, exports and test artifacts are excluded.
