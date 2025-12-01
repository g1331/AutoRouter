"use client";

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Trash2, Copy, Check, Key } from "lucide-react";
import { useState } from "react";
import type { APIKey } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface KeysTableProps {
  keys: APIKey[];
  onRevoke: (key: APIKey) => void;
}

/**
 * M3 API Keys Data Table
 */
export function KeysTable({ keys, onRevoke }: KeysTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyKeyPrefix = async (keyPrefix: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(keyPrefix);
      setCopiedId(keyId);
      toast.success("Key 前缀已复制");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) {
      return <Badge variant="success">永不过期</Badge>;
    }

    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const isExpired = expiryDate < now;

    if (isExpired) {
      return <Badge variant="error">已过期</Badge>;
    }

    return (
      <Badge variant="warning">
        {formatDistanceToNow(expiryDate, { addSuffix: true, locale: zhCN })}
      </Badge>
    );
  };

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-[var(--shape-corner-large)] bg-[rgb(var(--md-sys-color-surface-container-highest))] flex items-center justify-center mb-4">
          <Key className="w-8 h-8 text-[rgb(var(--md-sys-color-on-surface-variant))]" />
        </div>
        <h3 className="type-title-medium text-[rgb(var(--md-sys-color-on-surface))] mb-2">
          暂无 API Key
        </h3>
        <p className="type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]">
          点击上方按钮创建第一个 API Key
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
            <TableHead>Key 前缀</TableHead>
            <TableHead>描述</TableHead>
            <TableHead>Upstreams</TableHead>
            <TableHead>过期时间</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium">{key.name}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface))] rounded-[var(--shape-corner-extra-small)] type-label-medium font-mono">
                    {key.key_prefix}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyKeyPrefix(key.key_prefix, key.id)}
                  >
                    {copiedId === key.id ? (
                      <Check className="h-3.5 w-3.5 text-[rgb(var(--md-sys-color-success))]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </TableCell>
              <TableCell className="max-w-xs truncate">
                {key.description || (
                  <span className="text-[rgb(var(--md-sys-color-on-surface-variant))]">
                    -
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="info">{key.upstream_ids.length} 个</Badge>
              </TableCell>
              <TableCell>{formatExpiry(key.expires_at)}</TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(key.created_at), {
                  addSuffix: true,
                  locale: zhCN,
                })}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[rgb(var(--md-sys-color-error))] hover:bg-[rgb(var(--md-sys-color-error-container))]"
                  onClick={() => onRevoke(key)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
