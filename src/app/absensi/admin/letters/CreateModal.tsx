import { useCallback, useEffect, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { Plus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import type { LetterType } from "@/types";

const COMPANIES = ["TNT", "HYPE", "GOAT", "NOVA"];

/** Ptyxis untuk dikirim ke template: hanya kolom yang dipakai form ini. */
type LetterRecipient = { id: string; name: string; position: string | null };

type Preview = { runningNumber: number; fullNumber: string } | null;

export default function CreateModal({
  types,
  onClose,
  onUpdate,
}: {
  types: LetterType[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [company, setCompany] = useState<string>("TNT");
  const [typeId, setTypeId] = useState<string>("");
  const [issuedTo, setIssuedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Template parsing state
  const [variables, setVariables] = useState<string[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [templateBlob, setTemplateBlob] = useState<ArrayBuffer | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const createLetter = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/letters",
    "POST",
  );

  // ── Daftar penerima: server, bukan select langsung ke tabel users ──────
  const buildRecipients = useCallback(() => "/api/absensi/staff", []);
  const { data: recipientData } = useApiQuery<{
    staff: LetterRecipient[];
  }>(buildRecipients, []);

  const recipients = recipientData?.staff ?? [];

  // ── Preview nomor surat (dihitung server) ──────────────────────────────
  const now = new Date();
  const buildPreview = useCallback(
    () =>
      typeId
        ? withQuery("/api/absensi/letters", {
            preview: "1",
            company,
            letterTypeId: typeId,
            year: String(now.getFullYear()),
            month: String(now.getMonth() + 1),
          })
        : null,
    [company, typeId],
  );
  const { data: previewData } = useApiQuery<{ preview: Preview }>(
    buildPreview,
    [company, typeId],
  );
  const preview = previewData?.preview ?? null;

  useEffect(() => {
    if (types.length > 0 && !typeId) setTypeId(types[0].id);
  }, [types, typeId]);

  // Muat template .docx saat tipe surat berubah
  useEffect(() => {
    async function loadTemplate() {
      const type = types.find((t) => t.id === typeId);
      if (!type || !type.templateUrl) {
        setVariables([]);
        setTemplateBlob(null);
        setFormData({});
        return;
      }

      setLoadingTemplate(true);
      try {
        const res = await fetch(type.templateUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const arrayBuffer = await res.arrayBuffer();
        setTemplateBlob(arrayBuffer);

        const zip = new PizZip(arrayBuffer);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        const text = doc.getFullText();
        const matches = text.match(/\{[^{}]+\}/g) || [];
        const uniqueVars = Array.from(
          new Set(matches.map((m) => m.slice(1, -1))),
        );

        setVariables(uniqueVars);
        const initialForm: Record<string, string> = {};
        uniqueVars.forEach((v) => (initialForm[v] = ""));
        setFormData(initialForm);
      } catch (err) {
        console.error(err);
        toast.error("Gagal membaca variabel dari template");
      } finally {
        setLoadingTemplate(false);
      }
    }
    void loadTemplate();
  }, [typeId, types]);

  // Isi otomatis `nomor_surat` dari preview server.
  useEffect(() => {
    if (!preview?.fullNumber) return;
    setFormData((prev) => ({ ...prev, nomor_surat: preview.fullNumber }));
  }, [preview?.fullNumber]);

  // Isi otomatis nama + jabatan dari penerima yang dipilih.
  useEffect(() => {
    if (!issuedTo) return;
    const user = recipients.find((u) => u.id === issuedTo);
    if (!user) return;

    setFormData((prev) => ({
      ...prev,
      nama_karyawan: user.name,
      jabatan: user.position ?? "",
    }));
  }, [issuedTo, recipients]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !typeId) {
      return toast.error("Perusahaan dan Tipe wajib dipilih");
    }
    if (loadingTemplate) return toast.error("Template masih dimuat.");

    setSaving(true);
    const toastId = toast.loading("Memproses surat...");

    try {
      const date = new Date();
      let fileUrl: string | null = null;
      let actualFullNumber = preview?.fullNumber ?? "";

      // Generate .docx di browser, lalu unduh ke perangkat admin.
      // Berkas TIDAK diunggah ke server — endpoint upload ke object
      // storage belum ada (menunggu Cloudflare R2, Fase 4d). Nomor
      // surat tetap disimpan agar riwayatnya tercatat.
      if (templateBlob) {
        const zip = new PizZip(templateBlob);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        const merged = { ...formData, nomor_surat: actualFullNumber };
        doc.render(merged);

        const out = doc.getZip().generate({
          type: "blob",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        const type = types.find((t) => t.id === typeId);
        const recipient = recipients.find((u) => u.id === issuedTo);
        const paddedNum = String(preview?.runningNumber ?? 1).padStart(3, "0");

        const fileName =
          `${type?.code ?? "SURAT"}_${paddedNum}_` +
          `${recipient?.name ?? "Surat"}_${Date.now()}.docx`.replace(
            /\s+/g,
            "_",
          );

        saveAs(out, fileName);
      }

      // Nomor final dihitung ulang oleh server, jadi preview yang basi
      // tidak menghasilkan nomor duplikat.
      const res = await createLetter.mutate({
        company,
        letterTypeId: typeId,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        issuedTo: issuedTo || null,
        fileUrl,
      });

      if (!res.ok) {
        toast.error(res.error ?? "Gagal membuat surat.", { id: toastId });
        setSaving(false);
        return;
      }

      const letter = (res.data as { letter?: { fullNumber: string } } | undefined)
        ?.letter;
      actualFullNumber = letter?.fullNumber ?? actualFullNumber;

      toast.success(`Surat berhasil dibuat: ${actualFullNumber}`, { id: toastId });
      onUpdate();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan",
        { id: toastId },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-black text-slate-800">
              Buat Nomor Surat Baru
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Preview Nomor:{" "}
              <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                {preview?.fullNumber ?? "-"}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-200 text-slate-500 rounded-full hover:bg-slate-300 hover:text-slate-700 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form
            id="create-letter-form"
            onSubmit={handleSave}
            className="p-6 flex flex-col sm:flex-row gap-6"
          >
            {/* Informasi Dasar */}
            <div className="flex-1 space-y-4">
              <h3 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2">
                Informasi Dasar
              </h3>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Perusahaan
                </label>
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary"
                >
                  {COMPANIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Tipe Surat
                </label>
                <select
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Diberikan Ke (Opsional)
                </label>
                <select
                  value={issuedTo}
                  onChange={(e) => setIssuedTo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary"
                >
                  <option value="">-- Pilih Karyawan --</option>
                  {recipients.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.position ? ` (${u.position})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Isian Template */}
            <div className="flex-1 space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <h3 className="text-sm font-black text-slate-800 border-b border-slate-200 pb-2">
                Isian Template
              </h3>

              {loadingTemplate ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mb-2" />
                  <p className="text-xs font-semibold">Memuat variabel...</p>
                </div>
              ) : variables.length > 0 ? (
                <div className="space-y-3">
                  {variables.map((v) => (
                    <div key={v} className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 flex justify-between">
                        {v}
                        {v === "nomor_surat" && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">
                            Auto
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={formData[v] ?? ""}
                        onChange={(e) =>
                          setFormData({ ...formData, [v]: e.target.value })
                        }
                        disabled={v === "nomor_surat"}
                        className={`w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary ${v === "nomor_surat" ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                        placeholder={`Isi ${v}...`}
                      />
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-4">
                    Isian ini diambil otomatis dari tanda kurung kurawal pada
                    file template DOCX.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-center">
                  <p className="text-xs font-semibold mb-1">
                    Tidak ada template DOCX.
                  </p>
                  <p className="text-[10px]">
                    Hanya akan membuat nomor urut surat di database.
                  </p>
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 bg-white">
          <button
            form="create-letter-form"
            disabled={saving || loadingTemplate}
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {variables.length > 0
              ? "Generate & Download Surat"
              : "Buat Nomor Surat Saja"}
          </button>
          {variables.length > 0 && (
            <p className="text-[10px] text-slate-400 text-center mt-2 leading-relaxed">
              Berkas .docx diunduh ke perangkat Anda. Unggahan ke server belum
              aktif sampai integrasi Cloudflare R2 selesai.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}