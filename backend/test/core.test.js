const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineMeters } = require('../src/controllers/verificationController');
const { hashPassword, verifyPassword } = require('../src/services/passwordService');
const { makeToken, verify } = require('../src/services/tokenService');
const { assessMovement } = require('../src/services/caspgService');

test('Haversine returns zero for identical coordinates', () => {
  assert.equal(haversineMeters(18.5204, 73.8567, 18.5204, 73.8567), 0);
});
test('Haversine computes a realistic Pune-to-Delhi distance', () => {
  const km = haversineMeters(18.5204, 73.8567, 28.6139, 77.2090) / 1000;
  assert.ok(km > 1100 && km < 1250, `unexpected distance ${km} km`);
});
test('password hashing verifies correct password and rejects wrong password', async () => {
  const hash = await hashPassword('test-password-123');
  assert.notEqual(hash, 'test-password-123');
  assert.equal(await verifyPassword('test-password-123', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});
test('session tokens verify and contain a user subject', () => {
  const token = makeToken({ id: 'u-1', role: 'customer' });
  const payload = verify(token);
  assert.equal(payload.sub, 'u-1');
  assert.equal(payload.role, 'customer');
  assert.equal(verify(`${token}x`), null);
});

test('CASPG baseline does not pretend travel was checked on the first scan', () => {
  const result = assessMovement({ previous: null, current: { latitude: 18.5204, longitude: 73.8567, accuracyMeters: 10, serverReceivedAt: '2026-10-26T10:00:00.000Z' }, maxSpeedKmh: 120 });
  assert.equal(result.caspgStatus, 'BASELINE_NO_PREVIOUS_SCAN');
  assert.equal(result.estimatedSpeedKmh, null);
});
test('CASPG flags deliberately impossible travel', () => {
  const result = assessMovement({
    previous: { latitude: 18.5204, longitude: 73.8567, serverReceivedAt: '2026-10-26T10:00:00.000Z' },
    current: { latitude: 28.6139, longitude: 77.2090, accuracyMeters: 10, serverReceivedAt: '2026-10-26T10:20:00.000Z' },
    maxSpeedKmh: 120
  });
  assert.equal(result.caspgStatus, 'SUSPICIOUS_MOVEMENT');
  assert.ok(result.estimatedSpeedKmh > 120);
});
test('CASPG does not warn for nearby locations after a plausible interval', () => {
  const result = assessMovement({
    previous: { latitude: 18.5204, longitude: 73.8567, serverReceivedAt: '2026-10-26T10:00:00.000Z' },
    current: { latitude: 18.5300, longitude: 73.8600, accuracyMeters: 10, serverReceivedAt: '2026-10-26T10:50:00.000Z' },
    maxSpeedKmh: 120
  });
  assert.equal(result.caspgStatus, 'NO_TRAVEL_WARNING');
});
test('CASPG returns location uncertain for poor GPS accuracy', () => {
  const result = assessMovement({ previous: null, current: { latitude: 18.5204, longitude: 73.8567, accuracyMeters: 500, serverReceivedAt: '2026-10-26T10:00:00.000Z' }, maxSpeedKmh: 120, maxAccuracyMeters: 150 });
  assert.equal(result.caspgStatus, 'LOCATION_UNCERTAIN');
});
test('CASPG handles non-positive elapsed time safely', () => {
  const result = assessMovement({
    previous: { latitude: 18.5204, longitude: 73.8567, serverReceivedAt: '2026-10-26T10:00:00.000Z' },
    current: { latitude: 18.5300, longitude: 73.8600, accuracyMeters: 10, serverReceivedAt: '2026-10-26T09:59:59.000Z' },
    maxSpeedKmh: 120
  });
  assert.equal(result.caspgStatus, 'INVALID_TIME');
});
