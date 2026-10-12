import { withAuth, requireAbsensiAdmin } from "@/server/dal/guards";
import {
  saveClientContract,
  updateClientContract,
  deleteClientContract,
  listClientContracts,
  getClientContractById,
} from "@/server/dal/clients";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/contracts
 *   ?id=uuid        → detail arsip 1 kontrak dengan payload snapshot
 *   ?clientId=uuid  → daftar kontrak milik klien tertentu
 *   ?company=TNT    → filter unit TNT
 *   ?status=active  → filter status
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { searchParams } = new URL(request.url);

    const id = searchParams.get("id");
    if (id) {
      const contract = await getClientContractById(id);
      if (!contract) {
        return Response.json(
          { ok: false, error: "Kontrak tidak ditemukan." },
          { status: 404 },
        );
      }
      return { contract };
    }

    const clientId = searchParams.get("clientId") ?? undefined;
    const company = searchParams.get("company") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const contracts = await listClientContracts({
      clientId,
      company,
      status,
    });

    return { contracts };
  });
}

/**
 * POST /api/absensi/contracts
 * Simpan arsip kontrak PKS Klien secara permanen.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const body = await request.json();

    if (!body?.clientData?.name?.trim()) {
      return Response.json(
        { ok: false, error: "Nama perusahaan klien wajib diisi." },
        { status: 400 },
      );
    }

    if (!body?.contractNumber?.trim()) {
      return Response.json(
        { ok: false, error: "Nomor perjanjian/kontrak wajib diisi." },
        { status: 400 },
      );
    }

    if (!body?.signDate) {
      return Response.json(
        { ok: false, error: "Tanggal penandatanganan wajib diisi." },
        { status: 400 },
      );
    }

    const result = await saveClientContract(body, admin.id);
    return result;
  });
}

/**
 * PUT /api/absensi/contracts
 * Perbarui arsip kontrak PKS Klien yang sudah ada.
 */
export async function PUT(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const body = await request.json();

    if (!body?.id) {
      return Response.json(
        { ok: false, error: "ID kontrak wajib disertakan." },
        { status: 400 },
      );
    }

    const result = await updateClientContract(body.id, body, admin.id);
    return result;
  });
}

/**
 * DELETE /api/absensi/contracts?id=uuid
 * Hapus arsip kontrak PKS Klien.
 */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    await deleteClientContract(id, admin.id);
    return { ok: true, deleted: id };
  });
}
