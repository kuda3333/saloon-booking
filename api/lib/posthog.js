// Shared PostHog client for Vercel serverless functions
// Each function creates a fresh instance and shuts it down before responding.

const { PostHog } = require('posthog-node');

function createClient() {
  return new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST,
  });
}

module.exports = { createClient };
