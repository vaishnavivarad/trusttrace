function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(a)));
}

const KNOWN_CITIES = [
  { name: 'Pune, Maharashtra', lat: 18.5204, lon: 73.8567 },
  { name: 'Mumbai, Maharashtra', lat: 19.0760, lon: 72.8777 },
  { name: 'New Delhi, Delhi', lat: 28.6139, lon: 77.2090 },
  { name: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946 },
  { name: 'Nagpur, Maharashtra', lat: 21.1458, lon: 79.0882 },
  { name: 'Nashik, Maharashtra', lat: 19.9975, lon: 73.7898 },
  { name: 'Chhatrapati Sambhajinagar, MH', lat: 19.8762, lon: 75.3433 },
  { name: 'Kolhapur, Maharashtra', lat: 16.7050, lon: 74.2433 },
  { name: 'Hyderabad, Telangana', lat: 17.3850, lon: 78.4867 },
  { name: 'Chennai, Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata, West Bengal', lat: 22.5726, lon: 88.3639 },
  { name: 'Ahmedabad, Gujarat', lat: 23.0225, lon: 72.5714 },
  { name: 'Jaipur, Rajasthan', lat: 26.9124, lon: 75.7873 }
];

function resolveLocationName(lat, lon, explicitName) {
  if (explicitName && String(explicitName).trim()) return String(explicitName).trim();
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return null;
  let best = null;
  let bestKm = Infinity;
  for (const c of KNOWN_CITIES) {
    const km = haversineMeters(nLat, nLon, c.lat, c.lon) / 1000;
    if (km < bestKm) {
      bestKm = km;
      best = c.name;
    }
  }
  if (best && bestKm <= 65) return best;
  return `Lat ${nLat.toFixed(3)}°, Lon ${nLon.toFixed(3)}°`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} sec`;
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (mins < 60) return remSec > 0 ? `${mins} min ${remSec} sec` : `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hrs < 24) return remMin > 0 ? `${hrs} hr ${remMin} min` : `${hrs} hr`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days} day(s) ${remHrs} hr` : `${days} day(s)`;
}

/**
 * Calculate the location, timestamp, minimum required travel time, and implied speed
 * plausibility signal used by TrustTrace Layer 3 (CASPG).
 */
function assessMovement({ previous, current, maxSpeedKmh = 120, maxAccuracyMeters = 50000 }) {
  const maxSpeed = Number(maxSpeedKmh) > 0 ? Number(maxSpeedKmh) : 120;
  const maxAccuracy = Number(maxAccuracyMeters) > 0 ? Number(maxAccuracyMeters) : 50000;

  if (!current || !Number.isFinite(current.latitude) || current.latitude < -90 || current.latitude > 90 ||
      !Number.isFinite(current.longitude) || current.longitude < -180 || current.longitude > 180) {
    return {
      distanceKm: null,
      elapsedSeconds: null,
      minRequiredSeconds: null,
      estimatedSpeedKmh: null,
      caspgStatus: 'INVALID_COORDINATES',
      reasonCode: 'INVALID_COORDINATES',
      isDuplicateScan: Boolean(previous),
      explanation: 'Provided GPS/network coordinates are missing or outside valid latitude/longitude bounds.'
    };
  }

  // Only reject accuracy if it is explicitly negative; allow network/IP/Wi-Fi accuracy on laptops & indoor phones.
  if (Number.isFinite(current.accuracyMeters) && current.accuracyMeters < 0) {
    return {
      distanceKm: null,
      elapsedSeconds: null,
      minRequiredSeconds: null,
      estimatedSpeedKmh: null,
      caspgStatus: 'LOCATION_UNCERTAIN',
      reasonCode: 'POOR_GPS_ACCURACY',
      isDuplicateScan: Boolean(previous),
      explanation: `Invalid negative GPS accuracy (${current.accuracyMeters} m).`
    };
  }

  const curName = resolveLocationName(current.latitude, current.longitude, current.locationName);
  const curLocLabel = `${curName} (${current.latitude.toFixed(4)}, ${current.longitude.toFixed(4)})`;

  if (!previous || !Number.isFinite(Number(previous.latitude)) || !Number.isFinite(Number(previous.longitude))) {
    return {
      distanceKm: 0,
      elapsedSeconds: 0,
      minRequiredSeconds: 0,
      formattedElapsed: '0 sec',
      formattedMinRequired: '0 sec',
      estimatedSpeedKmh: 0,
      thresholdSpeedKmh: maxSpeed,
      caspgStatus: 'NO_TRAVEL_WARNING',
      reasonCode: 'BASELINE_FIRST_SCAN_RECORDED',
      isDuplicateScan: false,
      previousLocationName: null,
      currentLocationName: curName,
      currentLatitude: current.latitude,
      currentLongitude: current.longitude,
      currentTimestamp: current.serverReceivedAt,
      explanation: `Initial scan location verified at ${curLocLabel}. Baseline timestamp & coordinates saved for future travel-speed checks.`
    };
  }

  const prevLat = Number(previous.latitude);
  const prevLon = Number(previous.longitude);
  const prevExplicit = previous.locationName || (String(previous.reasonCode || '').startsWith('LOC:') ? String(previous.reasonCode).slice(4) : null);
  const prevName = resolveLocationName(prevLat, prevLon, prevExplicit);
  const prevLocLabel = `${prevName} (${prevLat.toFixed(4)}, ${prevLon.toFixed(4)})`;
  const isOriginPrev = previous.caspgStatus === 'ORIGIN_REGISTERED' || previous.scanType === 'MANUFACTURER_ORIGIN' || String(previous.sessionId || '').startsWith('ORIGIN_');

  const nowMs = new Date(current.serverReceivedAt).getTime();
  const previousMs = new Date(previous.serverReceivedAt).getTime();
  const rawElapsedSeconds = Math.floor((nowMs - previousMs) / 1000);
  const elapsedSeconds = Number.isFinite(rawElapsedSeconds) ? Math.max(1, rawElapsedSeconds) : 1;

  const distanceKm = haversineMeters(prevLat, prevLon, current.latitude, current.longitude) / 1000;
  // Minimum physically required time (in seconds) to cover distanceKm at maxSpeed km/h
  const minRequiredSeconds = distanceKm <= 2.5 ? 0 : Math.ceil((distanceKm / maxSpeed) * 3600);
  const estimatedSpeedKmh = distanceKm <= 0.05 ? 0 : (distanceKm / (elapsedSeconds / 3600));

  // If within 2.5 km (same neighborhood/building/city zone), treat as local rescan (not inter-city travel)
  const isSameArea = distanceKm <= 2.5;
  const suspicious = !isSameArea && (elapsedSeconds < minRequiredSeconds || estimatedSpeedKmh > maxSpeed);

  const prevTypeLabel = isOriginPrev ? 'Manufacturer Registration Origin' : 'Previous Customer Scan';
  let explanation;
  if (isSameArea) {
    explanation = `Scanned within the same local area (${distanceKm.toFixed(2)} km from ${prevTypeLabel} at ${prevLocLabel}) after ${formatDuration(elapsedSeconds)}. Movement is physically plausible.`;
  } else if (suspicious) {
    explanation = `IMPOSSIBLE TRAVEL DETECTED: Product moved ${distanceKm.toFixed(1)} km from ${prevTypeLabel} [${prevLocLabel}] to Current Scan [${curLocLabel}] in only ${formatDuration(elapsedSeconds)}. At the maximum threshold speed of ${maxSpeed} km/h, this distance requires at least ${formatDuration(minRequiredSeconds)}, but implied speed was ${estimatedSpeedKmh.toFixed(1)} km/h!`;
  } else {
    explanation = `Plausible travel verified: Product moved ${distanceKm.toFixed(1)} km from ${prevTypeLabel} [${prevLocLabel}] to Current Scan [${curLocLabel}] in ${formatDuration(elapsedSeconds)} (minimum required time: ${formatDuration(minRequiredSeconds)} at ${maxSpeed} km/h; implied speed: ${estimatedSpeedKmh.toFixed(1)} km/h <= ${maxSpeed} km/h).`;
  }

  return {
    distanceKm: Number(distanceKm.toFixed(3)),
    elapsedSeconds,
    minRequiredSeconds,
    formattedElapsed: formatDuration(elapsedSeconds),
    formattedMinRequired: formatDuration(minRequiredSeconds),
    estimatedSpeedKmh: Number(estimatedSpeedKmh.toFixed(2)),
    thresholdSpeedKmh: maxSpeed,
    previousLocationName: prevName,
    previousLatitude: prevLat,
    previousLongitude: prevLon,
    previousTimestamp: previous.serverReceivedAt,
    previousScanType: isOriginPrev ? 'MANUFACTURER_ORIGIN' : 'CUSTOMER_SCAN',
    currentLocationName: curName,
    currentLatitude: current.latitude,
    currentLongitude: current.longitude,
    currentTimestamp: current.serverReceivedAt,
    caspgStatus: suspicious ? 'SUSPICIOUS_MOVEMENT' : 'NO_TRAVEL_WARNING',
    reasonCode: suspicious ? 'IMPLAUSIBLE_MOVEMENT' : (isSameArea ? 'SAME_AREA_PLAUSIBLE' : 'MOVEMENT_WITHIN_THRESHOLD'),
    isDuplicateScan: !isOriginPrev,
    explanation
  };
}

let cachedIpLocation = null;
let cachedIpLocationAt = 0;

async function detectNetworkLocation() {
  if (cachedIpLocation && (Date.now() - cachedIpLocationAt) < 10 * 60 * 1000) {
    return cachedIpLocation;
  }
  const providers = [
    async () => {
      const r = await fetch('http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon', { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      if (d?.status === 'success' && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lon))) {
        return {
          latitude: Number(d.lat),
          longitude: Number(d.lon),
          locationName: [d.city, d.regionName].filter(Boolean).join(', ') || 'Detected Network Location',
          source: 'network-ip'
        };
      }
      return null;
    },
    async () => {
      const r = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      if (d?.success !== false && Number.isFinite(Number(d?.latitude)) && Number.isFinite(Number(d?.longitude))) {
        return {
          latitude: Number(d.latitude),
          longitude: Number(d.longitude),
          locationName: [d.city, d.region].filter(Boolean).join(', ') || 'Detected Network Location',
          source: 'network-ip'
        };
      }
      return null;
    }
  ];
  for (const fn of providers) {
    try {
      const res = await fn();
      if (res) {
        cachedIpLocation = res;
        cachedIpLocationAt = Date.now();
        return res;
      }
    } catch { /* try next */ }
  }
  return {
    latitude: 18.5204,
    longitude: 73.8567,
    locationName: 'Pune, Maharashtra',
    source: 'default-regional-fallback'
  };
}

module.exports = { assessMovement, haversineMeters, formatDuration, resolveLocationName, detectNetworkLocation, KNOWN_CITIES };
