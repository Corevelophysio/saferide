// SafeRide — OpenRouteService loop-routing proxy
// Keeps the ORS API key server-side so it is never exposed to clients.
// Accepts POST { coordinates, length, seed, avoid_polygons? } → ORS GeoJSON.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://saferide-cycling.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ORS_KEY = process.env.OPENROUTESERVICE_API_KEY;
  if (!ORS_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Routing service not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { coordinates, length, seed, avoid_polygons } = body;

  if (!Array.isArray(coordinates) || coordinates.length !== 1 ||
      typeof length !== 'number' || length < 500 || length > 200000) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid parameters' }) };
  }

  const orsBody = {
    coordinates,
    preference: 'recommended',
    // Prefer green (parks/residential) and quieter routes over commercial zones
    profile_params: {
      weightings: { green: 0.6, quiet: 0.3 },
    },
    options: {
      round_trip: {
        length: Math.round(length),
        points: 3,
        seed: typeof seed === 'number' ? seed : 0,
      },
      // Avoid motorways, toll roads, and other cyclist-hostile features
      avoid_features: ['highways', 'tollways', 'ferries', 'fords', 'steps'],
    },
  };

  // Add client-supplied avoid polygons (hotels, hospitals, parking, industrial, etc.)
  if (avoid_polygons && avoid_polygons.type && avoid_polygons.coordinates?.length) {
    orsBody.options.avoid_polygons = avoid_polygons;
  }

  try {
    const resp = await fetch('https://api.openrouteservice.org/v2/directions/cycling-regular/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ORS_KEY,
      },
      body: JSON.stringify(orsBody),
    });

    const text = await resp.text();

    if (!resp.ok) {
      console.error('ORS error', resp.status, text);
      // If avoid_polygons caused the failure, retry without them
      if (avoid_polygons && (resp.status === 400 || resp.status === 500)) {
        delete orsBody.options.avoid_polygons;
        const retry = await fetch('https://api.openrouteservice.org/v2/directions/cycling-regular/geojson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': ORS_KEY },
          body: JSON.stringify(orsBody),
        });
        if (retry.ok) return { statusCode: 200, headers, body: await retry.text() };
      }
      return { statusCode: resp.status, headers, body: JSON.stringify({ error: 'Routing service error', detail: resp.status }) };
    }

    return { statusCode: 200, headers, body: text };

  } catch (err) {
    console.error('ORS proxy fetch failed:', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not reach routing service' }) };
  }
};
