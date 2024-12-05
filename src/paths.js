const { getArgs } = require('./store');
const path = require("path");

const getRootPath = () => process.cwd()

const getLocalStatePath = () => {
  const args = getArgs()

  return `${getRootPath()}/${args.localDir}/${args.stateName}`
}

const getServerPath = () => {
  const args = getArgs()

  return args.serverDir
}

const getServerStatePath = () => {
  const args = getArgs()

  const serverDir = getServerPath();
  return `/${path.join(serverDir, args.stateName)}`;
};

const getTempStatePath = () => {
  return path.join(getRootPath(), 'temp-state.json')
}


module.exports = { getRootPath, getServerPath, getLocalStatePath, getServerStatePath, getTempStatePath };