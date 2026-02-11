# Woo Slack Bot V2

Slack bot that connects to WooCommerce to draft products, update prices, find orders, and generate order PDFs from mail logs.

## Features
- Draft a product by SKU with confirmation in Slack.
- Find orders by custom order number or WooCommerce order ID.
- Update product or variation price by SKU.
- Edit order link shortcut.
- Read and update customer metadata.
- Generate PDF from WooCommerce mail logs and upload to Slack.

## Requirements
- Node.js (LTS recommended)
- Slack app with slash commands + interactive components enabled
- WooCommerce REST API credentials

## Install
```bash
npm install
```

## Configure
Create a `.env` file in the project root with the following variables:

```
PORT=3000
SLACK_BOT_TOKEN=...
WOO_URL=https://yourstore.example
WOO_USERNAME=...
WOO_PASSWORD=...
ADMIN_EDIT_URL=https://yourstore.example/wp-admin/admin.php?page=wc-orders&action=edit&id=
```

Notes:
- `ADMIN_EDIT_URL` is optional; the default points to the Pathway Bookstore admin edit URL.
- `WOO_URL` should be the base site URL (no trailing slash).

## Run
```bash
npm start
```

The app listens on `http://localhost:<PORT>`.

## Slack Endpoints
Configure these endpoints in your Slack app:

- `/slack/command` (slash command: draft product by SKU)
- `/slack/findorder` (slash command: find by custom order number)
- `/slack/priceupdate` (slash command: update price by SKU)
- `/slack/findidorder` (slash command: find by Woo ID)
- `/slack/editorder` (slash command: admin edit link)
- `/slack/customermeta` (slash command: customer metadata)
- `/slack/orderpdf` (slash command: search mail logs and generate PDF)
- `/slack/interact` (interactive actions endpoint)

## Project Structure
```
src/
  clients/
    slack.js         Slack Web API client
  config/
    index.js         Environment configuration
  routes/
    commands.js      Slash command handlers
    interactions.js  Interactive action handlers
  services/
    pdf.js           HTML -> PDF conversion
    woo.js           WooCommerce API helpers
  store/
    sessions.js      In-memory session store
  index.js           App entrypoint
app.js               Legacy entrypoint (shim)
```

## Notes
- Sessions are stored in memory and cleared on process restart.
- The WooCommerce API calls use Basic Auth from `.env` credentials.
