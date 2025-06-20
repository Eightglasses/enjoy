const { BrowserWindow, screen } = require("electron");
const { WINDOW_CONFIG, PATHS, SHORTCUTS } = require("../config/constants");

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.floatingWindows = new Map();
    this.isWindowHidden = false; // 跟踪窗口是否被手动隐藏
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
        console.log("窗口关闭事件 - 阻止关闭并隐藏窗口");
        event.preventDefault();
        this.mainWindow.hide();
        this.isWindowHidden = true; // 标记窗口被隐藏
        return false;
      } else {
        console.log("应用正在退出 - 允许窗口关闭");
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
        enableRemoteModule: true,
        webSecurity: false, // 打包后需要这个设置
      },
    });

    floatingWindow.loadFile("floating.html");

    // 存储窗口和图片的对应关系
    const imageHash = global.storage.getImageHash(imageData);
    this.floatingWindows.set(imageHash, floatingWindow);

    floatingWindow.webContents.on("did-finish-load", () => {
      floatingWindow.webContents.send("set-image", imageData);
    });

    // 浮动窗口获得焦点时注册快捷键
    floatingWindow.on("focus", () => {
      console.log("浮动窗口获得焦点，注册快捷键");
      if (global.shortcut) {
        // 注册ESC关闭快捷键
        global.shortcut.register(SHORTCUTS.CLOSE, () => {
          floatingWindow.close();
          this.floatingWindows.delete(imageHash);
        });

        // 注册F12开发者工具快捷键
        global.shortcut.registerDevToolsShortcut();
      }
    });

    // 浮动窗口失去焦点时注销快捷键
    floatingWindow.on("blur", () => {
      console.log("浮动窗口失去焦点，注销快捷键");
      if (global.shortcut) {
        global.shortcut.unregister(SHORTCUTS.CLOSE);
        global.shortcut.unregisterDevToolsShortcut();
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
        enableRemoteModule: true,
        webSecurity: false, // 打包后需要这个设置
      },
    });

    editWindow.loadFile("edit.html");

    editWindow.webContents.on("did-finish-load", () => {
      editWindow.webContents.send("set-image", imageData);
      editWindow.show();
    });

    // 编辑窗口获得焦点时注册F12快捷键
    editWindow.on("focus", () => {
      console.log("编辑窗口获得焦点，注册F12快捷键");
      if (global.shortcut) {
        global.shortcut.registerDevToolsShortcut();
      }
    });

    // 编辑窗口失去焦点时注销F12快捷键
    editWindow.on("blur", () => {
      console.log("编辑窗口失去焦点，注销F12快捷键");
      if (global.shortcut) {
        global.shortcut.unregisterDevToolsShortcut();
      }
    });

    return editWindow;
  }

  showMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.log("显示主窗口");

      // 如果窗口被最小化，先恢复
      if (this.mainWindow.isMinimized()) {
        console.log("恢复最小化的窗口");
        this.mainWindow.restore();
      }

      // 显示并聚焦窗口
      this.mainWindow.show();
      this.mainWindow.focus();
      this.isWindowHidden = false; // 重置隐藏状态

      // 确保窗口在最前面
      this.mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.setAlwaysOnTop(false);
        }
      }, 100);
    } else {
      console.log("主窗口不存在或已销毁，无法显示");
    }
  }

  hideMainWindow() {
    if (this.mainWindow) {
      console.log("隐藏主窗口");
      this.mainWindow.hide();
      this.isWindowHidden = true; // 标记窗口被隐藏
    }
  }

  toggleMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const isVisible = this.mainWindow.isVisible();
      const isMinimized = this.mainWindow.isMinimized();

      console.log("切换主窗口状态:", {
        isVisible,
        isMinimized,
        isWindowHidden: this.isWindowHidden,
        windowExists: !!this.mainWindow,
      });

      // 使用状态跟踪来改善判断逻辑
      if (this.isWindowHidden || !isVisible || isMinimized) {
        console.log("窗口被隐藏/不可见/最小化 -> 显示窗口");
        this.showMainWindow();
      } else if (isVisible && !isMinimized) {
        console.log("窗口可见且未最小化 -> 隐藏窗口");
        this.hideMainWindow();
      } else {
        // 备用逻辑：强制显示
        console.log("状态不明确，强制显示窗口");
        this.showMainWindow();
      }
    } else {
      console.log("主窗口不存在或已销毁，重新创建");
      const mainWindow = this.createMainWindow();
      mainWindow.show();
      this.isWindowHidden = false;
    }
  }
}

module.exports = new WindowManager();
