# yutto-uiya 

这里是 yutto 的 gradio-webui!<br>

原仓库:[https://github.com/yutto-dev/yutto](https://github.com/yutto-dev/yutto).<br>

## 为什么开发 ?​

我先前用过 downkyi,JJdown.共同的问题就是,我自己没能力改源代码。downkyi 是`C#`开发的，而 JJdown 似乎是闭源的。每次 b 站上的朋友问我说"为啥子突然不行了"，我也只能说我去向作者反馈一下，然后去提一个 Issue。<br>

但对于 yutto,我觉得我行了。<br>

# 支持项:

-  [x] [用户投稿单个视频](https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10)
-  [x] [用户投稿视频列表](https://www.bilibili.com/video/BV1Hp4y1M7gq/?spm_id_from=333.1387.top_right_bar_window_custom_collection.content.click)
-  [x] [收藏夹](https://space.bilibili.com/100969474/favlist?fid=1306978874&ftype=create)
-  [x] [合集](https://space.bilibili.com/100969474/lists/1947439?type=series)
-  [x] [up 空间](https://space.bilibili.com/100969474)
-  [x] [番剧](https://www.bilibili.com/bangumi/play/ss48029?from_spmid=666.4.mylist.2)
-  [x] [课程](https://www.bilibili.com/cheese/play/ss63429?csource=common_myclass_purchasedlecture_null&spm_id_from=333.874.selfDef.mine_paid_list)

但有个前提, 所有支持项最终能否被获取到都取决于用户本身是否具有对该资源的访问权限, 比如是否是大会员, 是否是购买了课程.

## 预览：

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505091128956.png)
![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505091128046.png)
![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505091128196.png)
![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505091128791.png)

## 如何部署它:

### 前置:

<details closed>
<summary>

#### ffmpeg:

</summary>

在合并音视频为视频, 以及转换音视频格式的时候, 均使用到了 `ffmpeg`。其中 yutto 依赖于系统级的 ffmpeg, 所以需要环境变量中直接具有 ffmpeg.<br>

对于`mac/linux`用户:<br>

```shell
brew install ffmpeg # mac
sudo apt install ffmpeg # linux
```

对于 `windows` 用户:<br>

[https://www.ffmpeg.org/download.html](https://www.ffmpeg.org/download.html)

之后将 `ffmpeg.exe` 的路径添加到环境变量中。<br>

</details>
<details closed>
<summary>

#### uv:

</summary>

本项目完全使用 `uv` 管理, 所以需要安装 `uv`.<br>

请参考它的[**安装文档**](https://docs.astral.sh/uv/getting-started/installation/).

</details>
<details closed>
<summary>

#### Rust tool chain

</summary>
因为本项目联调 `yutto`, 并且总是使用最新特性, 且最新特性并没有全部合入到主分支和发布到 pypi, 所以实时编译最新的 yutto 需要使用到 `rust` 工具链.<br>

我也会在 release 中提供各个版本的 `yutto` 的编译好的 `whl` 包, 你可以直接下载使用.(v1.1.2 之后开始)<br>

对于 `mac/linux` 用户:<br>

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

安装完成后需要 source.<br>

对于 `windows` 用户:<br>

[https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)<br>

</details>
<details closed>
<summary>

#### just(可选):

</summary>

just 是一款用 rust 编写的简单易用的命令执行工具，通过它可以方便地执行一些开发时常用的命令。

对于 `mac/linux` 用户:<br>

```shell
brew install just # mac
sudo apt install just # linux
```

对于 `windows` 用户:<br>

```shell
scoop install just # 需要提前安装 scoop, 且正常使用还得依靠具有 sh 特性的终端, 可以通过 git bash 来实现.
```

对于 windows 用户来说, 安装相当麻烦, 可以考虑写入 `.bat` 文件来替代.

</details>

### 克隆仓库

```shell
git clone https://github.com/XnneHangLab/yutto-uiya.git
cd yutto-uiya
```

### 启动:<br>

```shell
just start # 如果你安装了 just

# 如果没有安装 just
uv lock
uv sync
uv run streamlit run src/uiya/yutto_uiya.py
```

## 如何使用:

参考[使用手册](https://xnnehang.top/posts/default/yutto_uiya_v1_1_2_guide)

## 待开发:

-  [x] 提供单独下载音频、视频、弹幕、封面的勾选项。放在 webui 中。
-  [x] 结合 nfo 显示部分视频信息。
-  [x] 提供手动选集。
-  [ ] 提供不同的保存格式。
-  [x] 加入覆盖下载。（目前当下载已下载的视频不同清晰度，会跳过。无法下载不同清晰度。）
-  [x] 首次运行自动创建配置文件
-  [x] Typing, 优化代码结构, 让代码变得优雅.
-  [x] release as a python lib
-  [ ] 提高解析速度.
-  [ ] 简化安装步骤.
