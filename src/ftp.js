const {logError, logInfo, logWarning, logText, logSuccess, logAlert} = require("./logger");
const {getArgs} = require("./store");
const {getServerDir, delay} = require("./utils");

let noopInterval = null;

async function keepConnectionAlive(client, interval = 30000) {
  stopKeepAlive(); // Zastav jakýkoliv existující interval

  noopInterval = setInterval(async () => {
    try {
      // logText('🔄 Sending NOOP to keep connection alive...');
      if (!client.closed) {
        await safeFtpOperation(client, async (ftpClient) => {
          await ftpClient.send('NOOP');
        });
      } else {
        throw new Error('Client is closed.');
      }
    } catch (error) {
      logWarning('⚠️ Failed to send NOOP. Stopping NOOP operation.', error);
      stopKeepAlive(); // Zastav NOOP při chybě
    }
  }, interval);
}

const stopKeepAlive = () => {
  if (noopInterval) {
    clearInterval(noopInterval);
    noopInterval = null;
  }
};


const connectToFtp = async (client, args, retries = 3) => {
  stopKeepAlive(); // Zastav NOOP před připojením

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logText(`📂 Connecting to FTP server (attempt ${attempt}/${retries})...`);
      await client.access({
        host: args.server,
        user: args.username,
        password: args.password,
        secure: true,
        secureOptions: { rejectUnauthorized: false },
      });

      await keepConnectionAlive(client);
      logSuccess('📂🗄 FTP connection established successfully.');
      return;
    } catch (error) {
      logError(`📂😞 Connection failed (attempt ${attempt}/${retries}): ${error.message}`, error);

      if (attempt === retries) {
        logAlert(`📂😞😞 Failed to connect to FTP server after ${retries} attempts.`);
        throw new Error(`📂😞😞 Failed to connect to FTP server: ${error.message}`);
      }

      logWarning('🥹 Retrying connection...');
      await delay(3000); // Pauza mezi pokusy
    }
  }
};


async function disconnectFromFtp(client) {
  try {
    if (noopInterval) {
      clearInterval(noopInterval);
      logInfo('✅ NOOP interval cleared.');
    }

    client.close();

    logInfo('📂 Disconnected from FTP server.');
  } catch (error) {
    logError('📂😞 Failed to disconnect from FTP server:', error);
  }
}

async function safeFtpOperation(client, operation, retries = 4) {
  const args = getArgs();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      stopKeepAlive(); // Zastavení NOOP před pokusem o operaci
      const result = await operation(client); // Provedení operace
      await keepConnectionAlive(client); // Restart NOOP po úspěšné operaci
      return result;
    } catch (error) {
      if (
        error.message.includes('Client is closed') ||
        error.message.includes('socket disconnected') ||
        error.message.includes('User launched a task') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('routines:ssl3_read_bytes:tlsv1 alert decode')
      ) {
        logError(`📂😞 FTP operation failed (attempt ${attempt}/${retries}): ${error.message}`);

        if (attempt < retries) {
          logWarning('🥹 Reconnecting to FTP server...');
          await delay(2000); // Pauza před opakováním
          await connectToFtp(client, args); // Obnova připojení
          logWarning('🥹 Retrying FTP operation...');
        } else {
          logError('📂😞😞 Maximum retry attempts reached. Failing operation.');
          throw new Error(`📂😞😞 FTP operation failed after ${retries} attempts: ${error.message}`);
        }
      } else {
        throw error; // Jiná chyba, není spojena s připojením
      }
    }
  }
}


async function jumpToRoot(client) {
  try {
    await client.cd('/');
    const serverDir = getServerDir();
    await client.cd(serverDir);
  } catch (error) {
    logError(`Failed to jump to root: ${error.message}`, error);
    throw new Error(`Jump to root failed: ${error.message}`);
  }
}

module.exports = { connectToFtp, safeFtpOperation, jumpToRoot, disconnectFromFtp }