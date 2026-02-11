'use strict';

const { WebClient } = require('@slack/web-api');
const config = require('../config');

/**
 * Singleton Slack client for posting messages and uploading files.
 */
const web = new WebClient(config.slackBotToken);

module.exports = { web };
