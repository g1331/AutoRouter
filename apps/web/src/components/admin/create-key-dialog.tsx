"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateAPIKey } from "@/hooks/use-api-keys";
import { useUpstreams } from "@/hooks/use-upstreams";
import type { APIKeyCreateResponse } from "@/types/api";
import { ShowKeyDialog } from "./show-key-dialog";

const createKeySchema = z.object({
  name: z.string().min(1, "请输入名称").max(100, "名称不能超过 100 个字符"),
  description: z.string().max(500, "描述不能超过 500 个字符").optional(),
  upstream_ids: z.array(z.string()).min(1, "至少选择一个 Upstream"),
  expires_at: z.date().optional(),
});

type CreateKeyForm = z.infer<typeof createKeySchema>;

/**
 * M3 Create API Key Dialog
 */
export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(
    null
  );
  const createMutation = useCreateAPIKey();

  const { data: upstreamsData, isLoading: upstreamsLoading } = useUpstreams(
    1,
    100
  );

  const form = useForm<CreateKeyForm>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: "",
      description: "",
      upstream_ids: [],
      expires_at: undefined,
    },
  });

  const onSubmit = async (data: CreateKeyForm) => {
    try {
      const result = await createMutation.mutateAsync({
        name: data.name,
        description: data.description || null,
        upstream_ids: data.upstream_ids,
        expires_at: data.expires_at ? data.expires_at.toISOString() : null,
      });

      setCreatedKey(result);
      setOpen(false);
      form.reset();
    } catch {
      // Error already handled by mutation onError
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            创建 API Key
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>创建新的 API Key</DialogTitle>
            <DialogDescription>
              创建一个新的 API Key 用于客户端访问，选择可用的 Upstreams
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
                      <Input placeholder="例如：Production API Key" {...field} />
                    </FormControl>
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
                        placeholder="简要描述此 Key 的用途..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="upstream_ids"
                render={() => (
                  <FormItem>
                    <FormLabel>选择 Upstreams *</FormLabel>
                    <FormDescription>此 Key 可以访问哪些上游服务</FormDescription>
                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto bg-[rgb(var(--md-sys-color-surface-container-low))] rounded-[var(--shape-corner-medium)] p-3 border border-[rgb(var(--md-sys-color-outline-variant))]">
                      {upstreamsLoading ? (
                        <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))] text-center py-4">
                          加载中...
                        </div>
                      ) : upstreamsData?.items.length === 0 ? (
                        <div className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))] text-center py-4">
                          暂无 Upstream，请先创建
                        </div>
                      ) : (
                        upstreamsData?.items.map((upstream) => (
                          <FormField
                            key={upstream.id}
                            control={form.control}
                            name="upstream_ids"
                            render={({ field }) => (
                              <FormItem className="flex items-start space-x-3 space-y-0 p-2 rounded-[var(--shape-corner-small)] hover:bg-[rgb(var(--md-sys-color-on-surface)_/_0.08)] transition-colors">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(upstream.id)}
                                    onCheckedChange={(checked) => {
                                      const updated = checked
                                        ? [...(field.value || []), upstream.id]
                                        : field.value?.filter(
                                            (id) => id !== upstream.id
                                          );
                                      field.onChange(updated);
                                    }}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none flex-1">
                                  <label className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))] cursor-pointer">
                                    {upstream.name}
                                  </label>
                                  {upstream.description && (
                                    <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                                      {upstream.description}
                                    </p>
                                  )}
                                </div>
                              </FormItem>
                            )}
                          />
                        ))
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expires_at"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>过期时间（可选）</FormLabel>
                    <FormDescription>不设置则永不过期</FormDescription>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal justify-start",
                              !field.value &&
                                "text-[rgb(var(--md-sys-color-on-surface-variant))]"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: zhCN })
                            ) : (
                              <span>选择日期</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "创建中..." : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {createdKey && (
        <ShowKeyDialog
          apiKey={createdKey}
          open={!!createdKey}
          onClose={() => setCreatedKey(null)}
        />
      )}
    </>
  );
}
