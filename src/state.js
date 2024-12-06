const fs = require('fs');
const path = require('path');
const minimatch = require('minimatch')
const { logInfo, logError, logWarning, logSuccess, logText, logAlert} = require('./logger');
const crypto = require("crypto");
const { safeFtpOperation, jumpToRoot } = require('./ftp')
const {getRootPath, getLocalDir, getServerDir, getLocalStatePath, getServerStatePath, getTempStatePath} = require("./paths");
const {getArgs} = require("./store");
const { jsonToConsole, normalizePath } = require("./utils")

const tempState = {
  description: "Temporary state for in-progress sync",
  version: "1.0.0",
  generatedTime: new Date().getTime(),
  data: [],
};

const isExcluded = (filePath, excludePatterns) => {
  logText(`is exclude? filePath: ${filePath} patterns: ${excludePatterns}`)
  const normalizedPath = normalizePath(filePath);
  const result = excludePatterns.some((pattern) =>
    minimatch(normalizedPath, pattern) || minimatch(normalizedPath + '/', pattern)
  );

  logInfo(`result: ${result}`)

  return result;
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

const updateServerState = async (client, localStatePath) => {
  const serverStatePath = getServerStatePath()
  const serverDir = getServerDir()
  const remotePath = `${path.join(serverDir, serverStatePath)}`;

  try {
    await jumpToRoot(client);
    logInfo(`Updating state file on server`);

    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.uploadFrom(localStatePath, serverStatePath);
    });
    logSuccess('State file successfully uploaded to server.');
  } catch (error) {
    logError(`Failed to upload state file: ${error.message}`, error);
  }
};

const scanLocalDir = () => {
  const args = getArgs()
  const localDir = `${getRootPath()}/${args.localDir}`
  const serverDir = args.serverDir

  const foldersToCreate = []
  const filesToUpload = []

  const scanDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const id = entry.name
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(localDir, fullPath);
      const remotePath = normalizePath(`${path.join(relativePath)}`)

      if (entry.name === args.stateName) {
        continue;
      }

      if (entry.isDirectory()) {
        foldersToCreate.push({
          id,
          remote: remotePath
        });

        try {
          scanDir(fullPath, serverDir);
        } catch (error) {
          logError(`Failed to scan directory "${fullPath}": ${error.message}`, error);
        }
      } else {
        filesToUpload.push({
          id,
          local: `${fullPath}`,
          remote: remotePath
        });
      }
    }
  };

  scanDir(localDir)

  return {
    folders: foldersToCreate,
    files: filesToUpload
  }
}

const getIdFromRemotePath = (remotePath) => {
  let serverDir = getServerDir()
  serverDir = serverDir.startsWith('./') ? serverDir.replace('./', '') : serverDir
  remotePath = remotePath.replace(serverDir, '')
  remotePath = remotePath.replace(/^\/+/, '');

  return normalizePath(`${getLocalDir()}/${remotePath}`)
}

async function setLocalState() {
  const args = getArgs()
  const localContent = scanLocalDir();
  const stateFilePath = getLocalStatePath();

  if (fs.existsSync(stateFilePath)) {
    try {
      logInfo(`Removing old state file: ${stateFilePath}`);
      await fs.promises.unlink(stateFilePath);
      logInfo('Old state file removed.');
    } catch (err) {
      logAlert(`Error removing old state: ${err.message}`);
    }
  }

  const localDir = getLocalDir();
  const serverDir = getServerDir();
  const rootPath = getRootPath();
  const remotePath = serverDir.startsWith('./') ? serverDir.replace('./', '/') : serverDir;

  let state = {
    description: "State for tracking uploaded files and folders",
    version: "1.0.0",
    generatedTime: Date.now(),
    data: [],
  };

  const excludePatterns = prepareExcludePatterns(args.exclude);

  const filteredFolders = localContent.folders.filter((folder) => {
    const excluded = isExcluded(folder.remote, excludePatterns);
    return !excluded;
  });

  const filteredFiles = localContent.files.filter((file) => {
    const excluded = isExcluded(file.remote, excludePatterns);
    return !excluded;
  });

  localContent.folders = filteredFolders;
  localContent.files = filteredFiles;

  for (const folder of localContent.folders) {
    if (!state.data.some((item) => item.type === 'folder' && item.name === folder.remote)) {
      const folderRemote = `${remotePath}/${folder.remote}`;

      state.data.push({
        type: 'folder',
        id: getIdFromRemotePath(folderRemote),
        remote: folderRemote,
      });
    }
  }

  for (const file of localContent.files) {
    const hash = calculateHash(file.local);
    const existingFileIndex = state.data.findIndex(
      (item) => item.type === 'file' && item.name === file.remote
    );


    if (existingFileIndex !== -1) {
      if (state.data[existingFileIndex].hash !== hash) {
        state.data[existingFileIndex].hash = hash;
      }
    } else {
      const fileRemote = normalizePath(`${remotePath}/${file.remote}`);
      state.data.push({
        type: 'file',
        id: getIdFromRemotePath(fileRemote),
        remote: fileRemote,
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
  logInfo('initUploadsFromStates...')
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

  // Porovnání a příprava `toUpload`
  const toUpload = {
    folders: [],
    files: []
  };

  // logInfo(`serverState: ${jsonToConsole(serverState)}`)

  const serverPaths = new Set(serverState.data.map((item) => item.remote));
  const localPaths = localState.data;

  // logInfo(`serverPaths: ${jsonToConsole(Array.from(serverPaths))}`);

  // Přidání složek k uploadu
  localPaths.filter((item) => item.type === 'folder').forEach((folder) => {
    // console.log(folder.remote)
    if (!serverPaths.has(folder.remote)) {
      toUpload.folders.push(folder);
    }
  });

  // Přidání souborů k uploadu
  localPaths.filter((item) => item.type === 'file').forEach((file) => {
    const serverFile = serverState.data.find((sItem) => sItem.id === file.id);
    if (!serverFile || serverFile.hash !== file.hash) {
      toUpload.files.push(file);
    }
  });

  // Uložení dočasného state pro pozdější aktualizace
  tempState.data = [];
  fs.writeFileSync(getTempStatePath(), JSON.stringify(tempState, null, 4), 'utf8');

  return toUpload;
};

module.exports = { setLocalState, updateServerState, updateTempState, calculateHash, initUploadsFromStates };