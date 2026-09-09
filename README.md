# Study Organiser

Your timetable, assignments and class notes — on your Mac, your MacBook and your iPad, kept in step,
**without installing Xcode and without paying Apple anything**.

- **Today** — today's classes and upcoming assignments at a glance
- **Schedule** — weekly timetable, colour-coded by subject, tagged Lecture/Tutorial/Practical/Exam/Other
- **Assignments** — grouped into overdue/upcoming/completed, with priority and due dates
- **Subjects** — your courses, each with a colour and optional links to related notebooks or folders
- **Settings** — paste an iCal (`.ics`) URL and the schedule builds itself: each class's type and subject
  are detected from its title, no manual classification required
- **Class notes** — open any class to keep a running, checkable list of follow-ups tied to that class
- **Sync** — every device stays in step through one private gist on your own GitHub account

It installs like a real app: its own icon, its own window, no browser chrome, and it works offline.

---

## Why it's a web app and not the Xcode project

The Swift project is still in this repository (see [The original Xcode project](#the-original-xcode-project)),
but it cannot do what's asked of it here, for reasons outside this codebase:

| | Native Swift app | This web app |
|---|---|---|
| Install on a Mac without Xcode | needs a signed build | open a URL |
| Install on an **iPad** | App Store, TestFlight, or sideloading — no free, no-Xcode path exists | open a URL |
| Sync between them | CloudKit, which **requires the $99/year Apple Developer Program** | included, free |
| Cost | $99/year | $0 |

That last row is the one that settles it. A free Apple ID cannot create a CloudKit container, so the
`cloudKitDatabase: .automatic` configuration in `Sources/App/StudyOrganiserApp.swift` quietly falls back
to its local-only configuration — the "iCloud sync" in the original app was never actually going to sync.

So the app was rebuilt as a web app. Everything else is a faithful port: the ICS parser, the type and
subject guessing (English and German keywords, course-code stripping), the import rules, the weekly
collapsing of one-off events — all of it behaves the way the Swift version did, and there are tests
pinning that down.

---

## 1. Put it online (once, ~2 minutes)

Push this branch to `main`. The **Deploy web app** workflow turns GitHub Pages on by itself and publishes
the app to:

**`https://bjarnewen.github.io/StudyOrganiser/`**

Check **Actions → Deploy web app** for the run. If it fails at the *Configure Pages* step, enable Pages by
hand once — **Settings → Pages → Source: GitHub Actions** — and re-run it.

> The published site contains only the app's code, which is already public in this repository.
> **None of your data goes onto the site.** It lives in your browser and in your own private gist.

## 2. Install it on each device (~1 minute each)

Open that URL on the device, then:

| Device | How |
|---|---|
| **Mac / MacBook** (Safari 17+, Sonoma or newer) | **File → Add to Dock…** |
| **Mac / MacBook** (older macOS, or Chrome/Edge) | click the **Install** icon at the right of the address bar |
| **iPad / iPhone** (Safari) | **Share** button → **Add to Home Screen** |

You now have an icon that opens in its own window with no address bar. It works with no connection.

## 3. Turn on sync (~2 minutes, once per device)

Each device holds its own copy of the data and reconciles through a single **private gist** on your GitHub
account. Nothing else is involved — no server, no account to create, no cost.

1. In the app, go to **Settings → Sync Across Devices → Set up sync**.
2. Follow the link to GitHub's token page. It preselects what's needed: tick **only** the `gist` scope,
   pick an expiry, and generate the token.
3. Paste it into the app and press **Connect**.

The first device creates the gist. Every other device you paste the same token into finds that gist
automatically — there's nothing to copy across by hand.

From then on, changes upload a couple of seconds after you make them, and each device pulls when you
switch to it, when it comes back online, and once a minute while it's open.

### How merging works

Sync is **per record**, not per file. Each subject, class, assignment and note carries its own
`updatedAt`, and the newer edit wins. Two devices that were both offline keep each other's changes
instead of one silently overwriting the other. Deletes leave a tombstone, so deleting something on the
iPad doesn't get resurrected by an older copy on the Mac.

### About the token

- It is stored in that browser's local storage **on that device only**, and is deliberately never written
  into the synced file.
- A classic token with the `gist` scope can read and write **all** of your gists, not just this one.
  That's the narrowest scope GitHub offers for gists. If you stop using the app, revoke the token at
  [github.com/settings/tokens](https://github.com/settings/tokens).
- **Settings → Disconnect** makes a device forget the token and stop syncing. Your data stays put.

---

## Getting your timetable in

Go to **Settings → Calendar Source**. There are three ways in, because browsers are more restricted than
the Swift app was: a page can only download an `.ics` file if the calendar server explicitly allows it,
and most — Google's "secret address" included — don't.

**a. Import the file by hand** — always works, nothing to set up.
Download the `.ics` from your calendar, tap **Import .ics file**, pick it. Re-do it when your timetable
changes. Only needs doing on one device; sync carries the result to the others.

**b. Publish a daily mirror** — set it up once, then it refreshes itself.
Add your calendar URL as a repository secret named `ICS_URL`
(**Settings → Secrets and variables → Actions → New repository secret**). The workflow then downloads the
calendar every day and publishes it next to the app, where the browser is allowed to read it. **Import /
Refresh Now** picks it up automatically.

> ⚠️ **This repository is public, so the mirror makes your timetable's contents public too** — anyone who
> knows the site URL could read `…/calendar.ics`. The secret URL itself stays hidden, but the events don't.
> Leave `ICS_URL` unset if you'd rather not; option (a) needs no publishing at all.

**c. Route it through a CORS proxy** — under *Calendar won't download?* in Settings.
Paste a proxy template containing `{url}`. The proxy sees your secret calendar address, so only use one
you run or trust.

**Where to find your calendar's link** — Google Calendar: gear → Settings → pick your calendar under
"Settings for my calendars" → **Integrate calendar** → copy **"Secret address in iCal format"**. Any
other app that can publish an `.ics` link works the same way.

## Using it

1. Import your calendar (above). The schedule builds itself — each class is classified as
   Lecture/Tutorial/Practical/Exam/Other and matched to a subject from its title, creating subjects as
   needed. `"WBPH001-10 Lecture: Linear Algebra"` becomes subject *Linear Algebra*, type *Lecture*.
2. If something is misclassified, **Settings → Class Mappings** → tap it. The fix applies to every class
   that rule already created and sticks for future imports.
3. Tap any class in **Today** or **Schedule** to add follow-up notes — they reappear next time that class
   comes around.
4. In **Subjects**, tap a subject to rename it, change its colour, or attach links.
5. Add assignments from the **Assignments** tab; filter by subject with the control in the header.

Class times are shown in **your device's** time zone, which is what the Swift version did too.

### Linking notebooks (GoodNotes, iCloud Drive, …)

The Swift version stored a macOS security-scoped bookmark, which only ever worked on the one Mac that
created it. A browser has no equivalent, so subjects take **links** instead: paste a share URL to a
GoodNotes notebook, an iCloud Drive folder, a Drive file — anything with a URL. Links sync to your other
devices and open in whichever app handles them there, which the old bookmarks could never do.

---

## The original Xcode project

`Sources/`, `Resources/`, `Entitlements/`, `project.yml` and `StudyOrganiser.xcodeproj` are untouched and
still build. If you ever do get Xcode and an Apple Developer account, that path is still open:

```bash
sudo xcode-select -switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license
open StudyOrganiser.xcodeproj
```

Add the **iCloud → CloudKit** capability to *both* targets, pointing at the *same* container, and pick your
team under Signing & Capabilities. Regenerate the project with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) (`xcodegen generate`) rather than hand-editing the
`.xcodeproj` if you change `project.yml`.

The **Build iOS IPA** workflow still produces an unsigned `.ipa`. Note that an unsigned build can't be
installed on an iPad or use iCloud — it's only useful as a compile check.

---

## Development

No dependencies, no build step, no bundler. The files in `web/` are served exactly as they are.

```bash
node scripts/serve.mjs          # http://localhost:8080
cd web && npm test              # 29 logic tests, Node's built-in runner
python3 scripts/make-icons.py   # regenerate the app icons (pure stdlib)
```

```
web/
  index.html  styles.css  manifest.webmanifest  sw.js
  js/
    domain.js      class types, subject-name guessing, palette   (Models/*.swift)
    ics.js         iCalendar parser                              (Services/ICSParser.swift)
    importer.js    auto-classify and upsert schedule entries     (Services/ICSImporter.swift)
    store.js       records, soft deletes, cascade rules          (the SwiftData schema)
    sync.js        gist pull/merge/push                          (replaces CloudKit)
    calendar.js    mirror / direct / proxy / file download paths
    ui.js  icons.js  components.js  app.js
    views/         today, schedule, assignments, subjects, settings
  test/            parser, importer, store and merge tests
```

The tests run in CI before every deploy, so a broken parser can't reach your devices.

## Known limitations

- Weekly recurrence (`RRULE:FREQ=WEEKLY`, including `BYDAY`) is expanded; one-off events import as single
  dated entries. Daily and monthly recurrence aren't specially handled — uncommon for class timetables.
- A calendar that publishes each week's class as its own event still imports fine: the weekly view
  collapses them to one representative row per class.
- Calendars using Windows time-zone names (`W. Europe Standard Time`) fall back to your local zone, the
  same way the Swift version did.
- Refreshing the calendar is manual (or daily, with the mirror) rather than continuous.
- Subject auto-detection strips recognised type keywords and leading course codes; messy titles may still
  need a rename in **Subjects**.
