// SafeRide — Stripe payment verification
// Called by the app after Stripe redirects back with ?session_id=cs_xxx
// Returns { premium: true, email } if the session was paid, { premium: false } otherwise.

const Stripe = require('stripe');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://saferide-cycling.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;

  // Basic sanity check — Stripe session IDs start with cs_
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid session_id' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY environment variable is not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment service not configured' }) };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          premium: true,
          email: session.customer_details?.email || null,
        }),
      };
    }

    // Session exists but payment not completed
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ premium: false }),
    };

  } catch (err) {
    console.error('Stripe verification error:', err.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Could not verify payment — please contact support.' }),
    };
  }
};
