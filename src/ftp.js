const {logError, logInfo, logWarning, logText, logSuccess} = require("./logger");
const {getArgs} = require("./store");
const {getServerDir} = require("./paths");

// let noopInterval = null;

const connectToFtp = async (client, args, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logText(`📂 Connecting to FTP server (attempt ${attempt}/${retries})...`);

      await client.access({
        host: args.server,
        user: args.username,
        password: args.password,
        secure: true,
        secureOptions: { rejectUnauthorized: false },
        minVersion: 'TLSv1',
        maxVersion: 'TLSv1.2',
      });

      logSuccess('📂🗄 FTP connection established successfully.');
      return; // Úspěšné připojení, ukončíme funkci
    } catch (error) {
      logError(`📂😞 Connection failed (attempt ${attempt}/${retries}): ${error.message}`, error);

      if (attempt === retries) {
        logAlert(`📂😞😞 Failed to connect to FTP server after ${retries} attempts.`);
        throw new Error(`📂😞😞 Failed to connect to FTP server: ${error.message}`);
      }

      logWarning('🥹 Retrying connection...');
    }
  }
};

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
        error.message.includes('ECONNRESET') ||
        error.message.includes('routines:ssl3_read_bytes:tlsv1 alert decode')
      ) {
        logError(`📂😞 FTP operation failed (attempt ${attempt}): ${error}`);
        if (attempt < retries) {
          logWarning('🥹 Reconnecting to FTP server...');
          setTimeout(async () => {
            await connectToFtp(client, args);
          }, 2000)
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