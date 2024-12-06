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
  const flushThreshold = 5;
  const retryLimit = 3;

  const failedFolders = [];
  const failedFiles = [];

  const retryOperation = async (operationList, operationFn, type) => {
    for (let attempt = 1; attempt <= retryLimit; attempt++) {
      if (operationList.length === 0) break; // Pokud nic nezbylo, ukonči

      logInfo(`🔄 Retrying failed ${type} operations (attempt ${attempt}/${retryLimit})...`);

      const pending = [...operationList]; // Kopie seznamu, který iterujeme
      operationList.length = 0; // Vyprázdní seznam pro další pokusy

      for (const item of pending) {
        try {
          await operationFn(item); // Zavolej funkci pro vytvoření/odeslání
          logSuccess(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} successfully handled: ${item.id}`);
        } catch (error) {
          logError(`Failed to handle ${type} "${item.id}" on attempt ${attempt}: ${error.message}`);
          operationList.push(item); // Přidej zpět k neúspěšným
        }
      }
    }
  };

  const createFolder = async (folder) => {
    logText(`📁 Creating folder: ${folder.id}`);
    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.ensureDir(folder.remote);
    });
    await updateTempState(folder);
    logSuccess(`📁 Folder created: ${folder.id}`);
    operationCount++;
    if (operationCount % flushThreshold === 0) {
      await updateServerState(client, getTempStatePath());
    }
  };

  const uploadFile = async (file) => {
    const localPath = `${getRootPath()}/${file.id}`;
    logInfo(`📄 Uploading file: ${localPath} -> ${file.id}`);
    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.uploadFrom(localPath, `/${file.remote}`);
    });
    await updateTempState(file);
    logSuccess(`📄 File uploaded: ${file.id}`);
    operationCount++;
    if (operationCount % flushThreshold === 0) {
      await updateServerState(client, getTempStatePath());
    }
  };

  // Zpracování složek
  for (const folder of toUpload.folders) {
    try {
      await createFolder(folder);
    } catch (error) {
      logError(`Failed to create folder "${folder.id}": ${error.message}`);
      failedFolders.push(folder); // Přidat do seznamu neúspěšných
    }
  }

  // Opakování neúspěšných složek
  await retryOperation(failedFolders, createFolder, "folder");

  // Zpracování souborů
  for (const file of toUpload.files) {
    try {
      await uploadFile(file);
    } catch (error) {
      logError(`Failed to upload file "${file.id}": ${error.message}`);
      failedFiles.push(file); // Přidat do seznamu neúspěšných
    }
  }

  // Opakování neúspěšných souborů
  await retryOperation(failedFiles, uploadFile, "file");

  // Final flush
  logInfo('📂 Finalizing: Uploading state file to server...');
  await updateServerState(client, getLocalStatePath());
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


module.exports = { processWithFlush, getLocalStatePath, getServerStatePath };