"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FolderKanban } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateUpstreamGroup, useUpdateUpstreamGroup } from "@/hooks/use-upstream-groups";
import type { UpstreamGroup } from "@/types/api";

interface UpstreamGroupDialogProps {
  group?: UpstreamGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

/**
 * Upstream Group Form Dialog (Create/Edit)
 * Manages upstream groups with load balancing and health check configuration
 */
export function UpstreamGroupDialog({
  group,
  open,
  onOpenChange,
  trigger,
}: UpstreamGroupDialogProps) {
  const isEdit = !!group;
  const createMutation = useCreateUpstreamGroup();
  const updateMutation = useUpdateUpstreamGroup();
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const upstreamGroupFormSchema = z.object({
    name: z.string().min(1, "Group name is required").max(64),
    provider: z.string().min(1, "Provider is required"),
    strategy: z.enum(["round_robin", "weighted", "least_connections"]),
    health_check_interval: z.number().int().min(5).max(300),
    health_check_timeout: z.number().int().min(1).max(60),
    is_active: z.boolean(),
  });

  type UpstreamGroupForm = z.infer<typeof upstreamGroupFormSchema>;

  const form = useForm<UpstreamGroupForm>({
    resolver: zodResolver(upstreamGroupFormSchema),
    defaultValues: {
      name: "",
      provider: "openai",
      strategy: "round_robin",
      health_check_interval: 30,
      health_check_timeout: 10,
      is_active: true,
    },
  });

  useEffect(() => {
    if (group && open) {
      form.reset({
        name: group.name,
        provider: group.provider,
        strategy: group.strategy,
        health_check_interval: group.health_check_interval,
        health_check_timeout: group.health_check_timeout,
        is_active: group.is_active,
      });
    } else if (!open) {
      form.reset({
        name: "",
        provider: "openai",
        strategy: "round_robin",
        health_check_interval: 30,
        health_check_timeout: 10,
        is_active: true,
      });
    }
  }, [group, open, form]);

  const onSubmit = async (data: UpstreamGroupForm) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: group.id,
          data: {
            name: data.name,
            provider: data.provider,
            strategy: data.strategy,
            health_check_interval: data.health_check_interval,
            health_check_timeout: data.health_check_timeout,
            is_active: data.is_active,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          provider: data.provider,
          strategy: data.strategy,
          health_check_interval: data.health_check_interval,
          health_check_timeout: data.health_check_timeout,
          is_active: data.is_active,
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
        <DialogTitle>{isEdit ? "Edit Upstream Group" : "Create Upstream Group"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update upstream group configuration for load balancing"
            : "Create a new upstream group for load balancing across multiple upstreams"}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Group Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., openai-production" {...field} />
                </FormControl>
                <FormDescription>A unique name to identify this upstream group</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("provider")} *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t("providerPlaceholder")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  All upstreams in this group must use this provider
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="strategy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Load Balancing Strategy *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="weighted">Weighted</SelectItem>
                    <SelectItem value="least_connections">Least Connections</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  How requests are distributed across upstreams in this group
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="health_check_interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Health Check Interval (s)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 30)}
                    />
                  </FormControl>
                  <FormDescription>Interval between health checks (5-300s)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="health_check_timeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Health Check Timeout (s)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 10)}
                    />
                  </FormControl>
                  <FormDescription>Timeout for health check requests (1-60s)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Active</FormLabel>
                  <FormDescription>Enable or disable this upstream group</FormDescription>
                </div>
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending
                ? isEdit
                  ? t("updating")
                  : t("creating")
                : isEdit
                  ? tCommon("save")
                  : tCommon("create")}
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
 * Create Upstream Group Button with Dialog
 */
export function CreateUpstreamGroupButton() {
  return (
    <UpstreamGroupDialog
      open={false}
      onOpenChange={() => {}}
      trigger={
        <Button variant="tonal">
          <FolderKanban className="h-4 w-4 mr-2" />
          Add Group
        </Button>
      }
    />
  );
}
