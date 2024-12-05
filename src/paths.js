const { getArgs } = require('./store');
const path = require("path");

const getRootPath = () => process.cwd()

const getLocalStatePath = () => {
  const args = getArgs()

  return `${getRootPath()}/${args.localDir}/${args.stateName}`
}

const getServerDir = () => {
  const args = getArgs()

  return args.serverDir
}

const getLocalDir = () => {
  const args = getArgs()

  return args.localDir
}

const getServerStatePath = () => {
  const args = getArgs()

  const serverDir = getServerDir();
  return `/${path.join(serverDir, args.stateName)}`;
};

const getTempStatePath = () => {
  return path.join(getRootPath(), 'temp-state.json')
}


module.exports = { getRootPath, getServerDir, getLocalStatePath, getServerStatePath, getTempStatePath, getLocalDir };