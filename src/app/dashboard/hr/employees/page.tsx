"use client";

import { useCallback, useEffect, useState } from "react";
import { useAllUsers } from "@/hooks/useUsers";
import { useDepartmentsWithId } from "@/hooks/useDivisions";
import { useApiMutation, useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { getKpiRole, DEFAULT_KPI_WEIGHTS } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, MessageSquare, SlidersHorizontal } from "lucide-react";
import type { User, KpiRole } from "@/types";

const kpiRoleLabel: Record<KpiRole, string> = {
  executive: "Executive",
  hr: "HR",
  head: "Head",
  tim: "Tim",
  developer: "Developer",
};

const kpiRoleVariant: Record<KpiRole, "default" | "secondary" | "outline"> = {
  executive: "default",
  hr: "default",
  head: "secondary",
  tim: "outline",
  developer: "default",
};

export default function HrEmployeesPage() {
  const { users, isLoading, refetch: refetchUsers } = useAllUsers();

  /**
   * `useDepartments()` mengembalikan NAMA divisi — itu yang jadi bug:
   * `managed_departments` di server dibandingkan dengan ID. Sekarang form
   * memakai id + name, dan yang dikirim ke server adalah ID.
   */
  const { departments, isLoading: departmentsLoading } = useDepartmentsWithId();

  const patchUser = useApiMutation<Record<string, unknown>, unknown>(
    "/api/users",
    "PATCH",
  );
  const putWeights = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpi-settings",
    "PUT",
  );

  // Role edit state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<KpiRole | "">("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [departmentError, setDepartmentError] = useState("");

  // Notes state (feature stubbed — no notes table in schema)
  const [notesUser, setNotesUser] = useState<User | null>(null);

  // Weight settings state
  const [weightUser, setWeightUser] = useState<User | null>(null);
  const [resultW, setResultW] = useState("");
  const [activityW, setActivityW] = useState("");
  const [qualityW, setQualityW] = useState("");
  const [leadTimW, setLeadTimW] = useState("");
  const [hrW, setHrW] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightError, setWeightError] = useState("");



  function openEditRole(u: User) {
    setEditUser(u);
    setSelectedRole(getKpiRole(u));
    setSelectedDepartments(
      getKpiRole(u) === "head" ? (u.managedDepartments ?? []) : [],
    );
    setRoleError("");
    setDepartmentError("");
  }

  function toggleDepartment(departmentId: string) {
    setSelectedDepartments((prev) =>
      prev.includes(departmentId)
        ? prev.filter((d) => d !== departmentId)
        : [...prev, departmentId],
    );
    setDepartmentError("");
  }

  /**
   * formerly: `supabase.from("users").update({ kpi_role, managed_departments })`
   * dari browser dengan `.eq("id", editUser.id)`.
   *
   * Dua masalah:
   *   - Tidak ada cek role di server. Halaman ini hanya menampilkan tombol
   *     untuk HR, tapi URL-nya bisa dibuka siapa saja yang punya sesi.
   *   - `managed_departments` diisi NAMA divisi, sedangkan server
   *     membandingkannya dengan ID. Setelah disimpan, semua halaman Head
   *     kosong tanpa error.
   *
   * sekarang: PATCH /api/users, divisi sebagai ID, divalidasi server.
   */
  async function handleSaveRole() {
    if (!editUser || !selectedRole) return;
    if (selectedRole === "head" && selectedDepartments.length === 0) {
      setRoleError("");
      setDepartmentError("Pilih minimal satu divisi untuk role Head.");
      return;
    }

    setSaving(true);
    setRoleError("");

    const res = await patchUser.mutate({
      id: editUser.id,
      kpiRole: selectedRole,
      managedDepartments: selectedRole === "head" ? selectedDepartments : [],
    });
    setSaving(false);

    if (res.ok) {
      setEditUser(null);
      void refetchUsers();
    } else {
      setRoleError(res.error ?? "Gagal menyimpan. Coba lagi.");
    }
  }

  function openNotes(u: User) {
    setNotesUser(u);
  }

  /**
   * formerly: `kpi_settings.select("*").eq("user_id", u.id)` dari browser.
   * sekarang `GET /api/kpi-settings?userId=` yang sudah mengecek
   * kepemilikan di server.
   */
  const { data: weightData, isLoading: weightLoading } = useApiQuery<{
    weights: {
      result: number;
      activity: number;
      quality: number;
      leadTim: number;
      hr: number;
    };
  }>(
    useCallback(
      () =>
        weightUser
          ? withQuery("/api/kpi-settings", { userId: weightUser.id })
          : null,
      [weightUser?.id],
    ),
    [weightUser?.id],
  );

  function openWeights(u: User) {
    setWeightUser(u);
    setWeightError("");
    setResultW("");
    setActivityW("");
    setQualityW("");
    setLeadTimW("");
    setHrW("");
  }

  // Isi form begitu bobot dari server datang. Nilai default dipakai kalau
  // user belum punya setelan — `getUserWeights` sudah mengembalikan itu.
  useEffect(() => {
    if (!weightUser) return;
    const w = weightData?.weights ?? DEFAULT_KPI_WEIGHTS;
    setResultW(String(w.result));
    setActivityW(String(w.activity));
    setQualityW(String(w.quality));
    setLeadTimW(String(w.leadTim));
    setHrW(String(w.hr));
  }, [weightData, weightUser]);

  /**
   * formerly `kpi_settings.upsert(...)` dari browser dengan validasi hanya
   * di form — bisa dilewati dengan request langsung, jadi bobot bisa
   * tersimpan tidak seimbang dan skor KPI jadi sia-sia.
   *
   * sekarang: PUT /api/kpi-settings, validasi total 100 di server.
   */
  async function handleSaveWeights() {
    if (!weightUser) return;
    const r = parseInt(resultW) || 0;
    const a = parseInt(activityW) || 0;
    const q = parseInt(qualityW) || 0;
    const lh = parseInt(leadTimW) || 0;
    const h = parseInt(hrW) || 0;

    if (r < 0 || a < 0 || q < 0 || lh < 0 || h < 0) {
      setWeightError("Bobot tidak boleh negatif.");
      return;
    }
    if (r + a + q !== 100) {
      setWeightError("Total bobot Performance harus 100%.");
      return;
    }
    if (lh + h !== 100) {
      setWeightError("Total bobot Personality harus 100%.");
      return;
    }

    setWeightSaving(true);
    setWeightError("");

    const res = await putWeights.mutate({
      userId: weightUser.id,
      resultWeight: r,
      activityWeight: a,
      qualityWeight: q,
      leadTimWeight: lh,
      hrWeight: h,
    });
    setWeightSaving(false);

    if (res.ok) {
      setWeightUser(null);
    } else {
      setWeightError(res.error ?? "Gagal menyimpan. Coba lagi.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Karyawan</h2>
        <p className="text-sm text-muted-foreground">
          {users.length} akun aktif
        </p>
      </div>

      <div className="space-y-2">
        {users.map((u) => {
          const role = getKpiRole(u);
          return (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.email}
                  {u.department ? ` · ${u.department}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge variant={kpiRoleVariant[role]}>{kpiRoleLabel[role]}</Badge>
                <button
                  onClick={() => openWeights(u)}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  title="Bobot KPI"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => openNotes(u)}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  title="Catatan"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => openEditRole(u)}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  title="Edit role KPI"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Role KPI</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{editUser.name}</p>
                <p className="text-xs text-muted-foreground">{editUser.email}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Role KPI</p>
                <Select
                  value={selectedRole}
                  onValueChange={(v) => {
                    setSelectedRole(v as KpiRole);
                    if (v !== "head") {
                      setSelectedDepartments([]);
                      setDepartmentError("");
                    } else if (
                      selectedDepartments.length === 0 &&
                      editUser?.departmentId
                    ) {
                      // Prefill dengan divisi user itu sendiri — pakai
                      // **id**, bukan nama. Dulu memakai nama, yang tidak
                      // pernah cocok dengan pembanding di server.
                      setSelectedDepartments([editUser.departmentId]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tim">Tim</SelectItem>
                    <SelectItem value="head">Head</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedRole === "head" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Divisi yang dikelola</p>
                  <div className="grid gap-2 rounded-md border border-input bg-background p-3">
                    {departmentsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Memuat divisi...
                      </div>
                    ) : departments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada data divisi.</p>
                    ) : (
                      departments.map((dept) => (
                        <label
                          key={dept.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDepartments.includes(dept.id)}
                            onChange={() => toggleDepartment(dept.id)}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                          />
                          <span>{dept.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pilih minimal satu divisi untuk Head. Jika tidak dipilih, Head tidak akan memiliki area pengawasan spesifik.
                  </p>
                  {departmentError && <p className="text-sm text-destructive">{departmentError}</p>}
                </div>
              )}

              {roleError && <p className="text-sm text-destructive">{roleError}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditUser(null)}>Batal</Button>
            <Button onClick={handleSaveRole} disabled={saving || !selectedRole}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Weight Settings Dialog */}
      <Dialog open={!!weightUser} onOpenChange={(o) => !o && setWeightUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bobot KPI — {weightUser?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground">Total harus 100%</p>
          </DialogHeader>
          {weightLoading ? (
            <div className="flex h-20 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-4 mt-1">
              <div className="space-y-3">
                <p className="text-xs font-semibold">Grup Performance (70%)</p>
                {(
                  [
                    { label: "Result", value: resultW, set: setResultW },
                    { label: "Activity", value: activityW, set: setActivityW },
                    { label: "Quality", value: qualityW, set: setQualityW },
                  ] as { label: string; value: string; set: (v: string) => void }[]
                ).map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm w-20 shrink-0">{label}</span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={value}
                      onChange={(e) => { set(e.target.value); setWeightError(""); }}
                      className="h-8 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                ))}
                {(() => {
                  const total = (parseInt(resultW) || 0) + (parseInt(activityW) || 0) + (parseInt(qualityW) || 0);
                  return (
                    <div className={`text-xs font-medium ${total === 100 ? "text-green-600" : "text-amber-600"}`}>
                      Sub-Total: {total}%{total === 100 ? " ✓" : " (harus 100%)"}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-3 pt-3 border-t">
                <p className="text-xs font-semibold">Grup Personality (30%)</p>
                {(
                  [
                    { label: "Lead Tim", value: leadTimW, set: setLeadTimW },
                    { label: "HR", value: hrW, set: setHrW },
                  ] as { label: string; value: string; set: (v: string) => void }[]
                ).map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm w-20 shrink-0">{label}</span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={value}
                      onChange={(e) => { set(e.target.value); setWeightError(""); }}
                      className="h-8 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                ))}
                {(() => {
                  const total = (parseInt(leadTimW) || 0) + (parseInt(hrW) || 0);
                  return (
                    <div className={`text-xs font-medium ${total === 100 ? "text-green-600" : "text-amber-600"}`}>
                      Sub-Total: {total}%{total === 100 ? " ✓" : " (harus 100%)"}
                    </div>
                  );
                })()}
              </div>

              {weightError && <p className="text-sm text-destructive">{weightError}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setWeightUser(null)}>Batal</Button>
            <Button onClick={handleSaveWeights} disabled={weightSaving || weightLoading}>
              {weightSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={!!notesUser} onOpenChange={(o) => !o && setNotesUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Catatan — {notesUser?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground">{notesUser?.department ?? "—"}</p>
          </DialogHeader>
          <div className="py-4 text-center text-sm text-muted-foreground">
            Fitur catatan belum tersedia.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
