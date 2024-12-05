const jsonToConsole = (json) => {
  return JSON.stringify(json, null, 2)
}

module.exports = { jsonToConsole }