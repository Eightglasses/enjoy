#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 图片粘贴工具 - 快速构建脚本");

// 设置环境变量
const env = {
  ...process.env,
  ELECTRON_MIRROR: "https://registry.npmmirror.com/-/binary/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR:
    "https://registry.npmmirror.com/-/binary/electron-builder-binaries/",
  NPM_CONFIG_REGISTRY: "https://registry.npmmirror.com/",
};

// 清理函数
function cleanUp() {
  console.log("🧹 清理缓存...");
  const dirsToClean = [
    "./dist",
    "./node_modules/.cache",
    path.join(require("os").homedir(), ".cache/electron-builder"),
  ];

  dirsToClean.forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

// 执行命令函数
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...env, ...options.env },
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`命令执行失败，退出码: ${code}`));
      }
    });
  });
}

// 主函数
async function main() {
  try {
    // 清理
    cleanUp();

    // 检查是否需要安装依赖
    if (!fs.existsSync("./node_modules")) {
      console.log("📦 安装依赖...");
      await runCommand("npm", ["install"]);
    }

    // 构建
    console.log("🔨 开始构建 Mac 版本...");
    await runCommand("npx", ["electron-builder", "--mac"]);

    console.log("✅ 构建成功！");
    console.log("📁 构建文件位置: ./dist/");

    // 显示构建结果
    if (fs.existsSync("./dist")) {
      const files = fs
        .readdirSync("./dist")
        .filter((f) => f.endsWith(".dmg") || f.endsWith(".zip"));
      files.forEach((file) => {
        const stats = fs.statSync(path.join("./dist", file));
        const size = (stats.size / 1024 / 1024).toFixed(1);
        console.log(`📦 ${file} (${size}MB)`);
      });
    }
  } catch (error) {
    console.error("❌ 构建失败:", error.message);
    process.exit(1);
  }
}

main();
