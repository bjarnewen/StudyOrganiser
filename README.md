# Study Organiser

A native SwiftUI app for macOS + iPadOS (+ iPhone) with:
- **Today** view — today's classes and upcoming assignments at a glance
- **Schedule** — weekly timetable, color-coded by subject, tagged Lecture/Tutorial/Practical/Exam/Other
- **Assignments** — manually entered, grouped by overdue/upcoming/completed, with priority and due dates
- **Subjects** — your list of courses, each with a color, and optional links to related files/folders (e.g. GoodNotes notebooks — see below)
- **Settings** — paste an iCal (.ics) URL and the schedule builds itself automatically: each class's type and subject are detected from its title, no manual classification required
- **Class notes** — tap any class in Today/Schedule to keep a running, checkable list of follow-up notes tied to that specific class
- **iCloud sync** — your data follows you between Mac and iPad once the iCloud capability is turned on (see step 3)

The project is fully generated and confirmed to build cleanly on both macOS and iPadOS (verified in the simulator before Xcode was removed from this machine during a storage cleanup). All you need is Xcode itself.

## Setup

### 1. Install Xcode
Open the **App Store** app → search **Xcode** → Get/Install. It's large (several GB) so this takes a while.

### 2. Point the command line tools at it and accept the license
```bash
sudo xcode-select -switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license
```
Launch Xcode.app once by hand afterward so it can finish installing its own additional components.

### 3. Open the project and turn on iCloud sync
Open `StudyOrganiser.xcodeproj` (already generated, in this folder). For **each** target (StudyOrganiser-iOS and StudyOrganiser-macOS):
- **Signing & Capabilities** tab → **Team**: pick your Apple ID (a free personal team is fine for local testing)
- Click **+ Capability** → add **iCloud** → check **CloudKit** → let Xcode create a container (e.g. `iCloud.com.bjarnewendland.studyorganiser`)
- **Important**: both targets must end up pointing at the **same** CloudKit container, or your data won't sync between Mac and iPad.

Network access (for downloading your calendar) and file-linking (for GoodNotes/iCloud Drive) entitlements are already set up for the macOS target in `project.yml` — nothing else to configure there.

If you ever change `project.yml`, regenerate the project with [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`xcodegen generate` from this folder) rather than hand-editing the `.xcodeproj`.

### 4. Build & run
- Pick the **StudyOrganiser-macOS** scheme and press **⌘R** to run it on your Mac.
- Pick an **iPad simulator** (or your own iPad) as the destination with the **StudyOrganiser-iOS** scheme, and press **⌘R**.

## Using it

1. Go to **Settings**, paste your calendar's iCal URL, and tap **Import/Refresh Now**. The schedule is created automatically — each class is classified as Lecture/Tutorial/Practical/Exam/Other and matched to a subject purely from its title (e.g. "Lecture: Linear Algebra" → subject "Linear Algebra", type Lecture), creating new subjects as needed.
   - **Google Calendar**: on the web, click the gear icon → Settings → pick your calendar under "Settings for my calendars" → scroll to **Integrate calendar** → copy **"Secret address in iCal format"**.
   - Any other calendar app that can export/publish an `.ics` link works the same way.
2. If a class gets misclassified, go to **Settings → Class Mappings** and tap it to fix the type or subject — the correction applies immediately to that class and sticks for future syncs.
3. Tap any class in **Today** or **Schedule** to add follow-up notes for it (things to check before the next occurrence).
4. In **Subjects**, tap a subject to rename it, change its color, or link a GoodNotes notebook/folder (see limitation below).
5. Add assignments manually from the **Assignments** tab (title, due date, subject, priority, notes).

## GoodNotes / iCloud Drive linking — what's actually possible

Apple's app sandboxing means no third-party app — including this one — can browse another app's private iCloud container directly, and GoodNotes doesn't publish an API for that. What *is* real and implemented: if you set a notebook's **Document Storage** to iCloud Drive/Files inside GoodNotes' own settings, it becomes a regular file the system can hand off to. Each subject's edit screen has a **Linked Notes** section where you pick that file or its containing folder once (via the standard file picker) and reopen it directly from then on. If a notebook stays in GoodNotes' own private storage (the default), it won't be pickable at all — that's a GoodNotes/Apple platform limitation, not something this app can work around.

## Notes / current limitations

- The importer expands weekly-recurring events (`RRULE:FREQ=WEEKLY`) into the correct weekday(s); one-off events import as single dated entries. Daily/monthly recurrence patterns aren't specially handled (uncommon for class timetables).
- Subject auto-detection strips recognized type keywords (lecture/tutorial/practical/exam, English + German) from the title to guess the subject name; messy titles (e.g. with course codes) may need a quick rename in Subjects afterward.
- Refresh is manual (tap the button in Settings) rather than on an automatic background schedule — keeps the app simple and dependency-free.
- No app icon is bundled yet — Xcode's default placeholder will show until you drop in your own via the Assets.xcassets AppIcon slot.
