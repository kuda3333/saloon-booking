// Vercel Cron — /api/send-reminders.js
// Runs hourly. Finds confirmed bookings happening in the next 24-25 hours
// that haven't had a reminder sent, fires a Twilio SMS, marks them reminded.
//
// Required environment variables (set in Vercel dashboard):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM            e.g. +12345550100   (your Twilio number)
//   FIREBASE_SERVICE_ACCOUNT_JSON   (full JSON string of a service-account key)
//   CRON_SECRET            shared secret to gate this endpoint
//
// Schedule defined in vercel.json:  "0 * * * *"  (every hour, on the hour)

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore }                 = require('firebase-admin/firestore');

function initAdmin() {
  if (getApps().length) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  initializeApp({ credential: cert(JSON.parse(json)) });
}

function normalizeZwPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('263')) return '+' + digits;
  if (digits.startsWith('0'))   return '+263' + digits.slice(1);
  return '+' + digits;
}

async function sendSms(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM;
  const auth  = Buffer.from(`${sid}:${token}`).toString('base64');

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  return res.json();
}

module.exports = async function handler(req, res) {
  // Vercel Cron sends a Bearer token in Authorization. Also allow manual hits
  // with the same secret as a query parameter for debugging.
  const provided = req.headers.authorization?.replace('Bearer ', '') || req.query?.secret;
  if (provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initAdmin();
    const db = getFirestore();

    const now      = new Date();
    const target   = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dateStr  = target.toISOString().split('T')[0];

    const snap = await db.collection('salon_bookings')
      .where('date', '==', dateStr)
      .where('status', '==', 'confirmed')
      .get();

    const sent = [];
    const skipped = [];
    const failed = [];

    for (const doc of snap.docs) {
      const b = doc.data();
      if (b.reminderSent) { skipped.push(b.bookingRef); continue; }

      const phone = normalizeZwPhone(b.customerPhone);
      const dateLabel = new Date(b.date + 'T00:00:00').toLocaleDateString('en-ZW',
        { weekday: 'long', day: 'numeric', month: 'long' });
      const body =
        `Glam Studio reminder: your ${b.service} is booked for ${dateLabel} at ${b.timeSlot}. ` +
        `Ref ${b.bookingRef}. Reply or WhatsApp +263778961269 to reschedule.`;

      try {
        await sendSms(phone, body);
        await doc.ref.update({ reminderSent: true, reminderSentAt: new Date() });
        sent.push(b.bookingRef);
      } catch (e) {
        console.error('SMS failed for', b.bookingRef, e.message);
        failed.push({ ref: b.bookingRef, error: e.message });
      }
    }

    return res.status(200).json({
      ok: true, target: dateStr,
      sent: sent.length, skipped: skipped.length, failed: failed.length,
      details: { sent, skipped, failed },
    });
  } catch (e) {
    console.error('Reminder cron error:', e);
    return res.status(500).json({ error: e.message });
  }
};
