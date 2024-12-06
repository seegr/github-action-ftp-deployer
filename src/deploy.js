const fs = require('fs');
const path = require('path');
const { logInfo, logSuccess, logError, logText} = require('./logger');
const { updateLocalStateFile, updateServerState, updateTempState, calculateHash } = require('./state')
const {getRootPath, getLocalStatePath, getServerStatePath, getTempStatePath, getServerDir} = require("./paths");
const { jumpToRoot, safeFtpOperation } = require("./ftp")
const {getArgs} = require("./store");

const processWithFlush = async (client, toUpload) => {
  let operationCount = 0;
  const flushThreshold = 5; // Počet operací před flush

  // Zpracování složek
  for (const folder of toUpload.folders) {
    try {
      logInfo(`📁 Creating folder: ${folder.remote}`);
      await safeFtpOperation(client, async (ftpClient) => {
        await ftpClient.ensureDir(folder.remote);
      });
      logInfo(`📁 Folder created: ${folder.remote}`);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to create folder "${folder}": ${error.message}`);
    }
  }

  // Zpracování souborů
  for (const file of toUpload.files) {
    try {
      logInfo(`📄 Uploading file: ${file.local} to ${file.remote}`);
      await safeFtpOperation(client, async (ftpClient) => {
        await ftpClient.uploadFrom(file.local, file.remote);
      });
      logInfo(`📄 File uploaded: ${file.remote}`);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to upload file "${file.local}": ${error.message}`);
    }
  }

  // Final flush
  logInfo('📂 Finalizing: Uploading state file to server...');
  await updateServerState(client, getTempStatePath());
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


module.exports = { processWithFlush, getLocalStatePath, getServerStatePath };