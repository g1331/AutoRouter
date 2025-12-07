import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  // - … if they start with `/_next`, `/api`, or contain a dot (static files)
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
