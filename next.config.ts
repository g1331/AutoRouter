import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import packageJson from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? `${packageJson.version}-dev`;

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.gstatic.com",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
