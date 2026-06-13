"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useChangeOwnPassword } from "@/hooks/use-portal-account";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Self-service password change form. The current password is verified
 * server-side; the new password follows the same strength rule as the admin
 * reset (minimum length).
 */
export function PortalChangePasswordForm() {
  const t = useTranslations("portal");
  const changePasswordMutation = useChangeOwnPassword();

  const changePasswordSchema = z
    .object({
      current_password: z.string().min(1, t("password.currentRequired")),
      new_password: z.string().min(MIN_PASSWORD_LENGTH, t("password.newTooShort")),
      confirm_password: z.string().min(1, t("password.confirmRequired")),
    })
    .superRefine((data, ctx) => {
      if (data.new_password !== data.confirm_password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirm_password"],
          message: t("password.confirmMismatch"),
        });
      }
    });

  type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const onSubmit = async (data: ChangePasswordForm) => {
    try {
      await changePasswordMutation.mutateAsync({
        current_password: data.current_password,
        new_password: data.new_password,
      });
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  return (
    <Card variant="outlined" className="max-w-xl border-divider bg-surface-200/70">
      <CardHeader>
        <CardTitle className="type-title-small">{t("password.cardTitle")}</CardTitle>
        <CardDescription>{t("password.cardDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="space-y-4">
            <FormField
              control={form.control}
              name="current_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("password.currentLabel")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("password.newLabel")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("password.confirmLabel")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? t("password.changing") : t("password.submit")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
