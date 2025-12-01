"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateUpstream, useUpdateUpstream } from "@/hooks/use-upstreams";
import type { Upstream } from "@/types/api";

const upstreamFormSchema = z.object({
  name: z.string().min(1, "请输入名称").max(100, "名称不能超过 100 个字符"),
  provider: z.string().min(1, "请选择 Provider"),
  base_url: z.string().url("请输入有效的 URL"),
  api_key: z.string().min(1, "请输入 API Key"),
  description: z.string().max(500, "描述不能超过 500 个字符").optional(),
});

type UpstreamForm = z.infer<typeof upstreamFormSchema>;

interface UpstreamFormDialogProps {
  upstream?: Upstream | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

/**
 * M3 Upstream Form Dialog (Create/Edit)
 */
export function UpstreamFormDialog({
  upstream,
  open,
  onOpenChange,
  trigger,
}: UpstreamFormDialogProps) {
  const isEdit = !!upstream;
  const createMutation = useCreateUpstream();
  const updateMutation = useUpdateUpstream();

  const form = useForm<UpstreamForm>({
    resolver: zodResolver(upstreamFormSchema),
    defaultValues: {
      name: "",
      provider: "openai",
      base_url: "",
      api_key: "",
      description: "",
    },
  });

  useEffect(() => {
    if (upstream && open) {
      form.reset({
        name: upstream.name,
        provider: upstream.provider,
        base_url: upstream.base_url,
        api_key: "",
        description: upstream.description || "",
      });
    } else if (!open) {
      form.reset({
        name: "",
        provider: "openai",
        base_url: "",
        api_key: "",
        description: "",
      });
    }
  }, [upstream, open, form]);

  const onSubmit = async (data: UpstreamForm) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: upstream.id,
          data: {
            name: data.name,
            provider: data.provider,
            base_url: data.base_url,
            api_key: data.api_key,
            description: data.description || null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          provider: data.provider,
          base_url: data.base_url,
          api_key: data.api_key,
          description: data.description || null,
        });
      }

      onOpenChange(false);
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  const dialogContent = (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "编辑 Upstream" : "添加新的 Upstream"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "修改上游 AI 服务的配置信息"
            : "配置一个新的上游 AI 服务提供商"}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称 *</FormLabel>
                <FormControl>
                  <Input placeholder="例如：OpenAI GPT-4" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择 Provider" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="azure">Azure OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>选择上游服务提供商类型</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="base_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL *</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://api.openai.com/v1"
                    {...field}
                  />
                </FormControl>
                <FormDescription>上游服务的 API 基础地址</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="api_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key *</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={
                      isEdit
                        ? "输入新的 API Key（留空则保持不变）"
                        : "输入上游服务的 API Key"
                    }
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {isEdit
                    ? "留空则保持原有 API Key 不变"
                    : "用于访问上游服务的认证密钥"}
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
                <FormLabel>描述</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="简要描述此 Upstream 的用途..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? isEdit
                  ? "保存中..."
                  : "创建中..."
                : isEdit
                  ? "保存"
                  : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogContent}
    </Dialog>
  );
}

/**
 * M3 Create Upstream Button with Dialog
 */
export function CreateUpstreamButton() {
  return (
    <UpstreamFormDialog
      open={false}
      onOpenChange={() => {}}
      trigger={
        <Button variant="tonal">
          <Plus className="h-4 w-4 mr-2" />
          添加 Upstream
        </Button>
      }
    />
  );
}
