"use client";

import { useCallback, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Plus,
  Settings,
  Loader2,
  X,
  Trash2,
  Upload,
  FileText,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import type { CompanyLetter, LetterType } from "@/types";
import CreateModal from "./CreateModal";

const COMPANIES = ["TNT", "HYPE", "GOAT", "NOVA"];

export default function LettersPage() {
  const [filterCompany, setFilterCompany] = useState<string>("ALL");
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // formerly: 2 query Supabase dari browser (letter_types +
  // company_letters dengan nested select users).
  const buildPath = useCallback(
    () =>
      withQuery("/api/absensi/letters", {
        includeTypes: "1",
        company: filterCompany === "ALL" ? "" : filterCompany,
      }),
    [filterCompany],
  );

  const { data, isLoading, refetch } = useApiQuery<{
    letters: CompanyLetter[];
    letterTypes: LetterType[];
  }>(buildPath, [filterCompany], 30_000);

  const letters = data?.letters ?? [];
  const letterTypes = data?.letterTypes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Surat Menyurat
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola dan terbitkan nomor surat keluar resmi perusahaan.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowTypeModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Tipe Surat</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
          >
            <Plus size={16} />
            Buat Surat
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:border-primary/50"
          >
            <option value="ALL">Semua Perusahaan</option>
            {COMPANIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Memuat Data...
              </p>
            </div>
          ) : letters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <p className="text-xs font-bold uppercase tracking-widest">
                Belum ada surat
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {letters.map((letter) => (
                <div
                  key={letter.id}
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex justify-between items-center group"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-primary/10 text-primary">
                        {letter.company}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {letter.letterTypeName}
                      </span>
                    </div>
                    <p className="text-lg font-black font-mono text-slate-900 tracking-tight">
                      {letter.fullNumber}
                    </p>
                    {letter.issuedToName && (
                      <p className="text-xs text-slate-500 mt-1">
                        Diberikan ke:{" "}
                        <span className="font-bold text-slate-700">
                          {letter.issuedToName}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {format(new Date(letter.createdAt), "dd MMM yyyy", {
                        locale: id,
                      })}
                    </p>
                    {letter.fileUrl && (
                      <a
                        href={letter.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold bg-slate-100 hover:bg-primary/10 text-slate-600 hover:text-primary px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200 hover:border-primary/20"
                      >
                        <Download size={12} /> Unduh
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTypeModal && (
        <TypeModal
          types={letterTypes}
          onClose={() => setShowTypeModal(false)}
          onUpdate={() => void refetch()}
        />
      )}

      {showCreateModal && (
        <CreateModal
          types={letterTypes}
          onClose={() => setShowCreateModal(false)}
          onUpdate={() => void refetch()}
        />
      )}
    </div>
  );
}

// ── Modal Kelola Tipe Surat ──────────────────────────────────────────────
function TypeModal({
  types,
  onClose,
  onUpdate,
}: {
  types: LetterType[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const postLetterType = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/letters",
    "POST",
  );
  const deleteLetterType = useApiMutation<unknown, unknown>(
    "/api/absensi/letters",
    "DELETE",
  );
  const patchLetterType = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/letters",
    "PATCH",
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !code) return toast.error("Semua field wajib diisi");

    setSaving(true);
    const res = await postLetterType.mutate({ kind: "letter-type", name, code });

    if (res.ok) {
      toast.success("Tipe surat ditambahkan!");
      setName("");
      setCode("");
      onUpdate();
    } else {
      toast.error(res.error ?? "Gagal menambah tipe surat.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus tipe surat ini?")) return;

    const res = await deleteLetterType.mutate(undefined, {
      id,
      kind: "letter-type",
    });

    if (res.ok) {
      toast.success("Tipe surat dihapus!");
      onUpdate();
    } else {
      toast.error(res.error ?? "Gagal menghapus. Mungkin sedang digunakan.");
    }
  }

  /**
   * Template .docx disimpan di object storage, bukan di database.
   *
   * Unggahan langsung dari browser belum aktif — endpoint upload-nya
   * menunggu integrasi Cloudflare R2 (Fase 4d). Sementara itu admin
   * menaruh file di R2 sendiri lalu menempelkan URL-nya di sini.
   */
  async function handleSetTemplateUrl(t: LetterType) {
    const input = window.prompt(
      "Unggahan file belum aktif (menunggu Cloudflare R2).\n" +
        "Tempelkan URL template .docx dari object storage:",
      t.templateUrl ?? "",
    );
    if (input === null) return;

    const url = input.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error("URL harus diawali http:// atau https://");
      return;
    }

    setSaving(true);
    const res = await patchLetterType.mutate({ id: t.id, templateUrl: url || null });

    if (res.ok) {
      toast.success("Template disimpan.");
      onUpdate();
    } else {
      toast.error(res.error ?? "Gagal menyimpan template.");
    }
    setSaving(false);
  }

  function handlePickTemplate(t: LetterType) {
    handleSetTemplateUrl(t);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-black text-slate-800">
            Kelola Tipe Surat
          </h2>
          <button
            onClick={onClose}
            className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form onSubmit={handleAdd} className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Nama (e.g. Surat Teguran)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Kode (e.g. ST)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary uppercase"
            />
            <button
              disabled={saving}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </form>

          <div className="space-y-2">
            {types.map((t) => (
              <div
                key={t.id}
                className="flex flex-col p-3 rounded-xl border border-slate-100 bg-slate-50 gap-2"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{t.name}</p>
                    <p className="text-[10px] font-black tracking-widest text-primary uppercase">
                      {t.code}
                    </p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button
                      type="button"
                      onClick={() => handlePickTemplate(t)}
                      disabled={saving}
                      className={`p-2 rounded-lg transition-colors ${t.templateUrl ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200"}`}
                      title={t.templateUrl ? "Ubah URL template" : "Set URL template DOCX"}
                    >
                      {t.templateUrl ? <FileText size={16} /> : <Upload size={16} />}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {t.templateUrl && (
                  <div className="text-[10px] flex items-center gap-1 font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit">
                    <FileText size={10} /> Template tersedia
                  </div>
                )}
              </div>
            ))}
            {types.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">
                Belum ada tipe surat.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}