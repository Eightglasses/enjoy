const fs = require("fs");
const crypto = require("crypto");
const { PATHS, STORAGE } = require("../config/constants");
const { app } = require("electron");
const { BrowserWindow } = require("electron");
const path = require("path");

// 计算图片数据的哈希值
function getImageHash(imageData) {
  return crypto.createHash("md5").update(imageData).digest("hex");
}

// 获取可用存储空间（GB）
function getAvailableStorage() {
  try {
    const stats = fs.statfsSync(app.getPath("userData"));
    const availableGB = (stats.bfree * stats.bsize) / (1024 * 1024 * 1024);
    return availableGB.toFixed(2);
  } catch (error) {
    console.error("获取存储空间失败:", error);
    return "0.00";
  }
}

// 获取已用空间（MB）
function getUsedStorage() {
  try {
    const historyPath = path.join(app.getPath("userData"), "history.json");
    if (fs.existsSync(historyPath)) {
      const stats = fs.statSync(historyPath);
      const usedMB = stats.size / (1024 * 1024);
      return usedMB.toFixed(2);
    }
    return "0.00";
  } catch (error) {
    console.error("获取已用空间失败:", error);
    return "0.00";
  }
}

// 计算数据大小
function getDataSize(data) {
  const str = JSON.stringify(data);
  return str.length;
}

// 获取文件大小
function getFileSize(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return stats.size;
    }
    return 0;
  } catch (error) {
    console.error("获取文件大小失败:", error);
    return 0;
  }
}

// 加载历史记录
function loadHistory() {
  try {
    if (fs.existsSync(PATHS.HISTORY_FILE)) {
      const data = fs.readFileSync(PATHS.HISTORY_FILE, "utf8");
      const history = JSON.parse(data);
      console.log(
        "历史记录文件大小:",
        (getFileSize(PATHS.HISTORY_FILE) / 1024 / 1024).toFixed(2),
        "MB"
      );
      console.log("历史记录条数:", history.length);
      console.log("可用存储空间:", getAvailableStorage(), "GB");

      // 发送存储信息更新
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        const stats = fs.statSync(PATHS.HISTORY_FILE);
        const usedMB = (stats.size / (1024 * 1024)).toFixed(2);
        const availableGB = getAvailableStorage();

        mainWindow.webContents.send("storage-info-updated", {
          usedSize: usedMB + " MB",
          availableSize: availableGB + " GB",
          totalCount: history.length,
        });
      }

      return history;
    }
  } catch (error) {
    console.error("加载历史记录失败:", error);
  }
  return [];
}

// 保存历史记录
function saveHistory(historyData) {
  try {
    const data = JSON.stringify(historyData, null, 2);
    fs.writeFileSync(PATHS.HISTORY_FILE, data);
    const fileSize = data.length;
    console.log(
      "当前历史记录文件大小:",
      (fileSize / 1024 / 1024).toFixed(2),
      "MB"
    );
    console.log("历史记录条数:", historyData.length);
    console.log("可用存储空间:", getAvailableStorage(), "GB");

    // 发送存储信息更新
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      const stats = fs.statSync(PATHS.HISTORY_FILE);
      const usedMB = (stats.size / (1024 * 1024)).toFixed(2);
      const availableGB = getAvailableStorage();

      mainWindow.webContents.send("storage-info-updated", {
        usedSize: usedMB + " MB",
        availableSize: availableGB + " GB",
        totalCount: historyData.length,
      });
    }

    return fileSize;
  } catch (error) {
    console.error("保存历史记录失败:", error);
    return 0;
  }
}

// 检查图片是否已存在
function isImageExists(imageData, historyData) {
  const hash = getImageHash(imageData);
  return historyData.some((item) => getImageHash(item.imageData) === hash);
}

// 添加历史记录
function addToHistory(imageData, historyData) {
  // 检查图片是否已存在
  if (isImageExists(imageData, historyData)) {
    console.log("图片已存在，跳过保存");
    return null;
  }

  const timestamp = new Date().toISOString();
  const newRecord = { imageData, timestamp, id: Date.now().toString() };

  // 计算新记录的大小
  const newRecordSize = getDataSize(newRecord);
  console.log("新记录大小:", (newRecordSize / 1024 / 1024).toFixed(2), "MB");

  // 检查存储空间
  const availableSpace = getAvailableStorage();
  if (availableSpace < STORAGE.MIN_AVAILABLE_SPACE) {
    console.warn("存储空间不足，请清理历史记录");
    return null;
  }

  // 将新的记录添加到开头
  historyData.unshift(newRecord);
  saveHistory(historyData);
  return historyData;
}

// 删除单条历史记录
function deleteHistoryItem(id, historyData) {
  const index = historyData.findIndex((item) => item.id === id);
  if (index !== -1) {
    historyData.splice(index, 1);
    saveHistory(historyData);
    return historyData;
  }
  return null;
}

module.exports = {
  getImageHash,
  getAvailableStorage,
  getUsedStorage,
  getDataSize,
  getFileSize,
  loadHistory,
  saveHistory,
  isImageExists,
  addToHistory,
  deleteHistoryItem,
};
