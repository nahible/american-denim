import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/20260804010000_secure_admin_panel.sql', import.meta.url)

test('admin migration keeps role and customer privacy enforcement database-side', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /create table if not exists public\.user_roles/)
  assert.match(sql, /security definer[\s\S]+set search_path = public[\s\S]+public\.is_admin/)
  assert.match(sql, /revoke all on table public\.user_roles from anon, authenticated/)
  assert.match(sql, /revoke update on table public\.users from authenticated/)
  assert.match(sql, /orders_admin_select[\s\S]+public\.is_admin\(\)/)
  assert.match(sql, /customer_order_refunds\(\)[\s\S]+o\.user_id = auth\.uid\(\)/)
  assert.doesNotMatch(sql, /create policy "refunds_customer_select"/)
  assert.match(sql, /revoke insert, update, delete on public\.orders from authenticated/)
  assert.match(sql, /revoke insert, update, delete on public\.order_items from authenticated/)
})

test('admin migration enforces transactional inventory and refund idempotency', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /admin_adjust_inventory/)
  assert.match(sql, /if next_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'/)
  assert.match(sql, /idempotency_key uuid not null unique/)
  assert.match(sql, /stripe_refund_id text unique/)
  assert.match(sql, /inventory_adjustments_reference_key/)
  assert.match(sql, /order_refund_restocks/)
  assert.match(sql, /refund-restock:/)
  assert.match(sql, /REFUND_TOTAL_EXCEEDS_ORDER/)
})

test('admin migration secures audit writes and customer refund projection', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /audit_admin_row_change\(\)[\s\S]+language plpgsql[\s\S]+security definer[\s\S]+set search_path = public/)
  assert.match(sql, /revoke all on function public\.audit_admin_row_change\(\) from public/)
  assert.match(sql, /customer_order_refunds\(\)[\s\S]+returns table \([\s\S]+restocked boolean/)
  assert.doesNotMatch(sql, /customer_order_refunds\(\)[\s\S]{0,900}(admin_user_id|idempotency_key|stripe_failure_reason|reason text)/)
})

test('admin migration makes financial reconciliation idempotent and validated', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /stripe_checkout_session_id text not null unique/)
  assert.match(sql, /stripe_event_id text not null unique/)
  assert.match(sql, /record_discount_redemption\([\s\S]+on conflict do nothing/)
  assert.match(sql, /metadata = coalesce\(metadata, '\{\}'::jsonb\)/)
  assert.match(sql, /DISCOUNT_EXCEEDS_SUBTOTAL/)
  assert.match(sql, /sum\(total - refunded_amount_cents \/ 100\.0\) as revenue/)
})
