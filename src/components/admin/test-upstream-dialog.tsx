"use client";

import { CheckCircle2, Loader2, TestTube2, XCircle } from "lucide-react";
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
import type { Upstream, TestUpstreamResponse } from "@/types/api";

interface TestUpstreamDialogProps {
  upstream: Upstream | null;
  open: boolean;
  onClose: () => void;
  testResult: TestUpstreamResponse | null;
  isLoading: boolean;
}

/**
 * M3 Test Upstream Connection Dialog
 * Displays loading, success, and failure states for upstream connection tests
 */
export function TestUpstreamDialog({
  upstream,
  open,
  onClose,
  testResult,
  isLoading,
}: TestUpstreamDialogProps) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isLoading) {
      onClose();
    }
  };

  if (!upstream) return null;

  // Determine state and colors
  const isSuccess = testResult?.success === true;
  const isFailed = testResult?.success === false;

  const getHeaderIcon = () => {
    if (isLoading) {
      return (
        <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-primary-container))] flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-[rgb(var(--md-sys-color-on-primary-container))] animate-spin" />
        </div>
      );
    }
    if (isSuccess) {
      return (
        <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-tertiary-container))] flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-[rgb(var(--md-sys-color-on-tertiary-container))]" />
        </div>
      );
    }
    if (isFailed) {
      return (
        <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-error-container))] flex items-center justify-center">
          <XCircle className="h-5 w-5 text-[rgb(var(--md-sys-color-on-error-container))]" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-[var(--shape-corner-medium)] bg-[rgb(var(--md-sys-color-surface-container-highest))] flex items-center justify-center">
        <TestTube2 className="h-5 w-5 text-[rgb(var(--md-sys-color-on-surface))]" />
      </div>
    );
  };

  const getTitle = () => {
    if (isLoading) return t("testing");
    if (isSuccess) return t("testSuccess");
    if (isFailed) return t("testFailed");
    return t("testUpstreamTitle");
  };

  const getDescription = () => {
    if (isLoading) return t("testUpstreamDesc");
    return testResult?.message || "";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {getHeaderIcon()}
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* Upstream Info */}
          <div className="bg-[rgb(var(--md-sys-color-surface-container-highest))] rounded-[var(--shape-corner-medium)] p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-surface))]">
                  {tCommon("name")}:
                </span>
                <span className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
                  {upstream.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-surface))]">
                  {t("provider")}:
                </span>
                <span className="type-body-medium text-[rgb(var(--md-sys-color-on-surface))]">
                  {upstream.provider}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="type-label-large text-[rgb(var(--md-sys-color-on-surface))]">
                  {t("baseUrl")}:
                </span>
                <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-surface))] max-w-xs text-right truncate">
                  {upstream.base_url}
                </code>
              </div>
            </div>
          </div>

          {/* Test Results */}
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
            </div>
          )}

          {isSuccess && testResult && (
            <div className="bg-[rgb(var(--md-sys-color-tertiary-container))] rounded-[var(--shape-corner-medium)] p-4">
              <div className="space-y-2">
                {testResult.latency_ms !== null && (
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-tertiary-container))]">
                      {t("testLatency")}:
                    </span>
                    <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-tertiary-container))]">
                      {testResult.latency_ms}ms
                    </code>
                  </div>
                )}
                {testResult.status_code !== null && (
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-tertiary-container))]">
                      {t("testStatusCode")}:
                    </span>
                    <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-tertiary-container))]">
                      {testResult.status_code}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}

          {isFailed && testResult && (
            <div className="bg-[rgb(var(--md-sys-color-error-container))] rounded-[var(--shape-corner-medium)] p-4">
              <div className="space-y-2">
                {testResult.error_type && (
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                      {t("testErrorType")}:
                    </span>
                    <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-error-container))]">
                      {testResult.error_type}
                    </code>
                  </div>
                )}
                {testResult.status_code !== null && (
                  <div className="flex justify-between">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                      {t("testStatusCode")}:
                    </span>
                    <code className="type-body-medium font-mono text-[rgb(var(--md-sys-color-on-error-container))]">
                      {testResult.status_code}
                    </code>
                  </div>
                )}
                {testResult.error_details && (
                  <div className="mt-3">
                    <span className="type-label-large text-[rgb(var(--md-sys-color-on-error-container))]">
                      {t("testErrorDetails")}:
                    </span>
                    <p className="type-body-small font-mono text-[rgb(var(--md-sys-color-on-error-container))] mt-1 break-words">
                      {testResult.error_details}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t("closeDialog")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
