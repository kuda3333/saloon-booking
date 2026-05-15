// Vercel Serverless Function — /api/paynow-initiate.js
// Server-side Paynow hash generation (required — integration key must never be in the browser)
// Docs: https://developers.paynow.co.zw/docs/initiating_transactions.html

const crypto = require('crypto');

function paynowHash(values, integrationKey) {
  const str = Object.values(values).join('') + integrationKey;
  return crypto.createHash('sha512').update(str).digest('hex').toUpperCase();
}

function buildFormBody(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    integrationId,
    integrationKey,
    resultUrl,
    returnUrl,
    reference,
    amount,
    email,
    phone,
    method,
    items,
  } = req.body;

  if (!integrationId || !integrationKey || !reference || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const itemStr = items.map(i => `${i.name},${Number(i.amount).toFixed(2)}`).join(';');

  const fields = {
    id:           integrationId,
    reference,
    amount:       Number(amount).toFixed(2),
    additionalinfo: itemStr,
    returnurl:    returnUrl,
    resulturl:    resultUrl,
    status:       'Message',
  };

  fields.hash = paynowHash(fields, integrationKey);

  try {
    const paynowRes = await fetch('https://www.paynow.co.zw/interface/initiatetransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: buildFormBody(fields),
    });

    const text = await paynowRes.text();
    const params = Object.fromEntries(new URLSearchParams(text));

    if (params.status?.toLowerCase() !== 'ok') {
      return res.status(502).json({ error: params.error || 'Paynow rejected the request' });
    }

    // Mobile money (EcoCash / InnBucks) — initiate express checkout
    if (method === 'ecocash' || method === 'innbucks') {
      const mobileFields = {
        id:        integrationId,
        reference,
        amount:    Number(amount).toFixed(2),
        additionalinfo: itemStr,
        returnurl: returnUrl,
        resulturl: resultUrl,
        phone,
        method,
        status:    'Message',
      };
      mobileFields.hash = paynowHash(mobileFields, integrationKey);

      const mobileRes = await fetch('https://www.paynow.co.zw/interface/remotetransaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildFormBody(mobileFields),
      });
      const mobileText = await mobileRes.text();
      const mobileParams = Object.fromEntries(new URLSearchParams(mobileText));

      if (mobileParams.status?.toLowerCase() === 'ok') {
        return res.status(200).json({ pollUrl: mobileParams.pollurl });
      }
      return res.status(502).json({ error: mobileParams.error || 'Mobile initiation failed' });
    }

    // Web redirect (card / other)
    return res.status(200).json({ redirectUrl: params.browserurl });
  } catch (e) {
    console.error('Paynow error:', e);
    return res.status(500).json({ error: e.message });
  }
};
