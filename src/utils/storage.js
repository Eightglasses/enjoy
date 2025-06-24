const fs = require("fs");
const crypto = require("crypto");
const { PATHS, STORAGE } = require("../config/constants");
const { app, BrowserWindow } = require("electron");
const path = require("path");
const Tesseract = require("tesseract.js");

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
    return 0;
  }
}

// 加载历史记录
function loadHistory() {
  try {
    if (fs.existsSync(PATHS.HISTORY_FILE)) {
      const data = fs.readFileSync(PATHS.HISTORY_FILE, "utf8");
      const history = JSON.parse(data);

      return history;
    }
  } catch (error) {}
  return [];
}

// 保存历史记录
function saveHistory(historyData) {
  try {
    const data = JSON.stringify(historyData, null, 2);
    fs.writeFileSync(PATHS.HISTORY_FILE, data);
    const fileSize = data.length;

    return fileSize;
  } catch (error) {
    return 0;
  }
}

// 检查图片是否已存在
function isImageExists(imageData, historyData) {
  const hash = getImageHash(imageData);
  return historyData.some((item) => getImageHash(item.imageData) === hash);
}

// 在后台执行OCR并更新记录
async function _runOcrAndUpdate(record) {
  try {
    const result = await Tesseract.recognize(record.imageData, "chi_sim", {
      logger: (m) => {}, // 静默日志
    });
    record.ocrText = result.data.text;

    // OCR完成后，再次保存并通知前端更新，以确保内容可搜索
    saveHistory(global.historyData);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send("history-updated", global.historyData);
    }
  } catch (error) {
    // OCR失败是次要任务，不应打断用户，所以这里只记录错误，不抛出
  }
}

// 添加历史记录
function addToHistory(imageData, historyData) {
  // 检查图片是否已存在
  if (isImageExists(imageData, historyData)) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const newRecord = {
    imageData,
    timestamp,
    id: Date.now().toString(),
    isFavorite: false,
    tags: [],
    ocrText: "", // 初始OCR文本为空
  };

  // 检查存储空间
  const availableSpace = getAvailableStorage();
  if (availableSpace < STORAGE.MIN_AVAILABLE_SPACE) {
    return null;
  }

  // 将新的记录添加到开头
  historyData.unshift(newRecord);
  saveHistory(historyData); // 立即保存，提供即时反馈

  // 在后台异步执行OCR，不阻塞主流程
  _runOcrAndUpdate(newRecord);

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

// 切换收藏状态
function toggleFavoriteStatus(id, historyData) {
  const item = historyData.find((item) => item.id === id);
  if (item) {
    item.isFavorite = !item.isFavorite;
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
  toggleFavoriteStatus,
};
