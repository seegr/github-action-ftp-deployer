const core = require('@actions/core');


function logText(message) {
  core.info(message);
}

function logInfo(message) {
  core.info(`\x1b[36m${message}\x1b[0m`);
}

function logSuccess(message) {
  core.info(`\x1b[32m${message}\x1b[0m`)
}

function logAlert(message) {
  core.info(`\x1b[31m${message}\x1b[0m`)
}

function logWarning(message) {
  core.info(`\x1b[33m${message}\x1b[0m`)
}

const logError = (message, error) => {
  if (error instanceof Error) {
    logAlert(`${message}: ${error.message}`);
    core.error(`Stack trace: ${error.stack}`);
  } else {
    core.error(`${message}: ${JSON.stringify(error)}`);
  }
};

module.exports = { logText, logInfo, logSuccess, logWarning, logError, logAlert };