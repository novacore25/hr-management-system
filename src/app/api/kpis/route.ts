import {
  withAuth,
  requireUser,
  requireKpiRole,
  isUuid,
} from "@/server/dal/guards";
import {
  listKpis,
  listKpisIncludingTrash,
  listDepartmentKpis,
  findKpiById,
  createKpi,
  updateKpi,
  softDeleteKpi,
  softDeleteKpis,
  restoreKpi,
  restoreKpis,
  hardDeleteKpis,
  recalcKpiTarget,
  copyKpiToMonth,
  copyKpisFromMonth,
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
    const scope = searchParams.get("scope");

    if (id) return { kpi: await findKpiById(id) };

    // `scope=managed` — KPI milik divisi yang dikelola aktornya.
    //
    // formerly /dashboard/head/kpi-setup menyaring sendiri di browser:
    //   kpis.filter(k => managedDepartments.includes(k.department))
    // `managedDepartments` berisi id divisi, sedangkan `k.department` berisi
    // NAMA divisi — jadi perbandingan itu tidak pernah cocok dan halaman
    // selalu kosong. Divisi yang dikelola datang dari AuthContext, jadi
    // bisa dimanipulasi juga.
    if (scope === "managed") {
      const { requireProfile } = await import("@/server/dal/guards");
      const profile = await requireProfile();

      const isSuperRole = ["hr", "executive", "developer"].includes(
        profile.kpiRole,
      );
      const managedDepartments = Array.isArray(profile.managedDepartments)
        ? profile.managedDepartments
        : [];

      const { listManagedKpis } = await import("@/server/dal/kpi");
      return {
        kpis: await listManagedKpis(
          isSuperRole ? null : managedDepartments,
          year,
          month,
        ),
      };
    }

    if (dept) return { kpis: await listDepartmentKpis(dept, year, month) };

    if (searchParams.get("includeTrash") === "1") {
      // Melihat sampah = hak HR ke atas
      await requireKpiRole("hr", "executive");
      return { kpis: await listKpisIncludingTrash(year, month) };
    }

    return { kpis: await listKpis(year, month) };
  });
}

/**
 * POST /api/kpis — buat KPI baru, atau `action=copy-from-month`.
 *
 * formerly tombol "Copy dari Bulan Lalu" di /dashboard/hr/kpi membaca
 * semua KPI bulan lalu lalu `insert` sekali dari browser. Duplikat
 * disaring dengan `k.title + "|" + k.department`, padahal baris
 * Supabase tidak punya kolom `department` — jadi kuncinya selalu
 * `"judul|undefined"` untuk kedua sisi dan yang dibandingkan cuma judulnya.
 * KPI dengan judul sama di divisi berbeda tetap ikut tersalin.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");

    const b = await request.json();

    if (b.action === "copy-from-month") {
      const toYear = num(String(b.year), new Date().getFullYear());
      const toMonth = num(String(b.month), new Date().getMonth() + 1);

      if (toYear < 2000 || toYear > 2100 || toMonth < 1 || toMonth > 12) {
        return Response.json(
          { ok: false, error: "Bulan tujuan tidak valid." },
          { status: 400 },
        );
      }

      // Bulan sebelumnya dihitung server, bukan dari browser.
      const from = new Date(toYear, toMonth - 2, 1);
      const result = await copyKpisFromMonth(
        from.getFullYear(),
        from.getMonth() + 1,
        toYear,
        toMonth,
        actor.id,
      );

      return {
        ok: true,
        ...result,
        from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
      };
    }

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

/**
 * PATCH /api/kpis — ubah KPI / soft delete / restore.
 *
 * formerly halaman /dashboard/head/kpi-setup menulis `kpis` dan
 * `kpi_assignments` langsung dari browser. Dua masalahnya:
 *   - `kpis.update({ status })` tanpa cek siapa pemiliknya. Head bisa
 *     mengubah status KPI divisi mana pun hanya dengan mengirim `id`.
 *   - soft delete = dua operasi terpisah tanpa pemeriksaan hasil.
 *
 * Endpoint ini juga melayani /dashboard/hr/kpi (tab Sampah, Restore,
 * Hapus Permanen, Copy dari Bulan Lalu) — semuanya formerly dari
 * browser.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("head", "hr", "executive");
    const b = await request.json();
    const { action } = b;

    // Operasi massal: `ids` menggantikan `id`. formerly /dashboard/hr/kpi
    // menjalankan satu request per KPI dalam `for` biasa — kalau yang
    // ketujuh gagal, enam yang pertama sudah terlanjur dihapus tapi UI
    // tetap bilang "berhasil" untuk semuanya.
    const ids: string[] = Array.isArray(b.ids)
      ? b.ids.map(String)
      : b.id
        ? [String(b.id)]
        : [];

    if (ids.length === 0) {
      return Response.json(
        { ok: false, error: "Parameter 'id' atau 'ids' wajib diisi." },
        { status: 400 },
      );
    }

    // Semua id harus format uuid. Tanpa cek, `inArray` meledak jadi 500
    // "Terjadi kesalahan di server" untuk satu id nakal di tengah daftar.
    const malformed = ids.filter((id) => !isUuid(id));
    if (malformed.length > 0) {
      return Response.json(
        {
          ok: false,
          error: `Id KPI tidak valid: ${malformed.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const isSuperRole = ["hr", "executive", "developer"].includes(
      actor.kpiRole,
    );

    // Head hanya boleh menyentuh KPI di divisi yang dia kelola.
    // formerly tidak ada cek sama sekali.
    if (!isSuperRole) {
      const { assertCanManageKpi } = await import("@/server/dal/kpi");
      for (const id of ids) {
        const allowed = await assertCanManageKpi(id, {
          id: actor.id,
          kpiRole: actor.kpiRole,
          managedDepartments: Array.isArray(actor.managedDepartments)
            ? actor.managedDepartments
            : [],
        });
        if (!allowed.ok) {
          return Response.json({ ok: false, error: allowed.error }, {
            status: 403,
          });
        }
      }
    }

    if (action === "soft-delete") {
      if (ids.length === 1) {
        const result = await softDeleteKpi(ids[0], actor.id);
        return { ok: true, ids, ...result };
      }
      const result = await softDeleteKpis(ids, actor.id);
      return { ok: true, ids, ...result };
    }

    if (action === "restore") {
      if (ids.length === 1) {
        const result = await restoreKpi(ids[0], actor.id);
        return { ok: true, ids, ...result };
      }
      const result = await restoreKpis(ids, actor.id);
      return { ok: true, ids, ...result };
    }

    // Operasi lain hanya berlaku untuk satu KPI.
    if (ids.length !== 1) {
      return Response.json(
        {
          ok: false,
          error: `Aksi '${action ?? "ubah"}' hanya bisa untuk satu KPI sekaligus.`,
        },
        { status: 400 },
      );
    }

    const id = ids[0];

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
      "brand",
      "hideActual",
    ]) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (b.monthlyTarget !== undefined) {
      patch.monthlyTarget = Number(b.monthlyTarget);
    }

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { ok: false, error: "Tidak ada perubahan yang dikirim." },
        { status: 400 },
      );
    }

    // formerly `toggleHideActual` menulis `hide_actual` dari browser tanpa
    // cek sama sekali; sekarang lewat patch yang sama dan sudah dijaga.
    const kpi = await updateKpi(id, patch);

    // Target KPI ikut recalc kalau ada perubahan yang memengaruhi total
    if (b.monthlyTarget !== undefined) await recalcKpiTarget(id);

    return { kpi };
  });
}

/**
 * DELETE /api/kpis — hapus permanen.
 *
 * formerly /dashboard/hr/kpi menghapus tiga tabel dari browser:
 * `daily_reports`, lalu `kpi_assignments`, lalu `kpis`. Kalau langkah
 * pertama atau kedua gagal, yang tertinggal adalah baris yatim tanpa
 * KPI induknya — dan tidak ada yang pernah membersihkannya.
 *
 * Sekarang satu delete; `daily_reports` dan `kpi_assignments` ikut
 * terhapus karena keduanya `ON DELETE CASCADE`.
 *
 * Role: HR dan Executive. Dulu endpoint ini hanya Executive, padahal
 * halamannya milik HR — jadi fitur "Hapus Permanen" di tab Sampah tidak
 * bisa dipakai siapa pun. Role `tim` dan `head` tetap tidak boleh:
 * penghapusan permanen tidak bisa dibatalkan.
 */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const { searchParams } = new URL(request.url);

    const ids = [
      ...searchParams.getAll("id"),
      ...(searchParams.get("ids") ?? "").split(",").map((s) => s.trim()),
    ].filter(Boolean);

    if (ids.length === 0) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    const malformed = ids.filter((id) => !isUuid(id));
    if (malformed.length > 0) {
      return Response.json(
        { ok: false, error: `Id KPI tidak valid: ${malformed.join(", ")}` },
        { status: 400 },
      );
    }

    const { deleted, skipped } = await hardDeleteKpis(ids);

    if (deleted.length === 0) {
      return Response.json(
        {
          ok: false,
          error:
            "Tidak ada KPI yang dihapus. Hapus permanen hanya untuk KPI yang sudah ada di tab Sampah.",
        },
        { status: 409 },
      );
    }

    return { deleted, skipped };
  });
}