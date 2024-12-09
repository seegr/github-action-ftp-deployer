const {logError, logInfo, logWarning, logText, logSuccess} = require("./logger");
const {getArgs} = require("./store");
const {getServerDir} = require("./paths");

// let noopInterval = null;

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
      logError(`📂😞 Connection failed (attempt ${attempt}): ${error}`, error);
      logWarning('🥹 Retrying connection...');

      return connectToFtp(client, args, attempt + 1);
    } else {
      throw new Error(`📂😞😞 Failed to connect to FTP server after 3 attempts: ${error.message}`);
    }
  }
}

async function disconnectFromFtp(client) {
  // if (noopInterval) {
  //   stopKeepAlive(noopInterval);
  // }
  client.close();
  logInfo('📂 Disconnected from FTP server.');
}

// function startKeepAlive(client, interval = 20000) {
//   logInfo('🟢 Starting keep-alive (NOOP)...');
//   return setInterval(async () => {
//     try {
//       logInfo('🔄 Sending NOOP...');
//       await safeFtpOperation(client, async (ftpClient) => {
//         await ftpClient.send("NOOP");
//       });
//     } catch (error) {
//       logWarning(`⚠️ Failed to send NOOP: ${error.message}`);
//     }
//   }, interval);
// }

// function stopKeepAlive(noopInterval) {
//   clearInterval(noopInterval);
//   logInfo('🔴 Stopping keep-alive (NOOP).');
// }

// let ftpTaskQueue = Promise.resolve(); // Fronta úloh

async function safeFtpOperation(client, operation, retries = 4) {
  const args = getArgs();
  let attempt = 0;

  while (attempt < retries) {
    try {
      attempt++;
      return await operation(client);
    } catch (error) {
      if (
        error.message.includes('Client is closed') ||
        error.message.includes('socket disconnected') ||
        error.message.includes('User launched a task') ||
        error.message.includes('ECONNRESET')
      ) {
        logError(`📂😞 FTP operation failed (attempt ${attempt}): ${error}`);
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
  try {
    await client.cd('/');
    const serverDir = getServerDir();
    await client.cd(serverDir);
    // logInfo(`Current directory after serverDir jump: ${await client.pwd()}`);
  } catch (error) {
    logError(`Failed to jump to root: ${error.message}`, error);
    throw new Error(`Jump to root failed: ${error.message}`);
  }
}

module.exports = { connectToFtp, safeFtpOperation, jumpToRoot, disconnectFromFtp }