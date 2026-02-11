'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const commandsRouter = require('./routes/commands');
const interactionsRouter = require('./routes/interactions');
const { verifySlackRequest } = require('./middleware/slackAuth');

const app = express();

function rawBodySaver(req, res, buf) {
  if (buf && buf.length) {
    req.rawBody = Buffer.from(buf);
  }
}

// Parse Slack slash command and interactive payloads.
app.use(bodyParser.urlencoded({ extended: true, verify: rawBodySaver }));
app.use(bodyParser.json({ verify: rawBodySaver }));
app.use('/slack', verifySlackRequest);

app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

app.use(commandsRouter);
app.use(interactionsRouter);

app.listen(config.port, () => {
  console.log(`🚀 Slack bot is running on http://localhost:${config.port}`);
});
