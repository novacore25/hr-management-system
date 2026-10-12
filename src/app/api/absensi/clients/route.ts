import { withAuth, requireAbsensiAdmin } from "@/server/dal/guards";
import { searchClients, getClientById, upsertClient } from "@/server/dal/clients";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/clients
 *   ?q=keyword   → pencarian nama PT / brand untuk autocomplete
 *   ?id=uuid     → detail 1 klien beserta kontak dan riwayat kontrak
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const client = await getClientById(id);
      return { client };
    }
    const query = searchParams.get("q") ?? undefined;
    const clients = await searchClients(query);
    return { clients };
  });
}

/**
 * POST /api/absensi/clients
 * Simpan / perbarui profil master klien dan kontak PIC.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const body = await request.json();
    if (!body?.name?.trim()) {
      return Response.json(
        { ok: false, error: "Nama perusahaan klien wajib diisi." },
        { status: 400 },
      );
    }
    const result = await upsertClient(body, admin.id);
    return result;
  });
}
