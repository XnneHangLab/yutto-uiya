# 🚀 快速开始

::: tip 🎬 视频教程
更喜欢看视频？可以直接看 [完整使用教程](https://www.bilibili.com/video/BV1yRdBBsEGZ/)~
:::

## 📥 下载安装

前往 [GitHub Releases](https://github.com/XnneHangLab/yutto-uiya/releases) 下载对应平台的最新版 portable 一键包。目前提供 Windows x86_64 与 macOS Apple Silicon 版本。Debian portable 版本计划在树莓派 4B 测试环境恢复后适配并发布。

- Windows：解压后双击 `yutto-uiya.exe`
- macOS：解压后打开 `yutto-uiya.app`

一键包已经内置 Python 运行环境、依赖和 FFmpeg，无需另行安装 uv、Conda、Python 或 FFmpeg。

::: warning 注意路径
请勿将程序解压到 `C:\Program Files` 等需要管理员权限的目录，否则可能出现 [拒绝访问](/troubleshooting/folder-cannot-access) 错误。
:::

## 🎬 第一次使用

### 1. 环境检测

首次启动时，程序会自动检测 FFmpeg 和 Python 环境。

- ✅ 如果使用一键包，环境已经内置，无需额外配置
- ⚠️ 如果提示 FFmpeg 不可用，请参考 [FFmpeg 不可用](/troubleshooting/ffmpeg-not-found)

### 2. 登录（可选）

在设置页面扫码登录 Bilibili 账号，可以解锁：

- 🎬 更高画质（1080P / 4K）
- ⭐ 大会员专属内容

不登录也可以使用，但画质最高只有 360P / 480P。详见 [画质只有 360P](/troubleshooting/low-quality-360p)。

### 3. 开始下载

1. 复制 B 站视频 / 收藏夹 / 合集的链接
2. 粘贴到「下载管理」的输入框，点击「解析」
3. 勾选想要的视频，按需调整画质与格式
4. 点击「下载所选」~

就是这么简单！🎉 更多细节（分组勾选、串行队列、实时进度）见 [下载管理](/guide/download)。
