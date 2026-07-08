# 启动下载时提示 FFmpeg 不可用

## 现象

点击下载后，控制台显示：

```
ffmpeg 不可用: [Errno 2] No such file or directory: 'ffmpeg'
```

设置页面环境检测也提示 `ffmpeg 返回非零退出码`。

<!-- TODO: 添加 ffmpeg-not-found.png 截图 -->

## 环境

- 系统：Windows 11
- yutto-uiya 版本：2.0.0
- Python 运行方式：uv

## 原因

yutto 需要 FFmpeg 来合并下载的音视频流。系统 PATH 中没有 ffmpeg，或者没有在设置中指定本地路径。

## 解决

> 如果你使用的是我的一键包。可以重新看一下 [视频](https://www.bilibili.com/video/BV1yRdBBsEGZ/) 的 1:54~2:20。