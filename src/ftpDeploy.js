const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const { logInfo, logWarning } = require('./logger');
const { prepareUploads, processWithFlush} = require('./deploy');
const { connectToFtp } = require('./ftp');
const { initUploadsFromStates } = require('./state')

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
      console.error('Failed to close FTP connection:', error);
    }
    process.exit(0);
  });

  try {
    await connectToFtp(client, args);
    const toUpload = await initUploadsFromStates(client, args);
    console.log(toUpload)
    await processWithFlush(client, toUpload, args);
  } catch (error) {
    throw new Error(`Deployment failed: ${error.message}`);
  } finally {
    client.close();
  }
}

module.exports = { deploy };