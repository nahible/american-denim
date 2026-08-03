-- Validate checkout items without creating an order or changing inventory.
-- This mirrors the availability checks used by create_customer_order while
-- returning the product and price data that Stripe Checkout can safely use.

create or replace function public.validate_checkout_items(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested record;
  variant_record record;
  line_items jsonb := '[]'::jsonb;
  item_count integer := 0;
  checkout_currency text := null;
  variant_uuid uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'EMPTY_CART',
        'message', 'Add an item to your cart before checking out.'
      )
    );
  end if;

  -- Aggregate duplicate variants before checking current availability.
  for requested in
    select variant_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as input(variant_id text, quantity integer)
    group by variant_id
    order by variant_id
  loop
    begin
      variant_uuid := requested.variant_id::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'INVALID_VARIANT',
          'message', 'One or more selected product variants are invalid.',
          'details', jsonb_build_object('variantId', requested.variant_id, 'remove', true)
        )
      );
    end;

    if requested.quantity is null or requested.quantity <= 0 then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'INVALID_QUANTITY',
          'message', 'Product quantities must be greater than zero.',
          'details', jsonb_build_object('variantId', requested.variant_id)
        )
      );
    end if;

    select
      pv.id,
      pv.name as variant_name,
      pv.price,
      pv.currency,
      pv.stock_quantity,
      p.name as product_name,
      p.status as product_status
    into variant_record
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = variant_uuid;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'INVALID_VARIANT',
          'message', 'One or more selected product variants are no longer available.',
          'details', jsonb_build_object('variantId', requested.variant_id, 'remove', true)
        )
      );
    end if;

    if variant_record.product_status <> 'active' then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'PRODUCT_UNAVAILABLE',
          'message', format('%s is no longer available.', variant_record.product_name),
          'details', jsonb_build_object('variantId', requested.variant_id, 'remove', true)
        )
      );
    end if;

    if variant_record.stock_quantity < requested.quantity then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'OUT_OF_STOCK',
          'message', format('%s has only %s available.', variant_record.product_name, variant_record.stock_quantity),
          'details', jsonb_build_object(
            'variantId', requested.variant_id,
            'availableQuantity', variant_record.stock_quantity,
            'currentPrice', variant_record.price
          )
        )
      );
    end if;

    if checkout_currency is not null and checkout_currency <> upper(coalesce(variant_record.currency, 'USD')) then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'CURRENCY_MISMATCH',
          'message', 'All checkout items must use the same currency.'
        )
      );
    end if;

    checkout_currency := upper(coalesce(variant_record.currency, 'USD'));
    item_count := item_count + 1;
    line_items := line_items || jsonb_build_array(jsonb_build_object(
      'variant_id', variant_record.id,
      'product_name', variant_record.product_name,
      'variant_name', coalesce(variant_record.variant_name, 'Standard option'),
      'quantity', requested.quantity,
      'unit_price', variant_record.price,
      'currency', checkout_currency
    ));
  end loop;

  if item_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'EMPTY_CART', 'message', 'Your cart is empty.')
    );
  end if;

  return jsonb_build_object('ok', true, 'items', line_items);
end;
$$;

revoke all on function public.validate_checkout_items(jsonb) from public;
grant execute on function public.validate_checkout_items(jsonb) to service_role;
