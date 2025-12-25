import { redirect } from "next/navigation";

/**
 * Root page - server-side redirect to login
 */
export default function HomePage() {
  redirect("/login");
}
