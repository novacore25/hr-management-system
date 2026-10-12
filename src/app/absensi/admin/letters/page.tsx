"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
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
  Eye,
  Edit,
  Building2,
  FileCheck2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { CompanyLetter, LetterType } from "@/types";
import CreateModal from "./CreateModal";
import { PksPreviewModal } from "@/components/documents/PksPreviewModal";

const COMPANIES = ["TNT", "HYPE", "GOAT", "NOVA"];

export default function LettersPage() {
  const [filterCompany, setFilterCompany] = useState<string>("ALL");
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Modal actions
  const [previewContractId, setPreviewContractId] = useState<string | null>(null);
  const [previewLetter, setPreviewLetter] = useState<CompanyLetter | null>(null);
  const [editLetter, setEditLetter] = useState<CompanyLetter | null>(null);

  const deleteLetterMutation = useApiMutation<unknown, unknown>(
    "/api/absensi/letters",
    "DELETE",
  );

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

  async function handleDeleteLetter(letter: CompanyLetter) {
    const isPks = Boolean(letter.contractId) || letter.letterTypeCode.startsWith("PKS");
    const warning = isPks
      ? `Apakah Anda yakin ingin menghapus surat & arsip PKS "${letter.fullNumber}"?\nTindakan ini akan menghapus arsip kontrak dari database.`
      : `Apakah Anda yakin ingin menghapus nomor surat "${letter.fullNumber}"?`;

    if (!window.confirm(warning)) return;

    const res = await deleteLetterMutation.mutate(undefined, {
      id: letter.id,
      kind: "letter",
    });

    if (res.ok) {
      toast.success(`Surat "${letter.fullNumber}" berhasil dihapus.`);
      void refetch();
    } else {
      toast.error(res.error ?? "Gagal menghapus surat.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Surat Menyurat
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola dan terbitkan nomor surat keluar resmi perusahaan serta dokumen PKS klien.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Link
            href="/absensi/admin/clients"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition shadow-sm"
          >
            <Building2 size={16} className="text-primary" />
            <span>Data Klien</span>
          </Link>
          <Link
            href="/absensi/admin/letters/generator"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold hover:brightness-105 transition shadow-sm shadow-emerald-500/20"
          >
            <FileCheck2 size={16} />
            <span>Generator PKS</span>
          </Link>
          <button
            onClick={() => setShowTypeModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Tipe Surat</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition shadow-sm shadow-primary/20"
          >
            <Plus size={16} />
            <span>Buat Surat</span>
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
              {letters.map((letter) => {
                const isPks =
                  Boolean(letter.contractId) ||
                  letter.letterTypeCode.startsWith("PKS");

                return (
                  <div
                    key={letter.id}
                    className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-primary/10 text-primary">
                          {letter.company}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {letter.letterTypeName}
                        </span>
                        {isPks && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            PKS Legal
                          </span>
                        )}
                        {letter.clientName && (
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            Klien: {letter.clientName}
                            {letter.brandName ? ` (${letter.brandName})` : ""}
                          </span>
                        )}
                      </div>

                      <p className="text-lg font-black font-mono text-slate-900 dark:text-white tracking-tight">
                        {letter.fullNumber}
                      </p>

                      {letter.issuedToName && (
                        <p className="text-xs text-slate-500 mt-1">
                          Diberikan ke:{" "}
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {letter.issuedToName}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 hidden md:inline">
                        {format(new Date(letter.createdAt), "dd MMM yyyy", {
                          locale: id,
                        })}
                      </span>

                      {/* 1. PREVIEW BUTTON */}
                      <button
                        onClick={() => {
                          if (isPks) {
                            setPreviewContractId(letter.contractId || letter.id);
                          } else {
                            setPreviewLetter(letter);
                          }
                        }}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-primary hover:border-primary/30 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                        title="Lihat / Pratinjau Dokumen"
                      >
                        <Eye size={13} className="text-primary" />
                        <span>Preview</span>
                      </button>

                      {/* 2. EDIT BUTTON */}
                      {isPks && letter.contractId ? (
                        <Link
                          href={`/absensi/admin/letters/generator?contractId=${letter.contractId}`}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-amber-600 hover:border-amber-400 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                          title="Edit Kontrak PKS di Generator"
                        >
                          <Edit size={13} className="text-amber-600" />
                          <span>Edit</span>
                        </Link>
                      ) : (
                        <button
                          onClick={() => setEditLetter(letter)}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-amber-600 hover:border-amber-400 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                          title="Edit Data Surat"
                        >
                          <Edit size={13} className="text-amber-600" />
                          <span>Edit</span>
                        </button>
                      )}

                      {/* 3. DOWNLOAD BUTTON (if fileUrl exists) */}
                      {letter.fileUrl && (
                        <a
                          href={letter.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-slate-100 hover:bg-primary/10 text-slate-600 hover:text-primary rounded-xl text-xs font-bold transition border border-slate-200 hover:border-primary/20 flex items-center gap-1"
                          title="Unduh file surat"
                        >
                          <Download size={13} />
                        </a>
                      )}

                      {/* 4. DELETE BUTTON */}
                      <button
                        onClick={() => handleDeleteLetter(letter)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition"
                        title="Hapus surat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
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

      {/* ── MODAL: PREVIEW DOKUMEN PKS ─────────────────────────────── */}
      {previewContractId && (
        <PksPreviewModal
          isOpen={Boolean(previewContractId)}
          contractId={previewContractId}
          onClose={() => setPreviewContractId(null)}
        />
      )}

      {/* ── MODAL: PREVIEW SURAT BIASA ──────────────────────────────── */}
      {previewLetter && (
        <LetterDetailModal
          letter={previewLetter}
          onClose={() => setPreviewLetter(null)}
        />
      )}

      {/* ── MODAL: EDIT SURAT BIASA ─────────────────────────────────── */}
      {editLetter && (
        <EditLetterModal
          letter={editLetter}
          onClose={() => setEditLetter(null)}
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

// ── Modal Detail Surat Biasa ─────────────────────────────────────────────
function LetterDetailModal({
  letter,
  onClose,
}: {
  letter: CompanyLetter;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText size={16} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Detail Surat Keluar
              </h2>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                {letter.company}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Nomor Surat Resmi
            </p>
            <p className="text-base font-black font-mono text-slate-900 dark:text-white mt-0.5">
              {letter.fullNumber}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Tipe Surat
              </p>
              <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                {letter.letterTypeName} ({letter.letterTypeCode})
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Tanggal Terbit
              </p>
              <p className="font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                {format(new Date(letter.createdAt), "dd MMMM yyyy", { locale: id })}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Penerima / Diberikan Kepada
            </p>
            <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              {letter.issuedToName || "Tidak ditentukan (Umum / Eksternal)"}
            </p>
          </div>

          {letter.clientName && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Klien Terkait
              </p>
              <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {letter.clientName} {letter.brandName ? `("${letter.brandName}")` : ""}
              </p>
            </div>
          )}

          {letter.fileUrl && (
            <div className="pt-2">
              <a
                href={letter.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
              >
                <Download size={14} />
                <span>Unduh Dokumen Terlampir</span>
              </a>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Edit Surat Biasa ───────────────────────────────────────────────
function EditLetterModal({
  letter,
  onClose,
  onUpdate,
}: {
  letter: CompanyLetter;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [issuedTo, setIssuedTo] = useState(letter.issuedTo || "");
  const [fileUrl, setFileUrl] = useState(letter.fileUrl || "");
  const [saving, setSaving] = useState(false);

  // Load staff recipients
  const buildRecipients = useCallback(() => "/api/absensi/staff", []);
  const { data: recipientData } = useApiQuery<{
    staff: Array<{ id: string; name: string; position: string | null }>;
  }>(buildRecipients, []);

  const recipients = recipientData?.staff ?? [];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/absensi/letters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: letter.id,
          kind: "letter",
          issuedTo: issuedTo || null,
          fileUrl: fileUrl.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal memperbarui surat.");
      }

      toast.success("Informasi surat berhasil diperbarui!");
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              Edit Data Surat
            </h2>
            <p className="text-xs font-mono text-slate-500">{letter.fullNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Diberikan Kepada (Karyawan)
            </label>
            <select
              value={issuedTo}
              onChange={(e) => setIssuedTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
            >
              <option value="">-- Tidak Ditentukan / Umum --</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.position ? `(${r.position})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              URL File Dokumen (Object Storage / Cloud)
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              <span>{saving ? "Menyimpan..." : "Simpan Perubahan"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}