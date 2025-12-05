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
 * Cassette Futurism Upstreams Data Table
 *
 * Terminal-style data display with:
 * - Mono font for URL data
 * - Provider-specific badge colors
 * - Amber accents and glow effects
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
      anthropic: { label: "Anthropic", variant: "secondary" },
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
        <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-amber-700" aria-hidden="true" />
        </div>
        <h3 className="font-mono text-lg text-amber-500 mb-2">
          NO UPSTREAMS CONFIGURED
        </h3>
        <p className="font-sans text-sm text-amber-700">
          点击上方按钮添加第一个 Upstream
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-cf-sm border border-divider overflow-hidden">
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
                <code className="px-2 py-1 bg-surface-300 text-amber-500 rounded-cf-sm font-mono text-xs border border-divider max-w-xs truncate inline-block">
                  {upstream.base_url}
                </code>
              </TableCell>
              <TableCell className="max-w-xs truncate">
                {upstream.description || (
                  <span className="text-amber-700">-</span>
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
                    className="h-8 w-8 text-amber-500 hover:bg-amber-500/10"
                    onClick={() => onEdit(upstream)}
                    aria-label={`编辑 Upstream: ${upstream.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                    onClick={() => onDelete(upstream)}
                    aria-label={`删除 Upstream: ${upstream.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
