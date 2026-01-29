"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Shield, ShieldAlert, ShieldCheck, Power, PowerOff, Loader2 } from "lucide-react";
import type { Upstream, CircuitBreakerState } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useCircuitBreakerStatus, useForceCircuitBreaker } from "@/hooks/use-circuit-breaker";

interface CircuitBreakerDialogProps {
  upstream: Upstream;
  trigger?: React.ReactNode;
}

export function CircuitBreakerDialog({ upstream, trigger }: CircuitBreakerDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("circuitBreaker");
  const tCommon = useTranslations("common");

  const { data: status, isLoading, refetch } = useCircuitBreakerStatus(upstream.id, open);
  const forceOpenMutation = useForceCircuitBreaker();
  const forceCloseMutation = useForceCircuitBreaker();

  const handleForceOpen = async () => {
    await forceOpenMutation.mutateAsync({ upstreamId: upstream.id, action: "open" });
    refetch();
  };

  const handleForceClose = async () => {
    await forceCloseMutation.mutateAsync({ upstreamId: upstream.id, action: "close" });
    refetch();
  };

  const getStateBadge = (state: CircuitBreakerState) => {
    switch (state) {
      case "closed":
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            {t("stateClosed")}
          </Badge>
        );
      case "open":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            {t("stateOpen")}
          </Badge>
        );
      case "half_open":
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {t("stateHalfOpen")}
          </Badge>
        );
    }
  };

  const getCurrentStateBadge = () => {
    const cb = upstream.circuit_breaker;
    if (!cb) {
      return (
        <Badge variant="secondary">
          <Shield className="h-3 w-3 mr-1" />
          {t("stateUnknown")}
        </Badge>
      );
    }
    return getStateBadge(cb.state);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-8 px-2">
            {getCurrentStateBadge()}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description", { upstreamName: upstream.name })}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : status ? (
          <div className="space-y-6">
            {/* State Display */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="text-sm font-medium">{t("currentState")}</span>
              {getStateBadge(status.state)}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-xs text-muted-foreground block">{t("failureCount")}</span>
                <span className="text-lg font-mono font-semibold">{status.failure_count}</span>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-xs text-muted-foreground block">{t("successCount")}</span>
                <span className="text-lg font-mono font-semibold">{status.success_count}</span>
              </div>
            </div>

            {/* Timestamps */}
            {status.last_failure_at && (
              <div className="text-sm">
                <span className="text-muted-foreground">{t("lastFailure")}: </span>
                <span className="font-mono">
                  {new Date(status.last_failure_at).toLocaleString()}
                </span>
              </div>
            )}
            {status.opened_at && (
              <div className="text-sm">
                <span className="text-muted-foreground">{t("openedAt")}: </span>
                <span className="font-mono">{new Date(status.opened_at).toLocaleString()}</span>
              </div>
            )}

            {/* Configuration */}
            {status.config && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">{t("configuration")}</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {status.config.failure_threshold !== undefined && (
                    <div className="text-muted-foreground">
                      {t("failureThreshold")}: {status.config.failure_threshold}
                    </div>
                  )}
                  {status.config.success_threshold !== undefined && (
                    <div className="text-muted-foreground">
                      {t("successThreshold")}: {status.config.success_threshold}
                    </div>
                  )}
                  {status.config.open_duration !== undefined && (
                    <div className="text-muted-foreground">
                      {t("openDuration")}: {status.config.open_duration}ms
                    </div>
                  )}
                  {status.config.probe_interval !== undefined && (
                    <div className="text-muted-foreground">
                      {t("probeInterval")}: {status.config.probe_interval}ms
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="border-t pt-4 flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleForceOpen}
                disabled={forceOpenMutation.isPending || status.state === "open"}
                className="flex-1"
              >
                {forceOpenMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <PowerOff className="h-4 w-4 mr-1" />
                )}
                {t("forceOpen")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleForceClose}
                disabled={forceCloseMutation.isPending || status.state === "closed"}
                className="flex-1"
              >
                {forceCloseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Power className="h-4 w-4 mr-1" />
                )}
                {t("forceClose")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">{t("noData")}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
