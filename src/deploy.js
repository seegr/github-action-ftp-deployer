const fs = require('fs');
const path = require('path');
const { logInfo, logSuccess, logError, logText} = require('./logger');
const { updateLocalStateFile, updateServerState, updateTempState, calculateHash } = require('./state')
const {getRootPath, getLocalStatePath, getServerStatePath, getTempStatePath, getServerDir} = require("./paths");
const { jumpToRoot } = require("./ftp")
const {getArgs} = require("./store");

const processWithFlush = async (client, toUpload) => {
  let operationCount = 0;
  const flushThreshold = 5;

  for (const folder of toUpload.folders) {
    try {
      logInfo(`Creating folder: ${folder.remote}`);
      await client.ensureDir(folder.remote);
      logSuccess(`Folder created: ${folder.remote}`);
      await updateTempState(folder);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
      // await delay(3000)
    } catch (error) {
      logError(`Failed to create folder "${folder}": ${error.message}`, error);
    }
  }

  for (const file of toUpload.files) {
    try {
      logText(`Uploading file: ${file.local} to ${file.remote}`);
      await client.uploadFrom(file.local, file.remote);
      logSuccess(`File uploaded: ${file.remote}`);

      await updateTempState(file);
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
      // await delay(3000)
    } catch (error) {
      logError(`Failed to upload file "${file.local}": ${error.message}`, error);
    }
  }

  logText('Finalizing: Uploading state file to server...');
  await updateServerState(client, getLocalStatePath());
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


module.exports = { processWithFlush, getLocalStatePath, getServerStatePath };