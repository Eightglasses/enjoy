const { globalShortcut } = require("electron");
const { SHORTCUTS } = require("../config/constants");

class ShortcutManager {
  constructor() {
    this.registeredShortcuts = new Set();
  }

  register(accelerator, callback) {
    if (!this.registeredShortcuts.has(accelerator)) {
      globalShortcut.register(accelerator, callback);
      this.registeredShortcuts.add(accelerator);
    }
  }

  unregister(accelerator) {
    if (this.registeredShortcuts.has(accelerator)) {
      globalShortcut.unregister(accelerator);
      this.registeredShortcuts.delete(accelerator);
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
    this.registeredShortcuts.clear();
  }

  registerPasteShortcut() {
    this.register(SHORTCUTS.PASTE, () => {
      const image = global.clipboard.readImage();
      if (!image.isEmpty()) {
        const imageData = image.toDataURL();
        // 添加到历史记录并通知主窗口更新
        const updatedHistory = global.storage.addToHistory(
          imageData,
          global.historyData
        );
        if (updatedHistory) {
          global.historyData = updatedHistory;
          global.windowManager.mainWindow.webContents.send(
            "history-updated",
            updatedHistory
          );
          const data = JSON.stringify(updatedHistory);
          global.windowManager.mainWindow.webContents.send("storage-info", {
            available: global.storage.getAvailableStorage(),
            used: data.length,
          });
          global.windowManager.createFloatingWindow(image, imageData);
        } else {
          global.windowManager.mainWindow.webContents.send(
            "storage-warning",
            "已经存在该图片"
          );
        }
      }
    });
  }

  registerDevToolsShortcut() {
    console.log("注册F12开发者工具快捷键");
    this.register(SHORTCUTS.DEV_TOOLS, () => {
      console.log("F12快捷键被触发");
      // 获取当前活动的窗口
      const focusedWindow =
        require("electron").BrowserWindow.getFocusedWindow();
      if (focusedWindow && focusedWindow.webContents) {
        focusedWindow.webContents.openDevTools();
      } else if (global.windowManager.mainWindow) {
        // 回退到主窗口
        global.windowManager.mainWindow.webContents.openDevTools();
      }
    });
  }

  unregisterDevToolsShortcut() {
    console.log("注销F12开发者工具快捷键");
    this.unregister(SHORTCUTS.DEV_TOOLS);
  }
}

module.exports = new ShortcutManager();
