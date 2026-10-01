import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import {
  listKpis,
  listKpisIncludingTrash,
  listDepartmentKpis,
  findKpiById,
  createKpi,
  updateKpi,
  softDeleteKpi,
  restoreKpi,
  hardDeleteKpi,
  recalcKpiTarget,
  copyKpiToMonth,
  type NewKpiInput,
} from "@/server/dal/kpi";

export const dynamic = "force-dynamic";

function num(v: string | null, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** GET /api/kpis */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const year = num(searchParams.get("year"), new Date().getFullYear());
    const month = num(searchParams.get("month"), new Date().getMonth() + 1);
    const dept = searchParams.get("department");
    const id = searchParams.get("id");

    if (id) return { kpi: await findKpiById(id) };

    if (dept) return { kpis: await listDepartmentKpis(dept, year, month) };

    if (searchParams.get("includeTrash") === "1") {
      // Melihat sampah = hak HR ke atas
      await requireKpiRole("hr", "executive");
      return { kpis: await listKpisIncludingTrash(year, month) };
    }

    return { kpis: await listKpis(year, month) };
  });
}

/** POST /api/kpis — buat KPI baru. HR/Executive/Developer. */
export async function POST(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");

    const b = await request.json();

    if (!b.title?.trim()) {
      return Response.json(
        { ok: false, error: "Judul KPI wajib diisi." },
        { status: 400 },
      );
    }

    const input: NewKpiInput = {
      title: b.title.trim(),
      description: b.description ?? null,
      type: b.type ?? "result",
      unit: b.unit ?? "number",
      period: b.period ?? "monthly",
      monthlyTarget: Number(b.monthlyTarget ?? 0),
      year: num(String(b.year), new Date().getFullYear()),
      month: num(String(b.month), new Date().getMonth() + 1),
      status: b.status ?? "draft",
      createdBy: actor.id,
      departmentId: b.departmentId ?? null,
      hideActual: Boolean(b.hideActual),
    };

    return { kpi: await createKpi(input) };
  });
}

/** PATCH /api/kpis — ubah KPI / soft delete / restore. */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const b = await request.json();
    const { id, action } = b;

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    if (action === "soft-delete") {
      await softDeleteKpi(id);
      return { ok: true, id };
    }

    if (action === "restore") {
      await restoreKpi(id);
      return { ok: true, id };
    }

    if (action === "recalc-target") {
      const total = await recalcKpiTarget(id);
      return { ok: true, monthlyTarget: total };
    }

    if (action === "copy") {
      const kpi = await copyKpiToMonth(
        id,
        num(String(b.year), new Date().getFullYear()),
        num(String(b.month), new Date().getMonth() + 1),
      );
      return { kpi };
    }

    const patch: Record<string, unknown> = {};
    for (const k of [
      "title",
      "description",
      "type",
      "unit",
      "period",
      "status",
      "departmentId",
      "hideActual",
    ]) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (b.monthlyTarget !== undefined) {
      patch.monthlyTarget = Number(b.monthlyTarget);
    }

    const kpi = await updateKpi(id, patch);

    // Target KPI ikut recalc kalau ada perubahan yang memengaruhi total
    if (b.monthlyTarget !== undefined) await recalcKpiTarget(id);

    return { kpi };
  });
}

/** DELETE /api/kpis — hapus permanen. Executive/Developer only. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("executive");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    await hardDeleteKpi(id);
    return { deleted: id };
  });
}