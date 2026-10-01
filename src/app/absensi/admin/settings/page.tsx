"use client";

import { useState, useEffect, useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { toast } from "sonner";
import { Clock, Settings, MapPin, CalendarDays, Plus, Trash2, Map, Pencil, X, Check } from "lucide-react";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";

interface WorkSettings {
  workStart: string; workEnd: string; maxLate: string;
  maxTimeSick: string; maxTimeLeave: string; maxTimeWfa: string;
  officeLat: number; officeLng: number; officeRadius: number;
}

interface Holiday { id: string; date: string; description: string }
interface Office { id: string; name: string; lat: number; lng: number; radius: number; departmentIds: string[] }
interface OfficeLocation { id: string; name: string; lat: number; lng: number; radius: number; deptIds: string[] }

const DEFAULT_SETTINGS: WorkSettings = {
  workStart: "08:00", workEnd: "18:00", maxLate: "08:15",
  maxTimeSick: "12:00", maxTimeLeave: "23:59", maxTimeWfa: "12:00",
  officeLat: -6.241586, officeLng: 106.628055, officeRadius: 100,
};

/** Ubah bentuk respons server (departmentIds) ke bentuk lokal (deptIds). */
function toLocalOffices(offices: Office[]): OfficeLocation[] {
  return offices.map((o) => ({
    id: o.id,
    name: o.name,
    lat: o.lat,
    lng: o.lng,
    radius: o.radius,
    deptIds: o.departmentIds,
  }));
}
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<WorkSettings>(DEFAULT_SETTINGS);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [newHol, setNewHol] = useState({ date: "", description: "" });
  const [newDept, setNewDept] = useState("");
  const [confirmCfg, setConfirmCfg] = useState<{ title: string; message: string; type: "danger" | "warning"; onConfirm: () => void } | null>(null);

  const [newOffice, setNewOffice] = useState({ name: "", lat: "", lng: "", radius: "100" });
  const [editingOfficeId, setEditingOfficeId] = useState<string | null>(null);
  const [editOfficeData, setEditOfficeData] = useState({ name: "", lat: "", lng: "", radius: "100" });

  // formerly: 5 query Supabase paralel (absensi_settings, holidays,
  // departments, office_locations, department_locations) dari browser.
  // sekarang: pengaturan + libur dari 1 endpoint, kantor dari 1 endpoint,
  // divisi dari /api/departments.
  const buildMain = useCallback(
    () => withQuery("/api/absensi/settings", { include: "holidays" }),
    [],
  );
  const {
    data: mainData,
    isLoading: mainLoading,
    refetch: refetchMain,
  } = useApiQuery<{ settings: WorkSettings; holidays: Holiday[] }>(
    buildMain,
    [],
    60_000,
  );

  const buildOffices = useCallback(
    () => withQuery("/api/absensi/settings", { include: "offices" }),
    [],
  );
  const {
    data: officeData,
    isLoading: officeLoading,
    refetch: refetchOffices,
  } = useApiQuery<{ offices: Office[] }>(buildOffices, [], 60_000);

  const buildDepts = useCallback(() => "/api/departments", []);
  const {
    data: deptData,
    refetch: refetchDepts,
  } = useApiQuery<{ departments: { id: string; name: string }[] }>(
    buildDepts,
    [],
    60_000,
  );

  const settingsMutate = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
  );
  const patchSettings = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
    "PATCH",
  );
  const postSettings = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
    "POST",
  );
  const putSettings = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
    "PUT",
  );
  const deptMutate = useApiMutation<Record<string, unknown>, unknown>(
    "/api/departments",
    "POST",
  );
  const deptPatch = useApiMutation<Record<string, unknown>, unknown>(
    "/api/departments",
    "PATCH",
  );
  const deptDelete = useApiMutation<Record<string, unknown>, unknown>(
    "/api/departments",
    "DELETE",
  );

  useEffect(() => {
    if (mainData?.settings) {
      setSettings({ ...DEFAULT_SETTINGS, ...mainData.settings });
    }
    if (mainData?.holidays) setHolidays(mainData.holidays);
  }, [mainData]);

  useEffect(() => {
    if (officeData?.offices) setOfficeLocations(toLocalOffices(officeData.offices));
  }, [officeData]);

  useEffect(() => {
    if (deptData?.departments) setDepartments(deptData.departments);
  }, [deptData]);

  useEffect(() => {
    if (!mainLoading && !officeLoading) setIsLoading(false);
  }, [mainLoading, officeLoading]);

  const saveSettings = async () => {
    const tid = toast.loading("Menyimpan pengaturan...");
    const res = await patchSettings.mutate({
      workStart: settings.workStart,
      workEnd: settings.workEnd,
      maxLate: settings.maxLate,
      maxTimeSick: settings.maxTimeSick,
      maxTimeLeave: settings.maxTimeLeave,
      maxTimeWfa: settings.maxTimeWfa,
    });
    if (res.ok) {
      toast.success("Pengaturan berhasil disimpan.", { id: tid });
      void refetchMain();
    } else {
      toast.error(res.error, { id: tid });
    }
  };

  const saveOffice = async () => {
    if (isNaN(settings.officeLat) || settings.officeLat < -90 || settings.officeLat > 90) return toast.error("Latitude harus antara -90 dan 90.");
    if (isNaN(settings.officeLng) || settings.officeLng < -180 || settings.officeLng > 180) return toast.error("Longitude harus antara -180 dan 180.");
    if (settings.officeRadius < 50) return toast.error("Radius minimal 50 meter.");

    const tid = toast.loading("Memperbarui lokasi...");
    const res = await patchSettings.mutate({
      officeLat: settings.officeLat,
      officeLng: settings.officeLng,
      officeRadius: settings.officeRadius,
    });
    if (res.ok) {
      toast.success("Konfigurasi lokasi berhasil diperbarui.", { id: tid });
      void refetchMain();
    } else {
      toast.error(res.error, { id: tid });
    }
  };

  const addHoliday = async () => {
    if (!newHol.date || !newHol.description.trim()) return toast.error("Isi tanggal dan keterangan.");
    if (holidays.some((h) => h.date === newHol.date)) return toast.error("Tanggal libur ini sudah ada!");

    const tid = toast.loading("Menambah hari libur...");
    const res = await postSettings.mutate({
      kind: "holiday",
      date: newHol.date,
      description: newHol.description.trim(),
    });
    if (res.ok) {
      setNewHol({ date: "", description: "" });
      toast.success("Hari libur ditambahkan.", { id: tid });
      void refetchMain();
    } else {
      toast.error(res.error, { id: tid });
    }
  };

  const deleteHoliday = (id: string, date: string) => {
    setConfirmCfg({
      title: "Hapus Hari Libur",
      message: `Yakin hapus tanggal libur ${date}?`,
      type: "danger",
      onConfirm: async () => {
        const tid = toast.loading("Menghapus...");
        const res = await settingsMutate.mutate(undefined, {
          kind: "holiday",
          id,
        });
        if (res.ok) {
          toast.success("Berhasil dihapus.", { id: tid });
          void refetchMain();
        } else {
          toast.error(res.error, { id: tid });
        }
        setConfirmCfg(null);
      },
    });
  };

  const addDepartment = async () => {
    if (!newDept.trim()) return;
    const tid = toast.loading("Menambah departemen...");
    const res = await deptMutate.mutate({ name: newDept.trim() });
    if (res.ok) {
      setNewDept("");
      toast.success("Departemen ditambahkan.", { id: tid });
      void refetchDepts();
    } else {
      toast.error(res.error, { id: tid });
    }
  };

  const deleteDepartment = (id: string, name: string) => {
    setConfirmCfg({
      title: "Hapus Departemen",
      message: `Yakin hapus departemen "${name}"?`,
      type: "danger",
      onConfirm: async () => {
        const tid = toast.loading("Menghapus...");
        const res = await deptDelete.mutate(undefined, { id });
        if (res.ok) {
          setDepartments((prev) => prev.filter((d) => d.id !== id));
          setOfficeLocations((prev) =>
            prev.map((o) => ({
              ...o,
              deptIds: o.deptIds.filter((did) => did !== id),
            })),
          );
          toast.success("Berhasil dihapus.", { id: tid });
        } else {
          toast.error(res.error, { id: tid });
        }
        setConfirmCfg(null);
      },
    });
  };

  const addOfficeLocation = async () => {
    if (!newOffice.name.trim() || !newOffice.lat || !newOffice.lng || !newOffice.radius)
      return toast.error("Isi semua data kantor.");

    const tid = toast.loading("Menambah lokasi kantor...");
    const res = await postSettings.mutate({
      kind: "office",
      name: newOffice.name.trim(),
      lat: parseFloat(newOffice.lat),
      lng: parseFloat(newOffice.lng),
      radius: parseInt(newOffice.radius),
    });
    if (res.ok) {
      setNewOffice({ name: "", lat: "", lng: "", radius: "100" });
      toast.success("Lokasi ditambahkan.", { id: tid });
      void refetchOffices();
    } else {
      toast.error(res.error, { id: tid });
    }
  };

  const saveEditOfficeLocation = async (id: string) => {
    if (!editOfficeData.name.trim() || !editOfficeData.lat || !editOfficeData.lng || !editOfficeData.radius)
      return toast.error("Isi semua data kantor.");

    const tid = toast.loading("Menyimpan perubahan...");
    const res = await patchSettings.mutate({
      kind: "office",
      id,
      name: editOfficeData.name.trim(),
      lat: parseFloat(editOfficeData.lat),
      lng: parseFloat(editOfficeData.lng),
      radius: parseInt(editOfficeData.radius),
    });
    if (res.ok) {
      setEditingOfficeId(null);
      toast.success("Perubahan disimpan.", { id: tid });
      void refetchOffices();
    } else {
      toast.error(res.error, { id: tid });
    }
  };

  const deleteOfficeLocation = (id: string, name: string) => {
    setConfirmCfg({
      title: "Hapus Kantor Cabang",
      message: `Yakin hapus lokasi "${name}"?`,
      type: "danger",
      onConfirm: async () => {
        const tid = toast.loading("Menghapus...");
        const res = await settingsMutate.mutate(undefined, {
          kind: "office",
          id,
        });
        if (res.ok) {
          toast.success("Berhasil dihapus.", { id: tid });
          void refetchOffices();
        } else {
          toast.error(res.error, { id: tid });
        }
        setConfirmCfg(null);
      },
    });
  };

  const toggleDeptOffice = async (officeId: string, deptId: string, checked: boolean) => {
    const res = await putSettings.mutate({
      officeId,
      departmentId: deptId,
      link: checked,
    });
    if (res.ok) {
      const list = (res.data as { offices?: Office[] } | undefined)?.offices;
      if (list) setOfficeLocations(toLocalOffices(list));
      else void refetchOffices();
    } else {
      toast.error("Gagal mengupdate relasi.");
    }
  };
  if (isLoading) return <div className="space-y-8 pb-24 animate-pulse"></div>;

  const inputCls = "w-full ab-input text-sm font-bold";
  const sectionCls = "ab-card-tactile space-y-6";
  const labelCls = "block text-[10px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1.5";

  return (
    <div className="space-y-8 pb-24">
      <h1 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">Pengaturan Global Sistem</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Jam Kerja */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#d1fae520", color: "#059669", border: "1px solid #a7f3d0" }}>
              <Clock size={16} />
            </div>
            <h3 className="font-black text-[var(--ab-text-main)] uppercase tracking-wider text-sm">Jam Operasional</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Mulai Kerja</label><input type="time" value={settings.workStart} onChange={(e) => setSettings({ ...settings, workStart: e.target.value })} className={inputCls} /></div>
            <div><label className={labelCls}>Akhir Kerja</label><input type="time" value={settings.workEnd} onChange={(e) => setSettings({ ...settings, workEnd: e.target.value })} className={inputCls} /></div>
            <div className="col-span-2"><label className={labelCls}>Batas Toleransi Telat</label><input type="time" value={settings.maxLate} onChange={(e) => setSettings({ ...settings, maxLate: e.target.value })} className={`${inputCls} text-red-500`} /></div>
          </div>
          <button onClick={saveSettings} className="ab-nm-button ab-btn-primary w-full py-3 text-xs font-black uppercase tracking-widest">Simpan Pengaturan</button>
        </div>

        {/* Batas Waktu Pengajuan */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ede9fe20", color: "#7c3aed", border: "1px solid #c4b5fd" }}><Settings size={16} /></div>
            <h3 className="font-black text-[var(--ab-text-main)] uppercase tracking-wider text-sm">Batas Jam Pengajuan</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[ { label: "Cuti", key: "maxTimeLeave" as const }, { label: "Sakit", key: "maxTimeSick" as const }, { label: "WFA", key: "maxTimeWfa" as const } ].map(({ label, key }) => (
              <div key={key}><label className={`${labelCls} text-center`}>{label}</label><input type="time" value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className={`${inputCls} text-center`} /></div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--ab-text-dim)] italic text-center">Staf tidak bisa mengajukan di hari H jika melewati jam di atas.</p>
          <button onClick={saveSettings} className="ab-nm-button w-full py-3 text-xs font-black uppercase tracking-widest border border-[var(--ab-border)] text-[var(--ab-text-main)]">Update Aturan Waktu</button>
        </div>

        {/* KANTOR CABANG */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#e0f2fe20", color: "#0ea5e9", border: "1px solid #bae6fd" }}><Map size={16} /></div>
            <h3 className="font-black text-[var(--ab-text-main)] uppercase tracking-wider text-sm">Lokasi Cabang</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-2 bg-[var(--ab-bg-surface)] p-3 rounded-xl border border-[var(--ab-border)]">
            <div className="col-span-2"><input type="text" placeholder="Nama Kantor (misal: Cabang A)" value={newOffice.name} onChange={e => setNewOffice({...newOffice, name: e.target.value})} className="ab-input w-full text-xs" /></div>
            <div><input type="number" step="any" placeholder="Lat" value={newOffice.lat} onChange={e => setNewOffice({...newOffice, lat: e.target.value})} className="ab-input w-full text-xs" /></div>
            <div><input type="number" step="any" placeholder="Lng" value={newOffice.lng} onChange={e => setNewOffice({...newOffice, lng: e.target.value})} className="ab-input w-full text-xs" /></div>
            <div className="col-span-2 flex gap-2">
              <input type="number" placeholder="Radius (m)" value={newOffice.radius} onChange={e => setNewOffice({...newOffice, radius: e.target.value})} className="ab-input w-24 text-xs" />
              <button onClick={addOfficeLocation} className="ab-nm-button ab-btn-primary flex-1 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><Plus size={14} /> Tambah Cabang</button>
            </div>
          </div>

          <div className="space-y-4 max-h-[300px] overflow-y-auto ab-scrollbar pr-1">
            {officeLocations.map((o) => (
              <div key={o.id} className="bg-[var(--ab-bg-main)] border border-[var(--ab-border)] p-3 rounded-xl flex flex-col gap-3">
                {editingOfficeId === o.id ? (
                  <div className="space-y-2">
                    <input type="text" value={editOfficeData.name} onChange={e => setEditOfficeData({...editOfficeData, name: e.target.value})} className="ab-input w-full text-xs font-bold" />
                    <div className="flex gap-2">
                      <input type="number" step="any" placeholder="Lat" value={editOfficeData.lat} onChange={e => setEditOfficeData({...editOfficeData, lat: e.target.value})} className="ab-input w-full text-xs" />
                      <input type="number" step="any" placeholder="Lng" value={editOfficeData.lng} onChange={e => setEditOfficeData({...editOfficeData, lng: e.target.value})} className="ab-input w-full text-xs" />
                      <input type="number" placeholder="Radius" value={editOfficeData.radius} onChange={e => setEditOfficeData({...editOfficeData, radius: e.target.value})} className="ab-input w-24 text-xs" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => saveEditOfficeLocation(o.id)} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest py-1.5 transition flex items-center justify-center gap-1"><Check size={12}/> Simpan</button>
                      <button onClick={() => setEditingOfficeId(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[10px] font-black uppercase tracking-widest py-1.5 transition flex items-center justify-center gap-1"><X size={12}/> Batal</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-black text-xs text-[var(--ab-text-main)] uppercase">{o.name}</div>
                      <div className="text-[10px] text-[var(--ab-text-dim)] flex items-center gap-1">
                        <a href={`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-blue-600 transition">
                          {o.lat}, {o.lng}
                        </a>
                        <span>&bull; R: {o.radius}m</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-[var(--ab-bg-surface)] p-1 rounded-lg border border-[var(--ab-border)]">
                      <button onClick={() => { setEditingOfficeId(o.id); setEditOfficeData({ name: o.name, lat: String(o.lat), lng: String(o.lng), radius: String(o.radius) }); }} className="text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 p-1.5 rounded transition"><Pencil size={12}/></button>
                      <button onClick={() => deleteOfficeLocation(o.id, o.name)} className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 p-1.5 rounded transition"><Trash2 size={12}/></button>
                    </div>
                  </div>
                )}

                {/* Departemen yang bisa absen di kantor ini */}
                <div className="pt-2 border-t border-[var(--ab-border)]">
                  <p className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] mb-1.5 tracking-widest">Divisi yang Absen di Sini:</p>
                  <div className="flex flex-wrap gap-2">
                    {departments.length === 0 ? (
                      <span className="text-[10px] italic text-[var(--ab-text-dim)]">Belum ada divisi.</span>
                    ) : departments.map(d => {
                      const isChecked = o.deptIds.includes(d.id);
                      return (
                        <label key={d.id} className="flex items-center gap-1.5 cursor-pointer bg-[var(--ab-bg-surface)] px-2 py-1 rounded-md text-[10px] font-bold border border-transparent hover:border-[var(--ab-border)] transition">
                          <input type="checkbox" checked={isChecked} onChange={e => toggleDeptOffice(o.id, d.id, e.target.checked)} className="accent-[var(--ab-primary)] rounded" />
                          <span className={isChecked ? "text-[var(--ab-text-main)]" : "text-[var(--ab-text-dim)]"}>{d.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hari Libur */}
        <div className={sectionCls}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ffedd520", color: "#ea580c", border: "1px solid #fed7aa" }}><CalendarDays size={16} /></div>
            <h3 className="font-black text-[var(--ab-text-main)] uppercase tracking-wider text-sm">Hari Libur Nasional</h3>
          </div>
          <div className="flex gap-2">
            <input type="date" value={newHol.date} onChange={(e) => setNewHol({ ...newHol, date: e.target.value })} className="ab-input text-xs" />
            <input type="text" placeholder="Keterangan..." value={newHol.description} onChange={(e) => setNewHol({ ...newHol, description: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addHoliday(); }} className="ab-input flex-1 text-xs" />
            <button onClick={addHoliday} className="ab-nm-button w-10 h-10 rounded-xl flex items-center justify-center text-orange-500 border border-orange-200 dark:border-orange-800 hover:bg-orange-500 hover:text-white transition shrink-0"><Plus size={14} /></button>
          </div>
          <div className="overflow-y-auto max-h-[160px] space-y-2 ab-scrollbar pr-1">
            {holidays.length === 0 ? <p className="text-center py-4 text-[10px] text-[var(--ab-text-dim)] uppercase font-black">Belum ada hari libur</p> : holidays.map((h) => (
              <div key={h.id} className="flex justify-between items-center bg-[var(--ab-bg-main)] p-2.5 rounded-xl border border-[var(--ab-border)]">
                <div className="text-[10px]"><span className="font-black text-orange-600 mr-2">{h.date}</span><span className="text-[var(--ab-text-dim)]">{h.description}</span></div>
                <button onClick={() => deleteHoliday(h.id, h.date)} className="text-red-400 hover:text-red-600 transition p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Departemen */}
        <div className={`${sectionCls} lg:col-span-2`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ccfbf120", color: "#0d9488", border: "1px solid #99f6e4" }}><Settings size={16} /></div>
            <h3 className="font-black text-[var(--ab-text-main)] uppercase tracking-wider text-sm">Manajemen Departemen</h3>
          </div>
          <div className="flex gap-2">
            <input type="text" value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addDepartment(); }} placeholder="Nama departemen baru..." className="ab-input flex-1 font-bold" />
            <button onClick={addDepartment} className="ab-nm-button ab-btn-primary px-6 py-3 text-xs font-black uppercase tracking-widest flex items-center gap-2"><Plus size={14} /> Tambah</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {departments.length === 0 ? <p className="text-[10px] text-[var(--ab-text-dim)] uppercase font-black italic">Belum ada departemen</p> : departments.map((d) => (
              <div key={d.id} className="bg-[var(--ab-bg-main)] border border-[var(--ab-border)] pl-4 pr-3 py-2 rounded-xl flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-main)]">
                {d.name}
                <button onClick={() => deleteDepartment(d.id, d.name)} className="text-red-400 hover:text-red-600 transition"><Trash2 size={10} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmCfg && <ConfirmDialog isOpen title={confirmCfg.title} message={confirmCfg.message} type={confirmCfg.type} onConfirm={confirmCfg.onConfirm} onCancel={() => setConfirmCfg(null)} />}
    </div>
  );
}
