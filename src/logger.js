const core = require('@actions/core');

function logInfo(message) {
  core.info(message);
}

function logWarning(message) {
  core.warning(message);
}

const logError = (message, error) => {
  if (error instanceof Error) {
    core.error(`${message}: ${error.message}`);
    core.error(`Stack trace: ${error.stack}`);
  } else {
    core.error(`${message}: ${JSON.stringify(error)}`);
  }
};

module.exports = { logInfo, logWarning, logError };