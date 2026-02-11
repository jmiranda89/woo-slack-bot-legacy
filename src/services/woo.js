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
const wooClient = axios.create({
  baseURL: wooApiBase,
  timeout: config.woo.timeoutMs
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryGet(err) {
  const status = err.response?.status;
  if (status === 429 || status >= 500) return true;
  return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(err.code);
}

async function wooRequest(method, path, options = {}) {
  const {
    params,
    data,
    retries = method === 'get' ? 2 : 0
  } = options;

  let attempt = 0;
  while (true) {
    try {
      return await wooClient.request({
        method,
        url: path,
        headers: getWooAuthHeaders(),
        params,
        data
      });
    } catch (err) {
      if (method !== 'get' || attempt >= retries || !shouldRetryGet(err)) {
        throw err;
      }
      attempt += 1;
      await sleep(250 * attempt);
    }
  }
}

/**
 * GET wrapper for the WooCommerce API with auth headers attached.
 * @param {string} path - API path (e.g. /products, /orders/123)
 * @param {object} [params]
 */
function wooGet(path, params) {
  return wooRequest('get', path, { params });
}

/**
 * PUT wrapper for the WooCommerce API with auth headers attached.
 * @param {string} path - API path (e.g. /products/123)
 * @param {object} data
 */
function wooPut(path, data) {
  return wooRequest('put', path, { data });
}

module.exports = {
  getWooAuthHeaders,
  wooGet,
  wooPut
};
