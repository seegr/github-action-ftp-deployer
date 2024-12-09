const {logInfo} = require("./logger");
const path = require("path");
const {getRootPath, getLocalDir, getServerDir} = require("./paths");
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

module.exports = { jsonToConsole, normalizePath, getServerFullPath }