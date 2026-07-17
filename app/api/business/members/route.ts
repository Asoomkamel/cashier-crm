import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, normalizeSaudiPhone } from "@/lib/server/authentica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest, businessId: string) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing access token." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, status: 401, error: "Invalid or expired session." };
  }

  const { data: memberships, error: memberError } = await admin
    .from("business_members")
    .select("id, role, created_at")
    .eq("user_id", data.user.id)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(1);

  const membership = Array.isArray(memberships) ? memberships[0] : null;

  if (memberError) {
    return { ok: false as const, status: 500, error: memberError.message };
  }
  if (!membership || membership.role !== "admin") {
    return { ok: false as const, status: 403, error: "Admin role required." };
  }

  return { ok: true as const, admin };
}

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ ok: false, error: "Missing businessId." }, { status: 400 });
    }

    const auth = await requireAdmin(request, businessId);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { data, error } = await auth.admin
      .from("business_members")
      .select(
        "id, phone, full_name, role, permissions, specializations, assigned_products, inventory_categories, created_at",
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, members: data || [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected error." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const businessId = body?.businessId as string | undefined;
    if (!businessId) {
      return NextResponse.json({ ok: false, error: "Missing businessId." }, { status: 400 });
    }

    const auth = await requireAdmin(request, businessId);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const phone = normalizeSaudiPhone(String(body?.phone ?? ""));
    if (!phone) {
      return NextResponse.json({ ok: false, error: "رقم جوال غير صحيح." }, { status: 400 });
    }

    const role = String(body?.role ?? "technician");
    if (!["admin", "supervisor", "technician", "pos"].includes(role)) {
      return NextResponse.json({ ok: false, error: "صلاحية غير صحيحة." }, { status: 400 });
    }

    const record = {
      business_id: businessId,
      phone,
      full_name: body?.fullName || phone,
      role,
      permissions: body?.permissions || {},
      specializations: Array.isArray(body?.specializations) ? body.specializations : [],
      assigned_products: Array.isArray(body?.assignedProducts) ? body.assignedProducts : [],
      inventory_categories: Array.isArray(body?.inventoryCategories) ? body.inventoryCategories : [],
    };

    const memberId = body?.id as string | undefined;
    const { data, error } = memberId
      ? await auth.admin
          .from("business_members")
          .update(record)
          .eq("id", memberId)
          .eq("business_id", businessId)
          .select()
          .single()
      : await auth.admin.from("business_members").insert(record).select().single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, member: data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected error." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    const memberId = request.nextUrl.searchParams.get("id");
    if (!businessId || !memberId) {
      return NextResponse.json({ ok: false, error: "Missing businessId or id." }, { status: 400 });
    }

    const auth = await requireAdmin(request, businessId);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { error } = await auth.admin
      .from("business_members")
      .delete()
      .eq("id", memberId)
      .eq("business_id", businessId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected error." }, { status: 500 });
  }
}
