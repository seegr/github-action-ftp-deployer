const {logError, logInfo, logWarning, logText, logSuccess} = require("./logger");
const {getArgs} = require("./store");
const {getServerDir} = require("./paths");

let noopInterval = null;

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

    // Start NOOP to keep the connection alive
    noopInterval = startKeepAlive(client);
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

async function disconnectFromFtp(client) {
  if (noopInterval) {
    stopKeepAlive(noopInterval);
  }
  client.close();
  logInfo('📂 Disconnected from FTP server.');
}

function startKeepAlive(client, interval = 20000) {
  logInfo('🟢 Starting keep-alive (NOOP)...');
  return setInterval(async () => {
    try {
      logInfo('🔄 Sending NOOP...');
      await client.send('NOOP');
    } catch (error) {
      logWarning(`⚠️ Failed to send NOOP: ${error.message}`);
    }
  }, interval);
}

function stopKeepAlive(noopInterval) {
  clearInterval(noopInterval);
  logInfo('🔴 Stopping keep-alive (NOOP).');
}

async function safeFtpOperation(client, operation, retries = 3) {
  const args = getArgs();
  let attempt = 0;

  while (attempt < retries) {
    try {
      attempt++;
      return await operation(client); // Každá operace musí mít `await`
    } catch (error) {
      if (error.message.includes('Client is closed') || error.message.includes('disconnected')) {
        logError(`📂😞 FTP operation failed (attempt ${attempt}): ${error.message}`);
        if (attempt < retries) {
          logWarning('🥹 Reconnecting to FTP server...');
          await connectToFtp(client, args); // Připojení znovu
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

module.exports = { connectToFtp, safeFtpOperation, jumpToRoot, disconnectFromFtp }