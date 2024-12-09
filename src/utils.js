const {logInfo} = require("./logger");
const path = require('path');
const { getArgs } = require('./store');
const jsonToConsole = (json) => {
  return JSON.stringify(json, null, 2)
}

const normalizePath = (filePath) => {
  return filePath
    .replace(/^[*\/]+/, '')         // Odstraní všechny * a / na začátku
    .replace(/\/+/g, '/')           // Nahradí více lomítek za jedno
    .replace(/^(\.\/|\.{2}\/)+/, ''); // Odstraní ./ nebo ../ na začátku
};

const getServerFullPath = (filePath) => {
  return path.join(getRootPath(), getLocalDir(), filePath);
}

const getRootPath = () => process.cwd()

const getLocalStatePath = () => {
  const args = getArgs()

  return `/${getRootPath()}/${args.localDir}/${args.stateName}`
}

const getServerDir = () => {
  const args = getArgs();
  let serverDir = args.serverDir;

  if (serverDir.startsWith('./')) {
    serverDir = serverDir.replace('./', '/');
  }

  return serverDir.replace(/\/+/g, '/'); // Normalizujeme více lomítek
};

const getLocalDir = () => {
  const args = getArgs()

  return args.localDir
}

const getServerStatePath = () => {
  const args = getArgs()

  const serverDir = getServerDir();
  return `${path.join(serverDir, args.stateName)}`;
};

const getTempStatePath = () => {
  return path.join(getRootPath(), 'temp-state.json')
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { getRootPath, getServerDir, getLocalStatePath, getServerStatePath, getTempStatePath, getLocalDir, jsonToConsole, normalizePath, getServerFullPath, delay };