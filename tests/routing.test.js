import test from 'node:test'
import assert from 'node:assert/strict'
import { getRouteFromHash } from '../src/utils/routing.js'

test('admin hash routes preserve query IDs', () => {
  assert.deepEqual(getRouteFromHash('#admin-order?id=abc-123'), {
    page: 'admin-order', productId: null, sessionId: null, id: 'abc-123',
  })
  assert.equal(getRouteFromHash('#admin-product?id=product%20one').id, 'product one')
})

test('unknown hashes still resolve to the not-found route', () => {
  assert.equal(getRouteFromHash('#admin-secret').page, '404')
})

test('auth callbacks take precedence over page parsing', () => {
  assert.equal(getRouteFromHash('#access_token=token&refresh_token=refresh').page, 'profile')
})
