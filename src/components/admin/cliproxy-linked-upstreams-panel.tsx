"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCliproxyLinkedUpstreams } from "@/hooks/use-cliproxy";
import type { CliproxyInstance } from "@/types/cliproxy";

interface CliproxyLinkedUpstreamsPanelProps {
  instance: CliproxyInstance;
}

/**
 * 选中实例后展示的关联上游面板。数据来自 AutoRouter 本地 upstreams 表，
 * 按 `cliproxyAuthFileName` 是否为空区分池上游与单账号上游。
 */
export function CliproxyLinkedUpstreamsPanel({ instance }: CliproxyLinkedUpstreamsPanelProps) {
  const t = useTranslations("cliproxy");
  const { data: upstreams, isLoading, isError } = useCliproxyLinkedUpstreams(instance.id);

  return (
    <Card variant="outlined">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="min-w-0">
          <h2 className="type-title-medium text-foreground">{t("linkedUpstreamsTitle")}</h2>
          <p className="type-body-small text-muted-foreground">{instance.name}</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="py-8 text-center type-body-medium text-destructive">
            {t("linkedUpstreamsLoadFailed")}
          </p>
        ) : !upstreams || upstreams.length === 0 ? (
          <p className="py-8 text-center type-body-medium text-muted-foreground">
            {t("linkedUpstreamsEmpty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnUpstreamName")}</TableHead>
                <TableHead>{t("columnProvider")}</TableHead>
                <TableHead>{t("columnUpstreamKind")}</TableHead>
                <TableHead>{t("columnLinkedAccount")}</TableHead>
                <TableHead>{t("columnStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upstreams.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="info">{row.provider}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.kind === "pool" ? "secondary" : "info"}>
                      {row.kind === "pool" ? t("kindPool") : t("kindSingle")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.auth_file_name ? (
                      <code className="type-body-small font-mono">{row.auth_file_name}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "success" : "secondary"}>
                      {row.is_active ? t("statusEnabled") : t("statusDisabled")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
