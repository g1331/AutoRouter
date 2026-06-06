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
import { Input } from "@/components/ui/input";
import { useChangeUsername } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface ChangeUsernameDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 修改用户名对话框：为用户设置新的登录用户名，唯一性冲突由服务端返回 409 提示。
 */
export function ChangeUsernameDialog({ user, open, onOpenChange }: ChangeUsernameDialogProps) {
  const mutation = useChangeUsername();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  const schema = z.object({
    username: z.string().min(1, t("usernameRequired")).max(255),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: user.username },
  });

  useEffect(() => {
    form.reset({ username: user.username });
  }, [user, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      await mutation.mutateAsync({ id: user.id, username: values.username });
      onOpenChange(false);
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changeUsernameTitle")}</DialogTitle>
          <DialogDescription>{t("changeUsernameDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("username")} *</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder={t("usernamePlaceholder")} {...field} />
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
