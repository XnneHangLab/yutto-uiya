<h1 align="center">yutto-uiya 使用手册</h1>

## 交互

![主界面](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160825264.png)

-  `单集解析`:作用域包括[**用户投稿视频**](https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10),[**用户投稿视频列表**](https://www.bilibili.com/video/BV1Hp4y1M7gq/?spm_id_from=333.1387.top_right_bar_window_custom_collection.content.click),[**番剧**](https://www.bilibili.com/bangumi/play/ss48029?from_spmid=666.4.mylist.2),[**课程**](https://www.bilibili.com/cheese/play/ss63429?csource=common_myclass_purchasedlecture_null&spm_id_from=333.874.selfDef.mine_paid_list).
-  `全集解析`: 所有链接均可以用全集解析.[**up 空间**](https://space.bilibili.com/100969474), [**合集**](https://space.bilibili.com/100969474/lists/1947439?type=series),[**收藏夹**](https://space.bilibili.com/100969474/favlist?fid=1306978874&ftype=create)等仅能使用`全集解析`

其中值得注意的是, 合集链接要从 `up 空间` 获取, 如 [这样一个列表](https://space.bilibili.com/556737824/lists/3415704?type=season), 而不能使用 [正在播放中的视频](https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10) 作为合集.

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160825587.png)

勾选至少一个视频后会出现下载按钮, 第一个勾选框可以全选或者全不选.

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160825141.png)

勾选和想要的资源项后即可开始开始下载. 视频和音频质量和你所配置的 `SESS_DATA` 相关.

## 设置

![](https://fastly.jsdelivr.net/gh/MrXnneHang/blog_img/BlogHosting/img/25/02/202505160826883.png)

### SESS_DATA

`SESS_DATA`用于伪装登陆, 决定可访问权限, 比如没有提供 `SESS_DATA`, 那么是作为游客身份下载的, 也就是只能下载 `480P` 及以下的视频, 同时无法解析大会员视频. 另外普通用户的 `SESS_DATA` 则是 `1080P`及以下, 以及无法解析大会员视频.

如何获取 SESS_DATA:

### 严格校验大会员 / 严格校验登陆

`vip_strict` 和 `login_strict` 用于开启校验 `SESS_DATA` , 如果你提供了大会员的 `SESS_DATA` 但是发现无法享受大会员权限, 可以考虑把两个都开启. 如果你发现提供了用户权限的 `SESS_DATA` 但是依然是游客身份, 可以考虑只打开 `login_strict`(严格校验登陆).

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
 DEBUG  ffmpeg -codecs
 DEBUG  ffmpeg -encoders
 DEBUG  Get redircted url: https://www.bilibili.com/video/BV1mUBXYeE1h/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d7601f0fc447d708fff71aa75186ea10
 DEBUG  Fetch json: http://api.bilibili.com/x/web-interface/view?aid=&bvid=BV1mUBXYeE1h
 DEBUG  Fetch json: http://api.bilibili.com/x/tag/archive/tags?aid=&bvid=BV1mUBXYeE1h
 DEBUG  Fetch json: https://api.bilibili.com/x/player/pagelist?aid=&bvid=BV1mUBXYeE1h&jsonp=jsonp
 投稿视频  yutto-uiya (˘•ω•˘) - bilibiliv2|新的b站视频下载器
 DEBUG  Fetch json: https://api.bilibili.com/x/player/playurl?avid=&bvid=BV1mUBXYeE1h&cid=27056538000&qn=127&type=&otype=json&fnver=0&fnval=4048&fourk=1
 DEBUG  Fetch json: https://api.bilibili.com/x/player/wbi/v2?aid=&bvid=BV1mUBXYeE1h&cid=27056538000
 DEBUG  Fetch json: https://api.bilibili.com/x/player/v2?avid=&bvid=BV1mUBXYeE1h&cid=27056538000
 DEBUG  get_user_info cache miss: user_info, all cache keys: []
 DEBUG  Fetch json: https://api.bilibili.com/x/web-interface/nav
 DEBUG  Fetch text: http://comment.bilibili.com/27056538000.xml
 INFO  开始处理视频 yutto-uiya (˘•ω•˘) - bilibiliv2｜新的b站视频下载器
 LINK  https://www.bilibili.com/video/BV1mUBXYeE1h?p=1
 INFO  共包含以下 6 个视频流：
 INFO    0 [HEVC] [ 852x480 ] <480P 清晰 > #3
 INFO    1 [AVC ] [ 852x480 ] <480P 清晰 > #3
 INFO    2 [AV1 ] [ 852x480 ] <480P 清晰 > #3
 INFO    3 [HEVC] [ 640x360 ] <360P 流畅 > #3
 INFO  * 4 [AVC ] [ 640x360 ] <360P 流畅 > #3
 INFO    5 [AV1 ] [ 640x360 ] <360P 流畅 > #3
 INFO  共包含以下 3 个音频流：
 INFO    0 [MP4A] <128kbps >
 INFO    1 [MP4A] < 64kbps >
 INFO  * 2 [MP4A] <320kbps >
 弹幕  存在可下载弹幕
 描述文件  {'title': 'yutto-uiya (˘•ω•˘) - bilibiliv2|新的b站视频下载器', 'show_title': 'yutto-uiya (˘•ω•˘) - bilibiliv2|新的b站视频下载器', 'plot': '我以前一直使用downkyi，但是不得不说，它有时候让我很烦躁。\n我出过一些downkyi的常见问题的解法，但是问题总比办法多。评论区里面收到的经常是"无法解析怎么办"，“解析了但下载失败怎么办”,"登录二维码出不来怎么办"。\n这我也无能为力，因为downkyi是C#写的，我不会写C#。而作者又不经常更新。作者不维护，时间推移就会导致downkyi时常不稳定，或者直接罢工。\n\n后来，我认识了一个大佬，他用python写了一个bilibili下载器yutto（这回我看得懂了），并且我也有能力改。\n我为他的那个下载器糊了一个WebUI，然后发到这里。\n\n详细可以参考:https://xnnehang.top/blog/175\n那个大佬的原仓库:https://github.com/yutto-dev/yutto\n我的这个UI的仓库:https://github.com/MrXnneHang/yutto-uiya\n\n这个视频字幕有点偏移可能有些影响观感，当然我知道你们最关心的不是这些，你们关心的是这个:\n通过网盘分享的文件：yutto-uiya\n链接: https://pan.baidu.com/s/1GDhX8cqOY_i7YD9BbyTbgA?pwd=xnne\n提取码: xnne', 'thumb': 'http://i1.hdslb.com/bfs/archive/9d73675ac3ce53263b264ac74ecbc2c72f3ab16e.jpg', 'premiered': 1732704814, 'dateadded': 1747306461, 'actor': [{'name': '一目生', 'role': 'UP主', 'thumb': 'https://i2.hdslb.com/bfs/face/f4ebd6ac72ed850ebd2fa7a221006349a6b52164.jpg', 'profile': 'https://space.bilibili.com/556737824', 'order': 0}], 'genre': ['软件应用'], 'tag': ['教程', '一键包', 'downkyi', 'bilibili下载器', 'yutto'], 'source': '', 'original_filename': '', 'website': 'https://www.bilibili.com/video/BV1mUBXYeE1h', 'chapter_info_data': []}
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
