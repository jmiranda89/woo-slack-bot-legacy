'use strict';

const puppeteer = require('puppeteer');

/**
 * Convert an HTML string to a PDF buffer using a headless browser.
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
    });
  } finally {
    await browser.close();
  }
}

module.exports = { htmlToPdfBuffer };
