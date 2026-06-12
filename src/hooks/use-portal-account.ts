import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import type { PasswordChangeRequest } from "@/types/api";
import { toast } from "sonner";

/**
 * Change the caller's own password (verifies the current password server-side).
 */
export function useChangeOwnPassword() {
  const { apiClient } = useAuth();
  const t = useTranslations("portal");

  return useMutation({
    mutationFn: (data: PasswordChangeRequest) => apiClient.put<void>("/user/password", data),
    onSuccess: () => {
      toast.success(t("password.changeSuccess"));
    },
    onError: (error: Error) => {
      toast.error(`${t("password.changeFailed")}: ${error.message}`);
    },
  });
}
