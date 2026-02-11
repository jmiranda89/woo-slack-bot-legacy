'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const commandsRouter = require('./routes/commands');
const interactionsRouter = require('./routes/interactions');

const app = express();

// Parse Slack slash command and interactive payloads
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(commandsRouter);
app.use(interactionsRouter);

app.listen(config.port, () => {
  console.log(`🚀 Slack bot is running on http://localhost:${config.port}`);
});
