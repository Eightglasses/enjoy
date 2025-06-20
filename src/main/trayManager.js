const { Tray, Menu, nativeImage } = require("electron");
const { PATHS, APP_NAME } = require("../config/constants");
const path = require("path");

class TrayManager {
  constructor() {
    this.tray = null;
  }

  createTray() {
    let iconPath;

    // 尝试不同的图标路径
    if (global.app.isPackaged) {
      // 打包后的路径 - 修复路径问题
      const possiblePaths = [
        path.join(process.resourcesPath, "icon.png"),
        path.join(process.resourcesPath, "app.asar.unpacked", "icon.png"),
        path.join(__dirname, "../../../icon.png"),
        path.join(process.resourcesPath, "extraResources", "icon.png"),
      ];

      // 尝试找到存在的图标文件
      iconPath =
        possiblePaths.find((p) => {
          try {
            require("fs").accessSync(p);
            return true;
          } catch {
            return false;
          }
        }) || possiblePaths[0];
    } else {
      // 开发环境路径
      iconPath = path.join(__dirname, "../../icon.png");
    }

    try {
      this.tray = new Tray(iconPath);
      console.log("成功加载图标:", iconPath);
    } catch (error) {
      console.log("主图标加载失败，尝试备用图标:", error.message);

      // 尝试备用路径
      const backupPaths = [
        path.join(__dirname, "../../icon.icns"),
        path.join(__dirname, "../../icon.png"),
        // 使用系统默认图标作为最后备用
      ];

      for (const backup of backupPaths) {
        try {
          this.tray = new Tray(backup);
          console.log("使用备用图标:", backup);
          break;
        } catch (e) {
          console.log("备用图标也失败:", backup, e.message);
        }
      }

      // 如果所有图标都失败，创建一个空的图标
      if (!this.tray) {
        const emptyImage = nativeImage.createEmpty();
        this.tray = new Tray(emptyImage);
        console.log("使用空图标作为托盘图标");
      }
    }

    this.updateContextMenu();

    // 点击托盘图标显示/隐藏主窗口
    this.tray.on("click", (event, bounds) => {
      console.log("托盘图标被点击");

      // 在macOS上，有时候需要延迟一下再执行
      setTimeout(() => {
        global.windowManager.toggleMainWindow();
      }, 50);
    });

    // macOS 上的右键点击（有些情况下会更可靠）
    this.tray.on("right-click", () => {
      console.log("托盘图标右键点击");
      this.tray.popUpContextMenu();
    });
  }

  updateContextMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示主窗口",
        click: () => {
          console.log("通过菜单显示主窗口");
          global.windowManager.showMainWindow();
        },
      },
      {
        label: "隐藏主窗口",
        click: () => {
          console.log("通过菜单隐藏主窗口");
          global.windowManager.hideMainWindow();
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          global.app.isQuitting = true;
          global.app.quit();
        },
      },
    ]);

    this.tray.setToolTip(APP_NAME);
    this.tray.setContextMenu(contextMenu);
  }
}

module.exports = new TrayManager();
