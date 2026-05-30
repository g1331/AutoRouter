import { defineConfig } from "vitepress";

const deploymentSidebar = [
  { text: "部署形态总览", link: "/guide/deployment/overview" },
  { text: "快速开始（源码 docker compose）", link: "/guide/deployment/quickstart" },
  { text: "环境变量参考", link: "/guide/deployment/env-reference" },
  { text: "GitHub Actions CI 部署", link: "/guide/deployment/github-actions" },
  { text: "CI 部署后追加 CLIProxyAPI sidecar", link: "/guide/deployment/cliproxy-sidecar" },
  { text: "数据库选型与初始化", link: "/guide/deployment/database" },
  { text: "HTTPS 与反向代理", link: "/guide/deployment/https-proxy" },
  { text: "数据持久化与备份", link: "/guide/deployment/persistence-backup" },
  { text: "升级与回滚", link: "/guide/deployment/upgrade-rollback" },
  { text: "常见部署问题排查", link: "/guide/deployment/troubleshooting" },
];

const usageSidebar = [
  { text: "管理后台导览", link: "/guide/usage/admin-overview" },
  { text: "添加第一个上游", link: "/guide/usage/first-upstream" },
  { text: "创建客户端 API Key", link: "/guide/usage/client-keys" },
  { text: "通过 AutoRouter 调用模型", link: "/guide/usage/invoke-models" },
  { text: "模型路由规则", link: "/guide/usage/model-routing" },
  { text: "负载均衡与权重", link: "/guide/usage/load-balancing" },
  { text: "熔断器配置", link: "/guide/usage/circuit-breaker-config" },
  { text: "CLIProxyAPI 首次使用指南", link: "/guide/usage/cliproxy-first-time" },
  { text: "CLIProxyAPI 外部 vs sidecar 选择", link: "/guide/usage/cliproxy-modes" },
  { text: "CLIProxyAPI 出站代理配置", link: "/guide/usage/cliproxy-egress-proxy" },
  { text: "请求日志与统计", link: "/guide/usage/logs-stats" },
  { text: "请求录制", link: "/guide/usage/request-recording" },
  { text: "故障排查手册", link: "/guide/usage/troubleshooting" },
];

const architectureSidebar = [
  { text: "整体架构总览", link: "/guide/architecture/overview" },
  { text: "请求生命周期", link: "/guide/architecture/request-lifecycle" },
  { text: "上游模型", link: "/guide/architecture/upstream-model" },
  { text: "失败转移与熔断", link: "/guide/architecture/failover-circuit" },
  { text: "安全模型", link: "/guide/architecture/security" },
  { text: "数据库 schema", link: "/guide/architecture/database-schema" },
  { text: "CLIProxyAPI 集成位置", link: "/guide/architecture/cliproxy-integration" },
  { text: "国际化机制", link: "/guide/architecture/i18n" },
  { text: "测试策略", link: "/guide/architecture/testing" },
  { text: "贡献指南与代码规范", link: "/guide/architecture/contributing" },
  { text: "版本与发布", link: "/guide/architecture/release" },
];

const referenceSidebar = [
  { text: "CLIProxyAPI 部署详解", link: "/cliproxy-deployment" },
  { text: "熔断器与失败转移详解", link: "/circuit-breaker" },
];

export default defineConfig({
  title: "AutoRouter",
  description: "AutoRouter 文档站：部署、使用与架构介绍",
  base: "/AutoRouter/",
  lang: "zh-CN",
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,

  locales: {
    root: {
      label: "简体中文",
      lang: "zh-CN",
      themeConfig: {
        nav: [
          { text: "首页", link: "/" },
          { text: "部署指南", link: "/guide/deployment/overview" },
          { text: "使用指南", link: "/guide/usage/admin-overview" },
          { text: "架构介绍", link: "/guide/architecture/overview" },
        ],
        sidebar: {
          "/guide/deployment/": [{ text: "部署指南", items: deploymentSidebar }],
          "/guide/usage/": [{ text: "使用指南", items: usageSidebar }],
          "/guide/architecture/": [{ text: "架构介绍", items: architectureSidebar }],
          "/": [
            { text: "部署指南", collapsed: false, items: deploymentSidebar },
            { text: "使用指南", collapsed: true, items: usageSidebar },
            { text: "架构介绍", collapsed: true, items: architectureSidebar },
            { text: "深度参考", collapsed: true, items: referenceSidebar },
          ],
        },
        outline: { label: "目录", level: [2, 3] },
        docFooter: { prev: "上一篇", next: "下一篇" },
        lastUpdated: { text: "最后更新于" },
        editLink: {
          pattern: "https://github.com/g1331/AutoRouter/edit/master/docs/:path",
          text: "在 GitHub 上编辑此页",
        },
      },
    },
    en: {
      label: "English",
      lang: "en-US",
      link: "/en/",
      themeConfig: {
        nav: [{ text: "Home", link: "/en/" }],
        sidebar: {
          "/en/": [
            {
              text: "Documentation",
              items: [{ text: "Overview (WIP)", link: "/en/" }],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    logo: "/images/banner.svg",
    socialLinks: [{ icon: "github", link: "https://github.com/g1331/AutoRouter" }],
    search: { provider: "local" },
    footer: {
      message: "Released under the AGPL-3.0 License.",
      copyright: "Copyright © 2025-present AutoRouter Contributors",
    },
  },
});
