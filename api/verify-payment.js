// SafeRide — Stripe payment verification (Vercel)
// Called by the app after Stripe redirects back with ?session_id=cs_xxx
// Returns { premium: true, email } if the session was paid, { premium: false } otherwise.

const Stripe = require('stripe');

module.exports = async (req, res) => {
  // CORS — allow same-origin Vercel domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.query.session_id;

  // Basic sanity check — Stripe session IDs start with cs_
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session_id' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY environment variable is not set');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      return res.status(200).json({
        premium: true,
        email: session.customer_details?.email || null,
      });
    }

    // Session exists but payment not completed
    return res.status(200).json({ premium: false });

  } catch (err) {
    console.error('Stripe verification error:', err.message);
    return res.status(400).json({ error: 'Could not verify payment — please contact support.' });
  }
};
