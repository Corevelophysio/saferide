// SafeRide — ORS point-to-point routing proxy (Vercel)
// Accepts POST { start: [lng, lat], end: [lng, lat], traffic? }
// Returns ORS GeoJSON preferring quiet/green bike-friendly roads.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ORS_KEY = process.env.OPENROUTESERVICE_API_KEY;
  if (!ORS_KEY) return res.status(503).json({ error: 'Routing service not configured' });

  const { start, end, traffic } = req.body || {};

  if (!Array.isArray(start) || start.length !== 2 ||
      !Array.isArray(end)   || end.length !== 2) {
    return res.status(400).json({ error: 'Invalid parameters — need start and end as [lng, lat]' });
  }

  // Increase quiet weighting in heavy traffic to push harder onto residential streets
  const quietW = traffic === 'high' ? 0.5 : traffic === 'moderate' ? 0.4 : 0.3;

  const orsBody = {
    coordinates: [start, end],
    preference: 'recommended',
    profile_params: {
      weightings: { green: 0.6, quiet: quietW },
    },
    options: {
      avoid_features: ['highways', 'tollways', 'ferries', 'fords', 'steps'],
    },
  };

  try {
    const resp = await fetch(
      'https://api.openrouteservice.org/v2/directions/cycling-regular/geojson',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': ORS_KEY },
        body: JSON.stringify(orsBody),
      }
    );

    const text = await resp.text();

    if (!resp.ok) {
      console.error('ORS P2P error', resp.status, text);
      return res.status(resp.status).json({ error: 'Routing service error', detail: resp.status });
    }

    res.status(200).send(text);
  } catch (err) {
    console.error('ORS P2P fetch failed:', err.message);
    res.status(502).json({ error: 'Could not reach routing service' });
  }
};
