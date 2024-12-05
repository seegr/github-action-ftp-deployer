const fs = require('fs');
const path = require('path');
const { logInfo, logError, logWarning} = require('./logger');
const crypto = require("crypto");
const { safeFtpOperation, jumpToRoot } = require('./ftp')
const {getRootPath, getServerPath, getLocalStatePath, getServerStatePath, getTempStatePath} = require("./paths");
const {getArgs} = require("./store");

const tempState = {
  description: "Temporary state for in-progress sync",
  version: "1.0.0",
  generatedTime: new Date().getTime(),
  data: [],
};

async function updateTempState(item) {
  tempState.data.push(item);
  tempState.generatedTime = new Date().getTime();

  const tempStatePath = getTempStatePath();
  const tempStateContent = JSON.stringify(tempState, null, 4)

  logInfo(`tempStatePath: ${tempStatePath}`)
  logInfo(`tempStateContent: ${tempStateContent}`)
  fs.writeFileSync(tempStatePath, tempStateContent, 'utf8');
}

function loadOrCreateStateFile(args) {
  const statePath = path.join(args.localDir, args.stateName);

  logInfo('befe')
  if (fs.existsSync(statePath)) {
    logInfo(`State file "${args.stateName}" found locally. Loading...`);
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } else {
    logInfo(`State file "${args.stateName}" not found locally. Creating a new one.`);

    return {
      description: 'Deployment state file',
      version: '1.0.0',
      generatedTime: new Date().getTime(),
      data: [],
    };
  }
}

const calculateHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
};

const updateLocalStateFile = (stateFilePath, toUpload) => {
  let state = {
    description: "State for tracking uploaded files and folders",
    version: "1.0.0",
    generatedTime: Date.now(),
    data: [],
  };

  if (fs.existsSync(stateFilePath)) {
    const existingState = fs.readFileSync(stateFilePath, 'utf-8');
    state = JSON.parse(existingState);
  }

  for (const folder of toUpload.folders) {
    if (!state.data.some((item) => item.type === 'folder' && item.name === folder)) {
      state.data.push({ type: 'folder', name: folder });
    }
  }

  for (const file of toUpload.files) {
    const hash = calculateHash(file.local);
    const existingFileIndex = state.data.findIndex(
      (item) => item.type === 'file' && item.name === file.remote
    );

    if (existingFileIndex !== -1) {
      if (state.data[existingFileIndex].hash !== hash) {
        state.data[existingFileIndex].hash = hash;
      }
    } else {
      state.data.push({
        type: 'file',
        name: file.remote,
        hash,
      });
    }
  }

  // Write updated state to file
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
  console.log(`State file updated: ${stateFilePath}`);
};

function saveStateFile(state, args) {
  const statePath = path.join(args.localDir, args.stateName);
  logInfo(`statePath: ${statePath}`)

  fs.writeFileSync(statePath, JSON.stringify(state, null, 4), 'utf8');

  logInfo(`State file "${args.stateName}" saved locally.`);
}

const updateServerState = async (client, localStatePath) => {
  const serverStatePath = getServerStatePath()
  const serverDir = getServerPath()
  const remotePath = `/${path.join(serverDir, serverStatePath)}`;

  try {
    await jumpToRoot(client);
    logInfo(`Uploading state file to server: ${localStatePath} -> ${remotePath}`);

    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.uploadFrom(localStatePath, serverStatePath);
    });
    logInfo('State file successfully uploaded to server.');
  } catch (error) {
    logError(`Failed to upload state file: ${error.message}`, error);
  }
};

const initUploadsFromStates = async (client) => {
  const args = getArgs()
  const tempStatePath = getTempStatePath();
  let serverState = { data: [] };
  let localState = { data: [] };

  // Načtení serverového state
  try {
    const serverStatePath = getServerStatePath();
    logInfo(`Downloading server state from: ${serverStatePath}`);
    await safeFtpOperation(client, async (ftpClient) => {
      await ftpClient.downloadTo(tempStatePath, serverStatePath);
    });
    logInfo('Server state downloaded successfully.');

    serverState = JSON.parse(fs.readFileSync(tempStatePath, 'utf8'));
  } catch (error) {
    logWarning(`Server state not found or unreadable. Initializing empty server state.`);
  }

  // Načtení lokálního state
  try {
    const localStatePath = getLocalStatePath();
    logInfo(`Loading local state from: ${localStatePath}`);
    localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
  } catch (error) {
    logWarning(`Local state not found or unreadable. Initializing empty local state.`);
  }

  // Porovnání a příprava `toUpload`
  const toUpload = {
    folders: [],
    files: []
  };

  const serverPaths = new Set(serverState.data.map((item) => item.name));
  const localPaths = localState.data;

  const rootPath = process.cwd(); // Kořenová cesta projektu

  // Přidání složek k uploadu
  localPaths.filter((item) => item.type === 'folder').forEach((folder) => {
    if (!serverPaths.has(folder.name)) {
      toUpload.folders.push(folder.name); // Používáme relativní cestu ze state
    }
  });

  // Přidání souborů k uploadu
  localPaths.filter((item) => item.type === 'file').forEach((file) => {
    const serverFile = serverState.data.find((sItem) => sItem.name === file.name);
    if (!serverFile || serverFile.hash !== file.hash) {
      let serverPath = args.serverDir
      if (serverPath.startsWith('./')) {
        serverPath = serverPath.replace('./', '/');
      }
      let remotePath = file.name;
      remotePath = remotePath.replace(serverPath, '');

      logInfo(`relativePath: ${remotePath}`)
      const localPath = path.join(rootPath, args.localDir, remotePath);
      logInfo(`localPath: ${localPath}`)

      toUpload.files.push({ local: path.resolve(localPath), remote: file.name });
    }
  });

  logInfo(`Prepared toUpload:`, JSON.stringify(toUpload, null, 2));

  // Uložení dočasného state pro pozdější aktualizace
  tempState.data = [];
  fs.writeFileSync(tempStatePath, JSON.stringify(tempState, null, 4), 'utf8');

  return toUpload;
};

module.exports = { updateLocalStateFile, updateServerState, updateTempState, calculateHash, initUploadsFromStates };