#!/usr/bin/env node

const core = require('@actions/core');
const ftpDeploy = require('../src/ftpDeploy');

// Načtení vstupů z prostředí GitHub Actions
const inputs = {
  server: core.getInput('server'),
  username: core.getInput('username'),
  password: core.getInput('password'),
  localDir: core.getInput('local-dir'),
  serverDir: core.getInput('server-dir'),
  stateName: core.getInput('state-name') || '.deploy-sync-state.json',
  timeout: parseInt(core.getInput('timeout')) || 3600000,
};

// Spuštění nasazení
ftpDeploy.deploy(inputs)
  .then(() => core.info('Deployment completed successfully!'))
  .catch((error) => core.setFailed(`Deployment failed: ${error.message}`));