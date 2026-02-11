'use strict';

const axios = require('axios');
const config = require('../config');

/**
 * Build Basic Auth headers for WooCommerce API requests.
 * @returns {{Authorization: string}}
 */
function getWooAuthHeaders() {
  const token = Buffer.from(`${config.woo.username}:${config.woo.password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

const wooApiBase = `${config.woo.url}/wp-json/wc/v3`;

/**
 * GET wrapper for the WooCommerce API with auth headers attached.
 * @param {string} path - API path (e.g. /products, /orders/123)
 * @param {object} [params]
 */
function wooGet(path, params) {
  return axios.get(`${wooApiBase}${path}`, {
    headers: getWooAuthHeaders(),
    params
  });
}

/**
 * PUT wrapper for the WooCommerce API with auth headers attached.
 * @param {string} path - API path (e.g. /products/123)
 * @param {object} data
 */
function wooPut(path, data) {
  return axios.put(`${wooApiBase}${path}`, data, {
    headers: getWooAuthHeaders()
  });
}

module.exports = {
  getWooAuthHeaders,
  wooGet,
  wooPut
};
