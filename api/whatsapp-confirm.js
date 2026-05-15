// Vercel Serverless Function — /api/whatsapp-confirm.js
// Sends an automatic WhatsApp confirmation via the WhatsApp Business Cloud API.
//
// Required environment variables (set in Vercel dashboard):
//   WHATSAPP_PHONE_NUMBER_ID   — from Meta Business → WhatsApp → API Setup
//   WHATSAPP_ACCESS_TOKEN      — permanent token (System User → Generate)
//   WHATSAPP_TEMPLATE_NAME     — pre-approved template, e.g. 'booking_confirmation'
//   WHATSAPP_LOCALE            — e.g. 'en' or 'en_US'
//
// To enable templates, register them in Meta Business Suite → WhatsApp → Message Templates.
// Templates must be APPROVED before they can be sent.

const { createClient } = require('./lib/posthog');

function normalizeZwPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('263')) return digits;
  if (digits.startsWith('0'))   return '263' + digits.slice(1);
  return digits;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const phoneId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token    = process.env.WHATSAPP_ACCESS_TOKEN;
  const template = process.env.WHATSAPP_TEMPLATE_NAME || 'booking_confirmation';
  const locale   = process.env.WHATSAPP_LOCALE || 'en';

  if (!phoneId || !token) {
    return res.status(503).json({ error: 'WhatsApp Business API not configured' });
  }

  const { phone, name, ref, service, datetime, stylist } = req.body;
  if (!phone || !ref || !service) return res.status(400).json({ error: 'Missing required fields' });

  const to = normalizeZwPhone(phone);

  try {
    const wRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: locale },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: name     || 'there' },
              { type: 'text', text: ref      },
              { type: 'text', text: service  },
              { type: 'text', text: datetime },
              { type: 'text', text: stylist  || 'Any available' },
            ],
          }],
        },
      }),
    });

    const data = await wRes.json();
    if (!wRes.ok) {
      console.error('WhatsApp API error:', data);
      return res.status(502).json({ error: data.error?.message || 'WhatsApp send failed' });
    }
    const posthog = createClient();
    posthog.capture({
      distinctId: phone,
      event: 'whatsapp_confirmation_sent',
      properties: { booking_ref: ref, service },
    });
    await posthog.shutdown();
    return res.status(200).json({ ok: true, id: data.messages?.[0]?.id });
  } catch (e) {
    console.error('WhatsApp error:', e);
    return res.status(500).json({ error: e.message });
  }
};
