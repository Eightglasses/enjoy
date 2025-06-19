const { app, clipboard, ipcMain, BrowserWindow, dialog } = require("electron");
const windowManager = require("./windowManager");
const trayManager = require("./trayManager");
const shortcutManager = require("./shortcutManager");
const storage = require("../utils/storage");
const path = require("path");
const fs = require("fs");

// 隐藏 Dock 图标
app.dock.hide();

// 设置开机启动
function setAutoLaunch(enabled) {
  if (process.platform === "darwin") {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: app.getPath("exe"),
    });
  }
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

  // 创建托盘
  trayManager.createTray();

  // 注册快捷键
  shortcutManager.registerPasteShortcut();

  // 注册开发者工具快捷键
  mainWindow.on("focus", () => {
    shortcutManager.registerDevToolsShortcut();

    // 窗口获得焦点时发送存储信息
    console.log("Window focused, sending storage info...");
    sendStorageInfo(mainWindow);
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
    const existingWindow = windowManager.getFloatingWindow(imageData);

    if (existingWindow) {
      existingWindow.focus();
    } else {
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        windowManager.createFloatingWindow(image, imageData);
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
    event.sender.send("auto-launch-status", enabled);
  });

  // 监听开机启动开关切换
  ipcMain.on("toggle-auto-launch", (event) => {
    const currentStatus = getAutoLaunchStatus();
    const newStatus = !currentStatus;
    setAutoLaunch(newStatus);
    event.sender.send("auto-launch-status", newStatus);
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
