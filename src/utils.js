const {logInfo} = require("./logger");
const jsonToConsole = (json) => {
  return JSON.stringify(json, null, 2)
}

const normalizePath = (filePath) => {
  return filePath
    .replace(/^[*\/]+/, '')         // Odstraní všechny * a / na začátku
    .replace(/\/+/g, '/')           // Nahradí více lomítek za jedno
    .replace(/^(\.\/|\.{2}\/)+/, ''); // Odstraní ./ nebo ../ na začátku
};

module.exports = { jsonToConsole, normalizePath }