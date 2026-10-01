import { withAuth, requireUser, requireAbsensiAdmin } from "@/server/dal/guards";
import {
  listLetterTypes,
  createLetterType,
  deleteLetterType,
  listCompanyLetters,
  createCompanyLetter,
  deleteCompanyLetter,
} from "@/server/dal/letters";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/letters
 *
 *   company=TNT              → filter perusahaan
 *   issuedTo=<userId>        → surat milik user (untuk staff)
 *   includeTypes=1           → sekalian daftar tipe surat
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const issuedToParam = searchParams.get("issuedTo");

    // Staff hanya boleh melihat surat miliknya sendiri.
    // Admin boleh melihat semua.
    let issuedTo = issuedToParam ?? undefined;
    if (issuedTo && issuedTo !== me.id) {
      await requireAbsensiAdmin();
    }
    if (!issuedTo && searchParams.get("mine") === "1") {
      issuedTo = me.id;
    }

    const result: Record<string, unknown> = {
      letters: await listCompanyLetters({
        company: searchParams.get("company") ?? undefined,
        letterTypeId: searchParams.get("letterTypeId") ?? undefined,
        issuedTo,
      }),
    };

    if (searchParams.get("includeTypes") === "1") {
      result.letterTypes = await listLetterTypes();
    }

    return result;
  });
}

/** POST /api/absensi/letters — buat surat / tipe surat baru. */
export async function POST(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const me = await requireUser();
    const body = await request.json();

    if (body.kind === "letter-type") {
      if (!body.name || !body.code) {
        return Response.json(
          { ok: false, error: "Nama dan kode wajib diisi." },
          { status: 400 },
        );
      }
      return { letterType: await createLetterType(body.name, body.code) };
    }

    if (!body.letterTypeId || !body.company) {
      return Response.json(
        { ok: false, error: "Tipe surat dan perusahaan wajib diisi." },
        { status: 400 },
      );
    }

    const result = await createCompanyLetter({
      company: String(body.company),
      letterTypeId: String(body.letterTypeId),
      month: String(body.month ?? ""),
      year: Number(body.year ?? new Date().getFullYear()),
      issuedTo: body.issuedTo ?? null,
      fileUrl: body.fileUrl ?? null,
      actorId: me.id,
    });

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return { letter: result.letter };
  });
}

/** DELETE /api/absensi/letters — hapus surat / tipe surat. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const sp = new URL(request.url).searchParams;
    const id = sp.get("id");
    const kind = sp.get("kind") ?? "letter";

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    if (kind === "letter-type") {
      await deleteLetterType(id);
    } else {
      await deleteCompanyLetter(id, admin.id);
    }

    return { deleted: id };
  });
}