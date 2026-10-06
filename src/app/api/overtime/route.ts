import {
  withAuth,
  requireUser,
  requireProfile,
  requireKpiRole,
  ValidationError,
  ForbiddenError,
  isUuid,
} from "@/server/dal/guards";
import {
  listOvertimeRequests,
  listOvertimeForUser,
  findOvertimeById,
  createOvertimeRequest,
  approveOvertime,
  rejectOvertime,
  submitOvertimeReport,
  setFinalDuration,
  finalizeOvertime,
  cancelOwnOvertime,
  deleteOvertime,
  listPayrollStaffSettings,
  getBaseSalary,
} from "@/server/dal/overtime";
import { cekStorage, fotoBisaDibuka } from "@/server/storage/overtimeProofs";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * GET /api/overtime
 *
 *   scope=mine                  → pengajuan milik user yang login
 *   from=YYYY-MM-DD&to=...      → rentang (HR/Executive/Developer)
 *   id=<uuid>                   → satu pengajuan
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const id = searchParams.get("id");
    if (id) {
      if (!isUuid(id)) {
        throw new ValidationError("Parameter 'id' bukan id yang valid.");
      }

      const row = await findOvertimeById(id);
      if (!row) {
        return Response.json(
          { ok: false, error: "Pengajuan tidak ditemukan." },
          { status: 404 },
        );
      }

      // Pemilik boleh melihat miliknya; role di atas boleh semua.
      if (row.userId !== me.id) {
        const p = await requireKpiRole("hr", "executive");
        if (p.kpiRole !== "developer" && p.kpiRole !== "hr" && p.kpiRole !== "executive") {
          throw new ForbiddenError("Anda tidak bisa melihat pengajuan orang lain.");
        }
      }

      return { overtime: row, baseSalary: String(await getBaseSalary(row.userId)) };
    }

    // `storage` dikirim supaya UI bisa menampilkan peringatan lebih awal.
    // formerly UI hanya mencoba mengunggah lalu baru tahu dari toast --
    // staf sudah menyelesaikan laporan, memotret foto, memilih file,
    // baru ditolak. Memindahkan pengecekan ke GET membuat kegagalan
    // diketahui SEBELUM pekerjaan itu dilakukan.
    const storage = cekStorage();

    const scope = searchParams.get("scope");

    if (scope === "mine") {
      return { requests: await listOvertimeForUser(me.id), storage };
    }

    /**
     * `scope=today` — siapa saja yang lembur hari ini.
     *
     * formerly `overtime_requests.select("*, users!...")` dengan filter
     * tanggal hari ini dari browser, jadi **semua** kolom ikut terbaca:
     * termasuk `tasks`, `staff_notes`, dan `task_reports` milik orang
     * lain. Halaman ini cuma menampilkan nama, jam, dan status.
     *
     * Jadi sekarang hanya field itu yang dikembalikan.
     */
    if (scope === "today") {
      const day = searchParams.get("date") ?? todayStr();
      if (!DATE_RE.test(day)) {
        throw new ValidationError("Parameter 'date' harus format YYYY-MM-DD.");
      }

      const all = await listOvertimeRequests(day, day, [
        "pending",
        "approved",
        "reported",
        "finalized",
      ]);

      return {
        requests: all.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.userName,
          departmentName: r.departmentName,
          status: r.status,
          overtimeDate: r.overtimeDate,
          requestedStartTime: r.requestedStartTime,
          requestedEndTime: r.requestedEndTime,
          approvedStartTime: r.approvedStartTime,
          approvedEndTime: r.approvedEndTime,
          actualStartTime: r.actualStartTime,
          actualEndTime: r.actualEndTime,
        })),
      };
    }

    await requireKpiRole("hr", "executive");

    const from = searchParams.get("from") ?? todayStr();
    const to = searchParams.get("to") ?? from;

    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return Response.json(
        { ok: false, error: "Parameter 'from'/'to' harus format YYYY-MM-DD." },
        { status: 400 },
      );
    }
    if (to < from) {
      return Response.json(
        { ok: false, error: "Rentang tanggal terbalik." },
        { status: 400 },
      );
    }

    const statuses = (searchParams.get("statuses") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const requests = await listOvertimeRequests(from, to, statuses);
    return { requests, settings: await listPayrollStaffSettings() };
  });
}

/**
 * POST /api/overtime — staf mengajukan lembur.
 *
 * formerly `overtime_requests.insert({...})` dari browser. Validasi
 * durasi maksimum dan tanggal hanya ada di form, jadi bisa dilewati
 * dengan satu request biasa.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const b = await request.json();

    const row = await createOvertimeRequest(
      {
        overtimeDate: b.overtimeDate,
        startTime: b.startTime,
        endTime: b.endTime,
        tasks: Array.isArray(b.tasks)
          ? b.tasks.filter((t: { name?: string }) => t?.name?.trim())
          : [],
        staffNotes: b.staffNotes ?? null,
      },
      me.id,
    );

    return { overtime: row };
  });
}

/**
 * PATCH /api/overtime
 *
 *   action=approve  → HR menyetujui jadwal
 *   action=reject   → HR menolak
 *   action=report   → staf melaporkan waktu aktual (pemilik saja)
 *   action=finalize → HR memfinalisasi; gaji dihitung SERVER
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const b = await request.json();

    const id = b.id ? String(b.id) : null;
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    if (!isUuid(id)) {
      throw new ValidationError("Parameter 'id' bukan id yang valid.");
    }

    switch (b.action) {
      case "approve": {
        await requireKpiRole("hr", "executive");
        return {
          overtime: await approveOvertime(
            id,
            {
              approvedStartTime: b.approvedStartTime,
              approvedEndTime: b.approvedEndTime,
              approvalNotes: b.approvalNotes ?? null,
            },
            me.id,
          ),
        };
      }

      case "reject": {
        await requireKpiRole("hr", "executive");
        return { overtime: await rejectOvertime(id, b.reason ?? "", me.id) };
      }

      case "report": {
        return {
          overtime: await submitOvertimeReport(
            id,
            {
              actualStartTime: b.actualStartTime,
              actualEndTime: b.actualEndTime,
              taskReports: Array.isArray(b.taskReports) ? b.taskReports : [],
              staffReportNotes: b.staffReportNotes ?? null,
              // URL foto yang sudah tersimpan (dari pengajuan lama) tetap
              // diteruskan supaya tidak hilang -- bucket Supabase masih
              // hidup, dan foto itu tidak ikut terhapus saat migrasi.
              //
              // Foto BARU tidak bisa ditambah: storage R2 belum
              // disiapkan. Jalur itu menolak dengan pesan, bukan
              // menyimpan diam-diam di tempat yang tidak di-backup.
              proofImages: fotoBisaDibuka(b.proofImages),
            },
            me.id,
          ),
        };
      }

      case "finalize-duration": {
        // Tahap persiapan: HR mengunci durasi akhir. Status BELUM
        // berubah, supaya `OvertimeFinalizeModal` masih bisa dipakai
        // untuk menghitung gaji.
        await requireKpiRole("hr", "executive");
        return {
          overtime: await setFinalDuration(
            id,
            {
              finalDurationMinutes: Number(b.finalDurationMinutes),
              finalNotes: b.finalNotes ?? null,
            },
            me.id,
          ),
        };
      }

      case "finalize": {
        await requireKpiRole("hr", "executive");
        return {
          overtime: await finalizeOvertime(
            id,
            {
              dayType: b.dayType,
              hourlyBaseRate:
                b.hourlyBaseRate !== undefined
                  ? Number(b.hourlyBaseRate)
                  : undefined,
              maxPayCap:
                b.maxPayCap === null || b.maxPayCap === undefined
                  ? b.maxPayCap
                  : Number(b.maxPayCap),
              totalPayOverride:
                b.totalPayOverride === null || b.totalPayOverride === undefined
                  ? b.totalPayOverride
                  : Number(b.totalPayOverride),
              overrideReason: b.overrideReason ?? null,
              finalNotes: b.finalNotes ?? null,
              finalizedDate: b.finalizedDate,
            },
            me.id,
          ),
        };
      }

      default:
        return Response.json(
          { ok: false, error: `Aksi '${b.action ?? "(kosong)"}' tidak dikenal.` },
          { status: 400 },
        );
    }
  });
}

/**
 * DELETE /api/overtime
 *
 *   ?id=<uuid>             → hapus permanen (HR/Executive, belum final)
 *   ?id=<uuid>&cancel=1    → batalkan pengajuan sendiri (pemilik, pending)
 */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const sp = new URL(request.url).searchParams;

    const id = sp.get("id");
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    if (!isUuid(id)) {
      throw new ValidationError("Parameter 'id' bukan id yang valid.");
    }

    if (sp.get("cancel") === "1") {
      return await cancelOwnOvertime(id, me.id);
    }

    await requireKpiRole("hr", "executive");
    return await deleteOvertime(id);
  });
}