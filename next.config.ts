import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import packageJson from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? `${packageJson.version}-dev`;

const nextConfig: NextConfig = {
  output: "standalone",
  // 开发环境：允许通过 127.0.0.1 访问（如 SSH 端口转发），否则 dev 脚本被拦截、页面无法水合。
  allowedDevOrigins: ["127.0.0.1"],
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
