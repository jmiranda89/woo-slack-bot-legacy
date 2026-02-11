'use strict';

const { web } = require('../../clients/slack');
const { wooGet } = require('../../services/woo');
const { updateSession } = require('../../store/sessions');

function registerProductCommands(router) {
  /**
   * /draftproduct - Slack slash command entrypoint.
   * Looks up a product by SKU and prompts the user to confirm drafting it.
   */
  router.post('/slack/command', (req, res) => {
    const { text, user_id, channel_id } = req.body;
    const sku = (text || '').trim();

    if (!sku) return res.send('❌ Please provide a SKU.');
    res.status(200).send(`🔍 Looking up SKU *${sku}*...`);

    (async () => {
      try {
        const response = await wooGet('/products', { sku });

        if (!response.data.length) {
          await web.chat.postMessage({ channel: channel_id, text: `❌ No product found with SKU: ${sku}` });
          return;
        }

        const product = response.data[0];

        updateSession(user_id, {
          productId: product.id,
          productName: product.name
        });

        await web.chat.postMessage({
          channel: channel_id,
          text: `Is this the correct product to draft?\n*${product.name}* ($${product.price})`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Product:* ${product.name}\n*Price:* $${product.price}` }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Yes' },
                  style: 'primary',
                  value: user_id,
                  action_id: 'confirm_draft'
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ No' },
                  style: 'danger',
                  value: user_id,
                  action_id: 'cancel_draft'
                }
              ]
            }
          ]
        });
      } catch (err) {
        console.error('Error fetching product:', err.message);
        await web.chat.postMessage({ channel: channel_id, text: '❌ Error retrieving product.' });
      }
    })();

    return undefined;
  });

  /**
   * /priceupdate - Update product/variation price by SKU.
   */
  router.post('/slack/priceupdate', (req, res) => {
    const { text, user_id, channel_id } = req.body;
    const sku = (text || '').trim();

    if (!sku) return res.send('❌ Please provide a SKU.');
    res.status(200).send(`🔍 Looking up current price for *${sku}*...`);

    (async () => {
      try {
        const response = await wooGet('/products', { sku });

        if (!response.data.length) {
          await web.chat.postMessage({ channel: channel_id, text: `❌ No product found with SKU: ${sku}` });
          return;
        }

        const product = response.data[0];
        let variant = null;

        if (product.type === 'variable') {
          const variationsRes = await wooGet(`/products/${product.id}/variations`);
          variant = variationsRes.data.find((v) => v.sku === sku);
          if (!variant) {
            await web.chat.postMessage({ channel: channel_id, text: `❌ No matching variation found with SKU: ${sku}` });
            return;
          }
        }

        const currentPrice = variant ? variant.price : product.price;

        updateSession(user_id, {
          sku,
          productId: product.id,
          variationId: variant?.id || null,
          isVariation: !!variant,
          originalPrice: currentPrice
        });

        await web.chat.postMessage({
          channel: channel_id,
          text: `Current price for *${sku}* is $${currentPrice}.`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `*SKU:* ${sku}\n*Current Price:* $${currentPrice}` } },
            {
              type: 'input',
              block_id: 'new_price_input',
              label: { type: 'plain_text', text: 'Enter new price' },
              element: { type: 'plain_text_input', action_id: 'new_price' }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Confirm' },
                  style: 'primary',
                  value: user_id,
                  action_id: 'confirm_price'
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ Cancel' },
                  style: 'danger',
                  value: user_id,
                  action_id: 'cancel_price'
                }
              ]
            }
          ]
        });
      } catch (err) {
        console.error('Error fetching SKU:', err.message);
        await web.chat.postMessage({ channel: channel_id, text: '❌ Failed to find product.' });
      }
    })();

    return undefined;
  });
}

module.exports = { registerProductCommands };
