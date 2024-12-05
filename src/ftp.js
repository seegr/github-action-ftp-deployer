const {logError, logInfo, logWarning, logText, logSuccess} = require("./logger");
const {getArgs} = require("./store");
const {getServerDir} = require("./paths");

async function connectToFtp(client, args, attempt = 3) {
  try {
    logText(`📂 Connecting to FTP server (attempt ${attempt})...`);

    await client.access({
      host: args.server,
      user: args.username,
      password: args.password,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    });

    logSuccess('📂🗄 FTP connection established successfully.');
  } catch (error) {
    if (attempt < 3) {
      logError(`📂😞 Connection failed (attempt ${attempt}): ${error.message}`, error);
      logWarning('🥹 Retrying connection...');

      return connectToFtp(client, args, attempt + 1);
    } else {
      throw new Error(`📂😞😞 Failed to connect to FTP server after 3 attempts: ${error.message}`);
    }
  }
}

async function safeFtpOperation(client, operation, retries = 4) {
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
        logError(`📂😞 FTP operation failed (attempt ${attempt}): ${error.message}`);
        if (attempt < retries) {
          logWarning('🥹 Reconnecting to FTP server...');
          await connectToFtp(client, args);
          logWarning('🥹 Retrying FTP operation...');
        } else {
          logError('📂😞😞 Maximum retry attempts reached. Failing operation.');
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}

async function jumpToRoot(client) {
  await client.cd('/'); // Jdi na root
  await client.cd(getServerDir());
}

module.exports = { connectToFtp, safeFtpOperation, jumpToRoot }