const {
  app,
  clipboard,
  ipcMain,
  BrowserWindow,
  dialog,
  shell,
} = require("electron");
const { exec } = require("child_process");
const windowManager = require("./windowManager");
const trayManager = require("./trayManager");
const shortcutManager = require("./shortcutManager");
const storage = require("../utils/storage");
const path = require("path");
const fs = require("fs");

// 显示 Dock 图标 (之前被隐藏了)
// app.dock.hide();

// 使用 AppleScript 设置自动启动 (备用方案)
function setAutoLaunchWithAppleScript(enabled, appPath) {
  return new Promise((resolve) => {
    if (!enabled || !appPath) {
      resolve(false);
      return;
    }

    const script = `
      tell application "System Events"
        try
          set appName to "${path.basename(appPath)}"
          set loginItems to login items
          set itemExists to false
          
          repeat with loginItem in loginItems
            if name of loginItem is appName then
              set itemExists to true
              exit repeat
            end if
          end repeat
          
          if not itemExists then
            make login item at end with properties {path:"${appPath}", hidden:true}
            return "success"
          else
            return "already_exists"
          end if
        on error
          return "error"
        end try
      end tell
    `;

    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
      if (error) {
        console.error("AppleScript 执行失败:", error);
        resolve(false);
      } else {
        const result = stdout.trim();
        console.log("AppleScript 结果:", result);
        resolve(result === "success" || result === "already_exists");
      }
    });
  });
}

// 设置开机启动
function setAutoLaunch(enabled) {
  if (process.platform === "darwin") {
    return new Promise(async (resolve) => {
      try {
        console.log("开始设置自动启动:", enabled);
        console.log("应用是否已打包:", app.isPackaged);
        console.log("执行路径:", process.execPath);
        console.log("应用路径:", app.getPath("exe"));

        const settings = {
          openAtLogin: enabled,
          openAsHidden: true,
        };

        let appPath = null;

        // 尝试不同的路径设置方式
        if (app.isPackaged) {
          // 对于打包的应用，尝试多种路径
          const possiblePaths = [
            process.execPath,
            app.getPath("exe"),
            process.argv[0],
          ];

          console.log("可能的应用路径:", possiblePaths);

          // 使用第一个存在的路径
          for (const pathOption of possiblePaths) {
            if (pathOption && require("fs").existsSync(pathOption)) {
              settings.path = pathOption;
              appPath = pathOption;
              console.log("使用路径:", pathOption);
              break;
            }
          }
        }

        console.log("最终设置:", settings);

        // 首先尝试官方 API
        app.setLoginItemSettings(settings);

        // 等待一下让系统处理
        await new Promise((resolve) => setTimeout(resolve, 500));

        // 立即验证设置是否生效
        const verification = app.getLoginItemSettings();
        console.log("设置后验证结果:", verification);

        if (verification.openAtLogin === enabled) {
          console.log("官方 API 设置成功");
          resolve(true);
          return;
        }

        // 如果官方 API 失败，尝试 AppleScript 方案
        if (enabled && appPath) {
          console.log("官方 API 失败，尝试 AppleScript 方案...");
          const appleScriptResult = await setAutoLaunchWithAppleScript(
            enabled,
            appPath
          );
          resolve(appleScriptResult);
        } else {
          resolve(false);
        }
      } catch (error) {
        console.error("设置自动启动失败:", error);
        resolve(false);
      }
    });
  }
  return Promise.resolve(false);
}

// 获取开机启动状态
function getAutoLaunchStatus() {
  if (process.platform === "darwin") {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  }
  return false;
}

// 全局变量
global.app = app;
global.clipboard = clipboard;
global.windowManager = windowManager;
global.storage = storage;
global.shortcut = shortcutManager;
global.historyData = [];
global.setAutoLaunch = setAutoLaunch;
global.getAutoLaunchStatus = getAutoLaunchStatus;

// 初始化应用
function init() {
  // 加载历史记录
  global.historyData = storage.loadHistory();

  // 创建主窗口
  const mainWindow = windowManager.createMainWindow();

  // 初始状态：隐藏窗口，通过托盘操作
  console.log("主窗口初始状态 - 隐藏");

  // 创建托盘
  trayManager.createTray();

  // 注册快捷键
  shortcutManager.registerPasteShortcut();

  // 注册开发者工具快捷键 - 只在窗口获得焦点时监听
  mainWindow.on("focus", () => {
    console.log("主窗口获得焦点，注册F12快捷键");
    shortcutManager.registerDevToolsShortcut();

    // 窗口获得焦点时发送存储信息
    console.log("Window focused, sending storage info...");
    sendStorageInfo(mainWindow);
  });

  // 窗口失去焦点时注销F12快捷键
  mainWindow.on("blur", () => {
    console.log("主窗口失去焦点，注销F12快捷键");
    shortcutManager.unregisterDevToolsShortcut();
  });

  // 发送历史记录到渲染进程
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("history-loaded", global.historyData);

    const data = JSON.stringify(global.historyData);
    mainWindow.webContents.send("storage-info", {
      available: storage.getAvailableStorage(),
      used: data.length,
    });
  });

  return mainWindow;
}

// 监听事件
function setupEventListeners() {
  // 监听从历史记录显示图片的请求
  ipcMain.on("show-image", (event, imageData) => {
    console.log("收到显示图片请求:", imageData ? "有数据" : "无数据");

    const existingWindow = windowManager.getFloatingWindow(imageData);

    if (existingWindow) {
      console.log("窗口已存在，聚焦现有窗口");
      existingWindow.focus();
    } else {
      console.log("创建新的浮动窗口");
      // 直接使用传入的 imageData，不依赖剪贴板
      if (imageData) {
        // 使用 nativeImage 从 base64 数据创建图片对象
        const { nativeImage } = require("electron");
        try {
          const image = nativeImage.createFromDataURL(imageData);
          if (!image.isEmpty()) {
            windowManager.createFloatingWindow(image, imageData);
          } else {
            console.log("无法从数据创建图片");
          }
        } catch (error) {
          console.error("创建图片失败:", error);
        }
      } else {
        console.log("没有图片数据，无法创建浮动窗口");
      }
    }
  });

  // 监听删除单条历史记录
  ipcMain.on("delete-history-item", (event, id) => {
    const updatedHistory = storage.deleteHistoryItem(id, global.historyData);
    if (updatedHistory) {
      global.historyData = updatedHistory;
      windowManager.mainWindow.webContents.send(
        "history-updated",
        updatedHistory
      );
      const data = JSON.stringify(updatedHistory);
      windowManager.mainWindow.webContents.send("storage-info", {
        available: storage.getAvailableStorage(),
        used: data.length,
      });
    }
  });

  // 监听清除历史记录的请求
  ipcMain.on("clear-history", () => {
    global.historyData = [];
    storage.saveHistory(global.historyData);
    windowManager.mainWindow.webContents.send(
      "history-updated",
      global.historyData
    );
    windowManager.mainWindow.webContents.send("storage-info", {
      available: storage.getAvailableStorage(),
      used: 0,
    });
  });

  // 监听保存图片的请求
  ipcMain.on("save-image", async (event) => {
    try {
      const image = global.clipboard.readImage();
      if (!image.isEmpty()) {
        const { filePath } = await dialog.showSaveDialog({
          title: "保存图片",
          defaultPath: path.join(
            app.getPath("pictures"),
            `screenshot-${Date.now()}.png`
          ),
          filters: [
            { name: "PNG", extensions: ["png"] },
            { name: "JPEG", extensions: ["jpg", "jpeg"] },
          ],
        });

        if (filePath) {
          const buffer = image.toPNG();
          fs.writeFileSync(filePath, buffer);
          event.sender.send("save-success", path.basename(filePath));
        }
      }
    } catch (error) {
      console.error("保存图片失败:", error);
      event.sender.send("save-error", error.message);
    }
  });

  // 监听从历史记录保存图片的请求
  ipcMain.on("save-image-from-history", async (event, imageData) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: "保存图片",
        defaultPath: path.join(
          app.getPath("pictures"),
          `screenshot-${Date.now()}.png`
        ),
        filters: [
          { name: "PNG", extensions: ["png"] },
          { name: "JPEG", extensions: ["jpg", "jpeg"] },
        ],
      });

      if (filePath) {
        // 从 base64 数据中提取实际的图片数据
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(filePath, buffer);
        event.sender.send("save-success", path.basename(filePath));
      }
    } catch (error) {
      console.error("保存图片失败:", error);
      event.sender.send("save-error", error.message);
    }
  });

  // 监听编辑图片的请求
  ipcMain.on("edit-image", (event, imageData) => {
    windowManager.createEditWindow(imageData);
  });

  // 监听保存编辑后的图片
  ipcMain.on("save-edited-image", async (event, imageData) => {
    try {
      // 打开保存对话框
      const { filePath } = await dialog.showSaveDialog({
        title: "保存图片",
        defaultPath: path.join(app.getPath("pictures"), "edited-image.png"),
        filters: [
          { name: "PNG 图片", extensions: ["png"] },
          { name: "JPEG 图片", extensions: ["jpg", "jpeg"] },
        ],
      });

      if (!filePath) {
        event.reply("save-image-result", false, "已取消保存");
        return;
      }

      // 将 base64 图片数据转换为 Buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // 保存文件
      await fs.promises.writeFile(filePath, buffer);

      // 发送成功消息
      event.reply("save-image-result", true);
    } catch (error) {
      console.error("保存图片失败:", error);
      event.reply("save-image-result", false, error.message);
    }
  });

  // 监听开机启动状态查询
  ipcMain.on("get-auto-launch-status", (event) => {
    const enabled = getAutoLaunchStatus();
    console.log("查询自动启动状态:", enabled);
    event.sender.send("auto-launch-status", enabled);
  });

  // 监听开机启动开关切换（仅开启，不关闭）
  ipcMain.on("enable-auto-launch", async (event) => {
    console.log("收到开启自动启动请求...");

    try {
      // 尝试设置自动启动 (现在是异步的)
      const success = await setAutoLaunch(true);
      console.log("设置自动启动直接结果:", success);

      // 再次检查最终状态
      const finalStatus = getAutoLaunchStatus();
      console.log("最终自动启动状态:", finalStatus);

      if (success && finalStatus) {
        console.log("自动启动设置成功");
        event.sender.send("auto-launch-enabled", true);
      } else {
        console.log("自动启动设置失败，可能需要手动在系统偏好设置中添加");
        event.sender.send("auto-launch-enabled", false);

        // 根据不同情况提供不同的错误信息
        if (app.isPackaged) {
          event.sender.send(
            "auto-launch-error",
            "请手动在系统偏好设置 > 用户与群组 > 登录项中添加此应用，或者检查应用是否有足够的权限"
          );
        } else {
          event.sender.send(
            "auto-launch-error",
            "开发环境下无法设置自动启动，请在打包后的应用中尝试"
          );
        }
      }
    } catch (error) {
      console.error("处理自动启动请求时出错:", error);
      event.sender.send("auto-launch-enabled", false);
      event.sender.send("auto-launch-error", `设置失败: ${error.message}`);
    }
  });

  // 监听打开存储位置的请求
  ipcMain.on("open-storage-folder", (event) => {
    try {
      // 获取用户数据目录，这是历史记录保存的位置
      const userDataPath = app.getPath("userData");

      // 使用 shell.openPath 打开文件夹
      shell.openPath(userDataPath).catch((error) => {
        console.error("打开存储文件夹失败:", error);
        // 如果打开失败，可以显示一个消息给用户
        event.sender.send("folder-open-error", "无法打开存储文件夹");
      });
    } catch (error) {
      console.error("打开存储文件夹失败:", error);
      event.sender.send("folder-open-error", "无法打开存储文件夹");
    }
  });
}

// 应用准备就绪
app.whenReady().then(() => {
  init();
  setupEventListeners();
});

// 处理应用退出
app.on("before-quit", () => {
  app.isQuitting = true;
  shortcutManager.unregisterAll();
});

// 所有窗口关闭时退出应用
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 激活应用时创建窗口
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    init();
  }
});

function sendStorageInfo(window) {
  const history = storage.loadHistory();
  window.webContents.send("storage-info", {
    available: storage.getAvailableStorage(),
    used: history.length,
  });

  // 发送缓存信息
  window.webContents.send("storage-info-updated", {
    usedSize: storage.getUsedStorage() + " MB",
    availableSize: storage.getAvailableStorage() + " GB",
    totalCount: history.length,
  });
}
