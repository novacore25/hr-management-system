"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { toast } from "sonner";
import {
  User,
  Save,
  Calendar,
  MapPin,
  Phone,
  Hash,
  AlertTriangle,
  CreditCard,
  Landmark,
} from "lucide-react";

/** Bentuk profil yang dikirim /api/me/profile. */
interface ProfileData {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  nik: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  gender: string | null;
  religion: string | null;
  maritalStatus: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  npwp: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
}

/** Field yang boleh dikirim balik. `id` dan `email` readonly. */
type EditableKey = Exclude<keyof ProfileData, "id" | "email">;

const EMPTY: ProfileData = {
  id: "",
  name: "",
  email: "",
  photoUrl: null,
  nik: null,
  birthPlace: null,
  birthDate: null,
  address: null,
  city: null,
  province: null,
  postalCode: null,
  phone: null,
  gender: null,
  religion: null,
  maritalStatus: null,
  emergencyName: null,
  emergencyPhone: null,
  npwp: null,
  bankName: null,
  bankAccountNumber: null,
  bankAccountName: null,
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  const buildPath = useCallback(() => "/api/me/profile", []);
  const { data, isLoading, error, refetch } = useApiQuery<{
    profile: ProfileData;
  }>(buildPath, [], 60_000);

  const saveProfile = useApiMutation<Record<string, unknown>, unknown>(
    "/api/me/profile",
    "PATCH",
  );

  useEffect(() => {
    if (data?.profile) setProfile({ ...EMPTY, ...data.profile });
  }, [data]);

  function handleChange(field: EditableKey, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    const tid = toast.loading("Menyimpan profil...");

    // Kirim hanya field yang boleh diubah user untuk dirinya sendiri.
    const payload: Record<string, unknown> = {
      nik: profile.nik,
      birthPlace: profile.birthPlace,
      birthDate: profile.birthDate,
      address: profile.address,
      city: profile.city,
      province: profile.province,
      postalCode: profile.postalCode,
      phone: profile.phone,
      gender: profile.gender,
      religion: profile.religion,
      maritalStatus: profile.maritalStatus,
      emergencyName: profile.emergencyName,
      emergencyPhone: profile.emergencyPhone,
      npwp: profile.npwp,
      bankName: profile.bankName,
      bankAccountNumber: profile.bankAccountNumber,
      bankAccountName: profile.bankAccountName,
    };

    const res = await saveProfile.mutate(payload);

    if (res.ok) {
      toast.success("Profil berhasil diperbarui!", { id: tid });
      void refetch();
    } else {
      toast.error(res.error ?? "Gagal menyimpan profil.", { id: tid });
    }

    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="p-8 pb-32 max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-[var(--ab-bg-surface)] rounded-2xl"></div>
        <div className="h-64 bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 pb-32 max-w-4xl mx-auto">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      </div>
    );
  }

  const labelCls =
    "text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1 flex items-center gap-1.5";
  const inputCls = "ab-input w-full text-sm font-semibold p-3";
  const selectCls =
    "ab-input w-full text-sm font-semibold p-3 appearance-none bg-white dark:bg-slate-900";

  return (
    <div className="p-4 md:p-8 pb-32 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--ab-bg-surface)] p-6 rounded-3xl border border-[var(--ab-border)] shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-[var(--ab-primary)] flex items-center justify-center text-white text-2xl font-black shadow-inner overflow-hidden shrink-0">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={profile.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              profile.name.substring(0, 1).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-2xl font-black text-[var(--ab-text-main)] tracking-tight">
              {profile.name}
            </h1>
            <p className="text-[11px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
              {profile.email}
            </p>
          </div>
        </div>
      </div>

      {/* Data Pribadi */}
      <div className="bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[var(--ab-border)] bg-[var(--ab-bg-main)]">
          <h2 className="text-sm font-black text-[var(--ab-text-main)] uppercase tracking-widest flex items-center gap-2">
            <User size={16} className="text-[var(--ab-primary)]" /> Data Pribadi
          </h2>
          <p className="text-[10px] text-[var(--ab-text-dim)] font-bold uppercase tracking-widest mt-1">
            Mohon lengkapi data pribadi Anda
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelCls}>
              <Hash size={12} /> NIK KTP
            </label>
            <input
              type="text"
              value={profile.nik ?? ""}
              onChange={(e) => handleChange("nik", e.target.value)}
              className={inputCls}
              placeholder="Contoh: 3201..."
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>
              <Calendar size={12} /> Tempat Lahir
            </label>
            <input
              type="text"
              value={profile.birthPlace ?? ""}
              onChange={(e) => handleChange("birthPlace", e.target.value)}
              className={inputCls}
              placeholder="Jakarta"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>
              <Calendar size={12} /> Tanggal Lahir
            </label>
            <input
              type="date"
              value={profile.birthDate ?? ""}
              onChange={(e) => handleChange("birthDate", e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>
              <Phone size={12} /> No. WhatsApp Aktif
            </label>
            <input
              type="text"
              value={profile.phone ?? ""}
              onChange={(e) => handleChange("phone", e.target.value)}
              className={inputCls}
              placeholder="08123456789"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>
              <User size={12} /> Agama
            </label>
            <select
              value={profile.religion ?? ""}
              onChange={(e) => handleChange("religion", e.target.value)}
              className={selectCls}
            >
              <option value="">Pilih Agama</option>
              {[
                "Islam",
                "Kristen",
                "Katolik",
                "Hindu",
                "Buddha",
                "Konghucu",
                "Lainnya",
              ].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>
              <User size={12} /> Status Kawin
            </label>
            <select
              value={profile.maritalStatus ?? ""}
              onChange={(e) => handleChange("maritalStatus", e.target.value)}
              className={selectCls}
            >
              <option value="">Pilih Status</option>
              {["Belum Menikah", "Menikah", "Cerai Hidup", "Cerai Mati"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={`${labelCls} text-rose-500`}>
              <AlertTriangle size={12} /> Nama Kontak Darurat
            </label>
            <input
              type="text"
              value={profile.emergencyName ?? ""}
              onChange={(e) => handleChange("emergencyName", e.target.value)}
              className={inputCls}
              placeholder="Nama Lengkap"
            />
          </div>

          <div className="space-y-1.5">
            <label className={`${labelCls} text-rose-500`}>
              <Phone size={12} /> No. Kontak Darurat
            </label>
            <input
              type="text"
              value={profile.emergencyPhone ?? ""}
              onChange={(e) => handleChange("emergencyPhone", e.target.value)}
              className={inputCls}
              placeholder="08123456789"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className={labelCls}>
              <MapPin size={12} /> Alamat KTP
            </label>
            <textarea
              value={profile.address ?? ""}
              onChange={(e) => handleChange("address", e.target.value)}
              className={`${inputCls} h-24 resize-none`}
              placeholder="Alamat lengkap sesuai KTP..."
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Kota</label>
            <input
              type="text"
              value={profile.city ?? ""}
              onChange={(e) => handleChange("city", e.target.value)}
              className={inputCls}
              placeholder="Jakarta Selatan"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Provinsi</label>
            <input
              type="text"
              value={profile.province ?? ""}
              onChange={(e) => handleChange("province", e.target.value)}
              className={inputCls}
              placeholder="DKI Jakarta"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Kode Pos</label>
            <input
              type="text"
              value={profile.postalCode ?? ""}
              onChange={(e) => handleChange("postalCode", e.target.value)}
              className={inputCls}
              placeholder="12345"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>
              <CreditCard size={12} /> NPWP (Opsional)
            </label>
            <input
              type="text"
              value={profile.npwp ?? ""}
              onChange={(e) => handleChange("npwp", e.target.value)}
              className={inputCls}
              placeholder="12.345.678.9-123.000"
            />
          </div>
        </div>

        <div className="p-4 bg-[var(--ab-bg-main)] border-t border-[var(--ab-border)] flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--ab-primary)] text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_4px_12px_-3px_var(--ab-primary-glow)]"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Simpan Perubahan
          </button>
        </div>
      </div>

      {/* Data Rekening — dipakai modul payroll */}
      <div className="bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[var(--ab-border)] bg-[var(--ab-bg-main)]">
          <h2 className="text-sm font-black text-[var(--ab-text-main)] uppercase tracking-widest flex items-center gap-2">
            <Landmark size={16} className="text-[var(--ab-primary)]" /> Data Rekening
          </h2>
          <p className="text-[10px] text-[var(--ab-text-dim)] font-bold uppercase tracking-widest mt-1">
            Dipakai untuk transfer gaji
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className={labelCls}>Nama Bank</label>
            <input
              type="text"
              value={profile.bankName ?? ""}
              onChange={(e) => handleChange("bankName", e.target.value)}
              className={inputCls}
              placeholder="BCA / BRI / Mandiri"
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Nama Pemilik Rekening</label>
            <input
              type="text"
              value={profile.bankAccountName ?? ""}
              onChange={(e) => handleChange("bankAccountName", e.target.value)}
              className={inputCls}
              placeholder="Sesuai rekening"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className={labelCls}>Nomor Rekening</label>
            <input
              type="text"
              value={profile.bankAccountNumber ?? ""}
              onChange={(e) => handleChange("bankAccountNumber", e.target.value)}
              className={inputCls}
              placeholder="1234567890"
            />
          </div>
        </div>

        <div className="p-4 bg-[var(--ab-bg-main)] border-t border-[var(--ab-border)] flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--ab-primary)] text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_4px_12px_-3px_var(--ab-primary-glow)]"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Simpan Rekening
          </button>
        </div>
      </div>
    </div>
  );
}