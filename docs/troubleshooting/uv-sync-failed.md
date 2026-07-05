# uv sync 安装依赖失败

## 现象

环境检测卡在「uiya 不可用」，控制台报错：

```
error: Failed to download: uia-yutto==0.0.5
  Caused by: Request failed after 3 retries
```

或点击「一键同步」后长时间无响应。

## 原因

网络问题导致 uv 无法从 PyPI 下载依赖包。常见于公司/校园网络有代理或防火墙限制。

## 解决

**方式一：设置代理**

如果你有代理，在终端中设置后重启 yutto-uiya：

```powershell
# Windows
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
```

```bash
# Linux / macOS
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
```

**方式二：使用国内镜像**

编辑项目根目录的 `pyproject.toml`，将 PyPI 源替换为清华镜像：

```toml
[[tool.uv.index]]
name = "pypi"
url = "https://pypi.tuna.tsinghua.edu.cn/simple"
default = true
```

然后重新点击`「设置-依赖同步-uv sync」`。
