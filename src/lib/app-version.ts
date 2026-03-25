const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;

if (!appVersion) {
  throw new Error("NEXT_PUBLIC_APP_VERSION is not configured");
}

export const APP_VERSION = appVersion;
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_REPOSITORY_URL = "https://github.com/g1331/AutoRouter";
