const { Tray, Menu } = require("electron");
const { PATHS, APP_NAME } = require("../config/constants");

class TrayManager {
  constructor() {
    this.tray = null;
  }

  createTray() {
    this.tray = new Tray(PATHS.ICON_PATH);
    this.updateContextMenu();

    // 点击托盘图标显示/隐藏主窗口
    this.tray.on("click", () => {
      global.windowManager.toggleMainWindow();
    });
  }

  updateContextMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示主窗口",
        click: () => {
          global.windowManager.showMainWindow();
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
