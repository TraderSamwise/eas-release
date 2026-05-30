# eas-release

Small release CLI for Sam's Expo/EAS apps. It is public to avoid private package friction, but it is intentionally built for this project family rather than every Expo setup.

## Install

```bash
yarn add -D @tradersamwise/eas-release
```

## Scripts

```json
{
  "scripts": {
    "version:current": "eas-release current",
    "version:bump-build": "eas-release bump-build",
    "version:bump-ota": "eas-release bump-ota",
    "version:rollback": "eas-release rollback",
    "version:set": "eas-release set",
    "build:testflight": "eas-release build testflight",
    "build:production": "eas-release build production",
    "update": "eas-release update testflight",
    "update:production": "eas-release update production"
  }
}
```

## Config

Create `eas-release.config.json` in the app directory:

```json
{
  "versionFile": "lib/version.ts",
  "native": {
    "ios": {
      "infoPlist": "ios/aimux/Info.plist",
      "pbxproj": "ios/aimux.xcodeproj/project.pbxproj"
    }
  },
  "eas": {
    "testflightProfile": "testflight",
    "productionProfile": "production",
    "testflightChannel": "testflight",
    "productionChannel": "production"
  },
  "env": {
    "required": ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]
  }
}
```

Native files are committed only when they are tracked by Git. Generated ignored `ios/` directories are updated locally when present, but skipped during version commits.
