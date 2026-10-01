import {
  withAuth,
  requireActiveAbsensiStaff,
  getProfile,
} from "@/server/dal/guards";
import { officesForDepartment } from "@/server/dal/absensi";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/locations
 *
 * Kantor yang boleh dipakai untuk check-in oleh user yang sedang login.
 *
 * Divisi diambil dari session, BUKAN dari query string — kalau
 * departmentId bisa dikirim dari browser, user bisa mengirim uuid divisi
 * lain lalu memakai kantor yang bukan haknya.
 *
 * Dipakai widget check-in untuk menampilkan area yang valid sebelum
 * check-in dikirim. Penegakan yang sebenarnya tetap di server saat
 * check-in disimpan (verifyCheckInLocation).
 */
export async function GET() {
  return withAuth(async () => {
    await requireActiveAbsensiStaff();
    const profile = await getProfile();

    const offices = await officesForDepartment(profile?.departmentId ?? null);

    return {
      offices: offices.map((o) => ({
        id: o.id,
        name: o.name,
        lat: o.lat,
        lng: o.lng,
        radius: o.radius,
      })),
    };
  });
}