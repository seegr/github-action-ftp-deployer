const { getArgs } = require('./store');
const path = require("path");
const {normalizePath} = require("./utils");

const getRootPath = () => process.cwd()

const getLocalStatePath = () => {
  const args = getArgs()

  return normalizePath(`${getRootPath()}/${args.localDir}/${args.stateName}`)
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


module.exports = { getRootPath, getServerDir, getLocalStatePath, getServerStatePath, getTempStatePath, getLocalDir };