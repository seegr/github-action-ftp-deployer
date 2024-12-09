const fs = require('fs');
const path = require('path');
const minimatch = require('minimatch')
const { logInfo, logError, logWarning, logSuccess, logText, logAlert} = require('./logger');
const crypto = require("crypto");
const { safeFtpOperation, jumpToRoot } = require('./ftp')
const {getRootPath, getLocalDir, getServerDir, getLocalStatePath, getServerStatePath, getTempStatePath} = require("./paths");
const {getArgs} = require("./store");
const { jsonToConsole, normalizePath, getServerFullPath} = require("./utils")

const tempState = {
  description: "Temporary state for in-progress sync",
  version: "1.0.0",
  generatedTime: new Date().getTime(),
  data: [],
};

const isExcluded = (filePath, excludePatterns) => {
  const normalizedPath = normalizePath(filePath);
  return excludePatterns.some((pattern) =>
    minimatch(normalizedPath, pattern) || minimatch(normalizedPath + '/', pattern)
  );
};

const prepareExcludePatterns = (excludeArg) => {
  return excludeArg
    ? excludeArg
      .split('\n')
      .map((line) => line.trim())
      .filter((pattern) => pattern.length > 0)
    : [];
};

async function updateTempState(item) {
  tempState.data.push(item);
  tempState.generatedTime = new Date().getTime();

  const tempStatePath = getTempStatePath();
  const tempStateContent = JSON.stringify(tempState, null, 4)

  fs.writeFileSync(tempStatePath, tempStateContent, 'utf8');
}


async function remoteTempStataFromLocal(item) {
  const tempStatePath = getTempStatePath();

  if (fs.existsSync(tempStatePath)) {
    try {
      logInfo(`Removing old temp state file: ${tempStatePath}`);
      await fs.promises.unlink(tempStatePath);
      logInfo('Old temp state file removed.');
    } catch (err) {
      logAlert(`Error removing old state: ${err.message}`);
    }
  }
}

const calculateHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  hash.update(filePath);

  return hash.digest('hex');
};

const updateState = async (client, localStatePath) => {
  const serverStatePath = getServerStatePath()

  try {
    await jumpToRoot(client);
    logText(`Updating state file on server`);

    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.uploadFrom(localStatePath, serverStatePath);
    });
    logSuccess('State file successfully uploaded to server.');
  } catch (error) {
    logError(`Failed to upload state file: ${error.message}`, error);
  }
};

const scanLocalDir = () => {
  const args = getArgs();
  const localDir = `${getRootPath()}/${args.localDir}`;
  const serverDir = args.serverDir;

  const foldersToCreate = [];
  const filesToUpload = [];
  const excludePatterns = prepareExcludePatterns(args.exclude);

  const scanDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const id = entry.name;
      const fullPath = path.join(dir, entry.name);
      const relativePath = normalizePath(path.relative(localDir, fullPath));

      if (entry.name === args.stateName) {
        continue;
      }

      // Kontrola na exclude
      if (isExcluded(relativePath, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        foldersToCreate.push({
          id,
          path: relativePath
        });

        try {
          scanDir(fullPath, serverDir); // Rekurzivní zpracování
        } catch (error) {
          logError(`Failed to scan directory "${fullPath}": ${error.message}`, error);
        }
      } else {
        filesToUpload.push({
          id,
          path: relativePath
        });
      }
    }
  };

  scanDir(localDir);

  return {
    folders: foldersToCreate,
    files: filesToUpload
  };
};

async function setLocalState() {
  const localContent = scanLocalDir();
  const stateFilePath = getLocalStatePath();
  // logInfo(`localContent: ${jsonToConsole(localContent)}`)

  if (fs.existsSync(stateFilePath)) {
    try {
      logInfo(`Removing old state file: ${stateFilePath}`);
      await fs.promises.unlink(stateFilePath);
      logInfo('Old state file removed.');
    } catch (err) {
      logAlert(`Error removing old state: ${err.message}`);
    }
  }

  let state = {
    description: "State for tracking uploaded files and folders",
    version: "1.0.0",
    generatedTime: Date.now(),
    data: [],
  };

  for (const folder of localContent.folders) {
    // logInfo(`folderRemote: ${folder.path}`)
    if (!state.data.some((item) => item.type === 'folder' && item.name === folder.path)) {

      state.data.push({
        type: 'folder',
        path: normalizePath(folder.path)
      });
    }
  }

  for (const file of localContent.files) {
    const fullPath = getServerFullPath(file.path)
    const hash = calculateHash(fullPath);
    const existingFileIndex = state.data.findIndex(
      (item) => item.type === 'file' && item.name === file.path
    );

    if (existingFileIndex !== -1) {
      if (state.data[existingFileIndex].hash !== hash) {
        state.data[existingFileIndex].hash = hash;
      }
    } else {
      state.data.push({
        type: 'file',
        path: normalizePath(file.path),
        hash,
      });
    }
  }

  // Write updated state to file
  logInfo('Saving local state')
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
  logInfo('Local state saved')
}

const initUploadsFromStates = async (client) => {
  const tempStatePath = getTempStatePath();
  let serverState = { data: [] };

  // Načtení serverového state
  try {
    const serverStatePath = getServerStatePath();
    logText(`Downloading server state from: ${serverStatePath}`);

    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.downloadTo(tempStatePath, serverStatePath);
    });

    logSuccess('Server state downloaded successfully.');
    serverState = JSON.parse(fs.readFileSync(tempStatePath, 'utf8'));
  } catch (error) {
    logText(`Server state not found or unreadable. Initializing empty server state.`);
  }

  // Načtení lokálního state
  const localStatePath = getLocalStatePath();
  logText(`Loading local state from: ${localStatePath}`);
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));

  const toUpload = {
    folders: [],
    files: []
  };

  // logInfo(`serverState: ${jsonToConsole(serverState)}`)

  const serverPaths = new Set(serverState.data.map((item) => normalizePath(item.path)));
  const localPaths = localState.data;
  logInfo(`serverPaths: ${jsonToConsole(Array.from(serverPaths))}`);

  localPaths.filter((item) => item.type === 'folder').forEach((folder) => {
    // logInfo(`folder: ${folder.path}`)
    if (!serverPaths.has(folder.path)) {
      toUpload.folders.push(folder);
    }
  });

  localPaths.filter((item) => item.type === 'file').forEach((file) => {
    // logInfo(`file: ${file.path}`)
    const serverFile = serverState.data.find((sItem) => sItem.path === file.path);
    if (!serverFile || serverFile.hash !== file.hash) {
      toUpload.files.push(file);
    }
  });

  // Uložení dočasného state pro pozdější aktualizace
  const tempState = { ...serverState };
  fs.writeFileSync(getTempStatePath(), JSON.stringify(tempState, null, 4), 'utf8');

  return toUpload;
};

module.exports = { setLocalState, updateState, updateTempState, calculateHash, initUploadsFromStates };