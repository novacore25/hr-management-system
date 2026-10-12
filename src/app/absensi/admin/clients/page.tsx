"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  FileText,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Eye,
  CheckCircle2,
  UserPlus,
  ArrowLeft,
  X,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";
import type { ClientWithDetails } from "@/server/dal/clients";
import { PksPreviewModal } from "@/components/documents/PksPreviewModal";
import { formatRupiah } from "@/lib/terbilang";

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // Modals state
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithDetails | null>(null);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [activeClientForContact, setActiveClientForContact] = useState<ClientWithDetails | null>(null);

  const [previewContractId, setPreviewContractId] = useState<string | null>(null);

  // Load clients from API
  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/absensi/clients");
      const json = await res.json();
      if (json.ok && Array.isArray(json.data?.clients)) {
        setClients(json.data.clients);
      }
    } catch (err) {
      console.error("Gagal memuat klien:", err);
      toast.error("Gagal memuat data klien.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Filter clients
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter((c) => {
      const matchName = c.name?.toLowerCase().includes(q);
      const matchBrand = c.brandName?.toLowerCase().includes(q);
      const matchAddress = c.address?.toLowerCase().includes(q);
      const matchContact = c.contacts?.some(
        (ct) =>
          ct.signeeName?.toLowerCase().includes(q) ||
          ct.signeePosition?.toLowerCase().includes(q),
      );
      return matchName || matchBrand || matchAddress || matchContact;
    });
  }, [clients, searchQuery]);

  // Aggregate stats
  const totalClients = clients.length;
  const totalContacts = clients.reduce((acc, c) => acc + (c.contacts?.length || 0), 0);
  const totalContracts = clients.reduce((acc, c) => acc + (c.contractsCount || 0), 0);

  // Delete Client
  async function handleDeleteClient(c: ClientWithDetails) {
    const msg = `Apakah Anda yakin ingin menghapus data klien "${c.name}"?\nSemua riwayat kontak PIC dan kontrak yang terikat akan ikut terhapus.`;
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch(`/api/absensi/clients?id=${c.id}&kind=client`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success(`Klien "${c.name}" berhasil dihapus.`);
        fetchClients();
      } else {
        toast.error(json.error || "Gagal menghapus klien.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat menghapus klien.");
    }
  }

  // Delete Contact PIC
  async function handleDeleteContact(contactId: string, contactName: string) {
    if (!window.confirm(`Hapus kontak PIC "${contactName}"?`)) return;

    try {
      const res = await fetch(`/api/absensi/clients?id=${contactId}&kind=contact`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        toast.success("Kontak PIC berhasil dihapus.");
        fetchClients();
      } else {
        toast.error(json.error || "Gagal menghapus kontak PIC.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat menghapus kontak PIC.");
    }
  }

  return (
    <div className="space-y-6">
      {/* ── TOP HEADER ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/absensi/admin/letters"
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 rounded-xl transition shadow-sm"
              title="Kembali ke Surat Menyurat"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Data Klien & Mitra Bisnis
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Kelola profil perusahaan, kontak PIC penandatangan, dan arsip dokumen PKS.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <Link
            href="/absensi/admin/letters/generator"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold hover:brightness-105 transition shadow-sm"
          >
            <FileCheck2 size={16} />
            <span>Generator PKS</span>
          </Link>
          <button
            onClick={() => {
              setEditingClient(null);
              setClientModalOpen(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition shadow-sm shadow-primary/20"
          >
            <Plus size={16} />
            <span>Tambah Klien</span>
          </button>
        </div>
      </div>

      {/* ── METRIC STATS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Perusahaan Klien
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {totalClients}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Kontak PIC / Penandatangan
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {totalContacts}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Kontrak PKS Terbit
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {totalContracts}
            </p>
          </div>
        </div>
      </div>

      {/* ── CLIENTS LIST CONTAINER ──────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Cari berdasarkan nama PT, brand, alamat, atau nama PIC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Reset
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin mb-2 text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Memuat data klien...
              </p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Building2 className="w-10 h-10 mb-2 stroke-1 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                {searchQuery ? "Klien tidak ditemukan" : "Belum ada klien terdaftar"}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
                {searchQuery
                  ? "Coba kata kunci lain atau tambahkan klien baru."
                  : "Data klien otomatis tersimpan saat Anda membuat PKS, atau klik Tambah Klien di atas."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredClients.map((client) => {
                const isExpanded = expandedClientId === client.id;
                const primaryPic =
                  client.contacts?.find((ct) => ct.isPrimary) ||
                  client.contacts?.[0] ||
                  null;
                const otherPics = client.contacts?.filter((ct) => ct.id !== primaryPic?.id) || [];

                return (
                  <div
                    key={client.id}
                    className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                  >
                    {/* Top Row: Name, Brand, Actions */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                            {client.entityType || "PT"}
                          </span>
                          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                            {client.name}
                          </h3>
                          {client.brandName && (
                            <span className="px-2 py-0.5 text-xs font-bold text-primary bg-primary/10 rounded-full">
                              Brand: {client.brandName}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold text-slate-400">
                            · {client.contractsCount || 0} Kontrak PKS
                          </span>
                        </div>

                        {/* Address & Contact info */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                          {client.address && (
                            <span className="flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400" />
                              <span className="line-clamp-1">{client.address}</span>
                            </span>
                          )}
                          {client.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={12} className="text-slate-400" />
                              {client.phone}
                            </span>
                          )}
                          {client.email && (
                            <span className="flex items-center gap-1">
                              <Mail size={12} className="text-slate-400" />
                              {client.email}
                            </span>
                          )}
                          {client.bankName && (
                            <span className="flex items-center gap-1">
                              <CreditCard size={12} className="text-slate-400" />
                              {client.bankName} - {client.bankAccountNo} (a.n. {client.bankAccountName})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <Link
                          href={`/absensi/admin/letters/generator?clientId=${client.id}`}
                          className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold hover:brightness-105 transition flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
                          title="Buat PKS baru dengan profil klien ini"
                        >
                          <FileCheck2 size={13} />
                          <span>Buat PKS</span>
                        </Link>

                        <button
                          onClick={() => {
                            setEditingClient(client);
                            setClientModalOpen(true);
                          }}
                          className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-xl transition"
                          title="Edit profil klien"
                        >
                          <Edit size={14} />
                        </button>

                        <button
                          onClick={() => {
                            setActiveClientForContact(client);
                            setContactModalOpen(true);
                          }}
                          className="p-2 text-primary hover:bg-primary/10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
                          title="Tambah PIC / Kontak penandatangan"
                        >
                          <UserPlus size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteClient(client)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition"
                          title="Hapus data klien"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Middle Section: PIC / Penandatangan & Kontrak Terakhir */}
                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* PIC Penandatangan Aktif */}
                      <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <Users size={13} className="text-primary" />
                            PIC Penandatangan Aktif
                          </span>
                          {client.contacts?.length > 1 && (
                            <button
                              onClick={() =>
                                setExpandedClientId(isExpanded ? null : client.id)
                              }
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                            >
                              <span>{client.contacts.length} kontak tersimpan</span>
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </div>

                        {primaryPic ? (
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 dark:text-white text-sm">
                              {primaryPic.signeeName}
                            </p>
                            <p className="text-slate-500">
                              {primaryPic.signeePosition} · Kuasa: {primaryPic.signeeBasis || "Direksi"}
                            </p>
                            {primaryPic.phone && (
                              <p className="text-slate-400 text-[11px]">Telp: {primaryPic.phone}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-slate-400 italic">Belum ada PIC tersimpan.</p>
                        )}
                      </div>

                      {/* Kontrak PKS Terakhir */}
                      <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <FileText size={13} className="text-emerald-600" />
                            Kontrak Terakhir
                          </span>
                          {client.latestContract && (
                            <button
                              onClick={() => setPreviewContractId(client.latestContract?.id || null)}
                              className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                            >
                              <Eye size={12} />
                              <span>Lihat PKS</span>
                            </button>
                          )}
                        </div>

                        {client.latestContract ? (
                          <div className="space-y-0.5">
                            <p className="font-bold font-mono text-slate-900 dark:text-white text-xs">
                              {client.latestContract.contractNumber}
                            </p>
                            <p className="text-slate-500">
                              Tgl: {client.latestContract.signDate} · Nilai: {formatRupiah(Number(client.latestContract.totalAmount) || 0)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-slate-400 italic">Belum ada kontrak PKS.</p>
                        )}
                      </div>
                    </div>

                    {/* Expandable: Daftar seluruh kontak PIC klien jika > 1 */}
                    {isExpanded && otherPics.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Varian PIC Penandatangan Lainnya ({otherPics.length}):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {otherPics.map((ot) => (
                            <div
                              key={ot.id}
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs flex justify-between items-center"
                            >
                              <div>
                                <p className="font-bold text-slate-800 dark:text-slate-100">
                                  {ot.signeeName}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {ot.signeePosition} · {ot.signeeBasis}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteContact(ot.id, ot.signeeName)}
                                className="text-red-400 hover:text-red-600 p-1"
                                title="Hapus kontak ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: CREATE / EDIT CLIENT ─────────────────────────────── */}
      {clientModalOpen && (
        <ClientFormModal
          client={editingClient}
          onClose={() => setClientModalOpen(false)}
          onSuccess={() => {
            setClientModalOpen(false);
            fetchClients();
          }}
        />
      )}

      {/* ── MODAL: ADD CONTACT PIC ──────────────────────────────────── */}
      {contactModalOpen && activeClientForContact && (
        <ContactFormModal
          client={activeClientForContact}
          onClose={() => setContactModalOpen(false)}
          onSuccess={() => {
            setContactModalOpen(false);
            fetchClients();
          }}
        />
      )}

      {/* ── MODAL: PREVIEW PKS ──────────────────────────────────────── */}
      {previewContractId && (
        <PksPreviewModal
          isOpen={Boolean(previewContractId)}
          contractId={previewContractId}
          onClose={() => setPreviewContractId(null)}
        />
      )}
    </div>
  );
}

// ── SUB-COMPONENT: CLIENT FORM MODAL ─────────────────────────────────────
function ClientFormModal({
  client,
  onClose,
  onSuccess,
}: {
  client: ClientWithDetails | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: client?.name || "",
    brandName: client?.brandName || "",
    entityType: client?.entityType || "PT",
    address: client?.address || "",
    phone: client?.phone || "",
    email: client?.email || "",
    bankName: client?.bankName || "",
    bankAccountNo: client?.bankAccountNo || "",
    bankAccountName: client?.bankAccountName || "",
    notes: client?.notes || "",
    // PIC Primer
    picName: client?.contacts?.[0]?.signeeName || "",
    picPosition: client?.contacts?.[0]?.signeePosition || "",
    picBasis: client?.contacts?.[0]?.signeeBasis || "Direksi",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) {
      return toast.error("Nama legal perusahaan wajib diisi.");
    }

    setSaving(true);
    try {
      const payload = {
        id: client?.id,
        name: formData.name.trim(),
        brandName: formData.brandName.trim() || null,
        entityType: formData.entityType.trim() || "PT",
        address: formData.address.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        bankName: formData.bankName.trim() || null,
        bankAccountNo: formData.bankAccountNo.trim() || null,
        bankAccountName: formData.bankAccountName.trim() || null,
        notes: formData.notes.trim() || null,
        contact: formData.picName.trim()
          ? {
              signeeName: formData.picName.trim(),
              signeePosition: formData.picPosition.trim() || "Direktur",
              signeeBasis: formData.picBasis.trim() || "Direksi",
              address: formData.address.trim() || null,
              isPrimary: true,
            }
          : undefined,
      };

      const res = await fetch("/api/absensi/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal menyimpan data klien.");
      }

      toast.success(
        client
          ? `Profil klien "${formData.name}" berhasil diperbarui!`
          : `Klien baru "${formData.name}" berhasil ditambahkan!`,
      );
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">
              {client ? "Edit Profil Klien" : "Tambah Klien Baru"}
            </h2>
            <p className="text-xs text-slate-500">
              Data master akan otomatis menjadi pilihan autocomplete saat membuat PKS.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Perusahaan Info */}
          <div className="space-y-3">
            <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Informasi Perusahaan
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bentuk Entitas
                </label>
                <select
                  value={formData.entityType}
                  onChange={(e) => setFormData((p) => ({ ...p, entityType: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                >
                  <option value="PT">PT (Perseroan)</option>
                  <option value="CV">CV (Komanditer)</option>
                  <option value="UD">UD / Perorangan</option>
                  <option value="Firma">Firma</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Legal Klien *
                </label>
                <input
                  type="text"
                  placeholder="e.g. PT Maju Bersama Sejahtera"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nama Brand / Merek Dagang (Opsional)
              </label>
              <input
                type="text"
                placeholder="e.g. Maju Cosmetics"
                value={formData.brandName}
                onChange={(e) => setFormData((p) => ({ ...p, brandName: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Alamat Kantor / Domisili Legal
              </label>
              <textarea
                rows={2}
                placeholder="Alamat lengkap perusahaan..."
                value={formData.address}
                onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Telepon Kantor
                </label>
                <input
                  type="text"
                  placeholder="e.g. 021-5551234"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Resmi
                </label>
                <input
                  type="email"
                  placeholder="e.g. legal@perusahaan.com"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* PIC Penandatangan Utama */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              PIC Penandatangan Utama
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap Penandatangan
                </label>
                <input
                  type="text"
                  placeholder="e.g. Budi Hartono"
                  value={formData.picName}
                  onChange={(e) => setFormData((p) => ({ ...p, picName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Jabatan Resmi
                </label>
                <input
                  type="text"
                  placeholder="e.g. Direktur Utama"
                  value={formData.picPosition}
                  onChange={(e) => setFormData((p) => ({ ...p, picPosition: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Dasar Kewenangan
              </label>
              <input
                type="text"
                placeholder="e.g. Direksi / Surat Kuasa Khusus No. 12"
                value={formData.picBasis}
                onChange={(e) => setFormData((p) => ({ ...p, picBasis: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Rekening Bank */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Informasi Rekening Bank (Opsional)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Bank
                </label>
                <input
                  type="text"
                  placeholder="e.g. BCA"
                  value={formData.bankName}
                  onChange={(e) => setFormData((p) => ({ ...p, bankName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nomor Rekening
                </label>
                <input
                  type="text"
                  placeholder="e.g. 5271234567"
                  value={formData.bankAccountNo}
                  onChange={(e) => setFormData((p) => ({ ...p, bankAccountNo: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Atas Nama (a.n.)
              </label>
              <input
                type="text"
                placeholder="e.g. PT Maju Bersama Sejahtera"
                value={formData.bankAccountName}
                onChange={(e) => setFormData((p) => ({ ...p, bankAccountName: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
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
              <span>{saving ? "Menyimpan..." : "Simpan Profil Klien"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SUB-COMPONENT: CONTACT FORM MODAL ────────────────────────────────────
function ContactFormModal({
  client,
  onClose,
  onSuccess,
}: {
  client: ClientWithDetails;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    signeeName: "",
    signeePosition: "",
    signeeBasis: "Direksi",
    phone: "",
    email: "",
    address: client.address || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.signeeName.trim() || !formData.signeePosition.trim()) {
      return toast.error("Nama dan jabatan PIC wajib diisi.");
    }

    setSaving(true);
    try {
      const payload = {
        id: client.id,
        name: client.name,
        contact: {
          signeeName: formData.signeeName.trim(),
          signeePosition: formData.signeePosition.trim(),
          signeeBasis: formData.signeeBasis.trim() || "Direksi",
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          isPrimary: false,
        },
      };

      const res = await fetch("/api/absensi/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal menyimpan kontak.");
      }

      toast.success(`Kontak "${formData.signeeName}" berhasil ditambahkan ke ${client.name}!`);
      onSuccess();
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
            <h2 className="text-lg font-black text-slate-800 dark:text-white">
              Tambah Kontak PIC / Penandatangan
            </h2>
            <p className="text-xs text-slate-500 font-semibold">{client.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nama Lengkap PIC Penandatangan *
            </label>
            <input
              type="text"
              placeholder="e.g. Jonathan Santoso"
              value={formData.signeeName}
              onChange={(e) => setFormData((p) => ({ ...p, signeeName: e.target.value }))}
              required
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Jabatan Resmi *
            </label>
            <input
              type="text"
              placeholder="e.g. Chief Marketing Officer"
              value={formData.signeePosition}
              onChange={(e) => setFormData((p) => ({ ...p, signeePosition: e.target.value }))}
              required
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Dasar Kuasa Bertindak
            </label>
            <input
              type="text"
              placeholder="e.g. Direksi / Surat Kuasa No. 05"
              value={formData.signeeBasis}
              onChange={(e) => setFormData((p) => ({ ...p, signeeBasis: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                No. HP / WhatsApp
              </label>
              <input
                type="text"
                placeholder="e.g. 08123456789"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email PIC
              </label>
              <input
                type="email"
                placeholder="e.g. jonathan@klien.com"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
              />
            </div>
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
              <span>{saving ? "Menyimpan..." : "Simpan Kontak"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
