#!/bin/bash

# 图片粘贴工具自动构建脚本
echo "🚀 开始构建图片粘贴工具..."

# 设置环境变量
export ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/

# 清理旧的构建文件和缓存
echo "🧹 清理缓存..."
rm -rf dist
rm -rf node_modules/.cache
rm -rf ~/.cache/electron-builder

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 构建应用
echo "🔨 开始构建 Mac 版本..."
npm run build:mac

# 检查构建结果
if [ $? -eq 0 ]; then
    echo "✅ 构建成功！"
    echo "📁 构建文件位置: ./dist/"
    ls -la dist/*.dmg dist/*.zip 2>/dev/null || echo "构建文件在 dist 目录中"
else
    echo "❌ 构建失败！"
    exit 1
fi 