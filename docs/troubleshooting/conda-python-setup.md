# 使用 conda 环境运行 yutto-uiya

## 现象

不想用 uv，想用已有的 conda 环境来运行。

## 解决

1. 创建或使用已有的 conda 环境：

```bash
conda create -n yutto python=3.11
conda activate yutto
pip install -e .
```

2. 找到该环境的 Python 路径：

```bash
# Linux / macOS
which python
# 例：/home/user/miniconda3/envs/yutto/bin/python

# Windows
where python
# 例：C:\Users\user\miniconda3\envs\yutto\python.exe
```

3. 打开 yutto-uiya → 设置 → Python 运行方式 → 选择「conda」
4. 在「Python 可执行文件」中填入上面的路径，或点击「浏览」选择
5. 点击「保存并重新检测」
