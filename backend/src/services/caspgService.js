function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Calculate the simple location/time plausibility signal used by TrustTrace Gate 3.
 * This is a heuristic, not proof that a product is genuine or counterfeit.
 */
function assessMovement({ previous, current, maxSpeedKmh, maxAccuracyMeters = 150 }) {
  const maxSpeed = Number(maxSpeedKmh);
  const maxAccuracy = Number(maxAccuracyMeters);
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) {
    throw new Error('MAX_PLAUSIBLE_SPEED_KMH must be a positive number.');
  }
  if (!current || !Number.isFinite(current.latitude) || current.latitude < -90 || current.latitude > 90 ||
      !Number.isFinite(current.longitude) || current.longitude < -180 || current.longitude > 180) {
    return { distanceKm: null, elapsedSeconds: null, estimatedSpeedKmh: null, caspgStatus: 'INVALID_COORDINATES', reasonCode: 'INVALID_COORDINATES', isDuplicateScan: Boolean(previous), explanation: 'Provided GPS coordinates are missing or outside valid latitude/longitude bounds.' };
  }
  if (!Number.isFinite(current.accuracyMeters) || current.accuracyMeters < 0 || current.accuracyMeters > maxAccuracy) {
    return { distanceKm: null, elapsedSeconds: null, estimatedSpeedKmh: null, caspgStatus: 'LOCATION_UNCERTAIN', reasonCode: 'POOR_GPS_ACCURACY', isDuplicateScan: Boolean(previous), explanation: `GPS accuracy (${current.accuracyMeters} m) exceeds the maximum reliable threshold (${maxAccuracy} m).` };
  }
  if (!previous) {
    return { distanceKm: null, elapsedSeconds: null, estimatedSpeedKmh: null, caspgStatus: 'BASELINE_NO_PREVIOUS_SCAN', reasonCode: 'NO_PREVIOUS_USABLE_LOCATION', isDuplicateScan: false, explanation: 'First usable GPS scan recorded as the baseline location for this Product ID.' };
  }
  if (!Number.isFinite(previous.latitude) || previous.latitude < -90 || previous.latitude > 90 ||
      !Number.isFinite(previous.longitude) || previous.longitude < -180 || previous.longitude > 180) {
    return { distanceKm: null, elapsedSeconds: null, estimatedSpeedKmh: null, caspgStatus: 'LOCATION_UNCERTAIN', reasonCode: 'PREVIOUS_LOCATION_INVALID', isDuplicateScan: true, explanation: 'Previous scan coordinates were invalid; could not compute travel speed.' };
  }
  const nowMs = new Date(current.serverReceivedAt).getTime();
  const previousMs = new Date(previous.serverReceivedAt).getTime();
  const elapsedSeconds = Math.floor((nowMs - previousMs) / 1000);
  if (!Number.isFinite(nowMs) || !Number.isFinite(previousMs) || elapsedSeconds <= 0) {
    return { distanceKm: null, elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : null, estimatedSpeedKmh: null, caspgStatus: 'INVALID_TIME', reasonCode: 'NON_POSITIVE_OR_INVALID_ELAPSED_TIME', isDuplicateScan: true, explanation: 'Scan timestamps are simultaneous or non-positive; travel speed cannot be computed.' };
  }
  const distanceKm = haversineMeters(previous.latitude, previous.longitude, current.latitude, current.longitude) / 1000;
  const estimatedSpeedKmh = distanceKm / (elapsedSeconds / 3600);
  const suspicious = estimatedSpeedKmh > maxSpeed;
  const explanation = suspicious
    ? `Implausible movement detected across duplicate scans: ${distanceKm.toFixed(2)} km in ${elapsedSeconds}s (${estimatedSpeedKmh.toFixed(1)} km/h > ${maxSpeed} km/h threshold).`
    : `Duplicate scan movement is physically plausible: ${distanceKm.toFixed(2)} km in ${elapsedSeconds}s (${estimatedSpeedKmh.toFixed(1)} km/h <= ${maxSpeed} km/h threshold).`;
  return {
    distanceKm,
    elapsedSeconds,
    estimatedSpeedKmh,
    caspgStatus: suspicious ? 'SUSPICIOUS_MOVEMENT' : 'NO_TRAVEL_WARNING',
    reasonCode: suspicious ? 'IMPLAUSIBLE_MOVEMENT' : 'MOVEMENT_WITHIN_THRESHOLD',
    isDuplicateScan: true,
    explanation
  };
}

module.exports = { assessMovement, haversineMeters };
