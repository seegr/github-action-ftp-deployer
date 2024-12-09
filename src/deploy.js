const fs = require('fs');
const path = require('path');
const { logInfo, logSuccess, logError, logText} = require('./logger');
const { updateLocalStateFile, updateState, updateTempState, calculateHash } = require('./state')
const { jumpToRoot, safeFtpOperation } = require("./ftp")
const {getArgs} = require("./store");
const { normalizePath, getRootPath, getLocalStatePath, getServerStatePath, getTempStatePath, getServerDir, getLocalDir } = require("./utils");


const processWithFlush = async (client, toUpload) => {
  let operationCount = 0;
  const flushThreshold = 5;
  const retryLimit = 3;

  const failedFolders = [];
  const failedFiles = [];

  const retryOperation = async (operationList, operationFn, type) => {
    for (let attempt = 1; attempt <= retryLimit; attempt++) {
      if (operationList.length === 0) break;

      logInfo(`🔄 Retrying failed ${type} operations (attempt ${attempt}/${retryLimit})...`);

      const pending = [...operationList];
      operationList.length = 0;

      for (const item of pending) {
        try {
          await operationFn(item);
          logSuccess(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} successfully handled: ${item.path}`);
        } catch (error) {
          logError(`Failed to handle ${type} "${item.path}" on attempt ${attempt}: ${error.message}`);
          operationList.push(item);
        }
      }
    }
  };

  const createFolder = async (folder) => {
    logText(`📁 Creating folder: ${folder.path}`);

    await safeFtpOperation(client, async (ftpClient) => {
      await jumpToRoot(client);
      await ftpClient.ensureDir(`${folder.path}`);
    });

    await updateTempState(folder);

    logSuccess(`📁 Folder created: ${folder.path}`);

    operationCount++;
    if (operationCount % flushThreshold === 0) {
      await updateState(client, getTempStatePath());
    }
  };

  const uploadFile = async (file) => {
    const localPath = path.join(getRootPath(), getLocalDir(), file.path);
    const remotePath = normalizePath(`${getServerDir()}/${file.path}`)
    logInfo(`📄 Uploading file: ${localPath}`);
    // logInfo(`📄 Uploading file: ${localPath} -> ${remotePath}`);

    await safeFtpOperation(client, async (ftpClient) => {
      await jumpToRoot(client);
      await ftpClient.uploadFrom(localPath, `/${remotePath}`);
    });

    await updateTempState(file);
    logSuccess(`📄 File uploaded: ${file.path}`);

    operationCount++;
    if (operationCount % flushThreshold === 0) {
      await updateState(client, getTempStatePath());
    }
  };

  // Zpracování složek
  for (const folder of toUpload.folders) {
    try {
      await createFolder(folder);
    } catch (error) {
      logError(`Failed to create folder "${folder.path}": ${error.message}`);
      failedFolders.push(folder); // Přidat do seznamu neúspěšných
    }
  }

  // Opakování neúspěšných složek
  await retryOperation(failedFolders, createFolder, "folder");

  // // Zpracování souborů
  for (const file of toUpload.files) {
    try {
      await uploadFile(file);
    } catch (error) {
      logError(`Failed to upload file "${file.path}": ${error.message}`);
      failedFiles.push(file); // Přidat do seznamu neúspěšných
    }
  }

  // Opakování neúspěšných souborů
  await retryOperation(failedFiles, uploadFile, "file");

  // Final flush
  logInfo('📂 Finalizing: Uploading state file to server...');
  await updateState(client, getLocalStatePath());
};


module.exports = { processWithFlush, getLocalStatePath, getServerStatePath };