const fs = require('fs');
const path = require('path');
const { logInfo, logWarning, logError} = require('./logger');
const { updateLocalStateFile, updateServerState, updateTempState, calculateHash } = require('./state')
const {getRootPath, getLocalStatePath, getServerStatePath, getTempStatePath, getServerPath} = require("./paths");
const { jumpToRoot } = require("./ftp")


const scanLocalDir = (args) => {
  const localDir = `${getRootPath()}/${args.localDir}`
  const serverDir = args.serverDir

  const foldersToCreate = []
  const filesToUpload = []

  logInfo(`localDir: ${localDir}`)
  logInfo(`serverDir: ${serverDir}`)

  const scanDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(localDir, fullPath);
      const remotePath = `/${path.join(serverDir, relativePath)}`;

      if (entry.name === args.stateName) {
        console.log(`Skipping state file: ${entry.name}`);
        continue;
      }

      if (entry.isDirectory()) {
        foldersToCreate.push(remotePath);
        try {
          scanDir(fullPath, serverDir);
        } catch (error) {
          logError(`Failed to scan directory "${fullPath}": ${error.message}`, error);
        }
      } else {
        filesToUpload.push({ local: fullPath, remote: remotePath });
      }
    }
  };

  scanDir(localDir)

  return {
    folders: foldersToCreate,
    files: filesToUpload
  }
}

async function prepareUploads(client, args) {
  const rootDir = process.cwd()
  const localDir = args.localDir
  const ftpRootDir = await client.pwd()
  const serverDir = args.serverDir

  logInfo(`currentDir: ${rootDir}`)
  logInfo(`local-dir: ${localDir}`);
  logInfo(`server-dir: ${serverDir}`);
  logInfo(`ftpRootDir ${ftpRootDir}`)

  await client.ensureDir(serverDir);
  const toUpload = scanLocalDir(args)
  console.log(toUpload)

  const stateFilePath = getLocalStatePath(args)
  console.log(`stateFilePath: ${stateFilePath}`)
  updateLocalStateFile(stateFilePath, toUpload)

  return toUpload
}


const processWithFlush = async (client, toUpload) => {
  let operationCount = 0;
  const flushThreshold = 5;

  for (const folder of toUpload.folders) {
    try {
      logInfo(`Creating folder: ${folder}`);
      await client.ensureDir(folder);
      logInfo(`Folder created: ${folder}`);
      await updateTempState({ type: "folder", name: folder });
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to create folder "${folder}": ${error.message}`, error);
    }
  }

  for (const file of toUpload.files) {
    try {
      logInfo(`Uploading file: ${file.local} to ${file.remote}`);
      await client.uploadFrom(file.local, file.remote);
      logInfo(`File uploaded: ${file.remote}`);

      await updateTempState({
        type: "file",
        name: file.remote,
        size: fs.statSync(file.local).size,
        hash: calculateHash(file.local),
      });
      operationCount++;

      if (operationCount % flushThreshold === 0) {
        await updateServerState(client, getTempStatePath());
      }
    } catch (error) {
      logError(`Failed to upload file "${file.local}": ${error.message}`, error);
    }
  }

  logInfo('Finalizing: Uploading state file to server...');
  await updateServerState(client, getTempStatePath());
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


module.exports = { prepareUploads, processWithFlush, getLocalStatePath, getServerStatePath };