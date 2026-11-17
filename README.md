# Character Archive — USB / Writer Profiles Test

**This is a test build.** It replaces the Microsoft/OneDrive version's storage with browser-based folder access. It does not use Azure, OneDrive APIs, login credentials, or cloud storage.

## What it does

1. Click **Select library folder** at startup; select the same folder on your flash drive each time you open the app.
2. Pick a writer (for example, Aaron or Lindsay) or create one.
3. Pick or create a novel within that writer's library.
4. Create a blank character profile, fill in the six sections, optionally add a portrait, and link characters.
5. Edits are automatically written as JSON files to the selected folder after a brief pause. Do not unplug the drive until the save indicator reads **Saved to folder**.
6. You can switch writers without selecting the USB folder again *during the same page session*.

The app does **not** remember the chosen folder between page loads. Writer profiles are an organizational convenience, not private password-protected accounts.

## Safest test — don't overwrite your existing GitHub Pages site

You already have the GitHub repository `strnlke/character-archive` with GitHub Pages enabled. You can put this test in a separate folder:

1. Extract `Character_Archive_USB_Test.zip` to your PC.
2. Go to your GitHub `character-archive` repository, **Code** tab.
3. Click **Add file → Create new file**.
4. In the filename field enter `usb-test/README.md` (this creates a `usb-test` folder). Enter any placeholder text, then **Commit changes**.
5. Click the new **usb-test** folder, choose **Add file → Upload files**, and upload the **index.html**, **app.js**, and **styles.css** files from the extracted ZIP. Commit changes.
6. Open **https://strnlke.github.io/character-archive/usb-test/** after GitHub Pages has deployed your commit.

This leaves the existing site at `/character-archive/` untouched while you test the USB version.

**Alternative:** If you want to replace the existing OneDrive version, upload the three new application files at the repository root to overwrite the old versions, commit, then use the original GitHub Pages URL.

## First real test with a harmless folder

1. In Windows Explorer, create an empty folder such as `Documents\Character Archive TEST`. This is only for testing; you can use your flash drive afterwards.
2. Open the test URL in desktop Microsoft Edge or Google Chrome.
3. Click **Select library folder**, choose the TEST folder, and grant browser access.
4. Confirm creating a new library if asked.
5. Create a writer **Aaron**, then a novel **Don't Wake the Girls**, then a character **Jake**.
6. Enter some sample information, wait for **Saved to folder**, and inspect the TEST folder in Windows Explorer. The files should be there.
7. Refresh the browser. Select the same TEST folder again, open Aaron → Don't Wake the Girls → Jake, and check that the information is still there.
8. Create a second writer **Lindsay**, add a novel and a character, and switch back to Aaron. Their libraries should stay separate.
9. When you are satisfied, create `Character Archive` on your flash drive and choose that folder instead. The app will create a **new blank library** there. If you want to migrate existing data, manually copy the full contents of the TEST folder to the flash drive's `Character Archive` folder before selecting it.

## Expected folder structure

```
USB flash drive/
└── Character Archive/
    ├── character-archive-manifest.json
    ├── Aaron/
    │   └── Don't Wake the Girls/
    │       ├── novel.json
    │       ├── characters/
    │       │   ├── Jake--abc12345.json
    │       │   └── Jim--def67890.json
    │       └── portraits/
    │           └── character-id.png
    └── Lindsay/
        └── (her novels and characters)
```

Actual ID suffixes will be different. Filenames remain stable if you edit a character's display name, so links do not break.

## Backup options

- Click **Back up library** and choose a **different folder**, such as a folder on a second flash drive. The app creates a date-stamped backup folder and copies the full library, including portraits.
- Or manually copy the entire `Character Archive` folder with File Explorer.
- Or upload a zipped copy of that folder manually to the **OneDrive website**, without installing the OneDrive desktop sync app.

Do not use the current active library folder or one of its subfolders as the backup destination.

## Requirements and limitations

- **Desktop Chrome or Edge with HTTPS or localhost:** The File System Access API is not available consistently in all browsers. GitHub Pages provides HTTPS.
- The website itself needs an internet connection to load from GitHub Pages; reading and writing the selected folder does not use any cloud API.
- If saving fails because the drive is disconnected, the app shows **Save failed** and **Retry save**. It also provides **Download unsaved profile** to preserve a recovery JSON copy on your PC. Do **not** close the tab while unsaved changes are present.
- Do not use this version to edit a library simultaneously from two computers. A removable flash drive can only be connected to one computer at a time in normal use.
- There are no passwords or per-writer permissions. Anyone who can read the flash drive can read the JSON files.
- Images can be PNG, JPEG, or WebP up to 5 MB per image.
- Removing a portrait from the profile clears its reference but may leave an unreferenced image file in the `portraits` folder. You can clean those up later.
- The current test build does not include writer/novel renaming or deletion or an import wizard. Keep manual backups before deleting or moving files.

## What was tested before delivery

- JavaScript syntax check.
- Automated storage-flow tests using simulated file/folder handles: create/select writers, separate novels and JSON characters, save, reopen, character links, portrait upload, simulated write failure, retry, and copy a complete backup folder.
- **Not yet verified on a physical USB drive or a live GitHub Pages browser.** This is what the steps above are for.
