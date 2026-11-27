# Changelog

The version shows next to the app title (and on the login screen).
`server ✓` means the Apps Script backend matches. Only the first two numbers are compared: a third-number change (2.2.**1**) is a page-only fix, so only `index.html` needs pushing. A yellow `server vX` means Code.gs needs redeploying (or the page pushing).

## 2.3.0 – 27-11-2026 (page + Code.gs)
- Solutions and ticks are kept on the device first and saved to Drive in batches (fixes "Server busy" and edits being reset by Sync)
- Nothing is lost when offline, the server is busy or the page is reloaded; it is sent automatically later
- Changes that clash with another device are not overwritten: a window shows both versions to keep mine / keep theirs
- Status at the top: "N waiting to save", "Saving…", "All saved"

## 2.2.1 – 27-11-2026 (page only)
- Weekday (Mon, Tue…) under the date in the discrepancy list, Sundays highlighted; also in Copy for Excel and .xlsx

## 2.2.0 – 27-11-2026
- Admin settings tab (renamed from Users): users, activity log, backup & restore, data wipe
- Version number shown in the app

## 2.1.0 – 27-11-2026
- Solution suggestions per issue type, learned from what staff typed before
- IN / OUT / WH columns in the discrepancy list, full-width layout

## 2.0.0 – 27-11-2026
- Login, dashboard, Google Drive sync, solution entry and tick to rectify

## 1.1.0 – 18-11-2026
- Combine several Pagarbook files, Staff ID + name check
