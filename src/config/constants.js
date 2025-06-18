const path = require("path");
const { app } = require("electron");

module.exports = {
  // 应用配置
  APP_NAME: "图片粘贴工具",

  // 窗口配置
  WINDOW_CONFIG: {
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  },

  // 文件路径
  PATHS: {
    HISTORY_FILE: path.join(app.getPath("userData"), "history.json"),
    ICON_PATH: path.join(__dirname, "../../icon.png"),
  },

  // 快捷键
  SHORTCUTS: {
    PASTE: "Shift+V",
    DEV_TOOLS: "F12",
    CLOSE: "Escape",
  },

  // 存储配置
  STORAGE: {
    MIN_AVAILABLE_SPACE: 1, // 最小可用空间（GB）
    WARNING_THRESHOLD: 2, // 空间警告阈值（GB）
  },
};
