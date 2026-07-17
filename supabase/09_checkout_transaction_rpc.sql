-- Architecture Upgrade Phase 3: atomic checkout transaction RPC
-- Safe to run after supabase/08_normalized_core_schema.sql.
-- This function is the future server-side path for creating invoices atomically.
-- The current UI can continue using local-first checkout while this RPC is prepared and tested.

create extension if not exists pgcrypto;

create or replace function public.create_checkout_transaction(p_command jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_branch uuid;
  v_customer uuid;
  v_technician uuid;
  v_created_by uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_idempotency_key text;
  v_existing jsonb;
  v_item jsonb;
  v_item_product uuid;
  v_item_name text;
  v_qty numeric;
  v_unit_price numeric;
  v_discount numeric;
  v_tax numeric;
  v_line_total numeric;
  v_response jsonb;
begin
  if coalesce((p_command->>'dryRun')::boolean, false) then
    return jsonb_build_object('ok', true, 'dryRun', true);
  end if;

  v_org := nullif(p_command->>'organizationId', '')::uuid;
  v_branch := nullif(p_command->>'branchId', '')::uuid;
  v_customer := nullif(p_command->>'customerId', '')::uuid;
  v_technician := nullif(p_command->>'technicianId', '')::uuid;
  v_created_by := nullif(p_command->>'createdBy', '')::uuid;
  v_idempotency_key := nullif(p_command->>'idempotencyKey', '');
  v_invoice_number := nullif(p_command->>'invoiceNumber', '');

  if v_org is null then
    raise exception 'organizationId is required';
  end if;
  if v_idempotency_key is null then
    raise exception 'idempotencyKey is required';
  end if;
  if v_invoice_number is null then
    raise exception 'invoiceNumber is required';
  end if;
  if jsonb_array_length(coalesce(p_command->'items', '[]'::jsonb)) = 0 then
    raise exception 'At least one invoice item is required';
  end if;

  select response into v_existing
  from public.idempotency_keys
  where organization_id = v_org and idempotency_key = v_idempotency_key;

  if v_existing is not null then
    return v_existing || jsonb_build_object('replayed', true);
  end if;

  insert into public.invoices(
    organization_id,
    branch_id,
    invoice_number,
    customer_id,
    customer_name,
    invoice_type,
    payment_method,
    paid_amount,
    remaining_amount,
    total_before_tax,
    total_tax,
    total_discount,
    grand_total,
    technician_id,
    technician_name,
    status,
    idempotency_key,
    issued_at,
    created_by
  ) values (
    v_org,
    v_branch,
    v_invoice_number,
    v_customer,
    nullif(p_command->>'customerName', ''),
    coalesce(nullif(p_command->>'invoiceType', ''), 'tax_invoice'),
    coalesce(nullif(p_command->>'paymentMethod', ''), 'cash'),
    coalesce((p_command->>'paidAmount')::numeric, 0),
    coalesce((p_command->>'remainingAmount')::numeric, 0),
    coalesce((p_command->>'totalBeforeTax')::numeric, 0),
    coalesce((p_command->>'totalTax')::numeric, 0),
    coalesce((p_command->>'totalDiscount')::numeric, 0),
    coalesce((p_command->>'grandTotal')::numeric, 0),
    v_technician,
    nullif(p_command->>'technicianName', ''),
    'active',
    v_idempotency_key,
    coalesce(nullif(p_command->>'issuedAt', '')::timestamptz, now()),
    v_created_by
  ) returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_command->'items') loop
    v_item_product := nullif(v_item->>'productId', '')::uuid;
    v_item_name := coalesce(nullif(v_item->>'itemName', ''), 'Item');
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unitPrice')::numeric, 0);
    v_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_tax := coalesce((v_item->>'taxRate')::numeric, 0);
    v_line_total := greatest(0, (v_qty * v_unit_price) - v_discount);

    if v_qty <= 0 then
      raise exception 'Invoice item quantity must be positive';
    end if;

    insert into public.invoice_items(
      organization_id,
      invoice_id,
      product_id,
      item_name,
      quantity,
      unit_price,
      discount,
      tax_rate,
      line_total
    ) values (
      v_org,
      v_invoice_id,
      v_item_product,
      v_item_name,
      v_qty,
      v_unit_price,
      v_discount,
      v_tax,
      v_line_total
    );

    if v_item_product is not null then
      insert into public.stock_movements(
        organization_id,
        branch_id,
        product_id,
        technician_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        reference_number,
        notes,
        created_by,
        idempotency_key
      ) values (
        v_org,
        v_branch,
        v_item_product,
        case when coalesce(v_item->>'source', 'main') = 'technician' then v_technician else null end,
        'SALE_OUT',
        v_qty * -1,
        'invoice',
        v_invoice_id,
        v_invoice_number,
        nullif(p_command->>'notes', ''),
        v_created_by,
        v_idempotency_key || ':' || coalesce(v_item->>'productId', v_item_name)
      );
    end if;
  end loop;

  if coalesce((p_command->>'paidAmount')::numeric, 0) > 0 then
    insert into public.payments(
      organization_id,
      branch_id,
      invoice_id,
      customer_id,
      amount,
      method,
      collected_by,
      created_by,
      idempotency_key
    ) values (
      v_org,
      v_branch,
      v_invoice_id,
      v_customer,
      coalesce((p_command->>'paidAmount')::numeric, 0),
      coalesce(nullif(p_command->>'paymentMethod', ''), 'cash'),
      v_technician,
      v_created_by,
      v_idempotency_key || ':payment'
    );
  end if;

  insert into public.audit_logs(
    organization_id,
    branch_id,
    actor_id,
    action,
    table_name,
    record_id,
    new_value,
    details
  ) values (
    v_org,
    v_branch,
    v_created_by,
    'invoice.create.transaction',
    'invoices',
    v_invoice_id::text,
    p_command,
    'Invoice created through atomic checkout RPC'
  );

  v_response := jsonb_build_object(
    'ok', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'idempotency_key', v_idempotency_key
  );

  insert into public.idempotency_keys(organization_id, idempotency_key, command_type, response)
  values (v_org, v_idempotency_key, 'checkout.create_invoice', v_response);

  return v_response;
end;
$$;
