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
import { Key, Server, ArrowRight, Activity } from "lucide-react";

/**
 * Dashboard Page - Material You Style
 * 避免 AI 味儿的设计：
 * 1. 不对称布局
 * 2. 不同大小的元素
 * 3. 有机的层次感
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
      <Topbar title="Dashboard" />
      <div className="p-6 lg:p-8 max-w-6xl">
        {/* Welcome Section - 简洁的欢迎语 */}
        <div className="mb-8">
          <p className="type-body-large text-[rgb(var(--md-sys-color-on-surface-variant))]">
            管理你的 API 密钥和上游服务
          </p>
        </div>

        {/* Stats Overview - 不对称网格 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* 主要统计卡片 - 占据更大空间 */}
          <Card className="md:col-span-2 bg-[rgb(var(--md-sys-color-primary-container))] border-0">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="type-label-large text-[rgb(var(--md-sys-color-on-primary-container)_/_0.7)] mb-1">
                    API 密钥
                  </p>
                  {keysLoading ? (
                    <Skeleton className="h-12 w-20 bg-[rgb(var(--md-sys-color-on-primary-container)_/_0.1)]" />
                  ) : (
                    <p className="type-display-medium text-[rgb(var(--md-sys-color-on-primary-container))]">
                      {keyCount}
                    </p>
                  )}
                  <p className="type-body-medium text-[rgb(var(--md-sys-color-on-primary-container)_/_0.6)] mt-2">
                    {keyCount === 0 ? "还没有创建密钥" : "个活跃密钥"}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[rgb(var(--md-sys-color-on-primary-container)_/_0.12)] flex items-center justify-center">
                  <Key className="w-6 h-6 text-[rgb(var(--md-sys-color-on-primary-container))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 次要统计卡片 */}
          <Card className="bg-[rgb(var(--md-sys-color-surface-container-high))] border-0">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="type-label-large text-[rgb(var(--md-sys-color-on-surface-variant))] mb-1">
                    上游服务
                  </p>
                  {upstreamsLoading ? (
                    <Skeleton className="h-10 w-12" />
                  ) : (
                    <p className="type-display-small text-[rgb(var(--md-sys-color-on-surface))]">
                      {upstreamCount}
                    </p>
                  )}
                  <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))] mt-1">
                    已配置
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[rgb(var(--md-sys-color-tertiary-container))] flex items-center justify-center">
                  <Server className="w-5 h-5 text-[rgb(var(--md-sys-color-on-tertiary-container))]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - 卡片式导航 */}
        <div className="space-y-3">
          <h2 className="type-title-medium text-[rgb(var(--md-sys-color-on-surface-variant))] px-1">
            快捷操作
          </h2>

          <div className="space-y-2">
            <Link href="/keys" className="block group">
              <Card className="border border-[rgb(var(--md-sys-color-outline-variant))] hover:border-[rgb(var(--md-sys-color-outline))] hover:bg-[rgb(var(--md-sys-color-surface-container-low))] transition-all duration-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(var(--md-sys-color-primary)_/_0.12)] flex items-center justify-center">
                      <Key className="w-5 h-5 text-[rgb(var(--md-sys-color-primary))]" />
                    </div>
                    <div>
                      <p className="type-title-small text-[rgb(var(--md-sys-color-on-surface))]">
                        管理 API 密钥
                      </p>
                      <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                        创建、编辑或删除客户端访问密钥
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[rgb(var(--md-sys-color-on-surface-variant))] group-hover:text-[rgb(var(--md-sys-color-primary))] group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/upstreams" className="block group">
              <Card className="border border-[rgb(var(--md-sys-color-outline-variant))] hover:border-[rgb(var(--md-sys-color-outline))] hover:bg-[rgb(var(--md-sys-color-surface-container-low))] transition-all duration-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(var(--md-sys-color-tertiary)_/_0.12)] flex items-center justify-center">
                      <Server className="w-5 h-5 text-[rgb(var(--md-sys-color-tertiary))]" />
                    </div>
                    <div>
                      <p className="type-title-small text-[rgb(var(--md-sys-color-on-surface))]">
                        配置上游服务
                      </p>
                      <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
                        添加或修改 AI 服务提供商
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[rgb(var(--md-sys-color-on-surface-variant))] group-hover:text-[rgb(var(--md-sys-color-tertiary))] group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* System Status Hint */}
        <div className="mt-8 p-4 rounded-2xl bg-[rgb(var(--md-sys-color-surface-container))]">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[rgb(var(--md-sys-color-success))]" />
            <p className="type-body-small text-[rgb(var(--md-sys-color-on-surface-variant))]">
              系统运行正常
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
