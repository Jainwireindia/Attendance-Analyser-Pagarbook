# Attendance Analyser (Pagarbook)

A web dashboard for checking Pagarbook attendance, collecting solutions from supervisors and tracking rectification. Data is saved as JSON files in a Google Drive folder through a Google Apps Script backend.

**How it works**

1. **Analyse.** The office uploads one or more Pagarbook exports. Staff appearing in more than one file are matched by Staff ID and name, and ID clashes are flagged. The tool lists every discrepancy: OT, half day, missing punch, absent, Sunday work, new joiner, resignation and not in company. **Save to Google Drive** stores the list.
2. **Solution.** A supervisor or the office types what was decided for each item, such as "OT approved" or "Half day". The item moves to *To rectify in Pagarbook*.
3. **Rectify.** The office makes the change in Pagarbook and ticks the box. The item disappears from the list, and the dashboard progress goes up.

Uploading the same period again keeps every solution and tick. Anything that no longer shows up in the new export has been fixed in Pagarbook, so it is ticked automatically. Staff absent for the whole period are marked *Not in company* automatically.

## Files

```
index.html               the app (host on GitHub Pages)
apps-script/Code.gs      the backend: paste into a Google Apps Script project
apps-script/appsscript.json
test/                    backend tests that run in Node with mock Google services (no staff data)
```

## Setup (one time)

### 1. Backend: Google Apps Script

1. Go to <https://script.google.com> → **New project**, and name it *Attendance Analyser*.
2. Replace the contents of `Code.gs` with `apps-script/Code.gs` from this repository.
3. **Project Settings** (gear icon) → **Script Properties** → **Add script property**:
   | Property | Value |
   |---|---|
   | `ADMIN_PASSWORD` | the password for the built-in `admin` login (required) |
   | `DRIVE_FOLDER_ID` | optional. The ID of an existing Drive folder for the data. Leave it out and a folder called *Attendance Analyser Data* is created in your Drive |
4. In the editor, choose the function `setupCheck` and press **Run**. Allow the Drive permission when Google asks. The log shows the data folder link.
5. **Deploy** → **New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Copy the **Web app URL**, which ends in `/exec`.

After you change `Code.gs` later, use **Deploy → Manage deployments → Edit → Version: New version**. That keeps the same URL.

### 2. Front end: GitHub Pages

1. Open `index.html` and paste the Web app URL into `const API_URL = "";` near the top of the second `<script>`.
   (Or leave it empty, and enter the URL once under **Server settings** on the login screen of each device.)
2. Commit and push, then go to **Settings → Pages → Deploy from branch → main / root**.
3. Open the Pages link and log in as `admin` with the `ADMIN_PASSWORD`.
4. Under **Users**, create the logins for your staff.

## Logins and roles

| Role | Can do |
|---|---|
| **Admin** | Everything: users, analysis, solutions, ticks, delete periods. The built-in `admin` login takes its password from Script Properties |
| **Office** | Upload and analyse, enter solutions, tick as rectified |
| **Supervisor** | See and answer discrepancies. If departments are set, only those departments are shown. Cannot tick |

- Passwords are stored salted and hashed in `users.json`. Users can change their own password.
- A login lasts 12 hours. Disabling or deleting a user ends their session straight away.
- To log everyone out, delete `TOKEN_SECRET` in Script Properties.

## Data in Google Drive

| File | Contents |
|---|---|
| `users.json` | users and password hashes |
| `periods.json` | list of periods with counts per department |
| `period_YYYY-MM-DD_YYYY-MM-DD.json` | every discrepancy of a period, with solution, who and when, tick, and a history log |

The dashboard syncs every minute and when you press **Sync**. Every solution and tick is written to Drive straight away. Two people working at once is fine, because writes are locked on the server.

## Discrepancy rules

| Rule | Flag |
|---|---|
| Working hours more than 12:00 + 30 min | OT, confirm |
| Working hours less than 12:00 − 30 min | Half day / early leave, confirm |
| Working hours of 16:00 or more | Likely punch mismatch, confirm actual OT |
| IN without OUT, or OUT without IN | Confirm full day |
| Worked on Sunday (`WO,P`) | Confirm Sunday work |
| Absent (`A`) | Confirm absence or leave |
| No work for the first 4+ days | New joiner, confirm joining date |
| No work for the last 4+ days | Confirm last working day or resignation |
| No work for the whole period | Not in company (auto) |

The shift, tolerance, grace days and year can be changed under **New analysis → Rules**.

**Combining files:** staff are matched by Staff ID and name.
- Same ID with the same or a fuller name (`Ashok` / `Ashok Kumar`) → same person, merged.
- Same ID with different names (`Manoj Kumar` / `Suraj Kumar`) → **ID clash**. They are kept separate, so change one Staff ID in Pagarbook.

## Privacy

Never commit Pagarbook exports or reports. `.gitignore` blocks `.xlsx`, `.xls` and `.csv`. The repository holds code only. Staff data stays in your Google Drive.

## Tests

```
node test/api_test.js
```

These tests run `apps-script/Code.gs` against mock Google services.
