"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  Save,
  Search,
  CheckCircle2,
  Building2,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Loader2,
  ShieldAlert,
  FileCheck2,
  Layers,
  Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { PksMcnDocument } from "@/components/documents/PksMcnDocument";
import { PksTntDocument } from "@/components/documents/PksTntDocument";
import {
  DEFAULT_PKS_MCN_DATA,
  DEFAULT_PKS_TNT_DATA,
  type PksMcnData,
  type PksTntData,
  type PksTaxType,
  type PksTemplateType,
} from "@/types/pks";
import type { ClientWithDetails } from "@/server/dal/clients";
import { formatRupiah, terbilangRupiah } from "@/lib/terbilang";

const COMPANIES = [
  { code: "TNT", name: "PT TNT KREATIF DIGITAL", trade: "Thick and Thin Media Indonesia" },
  { code: "HYPE", name: "PT HYPE MEDIA INDONESIA", trade: "HYPE Management" },
  { code: "GOAT", name: "PT TALENTA SIBER MAKMUR", trade: "GOAT Creator Agency" },
  { code: "NOVA", name: "PT NOVA CORE DIGITAL", trade: "NovaCore" },
] as const;

interface Props {
  backHref?: string;
}

function UniversalContractGeneratorInner({ backHref = "/absensi/letters" }: Props) {
  const searchParams = useSearchParams();
  const contractIdParam = searchParams.get("contractId");
  const clientIdParam = searchParams.get("clientId");
  const typeParam = searchParams.get("type");

  // ── Template Selection ───────────────────────────────────────────
  const [templateType, setTemplateType] = useState<PksTemplateType>("PKS_KLIEN_TNT");

  // ── Document State ───────────────────────────────────────────────
  const [formDataTnt, setFormDataTnt] = useState<PksTntData>(DEFAULT_PKS_TNT_DATA);
  const [formDataMcn, setFormDataMcn] = useState<PksMcnData>(DEFAULT_PKS_MCN_DATA);
  const [zoom, setZoom] = useState<number>(0.85);

  // ── Editing Existing Contract State ──────────────────────────────
  const [editingContractId, setEditingContractId] = useState<string | null>(null);

  // ── Client Search & Multi-Profile State ─────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ClientWithDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithDetails | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>("default");

  // ── Save State ───────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedContractNumber, setSavedContractNumber] = useState<string | null>(null);

  // ── Active Form Section ──────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<
    "parties" | "scope" | "financial" | "terms" | "schedule_or_sla"
  >("parties");

  // ── Auto-load from URL Query Params ──────────────────────────────
  useEffect(() => {
    if (typeParam === "PKS_KLIEN_TNT" || typeParam === "PKS_KLIEN_MCN") {
      setTemplateType(typeParam as PksTemplateType);
    }
  }, [typeParam]);

  useEffect(() => {
    if (contractIdParam) {
      setIsSaving(true);
      fetch(`/api/absensi/contracts?id=${encodeURIComponent(contractIdParam)}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.ok && json.data?.contract) {
            const c = json.data.contract;
            setEditingContractId(c.id);
            if (c.contractType) {
              setTemplateType(c.contractType as PksTemplateType);
            }
            if (c.contractType === "PKS_KLIEN_TNT") {
              setFormDataTnt(c.documentPayload as PksTntData);
            } else {
              setFormDataMcn(c.documentPayload as PksMcnData);
            }
            toast.success(`Memuat kontrak untuk diedit: ${c.contractNumber}`);
          }
        })
        .catch((err) => {
          console.error("Gagal load kontrak:", err);
          toast.error("Gagal memuat dokumen kontrak.");
        })
        .finally(() => setIsSaving(false));
    } else if (clientIdParam) {
      fetch(`/api/absensi/clients?id=${encodeURIComponent(clientIdParam)}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.ok && json.data?.client) {
            handleSelectClient(json.data.client);
            toast.success(`Klien terpilih: ${json.data.client.name}`);
          }
        })
        .catch((err) => console.error("Gagal load klien:", err));
    }
  }, [contractIdParam, clientIdParam]);

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

    if (primaryContact) {
      setSelectedContactId(primaryContact.id);
    } else {
      setSelectedContactId("default");
    }

    const clientPayload = {
      id: client.id,
      name: client.name,
      brandName: client.brandName ?? "",
      entityType: client.entityType ?? "perseroan terbatas",
      address: primaryContact?.address || client.address || "",
      signeeName: primaryContact?.signeeName ?? "",
      signeePosition: primaryContact?.signeePosition ?? "",
      signeeBasis: primaryContact?.signeeBasis ?? "Direksi",
      phone: client.phone ?? "",
      email: client.email ?? "",
    };

    setFormDataTnt((prev) => ({ ...prev, client: clientPayload }));
    setFormDataMcn((prev) => ({ ...prev, client: clientPayload }));

    toast.success(`Data klien "${client.name}" berhasil diisi otomatis!`);
  }

  // ── Switch between available PIC/contacts of this client ────────
  function handleSelectContact(contactId: string) {
    setSelectedContactId(contactId);
    if (!selectedClient) return;

    if (contactId === "new") {
      setFormDataTnt((prev) => ({
        ...prev,
        client: {
          ...prev.client,
          signeeName: "",
          signeePosition: "",
          signeeBasis: "Direksi",
        },
      }));
      setFormDataMcn((prev) => ({
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
      const updatedFields = {
        signeeName: found.signeeName,
        signeePosition: found.signeePosition,
        signeeBasis: found.signeeBasis,
        address: found.address || selectedClient.address || "",
      };

      setFormDataTnt((prev) => ({
        ...prev,
        client: { ...prev.client, ...updatedFields },
      }));
      setFormDataMcn((prev) => ({
        ...prev,
        client: { ...prev.client, ...updatedFields },
      }));

      toast.info(`Profil penandatangan beralih ke: ${found.signeeName} (${found.signeePosition})`);
    }
  }

  // ── Auto-calculate Tax & Total (PKS TNT) ─────────────────────────
  function handleFinancialChangeTnt(val: number, taxType: PksTaxType) {
    let rate = 0;
    if (taxType === "pph_0_5") rate = 0.005;
    else if (taxType === "pph_23") rate = 0.02;
    else if (taxType === "ppn_11") rate = 0.11;

    const taxAmount = Math.round(val * rate);
    const totalAmount = val + taxAmount;

    setFormDataTnt((prev) => ({
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

  // ── Auto-calculate Tax & Total (PKS MCN) ─────────────────────────
  function handleFinancialChangeMcn(val: number, taxType: PksTaxType) {
    let rate = 0;
    if (taxType === "pph_0_5") rate = 0.005;
    else if (taxType === "pph_23") rate = 0.02;
    else if (taxType === "ppn_11") rate = 0.11;

    const taxAmount = Math.round(val * rate);
    const totalAmount = val + taxAmount;

    setFormDataMcn((prev) => ({
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
    const agencyData = {
      company: target.code,
      companyLegalName: target.name,
      tradeName: target.trade,
      address:
        "Jalan Kavling Perkebunan Raya, RT 006 / RW 013, Panunggangan Barat, Kec. Cibodas, Kota Tangerang, Banten 15139",
      signeeName: "RUBEN ARIANTO",
      signeePosition: "DIREKTUR UTAMA",
    };

    setFormDataTnt((prev) => ({ ...prev, agency: agencyData }));
    setFormDataMcn((prev) => ({ ...prev, agency: agencyData }));
  }

  // ── Action: Print / Download PDF ────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── Action: Save & Auto Write-Back to Database ───────────────────
  async function handleSaveContract() {
    const isTnt = templateType === "PKS_KLIEN_TNT";
    const activeClient = isTnt ? formDataTnt.client : formDataMcn.client;
    const activeHeader = isTnt ? formDataTnt.header : formDataMcn.header;
    const activeAgency = isTnt ? formDataTnt.agency : formDataMcn.agency;
    const activeFinancial = isTnt ? formDataTnt.financial : formDataMcn.financial;

    if (!activeClient.name.trim()) {
      toast.error("Nama perusahaan klien wajib diisi.");
      return;
    }
    if (!activeHeader.contractNumber.trim()) {
      toast.error("Nomor perjanjian wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        contractType: templateType,
        clientId: selectedClient?.id,
        clientData: {
          name: activeClient.name,
          brandName: activeClient.brandName || null,
          entityType: activeClient.entityType || "perseroan terbatas",
          address: activeClient.address || null,
          phone: activeClient.phone || null,
          email: activeClient.email || null,
          signeeName: activeClient.signeeName,
          signeePosition: activeClient.signeePosition,
          signeeBasis: activeClient.signeeBasis,
        },
        contractNumber: activeHeader.contractNumber,
        company: activeAgency.company,
        signDate: activeHeader.signDate,
        startDate: isTnt ? formDataTnt.term.startDate : formDataMcn.term.startDate,
        endDate: isTnt ? formDataTnt.term.runningEndDate : formDataMcn.term.endDate,
        contractValue: activeFinancial.contractValue,
        taxType: activeFinancial.taxType,
        taxAmount: activeFinancial.taxAmount,
        totalAmount: activeFinancial.totalAmount,
        programName: isTnt
          ? formDataTnt.campaign.programName
          : formDataMcn.deliverables.programName,
        platform: isTnt ? "TikTok" : formDataMcn.deliverables.platform,
        creators: isTnt ? null : formDataMcn.deliverables.creators,
        totalSessions: isTnt
          ? formDataTnt.campaign.totalVideos
          : formDataMcn.deliverables.totalSessions,
        sessionDuration: isTnt ? 0 : formDataMcn.deliverables.sessionDuration,
        bankDetails: activeFinancial.bank,
        signeeName: activeClient.signeeName,
        signeePosition: activeClient.signeePosition,
        clientAddress: activeClient.address,
        tntSigneeName: activeAgency.signeeName,
        tntSigneePosition: activeAgency.signeePosition,
        courtJurisdiction: isTnt
          ? formDataTnt.legal.courtJurisdiction
          : formDataMcn.legal.courtJurisdiction,
        documentPayload: isTnt ? formDataTnt : formDataMcn,
        registerLetterNumber: !editingContractId,
      };

      const method = editingContractId ? "PUT" : "POST";
      const payloadToSend = editingContractId
        ? { id: editingContractId, ...payload }
        : payload;

      const res = await fetch("/api/absensi/contracts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal menyimpan kontrak.");
      }

      setSaveSuccess(true);
      setSavedContractNumber(activeHeader.contractNumber);
      toast.success(
        editingContractId
          ? `Perubahan pada kontrak "${activeHeader.contractNumber}" berhasil disimpan!`
          : `Dokumen "${activeHeader.contractNumber}" (${templateType === "PKS_KLIEN_TNT" ? "PKS TNT" : "PKS MCN"}) & data klien berhasil diarsipkan ke database!`,
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
            href={backHref}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                Generator Dokumen: {templateType === "PKS_KLIEN_TNT" ? "PKS Klien TNT" : "PKS Klien MCN"}
              </h1>
              {editingContractId ? (
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full flex items-center gap-1">
                  <Edit3 size={11} /> Mode Edit Kontrak
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary rounded-full">
                  Dokumen Baru · Times New Roman
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Form kiri, Live Preview A4 kanan, dan Auto Write-Back ke database master klien.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Template Selector Segment */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setTemplateType("PKS_KLIEN_TNT")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                templateType === "PKS_KLIEN_TNT"
                  ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <FileCheck2 size={13} />
              <span>PKS Klien TNT</span>
            </button>
            <button
              onClick={() => setTemplateType("PKS_KLIEN_MCN")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                templateType === "PKS_KLIEN_MCN"
                  ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Layers size={13} />
              <span>PKS Klien MCN (LS)</span>
            </button>
          </div>

          <button
            onClick={() => {
              if (templateType === "PKS_KLIEN_TNT") {
                setFormDataTnt(DEFAULT_PKS_TNT_DATA);
              } else {
                setFormDataMcn(DEFAULT_PKS_MCN_DATA);
              }
              toast.info("Form dikembalikan ke data acuan awal.");
            }}
            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all flex items-center gap-1.5"
            title="Reset ke format default"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>

          <button
            onClick={handleSaveContract}
            disabled={isSaving}
            className={`px-4 py-2 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 ${
              editingContractId
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20"
                : "bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white hover:bg-slate-50"
            }`}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin text-primary" />
            ) : saveSuccess ? (
              <CheckCircle2 size={14} className="text-emerald-500" />
            ) : editingContractId ? (
              <Edit3 size={14} className="text-white" />
            ) : (
              <Save size={14} className="text-primary" />
            )}
            <span>
              {isSaving
                ? "Menyimpan..."
                : editingContractId
                  ? "Perbarui Kontrak"
                  : "Simpan & Arsipkan"}
            </span>
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
                      Klien Terhubung: {selectedClient.name} {selectedClient.brandName ? `("${selectedClient.brandName}")` : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedClient(null);
                      setSelectedContactId("default");
                    }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline font-semibold"
                  >
                    Lepas
                  </button>
                </div>

                {/* PIC Selector dropdown for returning clients */}
                <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/50">
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold shrink-0">
                    Pilih Profil PIC:
                  </span>
                  <select
                    value={selectedContactId}
                    onChange={(e) => handleSelectContact(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-800 dark:text-white focus:outline-none"
                  >
                    {selectedClient.contacts.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.isPrimary ? "[Utama] " : ""}{ct.signeeName} ({ct.signeePosition})
                      </option>
                    ))}
                    <option value="new">+ Input Profil / Penandatangan Baru</option>
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
                  Auto Write-Back Aktif
                </span>
              </div>
            )}
          </div>

          {/* Form Tabs Nav */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-3 overflow-x-auto gap-1 py-1.5 bg-slate-50/30">
            {[
              { id: "parties", label: "Pihak I & II", icon: Building2 },
              { id: "scope", label: "Ruang Lingkup", icon: FileCheck2 },
              { id: "financial", label: "Nilai & Bayar", icon: DollarSign },
              { id: "terms", label: "Periode & Waktu", icon: Calendar },
              {
                id: "schedule_or_sla",
                label: templateType === "PKS_KLIEN_TNT" ? "Approval & SLA" : "Lampiran Jadwal",
                icon: templateType === "PKS_KLIEN_TNT" ? ShieldAlert : Layers,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as never)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Form Tab Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── TAB 1: PIHAK I & II ───────────────────────────────── */}
            {activeSection === "parties" && (
              <div className="space-y-4">
                {/* Header Kontrak */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    Header & Nomor Dokumen
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Nomor Perjanjian:
                      </label>
                      <input
                        type="text"
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.header.contractNumber
                            : formDataMcn.header.contractNumber
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormDataTnt((prev) => ({
                            ...prev,
                            header: { ...prev.header, contractNumber: v },
                          }));
                          setFormDataMcn((prev) => ({
                            ...prev,
                            header: { ...prev.header, contractNumber: v },
                          }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Tanggal TTD Dokumen:
                      </label>
                      <input
                        type="date"
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.header.signDate
                            : formDataMcn.header.signDate
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormDataTnt((prev) => ({
                            ...prev,
                            header: { ...prev.header, signDate: v },
                          }));
                          setFormDataMcn((prev) => ({
                            ...prev,
                            header: { ...prev.header, signDate: v },
                          }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Pihak Pertama (Brand / Klien) */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                      Pihak Pertama (Brand / Klien)
                    </p>
                    <span className="text-[10px] text-primary font-bold">
                      Profil Entitas
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Nama Legal Perusahaan:
                      </label>
                      <input
                        type="text"
                        placeholder="PT ..."
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.client.name
                            : formDataMcn.client.name
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormDataTnt((p) => ({ ...p, client: { ...p.client, name: v } }));
                          setFormDataMcn((p) => ({ ...p, client: { ...p.client, name: v } }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Nama Brand / Alias:
                      </label>
                      <input
                        type="text"
                        placeholder="contoh: TAVI"
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.client.brandName
                            : formDataMcn.client.brandName
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormDataTnt((p) => ({ ...p, client: { ...p.client, brandName: v } }));
                          setFormDataMcn((p) => ({ ...p, client: { ...p.client, brandName: v } }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Alamat Domisili Legal Klien:
                    </label>
                    <textarea
                      rows={2}
                      value={
                        templateType === "PKS_KLIEN_TNT"
                          ? formDataTnt.client.address
                          : formDataMcn.client.address
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormDataTnt((p) => ({ ...p, client: { ...p.client, address: v } }));
                        setFormDataMcn((p) => ({ ...p, client: { ...p.client, address: v } }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Nama Wakil Penandatangan:
                      </label>
                      <input
                        type="text"
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.client.signeeName
                            : formDataMcn.client.signeeName
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormDataTnt((p) => ({ ...p, client: { ...p.client, signeeName: v } }));
                          setFormDataMcn((p) => ({ ...p, client: { ...p.client, signeeName: v } }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Jabatan Penandatangan:
                      </label>
                      <input
                        type="text"
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.client.signeePosition
                            : formDataMcn.client.signeePosition
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setFormDataTnt((p) => ({ ...p, client: { ...p.client, signeePosition: v } }));
                          setFormDataMcn((p) => ({ ...p, client: { ...p.client, signeePosition: v } }));
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Pihak Kedua (Internal TNT) */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    Pihak Kedua (Internal TNT)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Unit Perusahaan:
                      </label>
                      <select
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.agency.company
                            : formDataMcn.agency.company
                        }
                        onChange={(e) => handleCompanyChange(e.target.value as never)}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none"
                      >
                        {COMPANIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} ({c.trade})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Penandatangan TNT:
                      </label>
                      <input
                        type="text"
                        disabled
                        value="RUBEN ARIANTO (DIREKTUR UTAMA)"
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800/50 text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: RUANG LINGKUP ──────────────────────────────── */}
            {activeSection === "scope" && (
              <div className="space-y-4">
                {templateType === "PKS_KLIEN_TNT" ? (
                  /* Form Ruang Lingkup PKS TNT (Affiliate Booster) */
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                        Target Campaign: Affiliate Booster
                      </p>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        TikTok Yellow Cart
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Total Target Creators:
                        </label>
                        <input
                          type="number"
                          value={formDataTnt.campaign.totalCreators}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              campaign: {
                                ...p.campaign,
                                totalCreators: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Total Video Keranjang Kuning:
                        </label>
                        <input
                          type="number"
                          value={formDataTnt.campaign.totalVideos}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              campaign: {
                                ...p.campaign,
                                totalVideos: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Alokasi Tier Creator:
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Mega (&gt;1M followers):
                          </label>
                          <input
                            type="number"
                            value={formDataTnt.campaign.tiers.mega}
                            onChange={(e) =>
                              setFormDataTnt((p) => ({
                                ...p,
                                campaign: {
                                  ...p.campaign,
                                  tiers: {
                                    ...p.campaign.tiers,
                                    mega: Number(e.target.value) || 0,
                                  },
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Macro (100k - 999.9k):
                          </label>
                          <input
                            type="number"
                            value={formDataTnt.campaign.tiers.macro}
                            onChange={(e) =>
                              setFormDataTnt((p) => ({
                                ...p,
                                campaign: {
                                  ...p.campaign,
                                  tiers: {
                                    ...p.campaign.tiers,
                                    macro: Number(e.target.value) || 0,
                                  },
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Micro (10k - 99.9k):
                          </label>
                          <input
                            type="number"
                            value={formDataTnt.campaign.tiers.micro}
                            onChange={(e) =>
                              setFormDataTnt((p) => ({
                                ...p,
                                campaign: {
                                  ...p.campaign,
                                  tiers: {
                                    ...p.campaign.tiers,
                                    micro: Number(e.target.value) || 0,
                                  },
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">
                            Nano (1k - 9.9k):
                          </label>
                          <input
                            type="number"
                            value={formDataTnt.campaign.tiers.nano}
                            onChange={(e) =>
                              setFormDataTnt((p) => ({
                                ...p,
                                campaign: {
                                  ...p.campaign,
                                  tiers: {
                                    ...p.campaign.tiers,
                                    nano: Number(e.target.value) || 0,
                                  },
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Form Ruang Lingkup PKS MCN (Live Streaming) */
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-4">
                    <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                      Daftar Host Live Streaming MCN
                    </p>
                    <div className="space-y-2">
                      {formDataMcn.deliverables.creators.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Username Creator"
                            value={c.name}
                            onChange={(e) => {
                              const next = [...formDataMcn.deliverables.creators];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setFormDataMcn((p) => ({
                                ...p,
                                deliverables: { ...p.deliverables, creators: next },
                              }));
                            }}
                            className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          <input
                            type="number"
                            placeholder="Sesi"
                            value={c.sessions}
                            onChange={(e) => {
                              const next = [...formDataMcn.deliverables.creators];
                              next[idx] = { ...next[idx], sessions: Number(e.target.value) || 0 };
                              const total = next.reduce((sum, item) => sum + item.sessions, 0);
                              setFormDataMcn((p) => ({
                                ...p,
                                deliverables: { ...p.deliverables, creators: next, totalSessions: total },
                              }));
                            }}
                            className="w-20 px-2 py-1.5 text-xs text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                          <button
                            onClick={() => {
                              const next = formDataMcn.deliverables.creators.filter((_, i) => i !== idx);
                              const total = next.reduce((sum, item) => sum + item.sessions, 0);
                              setFormDataMcn((p) => ({
                                ...p,
                                deliverables: { ...p.deliverables, creators: next, totalSessions: total },
                              }));
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          setFormDataMcn((p) => ({
                            ...p,
                            deliverables: {
                              ...p.deliverables,
                              creators: [...p.deliverables.creators, { name: "", sessions: 10 }],
                            },
                          }))
                        }
                        className="text-xs font-bold text-primary flex items-center gap-1 hover:underline pt-1"
                      >
                        <Plus size={13} />
                        Tambah Creator Live
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: NILAI & BAYAR ──────────────────────────────── */}
            {activeSection === "financial" && (
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    Nilai Kontrak & Pajak
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Nilai Kontrak (DPP Sebelum Pajak):
                      </label>
                      <input
                        type="number"
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.financial.contractValue
                            : formDataMcn.financial.contractValue
                        }
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          if (templateType === "PKS_KLIEN_TNT") {
                            handleFinancialChangeTnt(val, formDataTnt.financial.taxType);
                          } else {
                            handleFinancialChangeMcn(val, formDataMcn.financial.taxType);
                          }
                        }}
                        className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Perlakuan Pajak (PPh):
                      </label>
                      <select
                        value={
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.financial.taxType
                            : formDataMcn.financial.taxType
                        }
                        onChange={(e) => {
                          const t = e.target.value as PksTaxType;
                          if (templateType === "PKS_KLIEN_TNT") {
                            handleFinancialChangeTnt(formDataTnt.financial.contractValue, t);
                          } else {
                            handleFinancialChangeMcn(formDataMcn.financial.contractValue, t);
                          }
                        }}
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                      >
                        <option value="pph_0_5">PPh 0,5% (PP 55 UMKM)</option>
                        <option value="pph_23">PPh 23 (2% Jasa)</option>
                        <option value="ppn_11">PPN 11%</option>
                        <option value="none">Bebas Pajak (0%)</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Nilai Pajak:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatRupiah(
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.financial.taxAmount
                            : formDataMcn.financial.taxAmount,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs font-black text-slate-900 dark:text-white pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>Total Pembayaran (Net):</span>
                      <span className="font-mono text-sm text-primary">
                        {formatRupiah(
                          templateType === "PKS_KLIEN_TNT"
                            ? formDataTnt.financial.totalAmount
                            : formDataMcn.financial.totalAmount,
                        )}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">
                      Terbilang:{" "}
                      {terbilangRupiah(
                        templateType === "PKS_KLIEN_TNT"
                          ? formDataTnt.financial.totalAmount
                          : formDataMcn.financial.totalAmount,
                      )}
                    </p>
                  </div>

                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Rekening Penerima Pembayaran:
                    </p>
                    <div className="p-2.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-mono space-y-0.5">
                      <p className="font-bold">Bank Central Asia (BCA)</p>
                      <p>Nama: PT TNT KREATIF DIGITAL</p>
                      <p>Nomor: 7613472888 (KCP Karawaci)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 4: PERIODE & WAKTU ───────────────────────────── */}
            {activeSection === "terms" && (
              <div className="space-y-4">
                {templateType === "PKS_KLIEN_TNT" ? (
                  /* Timeline PKS TNT */
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                    <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                      Jangka Waktu Campaign (Pasal 2)
                    </p>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Tanggal Mulai Perjanjian:
                      </label>
                      <input
                        type="date"
                        value={formDataTnt.term.startDate}
                        onChange={(e) =>
                          setFormDataTnt((p) => ({
                            ...p,
                            term: { ...p.term, startDate: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Masa Persiapan (Hari):
                        </label>
                        <input
                          type="number"
                          value={formDataTnt.term.prepDurationDays}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              term: {
                                ...p.term,
                                prepDurationDays: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Target First VT:
                        </label>
                        <input
                          type="date"
                          value={formDataTnt.term.firstVtDate}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              term: { ...p.term, firstVtDate: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Masa Running (Hari):
                        </label>
                        <input
                          type="number"
                          value={formDataTnt.term.runningDurationDays}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              term: {
                                ...p.term,
                                runningDurationDays: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Target Selesai Running:
                        </label>
                        <input
                          type="date"
                          value={formDataTnt.term.runningEndDate}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              term: { ...p.term, runningEndDate: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Timeline PKS MCN */
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                    <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                      Jangka Waktu Siaran Langsung
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Tanggal Mulai:
                        </label>
                        <input
                          type="date"
                          value={formDataMcn.term.startDate}
                          onChange={(e) =>
                            setFormDataMcn((p) => ({
                              ...p,
                              term: { ...p.term, startDate: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Tanggal Selesai:
                        </label>
                        <input
                          type="date"
                          value={formDataMcn.term.endDate}
                          onChange={(e) =>
                            setFormDataMcn((p) => ({
                              ...p,
                              term: { ...p.term, endDate: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 5: APPROVAL & SLA (TNT) / JADWAL (MCN) ───────── */}
            {activeSection === "schedule_or_sla" && (
              <div className="space-y-4">
                {templateType === "PKS_KLIEN_TNT" ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                    <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                      Aturan Approval & SLA (Pasal 6 & 8)
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Maksimal Revisi:
                        </label>
                        <input
                          type="number"
                          value={formDataTnt.approval.maxRevisions}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              approval: {
                                ...p.approval,
                                maxRevisions: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Batas Respon (Hari Kerja):
                        </label>
                        <input
                          type="number"
                          value={formDataTnt.approval.replyDays}
                          onChange={(e) =>
                            setFormDataTnt((p) => ({
                              ...p,
                              approval: {
                                ...p.approval,
                                replyDays: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Batas Akumulasi Keterlambatan Klien (Hari Kalender):
                      </label>
                      <input
                        type="number"
                        value={formDataTnt.approval.maxExtensionDays}
                        onChange={(e) =>
                          setFormDataTnt((p) => ({
                            ...p,
                            approval: {
                              ...p.approval,
                              maxExtensionDays: Number(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                        Lampiran I (Jadwal & Roster)
                      </p>
                      {/* Format Selector Toggle */}
                      <div className="flex rounded-lg bg-slate-200 dark:bg-slate-700 p-0.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() =>
                            setFormDataMcn((p) => ({ ...p, appendixFormat: "calendar" }))
                          }
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            (formDataMcn.appendixFormat || "calendar") === "calendar"
                              ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                          }`}
                        >
                          Kalender Grid (Resmi)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFormDataMcn((p) => ({ ...p, appendixFormat: "table" }))
                          }
                          className={`px-2.5 py-1 rounded-md transition-all ${
                            formDataMcn.appendixFormat === "table"
                              ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                          }`}
                        >
                          Tabel Daftar Sesi
                        </button>
                      </div>
                    </div>

                    {(formDataMcn.appendixFormat || "calendar") === "calendar" ? (
                      /* ── KALENDER ROSTER BULANAN VIEW BUILDER ── */
                      <div className="space-y-4">
                        <p className="text-[11px] text-slate-500">
                          Format kalender bulanan per creator sesuai dokumen asli PKS TAVI. Tiap creator memiliki jadwal live dan daftar promo di bawahnya.
                        </p>

                        {(formDataMcn.calendarRosters || []).map((roster, rIdx) => (
                          <div
                            key={rIdx}
                            className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3"
                          >
                            <div className="flex justify-between items-center text-xs font-bold border-b border-slate-100 dark:border-slate-700/60 pb-2">
                              <span>Creator #{rIdx + 1}: {roster.creatorName || `Talent ${rIdx + 1}`}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  Tema: {roster.themeColor || "blue"}
                                </span>
                                {(formDataMcn.calendarRosters || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = (formDataMcn.calendarRosters || []).filter(
                                        (_, i) => i !== rIdx,
                                      );
                                      setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                    }}
                                    className="text-rose-500 hover:text-rose-700 p-1"
                                    title="Hapus Kalender Creator Ini"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2 text-xs">
                              <div>
                                <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                                  Judul Kalender:
                                </label>
                                <input
                                  type="text"
                                  value={roster.targetInfo}
                                  onChange={(e) => {
                                    const next = [...(formDataMcn.calendarRosters || [])];
                                    next[rIdx] = { ...next[rIdx], targetInfo: e.target.value };
                                    setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                  }}
                                  placeholder="cth: Storyandine - TnT (10x Sesi Oktober)"
                                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border rounded-lg text-xs font-medium"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                                    Bulan Header:
                                  </label>
                                  <input
                                    type="text"
                                    value={roster.monthName}
                                    onChange={(e) => {
                                      const next = [...(formDataMcn.calendarRosters || [])];
                                      next[rIdx] = { ...next[rIdx], monthName: e.target.value };
                                      setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                    }}
                                    placeholder="OKTOBER"
                                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border rounded-lg text-xs font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
                                    Warna Tema:
                                  </label>
                                  <select
                                    value={roster.themeColor || "blue"}
                                    onChange={(e) => {
                                      const next = [...(formDataMcn.calendarRosters || [])];
                                      next[rIdx] = {
                                        ...next[rIdx],
                                        themeColor: e.target.value as "blue" | "pink" | "purple" | "emerald",
                                      };
                                      setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                    }}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border rounded-lg text-xs font-semibold"
                                  >
                                    <option value="blue">Biru (Blue Pastel)</option>
                                    <option value="pink">Pink / Magenta (TAVI)</option>
                                    <option value="purple">Ungu (Purple Pastel)</option>
                                    <option value="emerald">Hijau (Emerald Pastel)</option>
                                  </select>
                                </div>
                              </div>

                              {/* Promo Notes List */}
                              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                    Catatan Promo (*Note:)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...(formDataMcn.calendarRosters || [])];
                                      const curNotes = next[rIdx].notes || [];
                                      next[rIdx] = {
                                        ...next[rIdx],
                                        notes: [...curNotes, { date: "", description: "" }],
                                      };
                                      setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                    }}
                                    className="text-[10px] font-bold text-primary hover:underline"
                                  >
                                    + Tambah Promo
                                  </button>
                                </div>

                                <div className="space-y-1.5">
                                  {(roster.notes || []).map((note, nIdx) => (
                                    <div key={nIdx} className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={note.date}
                                        placeholder="Tgl (cth: 10 Okt)"
                                        onChange={(e) => {
                                          const next = [...(formDataMcn.calendarRosters || [])];
                                          const curNotes = [...(next[rIdx].notes || [])];
                                          curNotes[nIdx] = { ...curNotes[nIdx], date: e.target.value };
                                          next[rIdx] = { ...next[rIdx], notes: curNotes };
                                          setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                        }}
                                        className="w-28 px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded text-[11px]"
                                      />
                                      <input
                                        type="text"
                                        value={note.description}
                                        placeholder="Keterangan Promo"
                                        onChange={(e) => {
                                          const next = [...(formDataMcn.calendarRosters || [])];
                                          const curNotes = [...(next[rIdx].notes || [])];
                                          curNotes[nIdx] = {
                                            ...curNotes[nIdx],
                                            description: e.target.value,
                                          };
                                          next[rIdx] = { ...next[rIdx], notes: curNotes };
                                          setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                        }}
                                        className="flex-1 px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded text-[11px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = [...(formDataMcn.calendarRosters || [])];
                                          const curNotes = (next[rIdx].notes || []).filter(
                                            (_, i) => i !== nIdx,
                                          );
                                          next[rIdx] = { ...next[rIdx], notes: curNotes };
                                          setFormDataMcn((p) => ({ ...p, calendarRosters: next }));
                                        }}
                                        className="text-rose-500 hover:text-rose-700 p-1"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const cur = formDataMcn.calendarRosters || [];
                              const newIndex = cur.length + 1;
                              const colors: Array<"blue" | "pink" | "purple" | "emerald"> = [
                                "blue",
                                "pink",
                                "purple",
                                "emerald",
                              ];
                              const color = colors[cur.length % colors.length];
                              const creator =
                                formDataMcn.deliverables.creators[cur.length]?.name ||
                                `Creator ${newIndex}`;

                              setFormDataMcn((p) => ({
                                ...p,
                                calendarRosters: [
                                  ...cur,
                                  {
                                    creatorName: creator,
                                    targetInfo: `${creator} - TnT (10x Sesi)`,
                                    monthName: "OKTOBER",
                                    themeColor: color,
                                    slots: {
                                      prev_30: "1 sesi exc tavi",
                                      "6": "1 sesi mix tavi & IP",
                                      "10": "1 sesi mix tavi & IP",
                                    },
                                    notes: [
                                      { date: "10 Okt", description: "Promo 10.10" },
                                      { date: "25 Okt", description: "Promo Payday" },
                                    ],
                                  },
                                ],
                              }));
                            }}
                            className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            <Plus size={13} />
                            <span>Tambah Kalender Creator</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const creators = formDataMcn.deliverables.creators;
                              const colors: Array<"blue" | "pink" | "purple" | "emerald"> = [
                                "blue",
                                "pink",
                                "purple",
                                "emerald",
                              ];
                              const synced = creators.map((c, i) => {
                                const existing = (formDataMcn.calendarRosters || []).find(
                                  (r) => r.creatorName.toLowerCase() === c.name.toLowerCase(),
                                );
                                if (existing) return existing;
                                return {
                                  creatorName: c.name || `Creator ${i + 1}`,
                                  targetInfo: `${c.name || `Creator ${i + 1}`} - TnT (${c.sessions}x Sesi)`,
                                  monthName: "OKTOBER",
                                  themeColor: colors[i % colors.length],
                                  slots: {
                                    prev_30: "1 sesi exc tavi",
                                    "6": "1 sesi mix tavi & IP",
                                  },
                                  notes: [
                                    { date: "10 Okt", description: "Promo 10.10" },
                                    { date: "25 Okt", description: "Promo Payday" },
                                  ],
                                };
                              });
                              setFormDataMcn((p) => ({ ...p, calendarRosters: synced }));
                              toast.success(`Berhasil menyinkronkan ${synced.length} kalender creator!`);
                            }}
                            className="px-3 py-1.5 text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-xl transition-all flex items-center gap-1.5"
                          >
                            <RotateCcw size={13} />
                            <span>Sinkronkan dari Tab Deliverables</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setFormDataMcn((p) => ({
                              ...p,
                              calendarRosters: DEFAULT_PKS_MCN_DATA.calendarRosters,
                            }));
                          }}
                          className="text-[11px] text-slate-500 hover:text-primary underline block pt-1"
                        >
                          ↻ Reset ke Template Kalender Asli TAVI x TNT
                        </button>
                      </div>
                    ) : (
                      /* ── TABEL DAFTAR SESI VIEW ── */
                      <div className="space-y-2">
                        {formDataMcn.schedule.map((row, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2"
                          >
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span>Sesi #{row.sessionNo || idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = formDataMcn.schedule.filter((_, i) => i !== idx);
                                  setFormDataMcn((p) => ({ ...p, schedule: next }));
                                }}
                                className="text-rose-500 hover:text-rose-700"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <input
                                type="text"
                                placeholder="Tanggal (cth: 06 Oktober 2026)"
                                value={row.date}
                                onChange={(e) => {
                                  const next = [...formDataMcn.schedule];
                                  next[idx] = { ...next[idx], date: e.target.value };
                                  setFormDataMcn((p) => ({ ...p, schedule: next }));
                                }}
                                className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded"
                              />
                              <input
                                type="text"
                                placeholder="Jam (cth: 19:00 - 21:00 WIB)"
                                value={row.time}
                                onChange={(e) => {
                                  const next = [...formDataMcn.schedule];
                                  next[idx] = { ...next[idx], time: e.target.value };
                                  setFormDataMcn((p) => ({ ...p, schedule: next }));
                                }}
                                className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border rounded"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setFormDataMcn((p) => ({
                              ...p,
                              schedule: [
                                ...p.schedule,
                                {
                                  sessionNo: p.schedule.length + 1,
                                  date: "",
                                  time: "19:00 - 21:00 WIB",
                                  creator: p.deliverables.creators[0]?.name ?? "",
                                  notes: "Live Session",
                                },
                              ],
                            }))
                          }
                          className="text-xs font-bold text-primary flex items-center gap-1 hover:underline pt-1"
                        >
                          <Plus size={13} />
                          Tambah Baris Jadwal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: LIVE PREVIEW & INTERACTION (56%) ─────────── */}
        <div className="flex-1 bg-slate-200 dark:bg-slate-950 flex flex-col h-[calc(100vh-61px)] overflow-hidden">
          {/* Preview Toolbar */}
          <div className="no-print bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Pratinjau Lembar A4 (Auto-Flow · Tanpa Blank Space)
              </span>
              <span className="text-[11px] text-slate-400">· Skala: {Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"
                title="Perkecil"
              >
                <ZoomOut size={15} />
              </button>
              <button
                onClick={() => setZoom(0.85)}
                className="px-2 py-1 text-[11px] font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"
              >
                Fit
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400"
                title="Perbesar"
              >
                <ZoomIn size={15} />
              </button>
            </div>
          </div>

          {/* Document Render Canvas */}
          <div className="flex-1 overflow-y-auto p-8 flex justify-center pks-document-container">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease-out",
              }}
            >
              {templateType === "PKS_KLIEN_TNT" ? (
                <PksTntDocument data={formDataTnt} />
              ) : (
                <PksMcnDocument data={formDataMcn} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UniversalContractGenerator(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Menyiapkan Generator Dokumen...
          </p>
        </div>
      }
    >
      <UniversalContractGeneratorInner {...props} />
    </Suspense>
  );
}
