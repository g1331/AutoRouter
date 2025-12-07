import { redirect } from "next/navigation";

/**
 * Locale root page - redirect to login
 */
export default function LocaleHomePage() {
  redirect("/login");
}
