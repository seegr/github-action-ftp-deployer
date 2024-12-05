const {logError, logInfo} = require("./logger");
const {getArgs} = require("./store");
const {getServerPath} = require("./paths");

async function connectToFtp(client, args, attempt = 3) {
  try {
    logInfo(`Connecting to FTP server (attempt ${attempt})...`);

    await client.access({
      host: args.server,
      user: args.username,
      password: args.password,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    });

    logInfo('FTP connection established successfully.');
  } catch (error) {
    if (attempt < 3) {
      logError(`Connection failed (attempt ${attempt}): ${error.message}`, error);
      logInfo('Retrying connection...');

      return connectToFtp(client, args, attempt + 1);
    } else {
      throw new Error(`Failed to connect to FTP server after 3 attempts: ${error.message}`);
    }
  }
}

async function safeFtpOperation(client, operation, retries = 3) {
  const args = getArgs()

  let attempt = 0;

  while (attempt < retries) {
    try {
      attempt++;
      // Zkus provést operaci
      return await operation(client);
    } catch (error) {
      // Pokud je chyba spojená s připojením, pokus se o reconnect
      if (error.message.includes('Client is closed') || error.message.includes('disconnected')) {
        logError(`FTP operation failed (attempt ${attempt}): ${error.message}`);
        if (attempt < retries) {
          logInfo('Reconnecting to FTP server...');
          await connectToFtp(client, args);
          logInfo('Retrying FTP operation...');
        } else {
          logError('Maximum retry attempts reached. Failing operation.');
          throw error; // Po třetím pokusu ukonči s chybou
        }
      } else {
        // Pokud chyba nesouvisí s připojením, předej ji dál
        throw error;
      }
    }
  }
}

async function jumpToRoot(client) {
  logInfo(`Jumping to root: ${getServerPath()}`);
  await client.cd('/'); // Jdi na root
  await client.cd(getServerPath());
}

module.exports = { connectToFtp, safeFtpOperation, jumpToRoot }