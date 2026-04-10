#!/bin/bash
set -e

echo ""
echo " yutto-uiya 环境初始化"
echo " ========================"
echo ""

if ! command -v conda &> /dev/null; then
    echo " [错误] 未找到 conda，请先安装 Miniconda 或 Anaconda。"
    echo " 下载地址：https://docs.conda.io/en/latest/miniconda.html"
    echo ""
    exit 1
fi

echo " [1/2] 创建 conda 环境（首次需要下载依赖，请耐心等待）..."
if conda env create -f environment.yml; then
    :
else
    echo ""
    echo " [提示] 若环境已存在，尝试更新：conda env update -f environment.yml --prune"
    echo ""
    exit 1
fi

echo ""
echo " [2/2] 查找 python 路径..."
PYTHON_PATH=$(conda run -n yutto-uiya python -c "import sys; print(sys.executable)")
echo ""
echo " Python 路径：$PYTHON_PATH"
echo ""
echo " ✓ 初始化完成！"
echo ""
echo " 接下来："
echo "   1. 启动 yutto-uiya"
echo "   2. 进入「设置」，运行时选择「conda / 直接指定」"
echo "   3. 将上方 Python 路径填入即可"
echo ""
