import test from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed } from '../config/cors.ts';

test('CORS allows Capacitor Android and iOS origins and same-host requests even with strict ALLOWED_ORIGINS', () => {
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  const prevPublic = process.env.PUBLIC_APP_URL;
  try {
    process.env.ALLOWED_ORIGINS = 'https://maidanlive.in,https://admin.maidanlive.in';

    assert.equal(isOriginAllowed('capacitor://localhost'), true);
    assert.equal(isOriginAllowed('ionic://localhost'), true);
    assert.equal(isOriginAllowed('https://localhost'), true);
    assert.equal(isOriginAllowed('http://localhost'), true);
    assert.equal(isOriginAllowed('https://maidanlive.in'), true);
    assert.equal(isOriginAllowed('https://admin.maidanlive.in'), true);
    assert.equal(
      isOriginAllowed(
        'https://ais-dev-example.asia-east1.run.app',
        'ais-dev-example.asia-east1.run.app'
      ),
      true
    );
    assert.equal(isOriginAllowed(undefined), true);
    assert.equal(isOriginAllowed('https://evil.example.com', 'maidanlive.in'), false);

    // When ALLOWED_ORIGINS is unset, PUBLIC_APP_URL alone must not block preview/dev origins
    delete process.env.ALLOWED_ORIGINS;
    process.env.PUBLIC_APP_URL = 'https://maidanlive.in';
    assert.equal(
      isOriginAllowed('https://ais-dev-example.asia-east1.run.app'),
      true
    );
  } finally {
    if (prevAllowed === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = prevAllowed;
    }
    if (prevPublic === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = prevPublic;
    }
  }
});
