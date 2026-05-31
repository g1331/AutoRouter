"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CliproxyAuthAccount } from "@/types/cliproxy";

interface CliproxyAccountDetailDialogProps {
  account: CliproxyAuthAccount;
  open: boolean;
  onClose: () => void;
}

/** 将可空字符串渲染为占位符。 */
function renderText(value: string | null | undefined, placeholder: string): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{placeholder}</span>;
  }
  return value;
}

/** 将 ISO 时间戳渲染为本地格式。 */
function renderTimestamp(value: string | null, placeholder: string): React.ReactNode {
  if (!value) {
    return <span className="text-muted-foreground">{placeholder}</span>;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * 展示 OAuth 账号的完整元数据：邮箱、上游状态、前缀、备注、模型数、原始快照、时间戳等。
 */
export function CliproxyAccountDetailDialog({
  account,
  open,
  onClose,
}: CliproxyAccountDetailDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const placeholder = t("accountDetailEmpty");
  const status = account.status;
  const statusMessage =
    account.raw_metadata && typeof account.raw_metadata.status_message === "string"
      ? (account.raw_metadata.status_message as string)
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("accountDetailDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("accountFileLabel")}: {account.auth_file_name}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 space-y-3 overflow-y-auto py-2">
          <DetailRow label={t("columnProvider")}>
            <Badge variant="info">{account.provider}</Badge>
          </DetailRow>
          <DetailRow label={t("accountDetailLabelEmail")}>
            {renderText(account.email, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelStatus")}>
            {status ? <Badge variant="secondary">{status}</Badge> : renderText(null, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelStatusMessage")}>
            {renderText(statusMessage, placeholder)}
          </DetailRow>
          <DetailRow label={t("columnStatus")}>
            <Badge variant={account.disabled ? "secondary" : "success"}>
              {account.disabled ? t("accountStatusDisabled") : t("accountStatusEnabled")}
            </Badge>
          </DetailRow>
          <DetailRow label={t("accountDetailLabelPrefix")}>
            {account.prefix ? (
              <code className="type-body-small font-mono">{account.prefix}</code>
            ) : (
              renderText(null, placeholder)
            )}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelPriority")}>
            {account.priority === null || account.priority === undefined
              ? renderText(null, placeholder)
              : String(account.priority)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelNote")}>
            {renderText(account.note, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelModelCount")}>{account.model_count}</DetailRow>
          <DetailRow label={t("accountDetailLabelLastSyncedAt")}>
            {renderTimestamp(account.last_synced_at, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelCreatedAt")}>
            {renderTimestamp(account.created_at, placeholder)}
          </DetailRow>
          <DetailRow label={t("accountDetailLabelUpdatedAt")}>
            {renderTimestamp(account.updated_at, placeholder)}
          </DetailRow>

          {account.raw_metadata ? (
            <div className="space-y-1 pt-2">
              <span className="type-label-large text-muted-foreground">
                {t("accountDetailLabelRawMetadata")}
              </span>
              <pre className="overflow-x-auto rounded-cf-sm border border-border bg-surface-200 p-3 type-body-small font-mono">
                {JSON.stringify(account.raw_metadata, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{tCommon("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="grid grid-cols-3 items-center gap-3 rounded-cf-sm border border-border p-2">
      <span className="type-label-large text-muted-foreground">{label}</span>
      <div className="col-span-2 type-body-medium">{children}</div>
    </div>
  );
}
