-- ============================================================================
-- Migration 13: Enhanced Checkout Transaction RPC — Phase 5
--
-- Replaces/supplements supabase/09_checkout_transaction_rpc.sql.
-- Adds: stock deduction, technician inventory, financial logs, audit, idempotency.
--
-- Safe to run multiple times (CREATE OR REPLACE).
-- ============================================================================

create or replace function public.create_checkout_transaction(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org                uuid;
  v_branch             uuid;
  v_customer_id        uuid;
  v_technician_id      uuid;
  v_created_by         uuid;
  v_invoice_id         uuid;
  v_invoice_number     text;
  v_idempotency_key    text;
  v_existing_response  jsonb;
  v_item               jsonb;
  v_product_id         uuid;
  v_item_name          text;
  v_qty                numeric;
  v_unit_price         numeric;
  v_discount           numeric;
  v_tax                numeric;
  v_line_total         numeric;
  v_current_stock      numeric;
  v_tech_qty           numeric;
  v_use_tech_stock     boolean;
  v_paid_amount        numeric;
  v_grand_total        numeric;
  v_remaining          numeric;
  v_tech_commission    numeric;
  v_marketing_comm     numeric;
  v_response           jsonb;
begin
  -- Dry-run support (used by health check)
  if coalesce((p_command->>'dryRun')::boolean, false) then
    return jsonb_build_object('ok', true, 'dryRun', true);
  end if;

  -- ── Validate inputs ──────────────────────────────────────────────────────
  v_org              := nullif(p_command->>'organizationId', '')::uuid;
  v_branch           := nullif(p_command->>'branchId', '')::uuid;
  v_customer_id      := nullif(p_command->>'customerId', '')::uuid;
  v_technician_id    := nullif(p_command->>'technicianId', '')::uuid;
  v_created_by       := nullif(p_command->>'createdBy', '')::uuid;
  v_idempotency_key  := nullif(p_command->>'idempotencyKey', '');
  v_invoice_number   := nullif(p_command->>'invoiceNumber', '');
  v_paid_amount      := coalesce((p_command->>'paidAmount')::numeric, 0);
  v_grand_total      := coalesce((p_command->>'grandTotal')::numeric, 0);
  v_remaining        := v_grand_total - v_paid_amount;
  v_tech_commission  := coalesce((p_command->>'technicianCommission')::numeric, 0);
  v_marketing_comm   := coalesce((p_command->>'marketingCommission')::numeric, 0);
  v_use_tech_stock   := coalesce((p_command->>'useTechnicianStock')::boolean, false);

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
    raise exception 'At least one item is required';
  end if;

  -- ── Idempotency check ────────────────────────────────────────────────────
  select response into v_existing_response
  from public.idempotency_keys
  where organization_id = v_org and idempotency_key = v_idempotency_key;

  if v_existing_response is not null then
    return v_existing_response || jsonb_build_object('replayed', true);
  end if;

  -- ── Stock availability check ─────────────────────────────────────────────
  for v_item in select * from jsonb_array_elements(p_command->'items')
  loop
    v_product_id := nullif(v_item->>'productId', '')::uuid;
    v_qty        := coalesce((v_item->>'quantity')::numeric, 1);

    if v_product_id is null then continue; end if; -- manual / service items

    if v_use_tech_stock and v_technician_id is not null then
      select qty into v_tech_qty
      from public.technician_inventory
      where organization_id = v_org
        and technician_id = v_technician_id
        and product_id = v_product_id;

      if coalesce(v_tech_qty, 0) < v_qty then
        -- Fallback to main stock if not enough in tech inventory
        select coalesce(sb.current_stock, 0) into v_current_stock
        from public.stock_balances sb
        where sb.organization_id = v_org and sb.product_id = v_product_id;

        if coalesce(v_current_stock, 0) < v_qty then
          raise exception 'insufficient_stock:%:%',
            v_product_id::text, v_qty::text
            using hint = 'Not enough stock in technician or main inventory.';
        end if;
        -- Use main stock for this item
        v_use_tech_stock := false;
      end if;
    else
      select coalesce(sb.current_stock, 0) into v_current_stock
      from public.stock_balances sb
      where sb.organization_id = v_org and sb.product_id = v_product_id;

      if coalesce(v_current_stock, 0) < v_qty then
        raise exception 'insufficient_stock:%:%',
          v_product_id::text, v_qty::text
          using hint = 'Not enough main stock.';
      end if;
    end if;
  end loop;

  -- ── Insert invoice ───────────────────────────────────────────────────────
  insert into public.invoices (
    organization_id, branch_id, invoice_number, customer_id, customer_name,
    invoice_type, payment_method, paid_amount, remaining_amount,
    total_before_tax, total_tax, total_discount, grand_total,
    technician_id, technician_name, status, idempotency_key, issued_at, created_by
  ) values (
    v_org, v_branch, v_invoice_number, v_customer_id,
    nullif(p_command->>'customerName', ''),
    coalesce(nullif(p_command->>'invoiceType', ''), 'tax_invoice'),
    coalesce(nullif(p_command->>'paymentMethod', ''), 'cash'),
    v_paid_amount, v_remaining,
    coalesce((p_command->>'totalBeforeTax')::numeric, 0),
    coalesce((p_command->>'totalTax')::numeric, 0),
    coalesce((p_command->>'totalDiscount')::numeric, 0),
    v_grand_total,
    v_technician_id,
    nullif(p_command->>'technicianName', ''),
    'active', v_idempotency_key, now(), v_created_by
  )
  returning id into v_invoice_id;

  -- ── Insert items + stock movements ───────────────────────────────────────
  for v_item in select * from jsonb_array_elements(p_command->'items')
  loop
    v_product_id := nullif(v_item->>'productId', '')::uuid;
    v_item_name  := coalesce(nullif(v_item->>'itemName', ''), 'Item');
    v_qty        := coalesce((v_item->>'quantity')::numeric, 1);
    v_unit_price := coalesce((v_item->>'unitPrice')::numeric, 0);
    v_discount   := coalesce((v_item->>'discount')::numeric, 0);
    v_tax        := coalesce((v_item->>'taxRate')::numeric, 0);
    v_line_total := greatest(0, v_qty * v_unit_price - v_discount);

    insert into public.invoice_items (
      organization_id, invoice_id, product_id, item_name,
      quantity, unit_price, discount, tax_rate, line_total
    ) values (
      v_org, v_invoice_id, v_product_id, v_item_name,
      v_qty, v_unit_price, v_discount, v_tax, v_line_total
    );

    if v_product_id is not null then
      if v_use_tech_stock and v_technician_id is not null then
        -- Deduct from technician inventory
        update public.technician_inventory
        set qty = qty - v_qty, updated_at = now()
        where organization_id = v_org
          and technician_id = v_technician_id
          and product_id = v_product_id;

        -- Record technician stock movement
        insert into public.stock_movements (
          organization_id, branch_id, product_id, technician_id,
          movement_type, quantity, reference_type, reference_id,
          notes, created_by, created_at
        ) values (
          v_org, v_branch, v_product_id, v_technician_id,
          'TECHNICIAN_CONSUME', v_qty, 'invoice', v_invoice_id::text,
          'فاتورة رقم ' || v_invoice_number,
          v_created_by, now()
        );
      else
        -- Deduct from main stock
        insert into public.stock_movements (
          organization_id, branch_id, product_id,
          movement_type, quantity, reference_type, reference_id,
          notes, created_by, created_at
        ) values (
          v_org, v_branch, v_product_id,
          'SALE_OUT', v_qty, 'invoice', v_invoice_id::text,
          'فاتورة رقم ' || v_invoice_number,
          v_created_by, now()
        );
      end if;
    end if;
  end loop;

  -- ── Payment record ───────────────────────────────────────────────────────
  if v_paid_amount > 0 then
    insert into public.payments (
      organization_id, branch_id, invoice_id, customer_id,
      amount, method, paid_at, external_id
    ) values (
      v_org, v_branch, v_invoice_id, v_customer_id,
      v_paid_amount,
      coalesce(nullif(p_command->>'paymentMethod', ''), 'cash'),
      now(),
      v_invoice_id::text || ':payment'
    );
  end if;

  -- ── Technician financial logs ─────────────────────────────────────────────
  if v_technician_id is not null then
    -- Cash collection record (if cash payment to technician)
    if (p_command->>'paymentMethod') = 'cash' and v_paid_amount > 0 then
      insert into public.technician_financial_transactions (
        organization_id, branch_id, technician_id, technician_name,
        transaction_type, amount, method, reference_type, invoice_id, notes
      ) values (
        v_org, v_branch, v_technician_id,
        coalesce(nullif(p_command->>'technicianName', ''), 'Unknown'),
        'cash_collection', v_paid_amount, 'cash', 'invoice', v_invoice_id,
        'تحصيل نقدي - فاتورة ' || v_invoice_number
      );
    end if;

    -- Completion commission
    if v_tech_commission > 0 then
      insert into public.technician_financial_transactions (
        organization_id, branch_id, technician_id, technician_name,
        transaction_type, amount, reference_type, invoice_id, notes
      ) values (
        v_org, v_branch, v_technician_id,
        coalesce(nullif(p_command->>'technicianName', ''), 'Unknown'),
        'completion_commission', v_tech_commission, 'invoice', v_invoice_id,
        'عمولة إنجاز - فاتورة ' || v_invoice_number
      );
    end if;

    -- Marketing commission
    if v_marketing_comm > 0 then
      insert into public.technician_financial_transactions (
        organization_id, branch_id, technician_id, technician_name,
        transaction_type, amount, reference_type, invoice_id, notes
      ) values (
        v_org, v_branch, v_technician_id,
        coalesce(nullif(p_command->>'technicianName', ''), 'Unknown'),
        'marketing_commission', v_marketing_comm, 'invoice', v_invoice_id,
        'عمولة تسويق - فاتورة ' || v_invoice_number
      );
    end if;
  end if;

  -- ── Build response ────────────────────────────────────────────────────────
  v_response := jsonb_build_object(
    'ok',            true,
    'invoiceId',     v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'grandTotal',    v_grand_total,
    'paidAmount',    v_paid_amount,
    'remaining',     v_remaining
  );

  -- ── Save idempotency record ────────────────────────────────────────────────
  insert into public.idempotency_keys (
    organization_id, idempotency_key, response
  ) values (v_org, v_idempotency_key, v_response)
  on conflict (organization_id, idempotency_key) do nothing;

  -- ── Audit log ─────────────────────────────────────────────────────────────
  begin
    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id,
      after_data, created_at
    ) values (
      v_org, v_created_by, 'insert', 'invoice', v_invoice_id::text,
      v_response, now()
    );
  exception when others then
    null; -- don't fail the transaction for audit
  end;

  return v_response;

exception
  when others then
    raise exception '%', sqlerrm;
end;
$$;

revoke execute on function public.create_checkout_transaction(jsonb) from anon, authenticated;
