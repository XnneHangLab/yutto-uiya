<a href="https://xnnehang.top/">

<div align="center">
    <img src="https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202503312014744.svg" alt="魔女の实验室" width="270" height="180">
</div>
<h1 align="center">yutto-uiya</h1>

</a>
<br/>

<div align="center">
<a href="https://github.com/astral-sh/uv"><img alt="uv" src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json&style=flat-square"></a>
<a href="https://github.com/astral-sh/ruff"><img alt="ruff" src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json&style=flat-square"></a>
<a href="https://gitmoji.dev"><img alt="Gitmoji" src="https://img.shields.io/badge/gitmoji-%20😜%20😍-FFDD67?style=flat-square"></a>
<a href="https://github.com/casey/just"><img alt="just" src="https://img.shields.io/badge/just-🤖-yellow?style=flat-square&logoWidth=20"></a>
<a href="https://streamlit.io/"><img alt="Streamlit" src="https://img.shields.io/badge/Streamlit-FF4B4B?logo=streamlit&logoColor=white&style=flat-square"></a>
<br/>
</div>

<p align="center"> <a href="./README_en.md"><b>English Documentation </b></a> </p>

<p align="center">
 这里是为 yutto 开发的 WebUI!<br>
</p>

<p align="center">
<a href='https://xnnehang.top/posts/default/yutto_uiya_v1_1_2_guide' style='font-size: 20px;'><strong>文档网站(可能还没写全,再等等噢)</strong></a> ·
<a href='https://space.bilibili.com/556737824'><strong>bilibili视频教程(再等等噢)</strong></a>
</p>
<p align="center">
  <a href="#预览"><strong>预览</strong></a> ·
  <a href="#本地部署"><strong>本地部署</strong></a> ·
  <a href="#如何使用"><strong>如何使用</strong></a>
</p>

## 为什么开发 ?​

我先前用过 downkyi,JJdown.共同的问题就是,我自己没能力改源代码。downkyi 是`C#`开发的，而 JJdown 似乎是闭源的。每次 b 站上的朋友问我说"为啥子突然不行了"，我也只能说我去向作者反馈一下，然后去提一个 Issue。<br>

但对于 yutto, 我觉得我行了。<br>

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

## 本地部署:

### 1.安装前置:

<details closed>
<summary><b>ffmpeg #</b><br>

在合并音视频为视频, 以及转换音视频格式的时候, 均使用到了 `ffmpeg`。其中 yutto 依赖于系统级的 ffmpeg, 所以需要环境变量中直接具有 ffmpeg.<br>

</summary>

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
<summary><b>uv #</b><br>

本项目完全使用 `uv` 管理, 所以需要安装 `uv`.<br>

</summary>

请参考它的[**安装文档**](https://docs.astral.sh/uv/getting-started/installation/).

只需要保证全局环境下 uv 可访问即可: <br>

```shell
xnne@xnne-PC:~$ uv -V
uv 0.7.0
```

</details>

<details closed>
<summary><b>Rust tool chain #</b><br>

因为本项目联调 `yutto`, 并且总是使用最新特性, 且最新特性并没有全部合入到主分支和发布到 pypi, 所以实时编译最新的 yutto 需要使用到 `rust` 工具链.<br>

</summary>

我也会在 release 中提供各个版本的 `yutto` 的编译好的 `whl` 包, 你可以直接下载使用.(v1.1.2 之后开始)<br>

对于 `mac/linux` 用户:<br>

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

安装完成根据提示 source.<br>

对于 `windows` 用户:<br>

[https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)<br>

</details>

<details closed>
<summary> <b>just(可选) #</b> <br>
just 是一款用 rust 编写的简单易用的命令执行工具，通过它可以方便地执行一些开发时常用的命令。<br>
</summary>

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

### 2.克隆仓库

```shell
git clone https://github.com/XnneHangLab/yutto-uiya.git
cd yutto-uiya
```

### 3.启动程序:<br>

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
