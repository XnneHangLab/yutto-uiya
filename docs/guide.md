<h1 align="center">yutto-uiya 使用手册</h1>

<p align="center">
  <a href="#交互"><strong>交互</strong></a>
  <a href="#设置"><strong>设置</strong></a>
</p>

## 交互

![主界面](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160825264.png)

-  `单集解析`:作用域包括[**用户投稿视频**](https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10),[**用户投稿视频列表**](https://www.bilibili.com/video/BV1Hp4y1M7gq/?spm_id_from=333.1387.top_right_bar_window_custom_collection.content.click),[**番剧**](https://www.bilibili.com/bangumi/play/ss48029?from_spmid=666.4.mylist.2),[**课程**](https://www.bilibili.com/cheese/play/ss63429?csource=common_myclass_purchasedlecture_null&spm_id_from=333.874.selfDef.mine_paid_list).
-  `全集解析`: 所有链接均可以用全集解析.[**up 空间**](https://space.bilibili.com/100969474), [**合集**](https://space.bilibili.com/100969474/lists/1947439?type=series),[**收藏夹**](https://space.bilibili.com/100969474/favlist?fid=1306978874&ftype=create)等仅能使用`全集解析`

其中值得注意的是, 合集链接要从 `up 空间` 获取, 如 [这样一个列表](https://space.bilibili.com/556737824/lists/3415704?type=season), 而不能使用 [正在播放中的视频](https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10) 作为合集.

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160825587.png)

勾选至少一个视频后会出现下载按钮, 第一个勾选框可以全选或者全不选.

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160825141.png)

勾选和想要的资源项后即可开始开始下载. 视频和音频质量和你所配置的 `SESS_DATA` 相关.

## 设置参数

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160826883.png)

> [!note warning]
> 任何时候, 你在修改完配置项后, 都应该点击`保存更改`. 不然不会生效.

### SESS_DATA

`SESS_DATA`用于伪装登陆, 决定可访问权限, 比如没有提供 `SESS_DATA`, 那么是作为游客身份下载的, 也就是只能下载 `480P` 及以下的视频, 同时无法解析大会员视频. 另外普通用户的 `SESS_DATA` 则是 `1080P`及以下, 以及无法解析大会员视频.

<details closed>
<summary>获取 SESS_DATA 的方式</summary>

这里用 Chrome 作为示例，其它浏览器请尝试类似方法。

首先，用你的帐号登录 B 站，然后随便打开一个 B 站网页，比如首页。

按 F12 打开开发者工具，切换到 Network 栏，刷新页面，此时第一个加载的资源应该就是当前页面的 html，选中该资源，在右侧 「Request Headers」 中找到 「cookie」，在其中找到类似于 SESSDATA=d8bc7493%2C2843925707%2C08c3e*81; 的一串字符串，复制这里的 d8bc7493%2C2843925707%2C08c3e*81，这就是你需要的 SESSDATA。

</details>

### 严格校验大会员 / 严格校验登录

`vip_strict`(严格校验大会员) 和 `login_strict`(严格校验登录) 用于开启校验 `SESS_DATA` , 如果你提供了大会员的 `SESS_DATA` 但是发现无法享受大会员权限, 可以考虑把两个都开启. 如果你发现提供了用户权限的 `SESS_DATA` 但是依然是游客身份, 可以考虑只打开 `login_strict`(严格校验登陆).

一般不需要动, 默认关闭即可.

### 调试模式

任何时候你试图反馈一个 bug, 你应该先打开调试模式.

然后复现你的问题, 再把终端内容复制过来比如这样:

```shell
=================== DEBUG MODE ↓===================
['uv', 'run', 'yutto', 'https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10', '--config', 'config/yutto.toml']
num_workers=8 video_quality=16 audio_quality=30280 sessdata='' vip_strict=False login_strict=False dir='.cache/20250515_185420'
require_video=True require_audio=True require_danmaku=True require_subtitle=True require_metadata=True require_cover=True save_cover=True
=================== DEBUG MODE ↑===================
 INFO  发现配置文件 config/yutto.toml，加载中……
 INFO  未提供 SESSDATA，无法下载高清视频、字幕等资源哦～
 DEBUG  ffmpeg -codecs
 DEBUG  ffmpeg -encoders
... # 一直到本次解析或者下载结束,包括如果有抛出异常一起截进来
 封面  http://i1.hdslb.com/bfs/archive/9d73675ac3ce53263b264ac74ecbc2c72f3ab16e.jpg
```

### 下载目录

下载后最终存放的目录, 可自定义, 可以用相对路径, 也可以用绝对路径.

下载时的路径(缓存路径)位于 `.cache/`.

### FFmpeg 路径

可以使用相对路径也可以使用绝对路径, 为了照顾 windows 用户配置环境变量太麻烦, 可以直接添加可执行 exe 的路径.

如果你想要直接用系统环境变量中的 `ffmpeg` , 那么只需要填入 `ffmpeg` 即可, 这个似乎也是默认.

### 代理池

仅支持 https 代理, 目前不支持 socks5 代理.

默认 auto. 一般不需要动, 除非你重度使用并且经常被风控.
