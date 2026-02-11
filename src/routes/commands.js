'use strict';

const express = require('express');
const { registerProductCommands } = require('./commands/products');
const { registerOrderCommands } = require('./commands/orders');
const { registerCustomerCommands } = require('./commands/customers');
const { registerPdfCommands } = require('./commands/pdf');

const router = express.Router();

registerProductCommands(router);
registerOrderCommands(router);
registerCustomerCommands(router);
registerPdfCommands(router);

module.exports = router;
