export const APP_VERSION = {
  version: "1.0.0",
  buildNumber: 2,
  otaVersion: 0,
  timestamp: "2026-01-01T00:00:00Z",
  channel: "testflight",
};

export const getVersionString = () => `${APP_VERSION.version} (${APP_VERSION.buildNumber}.${APP_VERSION.otaVersion})`;
export const getVersionCode = () => `${APP_VERSION.buildNumber}.${APP_VERSION.otaVersion}`;
