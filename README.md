# eas-release

Small release CLI for Sam's Expo/EAS apps. It is public to avoid private package friction, but it is intentionally built for this project family rather than every Expo setup.

The version file format is intentionally standardized across apps. If an app differs only by quote style or formatting, update the app instead of adding package options.

## Install

```bash
yarn add -D @tradersamwise/eas-release
```

## Release

Releases are tag-driven. Run one of these from `main`:

```bash
yarn release:patch
yarn release:minor
yarn release:major
```

The `v*` tag triggers GitHub Actions, which verifies the package, checks that
`package.json` matches the tag, and publishes to npm with provenance through
npm Trusted Publishing.

## Scripts

```json
{
  "scripts": {
    "version:current": "eas-release current",
    "version:bump-build": "eas-release bump-build",
    "version:bump-ota": "eas-release bump-ota",
    "version:sync": "eas-release sync",
    "version:rollback": "eas-release rollback",
    "version:set": "eas-release set",
    "build:testflight": "eas-release build testflight",
    "build:production": "eas-release build production",
    "update": "eas-release update testflight",
    "update:production": "eas-release update production"
  }
}
```

## Workflow

Two release paths, chosen by what changed. Always bump the version first, then ship.

OTA update — JavaScript and asset changes only, delivered over the existing native build's Expo runtime:

```bash
yarn version:bump-ota && yarn update              # testflight
yarn version:bump-ota production && yarn update:production   # production
```

Native build — required whenever the native binary or its Expo runtime fingerprint changes:

```bash
yarn version:bump-build && yarn build:testflight    # testflight
yarn version:bump-build production && yarn build:production     # production
```

Decision rule: OTA covers JavaScript and assets. A native rebuild is required for native dependencies, Expo plugins, permissions/entitlements, icons, splash screens, build profiles, or any native configuration — anything that changes the native binary or its Expo runtime fingerprint. `bump-ota` enforces this: it aborts if the Expo runtime version changed since the last native build, because an OTA can only target the runtime already installed on the device. `bump-build` increments the build number, resets the OTA counter to 0, and updates native version files. Both commands commit the version file.

## Config

Create `eas-release.config.json` in the app directory:

```json
{
  "versionFile": "lib/version.ts",
  "native": {
    "ios": {
      "infoPlist": "ios/aimux/Info.plist",
      "pbxproj": "ios/aimux.xcodeproj/project.pbxproj"
    },
    "android": {
      "buildGradle": "android/app/build.gradle"
    }
  },
  "eas": {
    "testflightProfile": "testflight",
    "productionProfile": "production",
    "testflightChannel": "testflight",
    "productionChannel": "production"
  },
  "commands": {
    "checkReleaseEnv": "node scripts/check-release-env.js",
    "beforeUpdate": ["./scripts/check-dict-version.sh --strict"]
  },
  "env": {
    "required": ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]
  }
}
```

Native files are committed only when they are tracked by Git. Generated ignored `ios/` directories are updated locally when present, but skipped during version commits.

## Android tester distribution

Google Play has no TestFlight. Internal testing ships through the ordinary Play
Store, which never tells a tester that a new build exists or which build they
are on. Firebase App Distribution is the Android peer of `--auto-submit`: it
emails testers per release and lists builds with their numbers and notes.

Because an APK bound for Firebase cannot come from the same EAS profile as an
iOS store build, platforms can take different profiles:

```json
{
  "eas": {
    "platformProfiles": {
      "testflight": { "android": "testflight-android" }
    },
    "defaultBuildPlatform": "all",
    "defaultUpdatePlatform": "all",
    "parallelBuilds": true
  },
  "distribute": {
    "testflight": {
      "android": {
        "firebase": {
          "appId": "1:000000000000:android:abcdef",
          "project": "my-firebase-project",
          "groups": ["my-team"],
          "serviceAccountKeyPath": "credentials/firebase-distribute.json"
        }
      }
    }
  }
}
```

A platform with a `distribute` entry never receives `--auto-submit`; its build
is handed to that channel instead of to the store.

With `defaultBuildPlatform: "all"`, `eas-release build` runs both platforms
concurrently. iOS is launched first, and the two are isolated: either can fail
without cancelling or failing the other. Exit codes are aggregated afterwards
and printed as a summary, so a broken Android build never blocks an iOS
release.

`eas-release distribute [target]` re-pushes the latest finished Android build to
its tester channel without rebuilding.

### Per-app Android setup

Each app needs its own, and none of it is shared between apps:

1. Play developer account with the app created (package name matters).
2. A GCP service account with **Release manager** granted in Play Console under
   Users and permissions, keyed into `eas.json` as `serviceAccountKeyPath`.
3. A Firebase project with an Android app registered on the same package name,
   plus a tester group (`firebase appdistribution:group:create`).
4. A service account with `roles/firebaseappdistro.admin`, keyed into
   `distribute.*.android.firebase.serviceAccountKeyPath`.
5. An Android OAuth client per signing certificate if the app uses Google
   Sign-In - the Play **app signing** SHA-1 for Play builds, the **upload** key
   SHA-1 for directly installed APKs.

Keys live in a gitignored `credentials/` directory, never in the repo.

Each step below has a failure mode that is silent or misleading, so they are
written out in the order they bite.

#### 1. Play developer account

Needed even when you never intend to ship through Play: registering the package
there is what satisfies **Android developer verification**, without which your
own sideloaded APKs stop installing on certified devices (Brazil, Indonesia,
Singapore and Thailand from 30 September 2026, wider later).

Some app categories — crypto, banking, stock trading, health, VPN, government —
can only reach production from an **organization** account. A personal account
can still run internal testing for them.

#### 2. Firebase App Distribution is the tester channel

Play has no TestFlight. Internal testing ships through the ordinary Play Store,
which never tells a tester a build exists or which one they are running.

- Testers install **App Tester**, which is *not* in the Play Store — it installs
  other apps, which Play's own Device and Network Abuse policy forbids. It comes
  from the invite email as a sideload. Say so, or testers will hunt for it.
- Distribute an **APK**. Firebase only accepts an AAB when the Firebase project
  is linked to a Play developer account, and that link needs Owner on the
  Firebase project — which Google refuses to grant an external account over the
  API. Hence a separate APK profile rather than reusing the store AAB.
- Limits: 500 testers per project, 200 per group, 1000 releases, and releases
  expire after 150 days. Increases are free on request.

#### 3. Service account keys on a Workspace org

New Google Cloud orgs enforce `constraints/iam.disableServiceAccountKeyCreation`,
so key creation fails outright. Grant yourself `roles/orgpolicy.policyAdmin` on
the org, then:

```sh
gcloud resource-manager org-policies disable-enforce \
  constraints/iam.disableServiceAccountKeyCreation --project <project>
```

The change takes a few minutes to propagate; key creation keeps failing until it
does, with the same error. Retry rather than re-diagnose.

#### 4. Google Sign-In on Android

The most expensive part, because every failure looks like a different bug.

- **Two OAuth clients**, not one. An Android client is bound to a single signing
  certificate, so the Play **app signing** SHA-1 (Play installs) and the
  **upload** key SHA-1 (Firebase/EAS APKs) need one each. The wrong one gives
  *"<App> sent an invalid request"*.
- **Enable custom URI scheme** on each Android client, under Advanced settings.
  It is off by default and `expo-auth-session` needs it. Without it:
  *"Custom URI scheme is not enabled for your Android client."*
- **Register the package name as a scheme.** `expo-auth-session` redirects to
  `${applicationId}:/oauthredirect`, so `android.scheme` must include the
  package name, not just the app's own scheme. iOS is exempt because
  `ASWebAuthenticationSession` intercepts the callback. Without it the browser
  finishes and strands the user on google.com. Native change — needs a build.
- **Add an `oauthredirect` route** if the app uses expo-router, or the redirect
  renders "Unmatched Route". It must *pop*, not navigate: replacing the stack
  unmounts the sign-in screen mid token-exchange and silently drops the first
  attempt.
- **Accept the Android client ID server-side.** ID tokens carry the Android
  client ID as their audience; a backend that only allows the iOS and web client
  IDs returns UNAUTHORIZED after a fully successful OAuth round trip.

### Version parity

`buildNumber` is one counter shared by both platforms, and `runtimeVersion` is
derived from it. Shipping a single platform therefore strands the other on an
older runtime, where it silently stops receiving OTA updates.

So when `defaultBuildPlatform` is `"all"`, building is all or nothing.
`--platform ios` / `--platform android` are refused unless they *repair drift*
that already exists - that is, the other platform has a finished build at the
current build number and this one does not:

```
$ eas-release build testflight --platform android
Refusing to build only android at Build 7: ios has no build at that number
either, so this would strand ios on an older runtime and stop its OTA updates.
Building is all or nothing - run `eas-release build testflight`.
```

Apps that are genuinely single-platform set `defaultBuildPlatform` to `"ios"` or
`"android"` and are never subject to the check.
