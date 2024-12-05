#!/usr/bin/env node

const core = require('@actions/core');
const ftpDeploy = require('../src/ftpDeploy');
const { logSuccess, logAlert} = require('../src/logger')

// Načtení vstupů z prostředí GitHub Actions
const inputs = {
  server: core.getInput('server'),
  username: core.getInput('username'),
  password: core.getInput('password'),
  localDir: core.getInput('local-dir'),
  serverDir: core.getInput('server-dir'),
  stateName: core.getInput('state-name') || '.deploy-sync-state.json',
  timeout: parseInt(core.getInput('timeout')) || 3600000,
  exclude: core.getInput('exclude'),
};

// Spuštění nasazení
ftpDeploy.deploy(inputs)
  .then(() => logSuccess('💩🎉 Deployment completed successfully!!!'))
  .catch((error) => logAlert(`💩😞 Deployment failed: ${error.message}`));