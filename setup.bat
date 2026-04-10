@echo off
chcp 65001 >nul
echo.
echo  yutto-uiya 环境初始化
echo  ========================
echo.

where conda >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 未找到 conda，请先安装 Miniconda 或 Anaconda。
    echo  下载地址：https://docs.conda.io/en/latest/miniconda.html
    echo.
    pause
    exit /b 1
)

echo  [1/2] 创建 conda 环境（首次需要下载依赖，请耐心等待）...
conda env create -f environment.yml
if %errorlevel% neq 0 (
    echo.
    echo  [提示] 若环境已存在，尝试更新：conda env update -f environment.yml --prune
    echo.
    pause
    exit /b 1
)

echo.
echo  [2/2] 查找 python.exe 路径...
echo.
for /f "delims=" %%i in ('conda run -n yutto-uiya python -c "import sys; print(sys.executable)"') do set PYTHON_PATH=%%i
echo  Python 路径：%PYTHON_PATH%
echo.
echo  ✓ 初始化完成！
echo.
echo  接下来：
echo    1. 启动 yutto-uiya.exe
echo    2. 进入「设置」，运行时选择「conda / 直接指定」
echo    3. 将上方 Python 路径填入即可
echo.
pause
