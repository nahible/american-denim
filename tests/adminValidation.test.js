import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canTransitionFulfillment,
  adminAccessState,
  inventoryAfterAdjustment,
  validateDiscount,
  validateProductForm,
  validateRefundAmount,
} from '../src/utils/adminValidation.js'

test('admin access waits for both auth and database role verification', () => {
  assert.equal(adminAccessState({ authLoading: true, roleLoading: false, user: null, isAdmin: false }), 'loading')
  assert.equal(adminAccessState({ authLoading: false, roleLoading: true, user: { id: '1' }, isAdmin: false }), 'loading')
  assert.equal(adminAccessState({ authLoading: false, roleLoading: false, user: null, isAdmin: false }), 'unauthenticated')
  assert.equal(adminAccessState({ authLoading: false, roleLoading: false, user: { id: '1' }, isAdmin: false }), 'unauthorized')
  assert.equal(adminAccessState({ authLoading: false, roleLoading: false, user: { id: '1' }, isAdmin: true }), 'authorized')
})

test('fulfillment transitions allow only forward operational states', () => {
  assert.equal(canTransitionFulfillment('unfulfilled', 'processing'), true)
  assert.equal(canTransitionFulfillment('processing', 'shipped'), true)
  assert.equal(canTransitionFulfillment('shipped', 'delivered'), true)
  assert.equal(canTransitionFulfillment('delivered', 'processing'), false)
  assert.equal(canTransitionFulfillment('canceled', 'shipped'), false)
})

test('inventory adjustment validation never returns a negative result', () => {
  assert.equal(inventoryAfterAdjustment(5, 'remove', 5), 0)
  assert.equal(inventoryAfterAdjustment(5, 'remove', 6), null)
  assert.equal(inventoryAfterAdjustment(5, 'add', 3), 8)
  assert.equal(inventoryAfterAdjustment(5, 'set', 2), 2)
})

test('product validation requires a name, safe slug, and known status', () => {
  assert.deepEqual(validateProductForm({ name: 'Ranch Jean', slug: 'ranch-jean', status: 'active' }), {})
  assert.ok(validateProductForm({ name: '', slug: 'Bad Slug', status: 'draft' }).name)
})

test('refund validation prevents invalid and excessive amounts', () => {
  assert.equal(validateRefundAmount(500, 1000, 200), null)
  assert.match(validateRefundAmount(900, 1000, 200), /exceeds/)
  assert.match(validateRefundAmount(0, 1000), /positive/)
})

test('discount validation handles percentage and fixed amounts', () => {
  assert.equal(validateDiscount({ code: 'DENIM20', discountType: 'percentage', value: 20 }), null)
  assert.equal(validateDiscount({ code: 'SAVE10', discountType: 'fixed_amount', value: 10 }), null)
  assert.match(validateDiscount({ code: 'x', discountType: 'percentage', value: 200 }), /3–32/)
})
