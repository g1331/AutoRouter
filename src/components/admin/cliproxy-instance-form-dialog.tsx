"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateCliproxyInstance,
  useTestCliproxyConnection,
  useUpdateCliproxyInstance,
} from "@/hooks/use-cliproxy";
import { CLIPROXY_INSTANCE_MODES } from "@/types/cliproxy";
import type {
  CliproxyConnectionTestResult,
  CliproxyInstance,
  CliproxyInstanceCreate,
  CliproxyInstanceMode,
  CliproxyInstanceUpdate,
} from "@/types/cliproxy";
import { CliproxyConnectionResult } from "./cliproxy-connection-result";

interface CliproxyInstanceFormDialogProps {
  /** 传入实例则为编辑模式，否则为创建模式。 */
  instance?: CliproxyInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormValues {
  name: string;
  mode: CliproxyInstanceMode;
  base_url: string;
  management_url: string;
  client_api_key: string;
  management_key: string;
  enabled: boolean;
  description: string;
}

function buildDefaults(instance?: CliproxyInstance | null): FormValues {
  return {
    name: instance?.name ?? "",
    mode: (instance?.mode as CliproxyInstanceMode) ?? "managed",
    base_url: instance?.base_url ?? "",
    management_url: instance?.management_url ?? "",
    client_api_key: "",
    management_key: "",
    enabled: instance?.enabled ?? true,
    description: instance?.description ?? "",
  };
}

/**
 * CLIProxyAPI 实例创建与编辑弹窗。
 *
 * 编辑模式下凭据字段留空表示沿用现有密钥，仅在填写时提交。
 */
export function CliproxyInstanceFormDialog({
  instance,
  open,
  onOpenChange,
}: CliproxyInstanceFormDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(instance);

  const createMutation = useCreateCliproxyInstance();
  const updateMutation = useUpdateCliproxyInstance();
  const testMutation = useTestCliproxyConnection();

  const [testResult, setTestResult] = useState<CliproxyConnectionTestResult | null>(null);

  const schema = z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(64),
    mode: z.enum(CLIPROXY_INSTANCE_MODES as unknown as [string, ...string[]]),
    base_url: z.string().trim().min(1, t("baseUrlRequired")),
    management_url: z.string().trim().min(1, t("managementUrlRequired")),
    client_api_key: isEdit ? z.string() : z.string().trim().min(1, t("clientApiKeyRequired")),
    management_key: isEdit ? z.string() : z.string().trim().min(1, t("managementKeyRequired")),
    enabled: z.boolean(),
    description: z.string().trim().max(512),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: buildDefaults(instance),
  });

  const managementUrl = useWatch({ control: form.control, name: "management_url" }) ?? "";
  const managementKey = useWatch({ control: form.control, name: "management_key" }) ?? "";
  const pending = createMutation.isPending || updateMutation.isPending;

  const handlePreTest = async () => {
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync({
        management_url: managementUrl.trim(),
        management_key: managementKey,
      });
      setTestResult(result);
    } catch {
      // 网络层错误由 mutation 抛出，此处不展示结果
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const description = values.description.trim() ? values.description.trim() : null;
    try {
      if (isEdit && instance) {
        const payload: CliproxyInstanceUpdate = {
          name: values.name.trim(),
          mode: values.mode,
          base_url: values.base_url.trim(),
          management_url: values.management_url.trim(),
          enabled: values.enabled,
          description,
        };
        if (values.client_api_key) {
          payload.client_api_key = values.client_api_key;
        }
        if (values.management_key) {
          payload.management_key = values.management_key;
        }
        await updateMutation.mutateAsync({ id: instance.id, data: payload });
      } else {
        const payload: CliproxyInstanceCreate = {
          name: values.name.trim(),
          mode: values.mode,
          base_url: values.base_url.trim(),
          management_url: values.management_url.trim(),
          client_api_key: values.client_api_key,
          management_key: values.management_key,
          enabled: values.enabled,
          description,
        };
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pb-0 pr-12 pt-6">
          <DialogTitle>{isEdit ? t("editInstanceTitle") : t("createInstanceTitle")}</DialogTitle>
          <DialogDescription>{t("pageDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fieldName")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("fieldNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fieldMode")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="managed">{t("modeManaged")}</SelectItem>
                        <SelectItem value="external">{t("modeExternal")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("fieldModeHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="base_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fieldBaseUrl")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("fieldBaseUrlPlaceholder")} {...field} />
                    </FormControl>
                    <FormDescription>{t("fieldBaseUrlHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="management_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fieldManagementUrl")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("fieldManagementUrlPlaceholder")} {...field} />
                    </FormControl>
                    <FormDescription>{t("fieldManagementUrlHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("fieldClientApiKey")} {isEdit ? "" : "*"}
                    </FormLabel>
                    <FormControl>
                      <PasswordInput {...field} />
                    </FormControl>
                    <FormDescription>
                      {isEdit ? t("fieldClientApiKeyEditHint") : t("fieldClientApiKeyHint")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="management_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("fieldManagementKey")} {isEdit ? "" : "*"}
                    </FormLabel>
                    <FormControl>
                      <PasswordInput {...field} />
                    </FormControl>
                    <FormDescription>
                      {isEdit ? t("fieldManagementKeyEditHint") : t("fieldManagementKeyHint")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fieldDescription")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder={t("fieldDescriptionPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-cf-sm border border-border p-3">
                    <FormLabel className="mb-0">{t("fieldEnabled")}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-2 rounded-cf-sm border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="type-body-small text-muted-foreground">{t("testBeforeSave")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={testMutation.isPending || !managementUrl.trim() || !managementKey}
                    onClick={handlePreTest}
                  >
                    {testMutation.isPending ? t("testing") : t("testConnection")}
                  </Button>
                </div>
                {testResult && <CliproxyConnectionResult result={testResult} />}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-divider px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? isEdit
                    ? t("saving")
                    : t("creating")
                  : isEdit
                    ? tCommon("save")
                    : tCommon("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
