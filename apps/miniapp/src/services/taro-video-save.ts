import Taro from '@tarojs/taro';
import type { SavedMedia, SavedMediaIO } from './saved-media';

export function savedMediaIO(userId: string): SavedMediaIO {
  const key = `wb_v2_saved_media:${userId}`;
  const fs = Taro.getFileSystemManager();
  return {
    read: () => {
      const rows: unknown = Taro.getStorageSync(key);
      return Array.isArray(rows) ? rows.filter((row): row is SavedMedia => !!row && typeof row.assetId === 'string' && typeof row.sha256 === 'string' && typeof row.filePath === 'string' && typeof row.size === 'number' && typeof row.md5 === 'string') : [];
    },
    write: rows => Taro.setStorageSync(key, rows),
    info: filePath => new Promise((resolve, reject) => fs.getFileInfo({ filePath, digestAlgorithm: 'md5', success: resolve, fail: reject })),
    download: url => Taro.downloadFile({ url }),
    persist: tempFilePath => new Promise((resolve, reject) => fs.saveFile({ tempFilePath, success: result => resolve(result.savedFilePath), fail: reject })),
    remove: filePath => new Promise((resolve, reject) => fs.removeSavedFile({ filePath, success: () => resolve(), fail: reject })),
  };
}
