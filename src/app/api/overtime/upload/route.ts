import { requireUser, withAuth, ValidationError } from "@/server/dal/guards";
import { uploadBukti } from "@/server/storage/overtimeProofs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      const single = formData.get("file") as File | null;
      if (single) files.push(single);
    }

    if (files.length === 0) {
      throw new ValidationError("Pilih minimal 1 file foto bukti untuk diunggah.");
    }

    const urls: string[] = [];
    for (const file of files) {
      const res = await uploadBukti({
        userId: me.id,
        file,
      });

      if (!res.ok) {
        throw new ValidationError(res.error);
      }

      urls.push(res.url);
    }

    return { urls };
  });
}
