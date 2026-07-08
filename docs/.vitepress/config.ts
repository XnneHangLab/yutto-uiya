import { defineConfig } from "vitepress";

export default defineConfig({
  srcExclude: ["**/troubleshooting/_template.md"],
  lang: "zh-CN",
  title: "yutto-uiya",
  description: "绘心 — yutto 图形界面，Bilibili 视频下载工具",

  head: [["link", { rel: "icon", href: "/favicon.ico" }]],

  themeConfig: {
    logo: "/icon.png",

    nav: [
      { text: "🏠 首页", link: "/" },
      { text: "📖 指南", link: "/guide/intro" },
      { text: "🔧 常见问题", link: "/troubleshooting/ffmpeg-not-found" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "📖 开始",
          items: [
            { text: "🎬 项目介绍", link: "/guide/intro" },
            { text: "🚀 快速开始", link: "/guide/getting-started" },
            { text: "⚙️ 设置说明", link: "/guide/settings" },
          ],
        },
        {
          text: "🔧 常见问题",
          items: [
            {
              text: "🎞️ FFmpeg 不可用",
              link: "/troubleshooting/ffmpeg-not-found",
            },
            {
              text: "📂 合集只解析到一个视频",
              link: "/troubleshooting/collection-download-error",
            },
            {
              text: "🚫 拒绝访问 (WinError 5)",
              link: "/troubleshooting/folder-cannot-access",
            },
            {
              text: "📉 画质只有 360P",
              link: "/troubleshooting/low-quality-360p",
            },
            {
              text: "📦 uv sync 安装失败",
              link: "/troubleshooting/uv-sync-failed",
            },
          ],
        },
        {
          text: "🧑‍💻 开发",
          items: [
            { text: "🤝 贡献指南", link: "/guide/contributing" },
          ],
        },
      ],
      "/troubleshooting/": [
        {
          text: "📖 指南",
          items: [
            { text: "🎬 项目介绍", link: "/guide/intro" },
            { text: "🚀 快速开始", link: "/guide/getting-started" },
            { text: "⚙️ 设置说明", link: "/guide/settings" },
          ],
        },
        {
          text: "🔧 常见问题",
          items: [
            {
              text: "🎞️ FFmpeg 不可用",
              link: "/troubleshooting/ffmpeg-not-found",
            },
            {
              text: "📂 合集只解析到一个视频",
              link: "/troubleshooting/collection-download-error",
            },
            {
              text: "🚫 拒绝访问 (WinError 5)",
              link: "/troubleshooting/folder-cannot-access",
            },
            {
              text: "📉 画质只有 360P",
              link: "/troubleshooting/low-quality-360p",
            },
            {
              text: "📦 uv sync 安装失败",
              link: "/troubleshooting/uv-sync-failed",
            },
          ],
        },
        {
          text: "🧑‍💻 开发",
          items: [
            { text: "🤝 贡献指南", link: "/guide/contributing" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/XnneHangLab/yutto-uiya" },
    ],

    outline: { level: "deep", label: "📑 目录" },
    docFooter: { prev: "⬅️ 上一篇", next: "下一篇 ➡️" },
    lastUpdated: { text: "🕐 最后更新" },
    search: { provider: "local" },
  },

  lastUpdated: true,
});
