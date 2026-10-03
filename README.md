# KADIWA Formal 2026

Banner-themed guest passes, table assignments, program, reminders, volunteer QR scanning, attendance, and printable passes. GitHub Pages hosts the public website. A Google Apps Script web app reads the private seating list and records arrivals in a separate **Event Passes** tab.

The finalized source has 170 people: 150 assigned across 15 tables, and 20 at table `0`. Table `0` displays **Registration desk**. The website never publishes the full guest list. The included preview uses six fictitious guests and does not record attendance.

## 1. Connect Google Sheets (one-time)

1. Open the attendee spreadsheet, then **Extensions > Apps Script**. Use the same Google account that can edit the sheet.
2. Replace the default `Code.gs` contents with [`apps-script/Code.gs`](apps-script/Code.gs).
3. Click **+ > HTML**, name the file **Bridge**, and put the contents of [`apps-script/Bridge.html`](apps-script/Bridge.html) in it.
4. In **Project Settings**, enable **Show appsscript.json manifest file in editor**. Replace that file with [`apps-script/appsscript.json`](apps-script/appsscript.json). Save the project as **KADIWA Formal 2026**.
5. Reload the spreadsheet. Open **KADIWA Formal > Set up / reset volunteer password**. Authorize the script when prompted, then choose a password of at least 12 characters. Use a password unique to the event. This creates **Event Passes** without changing the seating or form-response tabs. Alternatively, run `setupKadiwa_` in the Apps Script editor, then return to the spreadsheet for the prompt.
6. In Apps Script, click **Deploy > New deployment > Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy** and copy the URL ending in `/exec`. An organization account may restrict the available access choices; check with its administrator if **Anyone** is unavailable.
7. Put that URL into `backendUrl` in [`site-config.json`](site-config.json), keeping the quotation marks. Commit the change to `main`.

The `/exec` service reveals a guest record only to someone with that guest's random pass token. Listing all guests, exporting passes, and recording arrivals require a valid volunteer session. Keep the spreadsheet and the volunteer password restricted to organizers. Guest pass links are personal: share each with its intended guest.

## 2. Publish on GitHub

In the repository, open **Settings > Pages**, and select **GitHub Actions** as the publishing source. The **Publish Event Website** workflow publishes after commits to `main`. If needed, open **Actions > Publish Event Website > Run workflow**.

Expected website address, once the workflow succeeds:

`https://edrienneching-ehc.github.io/kadiwaformal2026/`

Volunteer page:

`https://edrienneching-ehc.github.io/kadiwaformal2026/?view=admin`

The public pages work before the Google connection is configured. Live guest passes and attendance require the connection. The local preview's `?demo=1` flag uses sample guests only; never distribute preview passes. The bridge is restricted to the live GitHub origin, so use the published site for the real Google connection.

## 3. Generate and distribute the QR passes

1. Open the volunteer page and sign in using your name and the event's volunteer password.
2. Click **Print passes**, then **Print / Save PDF**. The printable sheet contains one personal QR code per guest, with their name, congregation, role and table. It is sized for A4 paper.
3. For an individual image, click the ticket icon beside a guest, then **Save pass**. This downloads a named PNG suitable for sending through your preferred messaging app.
4. **Export > Invitation links CSV** downloads a private list of names and personal links for distribution. Guests can open their links directly or scan their printed QR code.

The QR codes are generated on your device, without sending guest details to a QR-code service. They point to `?pass=<random-token>` on the event site. Changing a table preserves its QR code. After adding people, choose **KADIWA Formal > Refresh guest passes from seating list** in the spreadsheet, or refresh the volunteer list.

Names plus congregations identify the people across sheet updates. Correcting only capitalization or extra spaces preserves a pass. Changing the spelling of a name or the congregation creates a new pass, so reissue it for that person. Do not sort or edit **Event Passes** while volunteers are registering guests; use **Seating Arrangement** for seating changes.

## 4. Test before distributing

- On a phone, open a real guest link and check the name, table, QR image, program and reminders.
- On a second device, open the volunteer page. Allow camera access and scan that guest pass, or upload a QR image. Name lookup is also available.
- Confirm the arrival time and volunteer name appear in **Event Passes**. Refresh on another volunteer device to confirm the same result.
- Scan the same pass again: it should say **Already checked in** and preserve the original arrival time.
- Change that person's table in **Seating Arrangement** and refresh their existing pass. The table should update without changing the link.
- After a trial check-in, the organizer can clear only that test person's **Checked In At** and **Checked In By** cells in **Event Passes**. Do this before registration opens, then refresh the volunteer screen.

Camera scanning requires HTTPS and browser camera permission. If the camera is unavailable, use **QR image** or name lookup. Check-in requires internet. On a timeout, refresh attendance to confirm whether the arrival was recorded. The dashboard refreshes every 30 seconds; the refresh icon requests an immediate update. Volunteer sessions last up to six hours and may expire earlier if Google's cache is cleared; sign in again as needed.

## Update the program and reminders

Edit [`site-config.json`](site-config.json), keeping valid JSON. Leave unconfirmed items empty. Example entries:

```json
"program": [
  { "time": "5:00 PM", "title": "Confirmed session title", "description": "Optional detail" }
],
"reminders": [
  { "title": "Dress code", "text": "Your confirmed dress-code instructions." }
]
```

`startsAt` already uses October 4, 2026, 5:00 PM Singapore time. Set `endsAt` only when the ending time is confirmed. Add `venueAddress` once the precise address is available. Commit to `main` to publish changes.

After editing Apps Script code, use **Deploy > Manage deployments > Edit > New version > Deploy**. Keep the same deployment so the `/exec` URL stays unchanged. The Apps Script editor's save button alone does not update an existing live deployment.

## Development

```sh
npm ci
npm test
npm run build
npm run dev
```

Sample preview: `http://127.0.0.1:4173/?demo=1`

Sample volunteer screen: `http://127.0.0.1:4173/?demo=1&view=admin`

`npm run test:browser` checks desktop and mobile pages, check-in, duplicate scans, QR image decoding, printable passes, export, and rendering. It requires Playwright Chromium (`npx playwright install chromium`) and the preview server.

Only `dist/` is uploaded to Pages. It includes public event content, the provided banner, and browser libraries. Apps Script source, attendee names, real QR tokens, volunteer credentials, exports, and test artifacts are excluded from the Pages build.
