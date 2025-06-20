const { BrowserWindow, screen } = require("electron");
const { WINDOW_CONFIG, PATHS, SHORTCUTS } = require("../config/constants");

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.floatingWindows = new Map();
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      ...WINDOW_CONFIG,
      skipTaskbar: false, // 在任务栏显示
    });
    this.mainWindow.loadFile("index.html");

    // 窗口关闭时隐藏而不是退出
    this.mainWindow.on("close", (event) => {
      if (!global.app.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
        return false;
      }
    });

    return this.mainWindow;
  }

  createFloatingWindow(image, imageData) {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    // 获取图片的实际尺寸
    const imageSize = image.getSize();
    let windowWidth = imageSize.width;
    let windowHeight = imageSize.height;

    // 如果图片尺寸超过屏幕，则按比例缩放
    const maxWidth = screenWidth * 0.8; // 屏幕宽度的80%
    const maxHeight = screenHeight * 0.8; // 屏幕高度的80%

    if (windowWidth > maxWidth || windowHeight > maxHeight) {
      const ratio = Math.min(maxWidth / windowWidth, maxHeight / windowHeight);
      windowWidth = Math.floor(windowWidth * ratio);
      windowHeight = Math.floor(windowHeight * ratio);
    }

    // 计算窗口位置，使其居中显示
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = Math.floor((screenHeight - windowHeight) / 2);

    const floatingWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true, // 不在任务栏显示
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    floatingWindow.loadFile("floating.html");

    // 存储窗口和图片的对应关系
    const imageHash = global.storage.getImageHash(imageData);
    this.floatingWindows.set(imageHash, floatingWindow);

    floatingWindow.webContents.on("did-finish-load", () => {
      floatingWindow.webContents.send("set-image", imageData);
    });

    // 监听 ESC 键
    floatingWindow.on("focus", () => {
      if (global.shortcut) {
        global.shortcut.register(SHORTCUTS.CLOSE, () => {
          floatingWindow.close();
          this.floatingWindows.delete(imageHash);
        });
      }
    });

    // 窗口失去焦点时注销快捷键
    floatingWindow.on("blur", () => {
      if (global.shortcut) {
        global.shortcut.unregister(SHORTCUTS.CLOSE);
      }
    });

    // 窗口关闭时注销快捷键并清理
    floatingWindow.on("closed", () => {
      if (global.shortcut) {
        global.shortcut.unregister(SHORTCUTS.CLOSE);
      }
      this.floatingWindows.delete(imageHash);
    });

    return floatingWindow;
  }

  getFloatingWindow(imageData) {
    const imageHash = global.storage.getImageHash(imageData);
    return this.floatingWindows.get(imageHash);
  }

  createEditWindow(imageData) {
    const editWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    editWindow.loadFile("edit.html");

    editWindow.webContents.on("did-finish-load", () => {
      editWindow.webContents.send("set-image", imageData);
      editWindow.show();
    });

    return editWindow;
  }

  showMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  toggleMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideMainWindow();
      } else {
        this.showMainWindow();
      }
    }
  }
}

module.exports = new WindowManager();
