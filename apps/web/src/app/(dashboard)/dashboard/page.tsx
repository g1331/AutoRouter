"use client";

import Link from "next/link";
import { Topbar } from "@/components/admin/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/providers/auth-provider";
import { useQuery } from "@tanstack/react-query";
import {
  PaginatedAPIKeysResponse,
  PaginatedUpstreamsResponse,
} from "@/types/api";
import { Key, Server, ArrowRight, Activity, Cpu, Zap } from "lucide-react";

/**
 * Cassette Futurism Dashboard
 *
 * System monitoring panel style with:
 * - Pixel font statistics (VT323)
 * - Glowing numbers
 * - Terminal-style status indicators
 */
export default function DashboardPage() {
  const { apiClient } = useAuth();

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ["stats", "keys"],
    queryFn: () =>
      apiClient.get<PaginatedAPIKeysResponse>(
        "/admin/keys?page=1&page_size=1"
      ),
  });

  const { data: upstreamsData, isLoading: upstreamsLoading } = useQuery({
    queryKey: ["stats", "upstreams"],
    queryFn: () =>
      apiClient.get<PaginatedUpstreamsResponse>(
        "/admin/upstreams?page=1&page_size=1"
      ),
  });

  const keyCount = keysData?.total || 0;
  const upstreamCount = upstreamsData?.total || 0;

  return (
    <>
      <Topbar title="System Monitor" />
      <div className="p-6 lg:p-8 max-w-6xl">
        {/* System Status Header */}
        <div className="mb-8 border-b border-dashed border-divider pb-4">
          <div className="flex items-center gap-2 font-mono text-xs text-amber-700 mb-2">
            <Cpu className="w-4 h-4" />
            <span>AUTOROUTER CONTROL PANEL</span>
          </div>
          <p className="font-sans text-sm text-amber-500">
            Manage API keys and upstream services
          </p>
        </div>

        {/* Stats Grid - Terminal Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* API Keys Stat */}
          <Card className="cf-panel">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-amber-700 mb-2">
                    API KEYS
                  </p>
                  {keysLoading ? (
                    <Skeleton className="h-16 w-24" />
                  ) : (
                    <p className="font-display text-5xl text-amber-500 cf-glow-text">
                      {String(keyCount).padStart(3, "0")}
                    </p>
                  )}
                  <p className="font-mono text-xs text-amber-700 mt-2">
                    {keyCount === 0 ? "NO KEYS FOUND" : "ACTIVE"}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <Key className="w-6 h-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upstreams Stat */}
          <Card className="cf-panel">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-amber-700 mb-2">
                    UPSTREAMS
                  </p>
                  {upstreamsLoading ? (
                    <Skeleton className="h-16 w-24" />
                  ) : (
                    <p className="font-display text-5xl text-amber-500 cf-glow-text">
                      {String(upstreamCount).padStart(3, "0")}
                    </p>
                  )}
                  <p className="font-mono text-xs text-amber-700 mt-2">
                    CONFIGURED
                  </p>
                </div>
                <div className="w-12 h-12 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <Server className="w-6 h-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card className="cf-panel">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-amber-700 mb-2">
                    SYS STATUS
                  </p>
                  <p className="font-display text-5xl text-status-success cf-glow-text">
                    OK
                  </p>
                  <p className="font-mono text-xs text-status-success mt-2">
                    ALL SYSTEMS NOMINAL
                  </p>
                </div>
                <div className="w-12 h-12 rounded-cf-sm bg-status-success/10 border border-status-success/30 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-status-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 font-mono text-xs text-amber-700">
            <Zap className="w-4 h-4" />
            <span>QUICK ACTIONS</span>
          </div>

          <div className="space-y-2">
            <Link href="/keys" className="block group">
              <Card variant="outlined" className="hover:shadow-cf-glow-subtle transition-all duration-cf-normal">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <Key className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-mono text-sm text-amber-500">
                        MANAGE API KEYS
                      </p>
                      <p className="font-sans text-xs text-amber-700">
                        Create, edit or revoke client access keys
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-700 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/upstreams" className="block group">
              <Card variant="outlined" className="hover:shadow-cf-glow-subtle transition-all duration-cf-normal">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <Server className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-mono text-sm text-amber-500">
                        CONFIGURE UPSTREAMS
                      </p>
                      <p className="font-sans text-xs text-amber-700">
                        Add or modify AI service providers
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-700 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* System Log Footer */}
        <div className="mt-8 p-4 rounded-cf-sm bg-surface-200 border border-divider font-mono text-xs">
          <div className="flex items-center gap-3 text-amber-700">
            <span className="text-status-success">[OK]</span>
            <span>System initialized successfully</span>
          </div>
          <div className="flex items-center gap-3 text-amber-700 mt-1">
            <span className="text-status-success">[OK]</span>
            <span>All services online</span>
          </div>
        </div>
      </div>
    </>
  );
}
