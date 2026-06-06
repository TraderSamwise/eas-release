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
yarn version:bump-ota && yarn update:production   # production
```

Native build — required whenever the native binary or its Expo runtime fingerprint changes:

```bash
yarn version:bump-build && yarn build:testflight    # testflight
yarn version:bump-build && yarn build:production     # production
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
