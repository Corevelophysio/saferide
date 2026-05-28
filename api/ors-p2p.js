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
  console.log('ORS key present:', !!ORS_KEY, '| key prefix:', ORS_KEY ? ORS_KEY.slice(0, 8) : 'MISSING');
  if (!ORS_KEY) {
    console.error('OPENROUTESERVICE_API_KEY env var is not set');
    return res.status(503).json({ error: 'Routing service not configured' });
  }

  const { start, end, traffic } = req.body || {};
  console.log('ORS P2P request:', { start, end, traffic });

  if (!Array.isArray(start) || start.length !== 2 ||
      !Array.isArray(end)   || end.length !== 2) {
    return res.status(400).json({ error: 'Invalid parameters — need start and end as [lng, lat]' });
  }

  // ORS v9+ cycling-regular: profile_params removed, highways/tollways not valid avoid_features.
  // Use 'recommended' preference which routes on cycling-appropriate roads by default.
  const orsBody = {
    coordinates: [start, end],
    preference: 'recommended',
    options: {
      avoid_features: ['ferries', 'fords', 'steps'],
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
