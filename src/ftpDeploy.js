const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const { logText, logInfo, logWarning, logAlert} = require('./logger');
const { prepareUploads, processWithFlush} = require('./deploy');
const { connectToFtp, disconnectFromFtp } = require('./ftp');
const { setLocalState, initUploadsFromStates } = require('./state')

const { setArgs } = require('./store');


async function deploy(args) {
  setArgs(args);

  const client = new ftp.Client(args.timeout);
  client.ftp.verbose = false;

  process.on('SIGINT', async () => {
    console.log('CTRL+C detected, stopping deployment...');
    try {
      if (client) {
        await client.close();
      }
    } catch (error) {
      logAlert('📂😞 Failed to close FTP connection:', error);
    }
    process.exit(0);
  });

  try {
    logInfo('Nazdárek 🖖💩 ... tak jdeme na to!')

    await connectToFtp(client, args);
    await client.ensureDir(args.serverDir);
    await setLocalState()
    const toUpload = await initUploadsFromStates(client, args);

    toUpload.folders.map(item => {
      logText(`📁 To Create: ${item.id}`);
    });

    toUpload.files.map(item => {
      logText(`📄 To Upload: ${item.id}`);
    });

    await processWithFlush(client, toUpload);
    await disconnectFromFtp(client)
  } catch (error) {
    throw new Error(`Deployment failed: ${error.message}`);
  } finally {
    client.close();
  }
}

module.exports = { deploy };