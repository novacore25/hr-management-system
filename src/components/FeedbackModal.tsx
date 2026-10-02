"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiMutation } from "@/hooks/useApi";
import { Bug } from "lucide-react";

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<"bug" | "feature" | "other">("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const createFeedback = useApiMutation<
    { type: string; message: string },
    unknown
  >("/api/feedbacks", "POST");

  /**
   * formerly: `supabase.from("feedbacks").insert({ user_id, user_name,
   * department, role, type, message, status })` dari browser.
   *
   * `user_name`, `department`, `role`, dan `type` tidak pernah ada di
   * schema — kolomnya baru dibuat di migrasi 0012. Insert selalu gagal.
   * Tidak terlihat, karena stub `createClient()` membalas `error: null`,
   * jadi modal menampilkan "Laporan berhasil dikirim!" lalu menutup.
   * Tidak ada satu pun laporan yang pernah tersimpan sejak migrasi.
   *
   * sekarang: POST /api/feedbacks. Nama/divisi/role diambil server dari
   * baris `users`, dan error benar-benar sampai ke user kalau gagal.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    setError("");

    const res = await createFeedback.mutate({ type, message: message.trim() });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "Gagal mengirim laporan. Coba lagi.");
      return;
    }

    setSuccess(true);
    setMessage("");
    setTimeout(() => {
      setSuccess(false);
      onClose();
    }, 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-rose-500" />
            Laporkan Bug / Fitur
          </DialogTitle>
          <DialogDescription>
            Bantu kami memperbaiki sistem dengan melaporkan masalah atau usulan fitur.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-green-600">Laporan berhasil dikirim!</p>
            <p className="text-xs text-muted-foreground">Terima kasih atas masukan Anda.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tipe Laporan</label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug / Error</SelectItem>
                  <SelectItem value="feature">Usulan Fitur Baru</SelectItem>
                  <SelectItem value="other">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deskripsi</label>
              <Textarea
                placeholder="Jelaskan bug yang ditemukan atau fitur yang diinginkan..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="resize-none"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Batal
              </Button>
              <Button type="submit" disabled={submitting || !message.trim()}>
                {submitting ? "Mengirim..." : "Kirim Laporan"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
