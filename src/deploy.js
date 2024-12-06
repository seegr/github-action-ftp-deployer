const fs = require('fs');
const path = require('path');
const { logInfo, logSuccess, logError, logText} = require('./logger');
const { updateLocalStateFile, updateServerState, updateTempState, calculateHash } = require('./state')
const {getRootPath, getLocalStatePath, getServerStatePath, getTempStatePath, getServerDir, getLocalDir} = require("./paths");
const { jumpToRoot, safeFtpOperation } = require("./ftp")
const {getArgs} = require("./store");
const { normalizePath } = require("./utils");


const processWithFlush = async (client, toUpload) => {
  let operationCount = 0;
  const flushThreshold = 5; // Počet operací před flush

  // Zpracování složek
  for (const folder of toUpload.folders) {
    try {
      logInfo(`📁 Creating folder: ${folder.id}`);
      await safeFtpOperation(client, async (ftpClient) => {
        await ftpClient.ensureDir(folder.remote);
      });
      await updateTempState(folder)
      logInfo(`📁 Folder created: ${folder.id}`);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to create folder "${folder.id}": ${error.message}`);
    }
  }

  // Zpracování souborů
  for (const file of toUpload.files) {
    const localPath = `${getRootPath()}/${file.id}`

    try {
      logInfo(`📄 Uploading file: ${localPath} -> ${file.id}`);
      await safeFtpOperation(client, async (ftpClient) => {
        await ftpClient.uploadFrom(localPath, `/${file.remote}`);
      });
      await updateTempState(file)
      logInfo(`📄 File uploaded: ${file.id}`);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to upload file "${localPath}": ${error.message}`);
    }
  }

  // Final flush
  logInfo('📂 Finalizing: Uploading state file to server...');
  await updateServerState(client, getLocalStatePath());
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


module.exports = { processWithFlush, getLocalStatePath, getServerStatePath };