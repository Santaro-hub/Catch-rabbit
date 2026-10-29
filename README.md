# Rabbit Chase

Rabbit Chase is a small touch-friendly game built with HTML, CSS, and
JavaScript, packaged for Android with Capacitor. Catch as many hopping rabbits
as possible in each 30-second round, earn persistent coins and streak bonuses,
and level up to face faster, smaller rabbits. Your high score is saved too.
This is an original mini game, not Counter-Strike 2.

## Publish the website with GitHub Pages

The static website lives in `www/`. A GitHub Actions workflow is included at
`.github/workflows/deploy-pages.yml`; it publishes that folder when changes
are pushed to `main` or `master`, or when manually started from the Actions tab.

1. Create a GitHub repository and add this project to it.
2. Push the `main` or `master` branch.
3. In the repository, open **Settings > Pages** and set the source to **GitHub Actions**.
4. Open **Actions**, wait for **Deploy Rabbit Chase to GitHub Pages** to finish,
   and use the website URL shown in the deployment.
5. Open that public URL once to verify the game and `/privacy.html` load.

The website can also be hosted as a static site from the contents of `www/`
on any static hosting provider. HTTPS is required for installable PWA features.

The service worker caches the game for offline use after its first successful
visit and refreshes cached files after successful network requests.

## Google Play release

The Android package ID is `com.tacticaledge.rabbitchase`. Google Play does not
allow changing an app's package ID after its first release. Store listing copy
is in `play-store-listing.json`; the public privacy policy must be available at
the deployed website's `/privacy.html` before submitting the listing.

1. Install Node.js 22+ and Android Studio 2025.2.1+ with the Android SDK.
2. Run the Android setup commands below if the `android/` project has not yet
   been generated.
3. In Android Studio, open the `android/` project and choose
   **Build > Generate Signed Bundle / APK > Android App Bundle**.
4. Create and securely back up your upload key. Keep passwords and keystore
   files out of source control; never send them in chat.
5. Upload the signed `.aab` to the Google Play Console, complete its app
   content, data safety, target audience, testing, and store listing forms, and
   follow any review feedback.

The app stores game progress (coins, high score, inventory, and preferences)
locally on the user's device. It has no account system, ads, analytics, or
gameplay server. Review the linked privacy policy and Play Console Data safety
answers against the final app and Google's current requirements before release.
The store listing draft is in `play-store-listing.json`. Google Play also
requires store artwork, including a 512 × 512 PNG app icon; `www/icon.svg` is
the source artwork and can be exported to PNG for the listing and Android
launcher resources.

## Requirements

- Node.js 22 or newer
- Android Studio 2025.2.1 or newer, with an Android SDK installed
- Windows for the `android:debug` npm script

## Set up Android

From the project directory, install JavaScript dependencies and generate the
native Android project:

```powershell
npm install
npm run android:add
```

The Android project is generated in `android/`. You only need to run
`android:add` once. Open it in Android Studio with:

```powershell
npm run android:open
```

## Build a debug APK

```powershell
npm run android:debug
```

The APK will be written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

To install it on a connected device, enable USB debugging and run:

```powershell
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

For future web UI changes, update files in `www/` and run
`npm run android:sync` before building again. Use Android Studio's signed APK
or App Bundle flow to prepare a release build.
