const fs = require('fs');
const path = require('path');
const { logInfo, logSuccess, logError, logText} = require('./logger');
const { updateLocalStateFile, updateServerState, updateTempState, calculateHash } = require('./state')
const {getRootPath, getLocalStatePath, getServerStatePath, getTempStatePath, getServerDir} = require("./paths");
const { jumpToRoot, safeFtpOperation } = require("./ftp")
const {getArgs} = require("./store");

const normalizePath = (path) => path.replace(/\/+/g, '/').replace(/^\.\//, '/');

const processWithFlush = async (client, toUpload) => {
  let operationCount = 0;
  const flushThreshold = 5; // Počet operací před flush

  // Zpracování složek
  for (const folder of toUpload.folders) {
    const folderPath = normalizePath(folder.remote)

    try {
      logInfo(`📁 Creating folder: ${folderPath}`);
      await safeFtpOperation(client, async (ftpClient) => {
        await ftpClient.ensureDir(folderPath);
      });
      logInfo(`📁 Folder created: ${folderPath}`);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to create folder "${folderPath}": ${error.message}`);
    }
  }

  // Zpracování souborů
  for (const file of toUpload.files) {
    const filePath = normalizePath(file.remote)

    try {
      logInfo(`📄 Uploading file: ${file.local} to ${filePath}`);
      await safeFtpOperation(client, async (ftpClient) => {
        await ftpClient.uploadFrom(file.local, filePath);
      });
      logInfo(`📄 File uploaded: ${filePath}`);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to upload file "${filePath}": ${error.message}`);
    }
  }

  // Final flush
  logInfo('📂 Finalizing: Uploading state file to server...');
  await updateServerState(client, getTempStatePath());
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


module.exports = { processWithFlush, getLocalStatePath, getServerStatePath };