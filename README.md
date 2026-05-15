# Glam Studio — Online Booking

Salon booking app for Glam Studio (Harare, Zimbabwe). Customers pick a service, time slot and pay; the operator gets an instant email and SMS reminders go out 24 hours before each appointment.

**Live:** [saloon-booking-ten.vercel.app](https://saloon-booking-ten.vercel.app)

---

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Static HTML / vanilla JS module (no build step) |
| Database | Firebase Firestore |
| Email   | Resend |
| SMS     | Twilio (24h reminder cron) |
| Payments | Manual EcoCash / InnBucks · Visa pay-on-arrival · Paynow (when enabled) |
| Hosting / API | Vercel (static + serverless functions + cron) |
| CI/CD | GitHub Actions → Vercel production |

---

## Repo layout

```
saloon-booking/
├── index.html               # The booking app (single-page)
├── api/
│   ├── send-email.js        # Resend operator + customer email on booking
│   ├── send-reminders.js    # Hourly cron — SMS 24h before each booking
│   └── paynow-initiate.js   # Server-side Paynow hash + initiation
├── firestore.rules          # Production Firestore security rules
├── vercel.json              # Routes + cron schedule
├── package.json             # firebase-admin (used by reminder cron)
└── .github/workflows/deploy.yml
```

---

## First-time setup

### 1. Firebase

1. Open the [Firebase console](https://console.firebase.google.com) → project `saloon-booking-ce824`.
2. **Firestore → Rules** → paste the contents of [`firestore.rules`](firestore.rules) → Publish.
3. **Project settings → Service accounts** → *Generate new private key* → save the downloaded JSON. You'll need this for the reminder cron.

### 2. Resend (transactional email)

1. Sign up at [resend.com](https://resend.com).
2. **Domains** → *Add domain* → add e.g. `glamstudio.co.zw` and create the DNS records Resend gives you in your domain registrar.
3. Wait for verification (usually < 10 minutes).
4. **API Keys** → create a key with *Sending access*.
5. In Vercel project → Settings → Environment Variables, add:
   ```
   RESEND_API_KEY = re_xxxxxxxxxxxx
   RESEND_FROM    = Glam Studio <bookings@glamstudio.co.zw>
   OPERATOR_EMAIL = your@operator-email.com
   ```

> Until your domain is verified, emails will use Resend's sandbox `onboarding@resend.dev` and can only be delivered to the address you signed up with. Verify your domain before going live.

### 3. Twilio (SMS reminders)

1. Sign up at [twilio.com](https://twilio.com).
2. Buy a Zimbabwe-capable number (or use a US trial number — works for outbound to ZW with limits).
3. Grab your **Account SID** and **Auth Token** from the console.
4. In Vercel environment variables, add:
   ```
   TWILIO_ACCOUNT_SID            = AC...
   TWILIO_AUTH_TOKEN             = ...
   TWILIO_FROM                   = +12345550100
   FIREBASE_SERVICE_ACCOUNT_JSON = {"type":"service_account",...}   ← whole JSON on one line
   CRON_SECRET                   = (any long random string)
   ```

The cron runs every hour (`0 * * * *`). It looks 24 hours ahead, sends an SMS, and marks each booking `reminderSent: true` so it won't double-fire.

### 4. Paynow (optional — Zimbabwe card / mobile money)

Once your merchant account is approved at [developers.paynow.co.zw](https://developers.paynow.co.zw):

1. In `index.html`, find `PAYNOW_CONFIG` and fill in:
   ```js
   integrationId:  'YOUR_INTEGRATION_ID',
   integrationKey: 'YOUR_INTEGRATION_KEY',  // ⚠️ also add this as a Vercel env var
   enabled:        true,
   ```
2. Better: move `integrationKey` server-side. The browser only sends the request to `/api/paynow-initiate.js`, which already handles the HMAC-SHA512 hash so the key never leaves the server.

---

## Local development

```bash
npm install
npx vercel dev
```

`vercel dev` will run the static site at `http://localhost:3000` and serve the `/api/*` functions for testing.

---

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which:

1. Runs `vercel pull` to fetch project config
2. Runs `vercel build --prod`
3. Runs `vercel deploy --prebuilt --prod`

Required GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

---

## Operating the studio

### Daily routine

1. Check email — every booking pings `OPERATOR_EMAIL` instantly with full details.
2. For EcoCash/InnBucks bookings, match the customer's payment SMS against the `paymentRef` in the email.
3. Customers receive an SMS reminder 24 hours before their appointment automatically.

### Cancelling / rescheduling

For now this is manual: open Firestore console → `salon_bookings` → find the doc by `bookingRef`, set `status: 'cancelled'`. (An admin dashboard with one-click actions ships in Sprint 2.)

### Bringing the site down for maintenance

In Vercel: Project → Settings → Deployment Protection → enable Password Protection. Brings the public site behind a password without a redeploy.

---

## Roadmap

| Sprint | Feature | Status |
| --- | --- | --- |
| 1 | Visual redesign + reviews + stylists section | ✅ |
| 1 | Production Firestore rules | ✅ |
| 1 | SMS reminders (Twilio + cron) | ✅ |
| 1 | Resend domain config | ✅ |
| 2 | Stylist selection step | planned |
| 2 | Service variations (sub-services) | planned |
| 2 | Deposit-only payment option | planned |
| 2 | Operator dashboard at `/admin` | planned |
| 3 | PWA + offline support | planned |
| 3 | Loyalty / repeat-customer rewards | planned |
| 3 | PostHog funnel analytics | planned |
| 3 | WhatsApp Business API auto-confirm | planned |

---

## License

Private — all rights reserved by Glam Studio.
