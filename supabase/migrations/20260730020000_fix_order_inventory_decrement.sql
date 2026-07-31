-- Corrective replacement for create_customer_order.
-- The previously applied function used the final loop value when reserving
-- inventory. This replacement preserves the same signature and validation
-- contract, but decrements each locked variant by its own reserved quantity.

create or replace function public.create_customer_order(
  p_user_id uuid,
  p_items jsonb,
  p_contact jsonb,
  p_shipping_address jsonb,
  p_billing_address jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requested record;
  variant_record record;
  line_items jsonb := '[]'::jsonb;
  subtotal numeric(12, 2) := 0;
  line_total numeric(12, 2);
  order_record public.orders;
  item_count integer := 0;
  variant_uuid uuid;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'UNAUTHENTICATED',
        'message', 'You need to sign in before submitting an order.'
      )
    );
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'EMPTY_CART',
        'message', 'Add an item to your cart before submitting an order.'
      )
    );
  end if;

  -- Aggregate duplicate variants before checking stock.
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

    -- Keep the row lock so validation and reservation are atomic.
    select
      pv.id,
      pv.product_id,
      pv.name as variant_name,
      pv.price,
      pv.currency,
      pv.stock_quantity,
      p.name as product_name,
      p.status as product_status
    into variant_record
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = variant_uuid
    for update of pv;

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

    line_total := variant_record.price * requested.quantity;
    subtotal := subtotal + line_total;
    item_count := item_count + 1;
    line_items := line_items || jsonb_build_array(jsonb_build_object(
      'variant_id', variant_record.id,
      'product_id', variant_record.product_id,
      'product_name', variant_record.product_name,
      'variant_name', coalesce(variant_record.variant_name, 'Standard option'),
      'quantity', requested.quantity,
      'unit_price', variant_record.price,
      'currency', coalesce(variant_record.currency, 'USD'),
      'line_total', line_total
    ));
  end loop;

  if item_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'EMPTY_CART', 'message', 'Your cart is empty.')
    );
  end if;

  insert into public.orders (
    user_id,
    status,
    currency,
    subtotal,
    shipping_total,
    tax_total,
    discount_total,
    total,
    metadata
  ) values (
    p_user_id,
    'pending',
    'USD',
    subtotal,
    0,
    0,
    0,
    subtotal,
    jsonb_build_object(
      'contact', coalesce(p_contact, '{}'::jsonb),
      'shipping_address', coalesce(p_shipping_address, '{}'::jsonb),
      'billing_address', coalesce(p_billing_address, '{}'::jsonb)
    )
  ) returning * into order_record;

  insert into public.order_items (
    order_id,
    product_id,
    variant_id,
    product_name,
    variant_name,
    quantity,
    unit_price,
    currency,
    metadata
  )
  select
    order_record.id,
    (line_item->>'product_id')::uuid,
    (line_item->>'variant_id')::uuid,
    line_item->>'product_name',
    line_item->>'variant_name',
    (line_item->>'quantity')::integer,
    (line_item->>'unit_price')::numeric,
    coalesce(line_item->>'currency', 'USD'),
    jsonb_build_object('line_total', (line_item->>'line_total')::numeric)
  from jsonb_array_elements(line_items) as lines(line_item);

  -- Use the quantity belonging to each row in line_items. This is the
  -- critical correction: it never reuses the final requested loop value.
  update public.product_variants pv
  set stock_quantity = pv.stock_quantity - reserved.quantity,
      updated_at = now()
  from jsonb_to_recordset(line_items) as reserved(variant_id uuid, quantity integer)
  where pv.id = reserved.variant_id;

  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', order_record.id,
      'status', order_record.status,
      'total', order_record.total,
      'currency', order_record.currency,
      'created_at', order_record.created_at
    )
  );
end;
$$;

revoke all on function public.create_customer_order(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_customer_order(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
