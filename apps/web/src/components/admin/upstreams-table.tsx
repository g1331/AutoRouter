"use client";

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Pencil, Trash2, Server } from "lucide-react";
import type { Upstream } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";

interface UpstreamsTableProps {
  upstreams: Upstream[];
  onEdit: (upstream: Upstream) => void;
  onDelete: (upstream: Upstream) => void;
}

/**
 * M3 Upstreams Data Table
 */
export function UpstreamsTable({
  upstreams,
  onEdit,
  onDelete,
}: UpstreamsTableProps) {
  const formatProvider = (provider: string) => {
    const providerMap: Record<
      string,
      { label: string; variant: BadgeProps["variant"] }
    > = {
      openai: { label: "OpenAI", variant: "success" },
      anthropic: { label: "Anthropic", variant: "tertiary" },
      azure: { label: "Azure", variant: "info" },
      gemini: { label: "Gemini", variant: "warning" },
    };

    const config = providerMap[provider.toLowerCase()] || {
      label: provider,
      variant: "neutral" as const,
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (upstreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-[var(--shape-corner-large)] bg-[rgb(var(--md-sys-color-surface-container-highest))] flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-[rgb(var(--md-sys-color-on-surface-variant))]" />
        </div>
        <h3 className="type-title-medium text-[rgb(var(--md-sys-color-on-surface))] mb-2">
          暂无 Upstream
        </h3>
        <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
          点击上方按钮添加第一个 Upstream
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--shape-corner-large)] border border-[rgb(var(--md-sys-color-outline-variant))] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Base URL</TableHead>
            <TableHead>描述</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {upstreams.map((upstream) => (
            <TableRow key={upstream.id}>
              <TableCell className="font-medium">{upstream.name}</TableCell>
              <TableCell>{formatProvider(upstream.provider)}</TableCell>
              <TableCell>
                <code className="px-2 py-1 bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface))] rounded-[var(--shape-corner-extra-small)] type-label-medium font-mono max-w-xs truncate inline-block">
                  {upstream.base_url}
                </code>
              </TableCell>
              <TableCell className="max-w-xs truncate">
                {upstream.description || (
                  <span className="text-[rgb(var(--md-sys-color-on-surface-variant))]">
                    -
                  </span>
                )}
              </TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(upstream.created_at), {
                  addSuffix: true,
                  locale: zhCN,
                })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[rgb(var(--md-sys-color-primary))] hover:bg-[rgb(var(--md-sys-color-primary-container))]"
                    onClick={() => onEdit(upstream)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[rgb(var(--md-sys-color-error))] hover:bg-[rgb(var(--md-sys-color-error-container))]"
                    onClick={() => onDelete(upstream)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
