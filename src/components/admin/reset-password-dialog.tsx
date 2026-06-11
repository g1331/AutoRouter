"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { useResetUserPassword } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface ResetPasswordDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 重置密码对话框：管理员为用户设置新密码，用户在下次登录时使用。
 */
export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
  const mutation = useResetUserPassword();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  const schema = z.object({
    password: z.string().min(8, t("passwordMinLength")),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  useEffect(() => {
    form.reset({ password: "" });
  }, [user, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      await mutation.mutateAsync({ id: user.id, password: values.password });
      onOpenChange(false);
      form.reset({ password: "" });
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("resetPasswordTitle")}</DialogTitle>
          <DialogDescription>{t("resetPasswordDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("newPassword")} *</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      placeholder={t("passwordPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
