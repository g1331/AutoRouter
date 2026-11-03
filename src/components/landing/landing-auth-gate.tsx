"use client";

import { useEffect, type ReactNode } from "react";

import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";

/** 已登录主体按角色进入各自工作区；跳转前不渲染落地内容，避免门面页一闪。 */
export function LandingAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, principal } = useAuth();
  const signedIn = Boolean(token && principal);

  useEffect(() => {
    if (token && principal) {
      router.replace(principal.role === "member" ? "/portal" : "/dashboard");
    }
  }, [token, principal, router]);

  return signedIn ? null : children;
}
