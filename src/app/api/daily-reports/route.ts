import {
  withAuth,
  requireUser,
  requireProfile,
  requireKpiRole,
  ForbiddenError,
  ValidationError,
} from "@/server/dal/guards";
import {
  listReportsForAssignment,
  listReportsInRange,
  upsertDailyReport,
  deleteDailyReport,
  updateDailyReport,
} from "@/server/dal/assignments";

export const dynamic = "force-dynamic";

/**
 * GET /api/daily-reports
 *
 * Query param:
 *   assignmentId=&userId=  → laporan milik satu assignment
 *   from=YYYY-MM-DD&to=...  → laporan dalam rentang
 *   userId=                 → batasi ke satu user
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const assignmentId = searchParams.get("assignmentId");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (assignmentId) {
      // User biasa hanya boleh lihat laporannya sendiri
      const targetUser = userId ?? me.id;
      if (targetUser !== me.id) {
        await requireKpiRole("head", "hr", "executive");
      }
      return { reports: await listReportsForAssignment(assignmentId, targetUser) };
    }

    if (from && to) {
      const scope = searchParams.get("scope");
      const privileged = await isPrivileged();

      // formerly: `targetUser ?? (privileged ? undefined : me.id)`.
      // Kalau client mengirim `userId`, `targetUser` selalu terisi — jadi
      // cek `privileged` sama sekali tidak dipakai, dan staf biasa bisa
      // membaca laporannya orang lain cukup dengan mengubah query string.
      let targetUser: string | undefined;

      if (userId && userId !== me.id) {
        if (!privileged) throw new ForbiddenError(
          "Anda tidak berhak melihat laporan orang lain.",
        );
        targetUser = userId;
      } else {
        targetUser = me.id;
      }

      // `scope=all` hanya berarti "tanpa filter user" — dan hanya untuk
      // role yang memang boleh melihat semua (rekap HR, laporan divisi).
      if (scope === "all") {
        if (!privileged) {
          throw new ForbiddenError("Scope 'all' hanya untuk role di atas Head.");
        }
        targetUser = undefined;
      }

      return { reports: await listReportsInRange(from, to, targetUser) };
    }

    return { reports: [] };
  });
}

async function isPrivileged(): Promise<boolean> {
  const { getProfile } = await import("@/server/dal/guards");
  const p = await getProfile();
  return (
    !!p &&
    ["head", "hr", "executive", "developer"].includes(p.kpiRole as string)
  );
}


/**
 * POST /api/daily-reports — input nilai harian.
 * Otorisasi: user hanya boleh lapor untuk assignment-nya sendiri.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { assignmentId, kpiId, date, value, notes } = await request.json();

    if (!assignmentId || !date || value === undefined) {
      return Response.json(
        { ok: false, error: "assignmentId, date, dan value wajib diisi." },
        { status: 400 },
      );
    }

    // Verifikasi assignment memang milik user ini (kecuali HR/Executive)
    const { findAssignmentById } = await import("@/server/dal/assignments");
    const assignment = await findAssignmentById(assignmentId);
    if (!assignment) {
      return Response.json(
        { ok: false, error: "Assignment tidak ditemukan." },
        { status: 404 },
      );
    }

    const isOwner = assignment.userId === me.id;
    if (!isOwner) {
      const { getProfile } = await import("@/server/dal/guards");
      const p = await getProfile();
      const privileged =
        p && ["hr", "executive", "developer"].includes(p.kpiRole as string);
      if (!privileged) {
        return Response.json(
          { ok: false, error: "Anda tidak berhak menginput KPI orang lain." },
          { status: 403 },
        );
      }
    }

    await upsertDailyReport({
      assignmentId,
      kpiId: kpiId ?? assignment.kpiId,
      userId: isOwner ? me.id : assignment.userId,
      date,
      value: Number(value),
      notes: notes ?? null,
    });

    return { ok: true };
  });
}

/** DELETE /api/daily-reports — hapus satu laporan. */
/**
 * PATCH /api/daily-reports — koreksi nilai satu laporan yang sudah ada.
 *
 * formerly halaman /dashboard/tim/history menulis
 * `daily_reports.update({ value, notes }).eq("id", id)` dari browser.
 * Dua masalahnya:
 *   - `.eq("id", ...)` tanpa cek kepemilikan: cukup menebak id, staf
 *     biasa bisa mengubah laporannya orang lain.
 *   - `kpi_assignments.actual_total` TIDAK di-recalc, jadi skor KPI di
 *     dashboard tetap memakai angka lama. Total yang tampil dan yang
 *     disimpan jadi berbeda.
 *
 * sekarang: server cek pemilik, dan total assignment dihitung ulang.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { id, value, notes } = await request.json();

    if (!id || value === undefined) {
      return Response.json(
        { ok: false, error: "Parameter 'id' dan 'value' wajib diisi." },
        { status: 400 },
      );
    }

    const { findDailyReportById } = await import("@/server/dal/assignments");
    const report = await findDailyReportById(String(id));
    if (!report) {
      return Response.json(
        { ok: false, error: "Laporan tidak ditemukan." },
        { status: 404 },
      );
    }

    if (report.userId !== me.id) {
      const profile = await requireProfile();
      if (!["hr", "executive", "developer"].includes(profile.kpiRole)) {
        return Response.json(
          { ok: false, error: "Anda hanya bisa mengoreksi laporan sendiri." },
          { status: 403 },
        );
      }
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new ValidationError("Nilai harus angka dan tidak boleh negatif.");
    }

    await updateDailyReport(String(id), num, notes ?? null);
    return { ok: true };
  });
}

/** DELETE /api/daily-reports — hapus satu laporan. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const sp = new URL(request.url).searchParams;
    const assignmentId = sp.get("assignmentId");
    const date = sp.get("date");

    if (!assignmentId || !date) {
      return Response.json(
        { ok: false, error: "assignmentId dan date wajib diisi." },
        { status: 400 },
      );
    }

    const { findAssignmentById } = await import("@/server/dal/assignments");
    const assignment = await findAssignmentById(assignmentId);
    if (!assignment) {
      return Response.json(
        { ok: false, error: "Assignment tidak ditemukan." },
        { status: 404 },
      );
    }

    const isOwner = assignment.userId === me.id;
    if (!isOwner) {
      await requireKpiRole("hr", "executive");
    }

    await deleteDailyReport(assignmentId, date);
    return { ok: true };
  });
}