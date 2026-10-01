import {
  withAuth,
  requireUser,
  requireAbsensiAdmin,
} from "@/server/dal/guards";
import {
  listLetterTypes,
  createLetterType,
  deleteLetterType,
  setLetterTypeTemplate,
  listCompanyLetters,
  previewLetterNumber,
  createCompanyLetter,
  deleteCompanyLetter,
} from "@/server/dal/letters";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/letters
 *
 *   mine=1                 → surat milik user yang login
 *   issuedTo=<userId>      → surat milik user tertentu (admin saja)
 *   company=TNT            → filter perusahaan
 *   letterTypeId=<uuid>    → filter tipe surat
 *   includeTypes=1         → sekalian daftar tipe surat
 *   preview=1&company=&letterTypeId=
 *                          → nomor surat berikutnya (admin saja)
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    // Preview nomor surat untuk form "Buat Surat".
    if (searchParams.get("preview") === "1") {
      await requireAbsensiAdmin();

      const company = searchParams.get("company");
      const letterTypeId = searchParams.get("letterTypeId");

      if (!company || !letterTypeId) {
        return Response.json(
          { ok: false, error: "Parameter 'company' dan 'letterTypeId' wajib diisi." },
          { status: 400 },
        );
      }

      const now = new Date();
      const preview = await previewLetterNumber({
        company,
        letterTypeId,
        year: Number(searchParams.get("year")) || now.getFullYear(),
        month: Number(searchParams.get("month")) || now.getMonth() + 1,
      });

      return { preview };
    }

    let issuedTo = searchParams.get("issuedTo") ?? undefined;

    // Staff hanya boleh melihat surat miliknya sendiri; admin boleh semua.
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

/** POST /api/absensi/letters — buat surat atau tipe surat baru. */
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

    const month = Number(body.month);
    if (
      !body.letterTypeId ||
      !body.company ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return Response.json(
        { ok: false, error: "Tipe surat, perusahaan, dan bulan (1-12) wajib diisi." },
        { status: 400 },
      );
    }

    const result = await createCompanyLetter({
      company: String(body.company),
      letterTypeId: String(body.letterTypeId),
      month,
      year: Number(body.year ?? new Date().getFullYear()),
      issuedTo: body.issuedTo || null,
      fileUrl: body.fileUrl ?? null,
      actorId: me.id,
    });

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return { letter: result.letter };
  });
}

/** PATCH /api/absensi/letters — ubah template tipe surat. */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { id, templateUrl } = await request.json();

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    await setLetterTypeTemplate(id, templateUrl ?? null);
    return { letterTypes: await listLetterTypes() };
  });
}

/** DELETE /api/absensi/letters — hapus surat atau tipe surat. */
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