# 启动下载时提示 FFmpeg 不可用

## 现象

点击下载后，控制台显示：

```
ffmpeg 不可用: [Errno 2] No such file or directory: 'ffmpeg'
```

设置页面环境检测也提示 `ffmpeg 返回非零退出码`。

![ffmpeg 检测失败示例](assets/ffmpeg-not-found.png)

## 环境

- 系统：Windows 11
- yutto-uiya 版本：2.0.0
- Python 运行方式：uv

## 原因

yutto 需要 FFmpeg 来合并下载的音视频流。系统 PATH 中没有 ffmpeg，或者没有在设置中指定本地路径。

## 解决

**方式一：下载便携版 FFmpeg（推荐）**

> 如果你使用的是我的一键包。可以重新看一下 [视频](https://www.bilibili.com/video/BV1yRdBBsEGZ/) 的 1:54~2:20。

1. 从 [FFmpeg 官网](https://ffmpeg.org/download.html) 下载对应系统的构建版本
2. 解压到任意目录，如 `D:\tools\ffmpeg\bin\ffmpeg.exe`
3. 打开 yutto-uiya → 设置 → FFmpeg 来源 → 选择「本地 ffmpeg」
4. 点击「浏览」选择 `ffmpeg.exe` 路径
5. 点击「保存并重新检测」

**方式二：加入系统 PATH**

```powershell
# Windows — 将 ffmpeg 所在目录加入 PATH
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";D:\tools\ffmpeg\bin", "User")
```

```bash
# Linux / macOS
sudo apt install ffmpeg    # Debian/Ubuntu
brew install ffmpeg         # macOS
```

加入 PATH 后重启 yutto-uiya，设置中 FFmpeg 来源保持「系统 ffmpeg」即可。
