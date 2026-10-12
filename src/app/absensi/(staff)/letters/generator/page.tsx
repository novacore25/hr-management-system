"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Save,
  Search,
  CheckCircle2,
  Building2,
  User,
  Calendar,
  DollarSign,
  FileText,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Loader2,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { PksMcnDocument } from "@/components/documents/PksMcnDocument";
import {
  DEFAULT_PKS_MCN_DATA,
  type PksMcnData,
  type PksTaxType,
} from "@/types/pks";
import type { ClientWithDetails } from "@/server/dal/clients";
import { formatRupiah, terbilangRupiah } from "@/lib/terbilang";

const COMPANIES = [
  { code: "TNT", name: "PT TNT KREATIF DIGITAL", trade: "Thick and Thin Media Indonesia" },
  { code: "HYPE", name: "PT HYPE MEDIA INDONESIA", trade: "HYPE Management" },
  { code: "GOAT", name: "PT TALENTA SIBER MAKMUR", trade: "GOAT Creator Agency" },
  { code: "NOVA", name: "PT NOVA CORE DIGITAL", trade: "NovaCore" },
] as const;

export default function PksGeneratorPage() {
  const [formData, setFormData] = useState<PksMcnData>(DEFAULT_PKS_MCN_DATA);
  const [zoom, setZoom] = useState<number>(0.85);

  // Search & Client state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ClientWithDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithDetails | null>(null);
  const [selectedContactMode, setSelectedContactMode] = useState<string>("default");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedContractNumber, setSavedContractNumber] = useState<string | null>(null);

  // Active form section
  const [activeSection, setActiveSection] = useState<
    "client" | "deliverables" | "financial" | "terms" | "schedule"
  >("client");

  // ── Debounce search clients ─────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/absensi/clients?q=${encodeURIComponent(searchQuery.trim())}`,
        );
        const json = await res.json();
        if (json.ok && Array.isArray(json.data?.clients)) {
          setSearchResults(json.data.clients);
        }
      } catch (err) {
        console.error("Gagal mencari klien:", err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Auto-fill when selecting client from database ───────────────
  function handleSelectClient(client: ClientWithDetails) {
    setSelectedClient(client);
    setSearchQuery("");
    setSearchResults([]);

    const primaryContact =
      client.contacts.find((c) => c.isPrimary) || client.contacts[0] || null;

    setFormData((prev) => ({
      ...prev,
      client: {
        id: client.id,
        name: client.name,
        brandName: client.brandName ?? "",
        entityType: client.entityType ?? "perseroan terbatas",
        address: client.address ?? "",
        signeeName: primaryContact?.signeeName ?? "",
        signeePosition: primaryContact?.signeePosition ?? "",
        signeeBasis: primaryContact?.signeeBasis ?? "Direksi",
        phone: client.phone ?? "",
        email: client.email ?? "",
      },
    }));

    toast.success(`Data klien "${client.name}" berhasil diisi otomatis!`);
  }

  // ── Switch between available PIC/contacts of this client ────────
  function handleSelectContact(contactId: string) {
    setSelectedContactMode(contactId);
    if (!selectedClient) return;

    if (contactId === "new") {
      setFormData((prev) => ({
        ...prev,
        client: {
          ...prev.client,
          signeeName: "",
          signeePosition: "",
          signeeBasis: "Direksi",
        },
      }));
      return;
    }

    const found = selectedClient.contacts.find((c) => c.id === contactId);
    if (found) {
      setFormData((prev) => ({
        ...prev,
        client: {
          ...prev.client,
          signeeName: found.signeeName,
          signeePosition: found.signeePosition,
          signeeBasis: found.signeeBasis,
        },
      }));
    }
  }

  // ── Auto-calculate Tax & Total ──────────────────────────────────
  function handleFinancialChange(val: number, taxType: PksTaxType) {
    let rate = 0;
    if (taxType === "pph_0_5") rate = 0.005;
    else if (taxType === "pph_23") rate = 0.02;
    else if (taxType === "ppn_11") rate = 0.11;

    const taxAmount = Math.round(val * rate);
    const totalAmount = val + taxAmount;

    setFormData((prev) => ({
      ...prev,
      financial: {
        ...prev.financial,
        contractValue: val,
        taxType,
        taxRate: rate,
        taxAmount,
        totalAmount,
      },
    }));
  }

  // ── Switch Internal Company Unit ────────────────────────────────
  function handleCompanyChange(code: "TNT" | "HYPE" | "GOAT" | "NOVA") {
    const target = COMPANIES.find((c) => c.code === code) ?? COMPANIES[0];
    setFormData((prev) => ({
      ...prev,
      agency: {
        ...prev.agency,
        company: target.code,
        companyLegalName: target.name,
        tradeName: target.trade,
      },
    }));
  }

  // ── Creator Management ──────────────────────────────────────────
  function handleAddCreator() {
    setFormData((prev) => {
      const nextCreators = [...prev.deliverables.creators, { name: "", sessions: 10 }];
      const totalSessions = nextCreators.reduce((sum, c) => sum + (c.sessions || 0), 0);
      return {
        ...prev,
        deliverables: {
          ...prev.deliverables,
          creators: nextCreators,
          totalSessions,
        },
      };
    });
  }

  function handleUpdateCreator(index: number, name: string, sessions: number) {
    setFormData((prev) => {
      const nextCreators = [...prev.deliverables.creators];
      nextCreators[index] = { name, sessions };
      const totalSessions = nextCreators.reduce((sum, c) => sum + (c.sessions || 0), 0);
      return {
        ...prev,
        deliverables: {
          ...prev.deliverables,
          creators: nextCreators,
          totalSessions,
        },
      };
    });
  }

  function handleRemoveCreator(index: number) {
    setFormData((prev) => {
      const nextCreators = prev.deliverables.creators.filter((_, i) => i !== index);
      const totalSessions = nextCreators.reduce((sum, c) => sum + (c.sessions || 0), 0);
      return {
        ...prev,
        deliverables: {
          ...prev.deliverables,
          creators: nextCreators,
          totalSessions,
        },
      };
    });
  }

  // ── Schedule Management ─────────────────────────────────────────
  function handleAddScheduleRow() {
    setFormData((prev) => ({
      ...prev,
      schedule: [
        ...prev.schedule,
        {
          sessionNo: prev.schedule.length + 1,
          date: "",
          time: "19:00 - 21:00 WIB",
          creator: prev.deliverables.creators[0]?.name ?? "",
          notes: "Live Session",
        },
      ],
    }));
  }

  function handleRemoveScheduleRow(index: number) {
    setFormData((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((_, i) => i !== index),
    }));
  }

  // ── Action: Print / Download PDF ────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── Action: Save & Auto Write-Back to Database ───────────────────
  async function handleSaveContract() {
    if (!formData.client.name.trim()) {
      toast.error("Nama perusahaan klien wajib diisi.");
      return;
    }
    if (!formData.header.contractNumber.trim()) {
      toast.error("Nomor perjanjian wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        clientId: selectedClient?.id,
        clientData: {
          name: formData.client.name,
          brandName: formData.client.brandName || null,
          entityType: formData.client.entityType || "PT",
          address: formData.client.address || null,
          phone: formData.client.phone || null,
          email: formData.client.email || null,
          signeeName: formData.client.signeeName,
          signeePosition: formData.client.signeePosition,
          signeeBasis: formData.client.signeeBasis,
        },
        contractNumber: formData.header.contractNumber,
        company: formData.agency.company,
        signDate: formData.header.signDate,
        startDate: formData.term.startDate,
        endDate: formData.term.endDate,
        contractValue: formData.financial.contractValue,
        taxType: formData.financial.taxType,
        taxAmount: formData.financial.taxAmount,
        totalAmount: formData.financial.totalAmount,
        programName: formData.deliverables.programName,
        platform: formData.deliverables.platform,
        creators: formData.deliverables.creators,
        totalSessions: formData.deliverables.totalSessions,
        sessionDuration: formData.deliverables.sessionDuration,
        bankDetails: formData.financial.bank,
        signeeName: formData.client.signeeName,
        signeePosition: formData.client.signeePosition,
        clientAddress: formData.client.address,
        tntSigneeName: formData.agency.signeeName,
        tntSigneePosition: formData.agency.signeePosition,
        courtJurisdiction: formData.legal.courtJurisdiction,
        documentPayload: formData,
        registerLetterNumber: true,
      };

      const res = await fetch("/api/absensi/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal menyimpan kontrak.");
      }

      setSaveSuccess(true);
      setSavedContractNumber(formData.header.contractNumber);
      toast.success(
        `Dokumen "${formData.header.contractNumber}" & data klien berhasil diarsipkan ke database!`,
      );
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      {/* ─────────────────────────────────────────────────────────────
          TOP NAVBAR BAR
      ───────────────────────────────────────────────────────────── */}
      <header className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/absensi/admin/letters"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                Generator Dokumen: PKS Klien MCN
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary rounded-full">
                0% Server Load · Real-Time
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Form kiri, Live Preview A4 kanan, dan Auto Write-Back ke database master.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFormData(DEFAULT_PKS_MCN_DATA)}
            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all flex items-center gap-1.5"
            title="Reset ke format default acuan TAVI"
          >
            <RotateCcw size={14} />
            <span>Reset Default</span>
          </button>

          <button
            onClick={handleSaveContract}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white hover:bg-slate-50 rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin text-primary" />
            ) : saveSuccess ? (
              <CheckCircle2 size={14} className="text-emerald-500" />
            ) : (
              <Save size={14} className="text-primary" />
            )}
            <span>{isSaving ? "Menyimpan..." : "Simpan & Arsipkan"}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-sm shadow-primary/20 transition-all flex items-center gap-2"
          >
            <Printer size={15} />
            <span>Cetak / Unduh PDF (A4)</span>
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          SPLIT VIEW MAIN CONTENT
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ── LEFT PANE: FORM & WORKSPACE (42%) ─────────────────────── */}
        <div className="no-print w-full lg:w-[44%] border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[calc(100vh-61px)]">
          {/* Autocomplete & Client Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Cari Klien / Brand di Database (cth: Paragon, TAVI)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
              {isSearching && (
                <Loader2
                  size={14}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
                />
              )}

              {/* Autocomplete Dropdown List */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                  <div className="p-2 bg-slate-50 dark:bg-slate-900/50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Ditemukan di Database Master
                  </div>
                  {searchResults.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => handleSelectClient(client)}
                      className="w-full text-left p-3 hover:bg-primary/5 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0 flex items-start justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {client.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Brand: {client.brandName ?? "-"} · {client.entityType}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {client.contractsCount} PKS
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Client Badge & PIC Selector */}
            {selectedClient ? (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate">
                      Tersinkron: {selectedClient.name}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedClient(null);
                      setSelectedContactMode("default");
                    }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline font-semibold"
                  >
                    Lepas
                  </button>
                </div>

                {/* PIC Selector dropdown for returning clients */}
                <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/50">
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold shrink-0">
                    Pilih PIC:
                  </span>
                  <select
                    value={selectedContactMode}
                    onChange={(e) => handleSelectContact(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-800 dark:text-white focus:outline-none"
                  >
                    <option value="default">
                      {selectedClient.contacts[0]?.signeeName
                        ? `Utama: ${selectedClient.contacts[0].signeeName} (${selectedClient.contacts[0].signeePosition})`
                        : "Kontak Standar"}
                    </option>
                    {selectedClient.contacts.slice(1).map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.signeeName} ({ct.signeePosition})
                      </option>
                    ))}
                    <option value="new">+ Ketik PIC Baru untuk PKS Ini</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs px-2 py-1 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 text-amber-800 dark:text-amber-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={13} />
                  Ketik manual atau cari di atas untuk auto-fill
                </span>
                <span className="text-[10px] font-bold uppercase bg-amber-200/60 px-1.5 py-0.5 rounded">
                  Auto Write-Back
                </span>
              </div>
            )}
          </div>

          {/* Form Tabs Nav */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-3 overflow-x-auto gap-1 py-1.5 bg-slate-50/30">
            {[
              { id: "client", label: "Pihak I & II", icon: Building2 },
              { id: "deliverables", label: "Ruang Lingkup", icon: FileText },
              { id: "financial", label: "Nilai & Bayar", icon: DollarSign },
              { id: "terms", label: "Periode & Pasal", icon: Calendar },
              { id: "schedule", label: "Lampiran Jadwal", icon: FolderOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as typeof activeSection)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Form Content Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* ── TAB 1: PARA PIHAK ─────────────────────────────────── */}
            {activeSection === "client" && (
              <div className="space-y-5">
                {/* Header Dokumen */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Header & Nomor Dokumen
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500">
                        Nomor Perjanjian:
                      </label>
                      <input
                        type="text"
                        value={formData.header.contractNumber}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            header: { ...formData.header, contractNumber: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500">
                        Tanggal TTD Dokumen:
                      </label>
                      <input
                        type="date"
                        value={formData.header.signDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            header: { ...formData.header, signDate: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Identitas Pihak Pertama (Klien) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-primary">
                      Pihak Pertama (Brand / Klien)
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      Profil Entitas
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        Nama Legal Perusahaan:
                      </label>
                      <input
                        type="text"
                        placeholder="PT Paragon Technology and Innovation"
                        value={formData.client.name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            client: { ...formData.client, name: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        Nama Brand / Alias:
                      </label>
                      <input
                        type="text"
                        placeholder="TAVI"
                        value={formData.client.brandName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            client: { ...formData.client, brandName: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="text-[11px] font-bold text-slate-600">
                        Alamat Domisili Legal Klien:
                      </label>
                      <textarea
                        rows={2}
                        value={formData.client.address}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            client: { ...formData.client, address: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Nama Wakil Penandatangan:
                      </label>
                      <input
                        type="text"
                        placeholder="DARA TITANIA MUTHMAINNAH"
                        value={formData.client.signeeName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            client: { ...formData.client, signeeName: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Jabatan Penandatangan:
                      </label>
                      <input
                        type="text"
                        placeholder="AFFILIATE SPECIALIST"
                        value={formData.client.signeePosition}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            client: { ...formData.client, signeePosition: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Identitas Pihak Kedua (TNT) */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Pihak Kedua (Internal TNT)
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Unit Perusahaan:
                      </label>
                      <select
                        value={formData.agency.company}
                        onChange={(e) =>
                          handleCompanyChange(
                            e.target.value as "TNT" | "HYPE" | "GOAT" | "NOVA",
                          )
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      >
                        {COMPANIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Penandatangan TNT:
                      </label>
                      <input
                        type="text"
                        value={formData.agency.signeeName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            agency: { ...formData.agency, signeeName: e.target.value },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: RUANG LINGKUP & CREATORS ───────────────────── */}
            {activeSection === "deliverables" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Nama Program:
                    </label>
                    <input
                      type="text"
                      value={formData.deliverables.programName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deliverables: {
                            ...formData.deliverables,
                            programName: e.target.value,
                          },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Platform Siaran:
                    </label>
                    <input
                      type="text"
                      value={formData.deliverables.platform}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deliverables: {
                            ...formData.deliverables,
                            platform: e.target.value,
                          },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Durasi Minimal per Sesi (Menit):
                    </label>
                    <input
                      type="number"
                      value={formData.deliverables.sessionDuration}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deliverables: {
                            ...formData.deliverables,
                            sessionDuration: Number(e.target.value) || 120,
                          },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Total Sesi (Akumulasi):
                    </label>
                    <div className="mt-1 px-3 py-2 text-xs font-black bg-slate-100 dark:bg-slate-800 rounded-xl text-primary">
                      {formData.deliverables.totalSessions} Sesi Live
                    </div>
                  </div>
                </div>

                {/* Creators List */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Daftar Creator & Alokasi Sesi
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddCreator}
                      className="px-2.5 py-1 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg flex items-center gap-1 transition-all"
                    >
                      <Plus size={13} />
                      Tambah Creator
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formData.deliverables.creators.map((c, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800"
                      >
                        <input
                          type="text"
                          placeholder="Nama Akun / Creator (cth: Storyandine)"
                          value={c.name}
                          onChange={(e) =>
                            handleUpdateCreator(idx, e.target.value, c.sessions)
                          }
                          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={c.sessions}
                            onChange={(e) =>
                              handleUpdateCreator(
                                idx,
                                c.name,
                                Number(e.target.value) || 0,
                              )
                            }
                            className="w-16 px-2 py-1.5 text-xs font-bold text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          <span className="text-[11px] text-slate-400 font-bold">
                            sesi
                          </span>
                        </div>
                        {formData.deliverables.creators.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCreator(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: FINANSIAL & PEMBAYARAN ─────────────────────── */}
            {activeSection === "financial" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Nilai Kontrak Dasar (Sebelum Pajak):
                    </label>
                    <input
                      type="number"
                      step={50000}
                      value={formData.financial.contractValue}
                      onChange={(e) =>
                        handleFinancialChange(
                          Number(e.target.value) || 0,
                          formData.financial.taxType,
                        )
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 italic">
                      {terbilangRupiah(formData.financial.contractValue)}
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Skema Pajak:
                    </label>
                    <select
                      value={formData.financial.taxType}
                      onChange={(e) =>
                        handleFinancialChange(
                          formData.financial.contractValue,
                          e.target.value as PksTaxType,
                        )
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="pph_0_5">PPh Final 0.5% (UMKM)</option>
                      <option value="pph_23">PPh Pasal 23 (2%)</option>
                      <option value="ppn_11">PPN (11%)</option>
                      <option value="none">Bebas Pajak (0%)</option>
                    </select>
                  </div>

                  <div className="col-span-2 bg-primary/5 dark:bg-primary/10 p-3.5 rounded-2xl border border-primary/20 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-slate-500">
                        Total Pembayaran Bersih (Wajib Dibayar):
                      </p>
                      <p className="text-base font-black text-primary">
                        {formatRupiah(formData.financial.totalAmount)}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500 font-semibold">
                      <p>DPP: {formatRupiah(formData.financial.contractValue)}</p>
                      <p>Pajak: {formatRupiah(formData.financial.taxAmount)}</p>
                    </div>
                  </div>
                </div>

                {/* Rekening Tujuan Transfer */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Rekening Resmi Penerima (Pasal 3 Ayat 3)
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Bank:
                      </label>
                      <input
                        type="text"
                        value={formData.financial.bank.bankName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            financial: {
                              ...formData.financial,
                              bank: {
                                ...formData.financial.bank,
                                bankName: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Nomor Rekening:
                      </label>
                      <input
                        type="text"
                        value={formData.financial.bank.accountNumber}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            financial: {
                              ...formData.financial,
                              bank: {
                                ...formData.financial.bank,
                                accountNumber: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] font-bold text-slate-600">
                        Nama Pemilik Rekening:
                      </label>
                      <input
                        type="text"
                        value={formData.financial.bank.accountName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            financial: {
                              ...formData.financial,
                              bank: {
                                ...formData.financial.bank,
                                accountName: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 4: PERIODE & KLAUSUL ──────────────────────────── */}
            {activeSection === "terms" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Mulai Berlaku Kontrak:
                    </label>
                    <input
                      type="date"
                      value={formData.term.startDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          term: { ...formData.term, startDate: e.target.value },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">
                      Berakhir Kontrak:
                    </label>
                    <input
                      type="date"
                      value={formData.term.endDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          term: { ...formData.term, endDate: e.target.value },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-600">
                      Target Sesi Perdana (First Live):
                    </label>
                    <input
                      type="date"
                      value={formData.term.firstLiveDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          term: { ...formData.term, firstLiveDate: e.target.value },
                        })
                      }
                      className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Klausul Legal & Domisili Hukum
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Larangan Bypass Creator (Bulan):
                      </label>
                      <input
                        type="number"
                        value={formData.legal.nonCircumventionMonths}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            legal: {
                              ...formData.legal,
                              nonCircumventionMonths: Number(e.target.value) || 12,
                            },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Domisili Pengadilan:
                      </label>
                      <input
                        type="text"
                        value={formData.legal.courtJurisdiction}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            legal: {
                              ...formData.legal,
                              courtJurisdiction: e.target.value,
                            },
                          })
                        }
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 5: LAMPIRAN JADWAL ────────────────────────────── */}
            {activeSection === "schedule" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Roster / Jadwal Siaran (Lampiran I)
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddScheduleRow}
                    className="px-2.5 py-1 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg flex items-center gap-1 transition-all"
                  >
                    <Plus size={13} />
                    Tambah Sesi
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.schedule.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">
                          Sesi #{row.sessionNo || idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveScheduleRow(idx)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Tanggal (cth: 06 Oktober 2026)"
                          value={row.date}
                          onChange={(e) => {
                            const next = [...formData.schedule];
                            next[idx].date = e.target.value;
                            setFormData({ ...formData, schedule: next });
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <input
                          type="text"
                          placeholder="Jam (cth: 19:00 - 21:00 WIB)"
                          value={row.time}
                          onChange={(e) => {
                            const next = [...formData.schedule];
                            next[idx].time = e.target.value;
                            setFormData({ ...formData, schedule: next });
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <input
                          type="text"
                          placeholder="Nama Creator"
                          value={row.creator}
                          onChange={(e) => {
                            const next = [...formData.schedule];
                            next[idx].creator = e.target.value;
                            setFormData({ ...formData, schedule: next });
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                        <input
                          type="text"
                          placeholder="Catatan / Produk Fokus"
                          value={row.notes}
                          onChange={(e) => {
                            const next = [...formData.schedule];
                            next[idx].notes = e.target.value;
                            setFormData({ ...formData, schedule: next });
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: LIVE PREVIEW & ZOOM (58%) ─────────────────── */}
        <div className="flex-1 bg-slate-200/70 dark:bg-slate-950 flex flex-col h-[calc(100vh-61px)] overflow-hidden">
          {/* Preview Toolbar */}
          <div className="no-print bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-bold">Pratinjau Lembar A4 (14 Halaman)</span>
              <span className="text-slate-400">·</span>
              <span className="text-[11px] text-slate-500">
                Skala: {Math.round(zoom * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Perkecil"
              >
                <ZoomOut size={15} />
              </button>
              <button
                onClick={() => setZoom(0.85)}
                className="px-2 py-1 text-[11px] font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Fit
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Perbesar"
              >
                <ZoomIn size={15} />
              </button>
            </div>
          </div>

          {/* Scrollable Document Container */}
          <div className="flex-1 overflow-auto p-8 pks-document-container flex justify-center">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease-out",
              }}
            >
              <PksMcnDocument data={formData} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
