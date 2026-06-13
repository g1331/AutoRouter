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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpdateUser } from "@/hooks/use-users";
import type { User } from "@/types/api";

interface EditUserDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 该用户是当前可见数据中唯一启用的管理员时，锁定角色与启用状态以避免误操作。 */
  isLastActiveAdmin?: boolean;
  /** 启用容器变形动画（View Transition）。 */
  morph?: boolean;
  /** 容器变形使用的 view-transition-name，须与 CSS 具名过渡对应。 */
  morphName?: string;
}

/**
 * 编辑用户对话框：修改显示名称、角色与启用状态。用户名在此只读，改名走专用入口。
 */
export function EditUserDialog({
  user,
  open,
  onOpenChange,
  isLastActiveAdmin = false,
  morph = false,
  morphName = "morph-user-row",
}: EditUserDialogProps) {
  const updateMutation = useUpdateUser();
  const t = useTranslations("users");
  const tCommon = useTranslations("common");

  const schema = z.object({
    display_name: z.string().min(1, t("displayNameRequired")).max(255),
    role: z.enum(["admin", "member"]),
    is_active: z.boolean(),
  });
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: user.display_name,
      role: user.role,
      is_active: user.is_active,
    },
  });

  // 切换编辑对象时把表单同步到该用户的当前值
  useEffect(() => {
    form.reset({
      display_name: user.display_name,
      role: user.role,
      is_active: user.is_active,
    });
  }, [user, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      await updateMutation.mutateAsync({ id: user.id, data: values });
      onOpenChange(false);
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" morph={morph} morphName={morphName}>
        <DialogHeader>
          <DialogTitle>{t("editUserTitle")}</DialogTitle>
          <DialogDescription>{t("editUserDesc")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="type-label-small text-muted-foreground">{t("username")}</label>
              <Input value={user.username} disabled readOnly />
            </div>
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("displayName")} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t("displayNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("role")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isLastActiveAdmin}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="member">{t("roleMember")}</SelectItem>
                      <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {isLastActiveAdmin && (
                    <p className="type-caption text-muted-foreground">{t("lastAdminHint")}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-cf-sm border border-divider px-3 py-2">
                  <div className="space-y-0.5">
                    <FormLabel>{t("status")}</FormLabel>
                    <p className="type-caption text-muted-foreground">
                      {field.value ? t("active") : t("inactive")}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isLastActiveAdmin}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
