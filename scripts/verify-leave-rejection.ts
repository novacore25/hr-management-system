import { readFileSync } from "node:fs";

console.log("=== VERIFIKASI FITUR EXPAND ALASAN & ALASAN PENOLAKAN CUTI ===");
let pass = 0;
let fail = 0;

function assert(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.error(`  FAIL  ${name} — ${detail}`);
    fail++;
  }
}

// 1. Verifikasi DAL leave.ts
console.log("\n1. Verifikasi Server DAL (leave.ts)");
const dalLeave = readFileSync("src/server/dal/leave.ts", "utf8");

assert(
  "decideLeaveStage menyimpan executiveNotes pada penolakan tahap executive",
  dalLeave.includes("executiveNotes: notes?.trim() || null"),
  "executiveNotes tidak diset saat reject",
);

assert(
  "decideLeaveStage menyimpan hrNotes pada penolakan tahap HR",
  dalLeave.includes("hrNotes: notes?.trim() || null"),
  "hrNotes tidak diset saat reject",
);

assert(
  "decideLeaveStage menyimpan rejectionReason, rejectedBy, dan rejectedAt",
  dalLeave.includes("rejectionReason: notes?.trim() || null") &&
  dalLeave.includes("rejectedBy: approver.name") &&
  dalLeave.includes("rejectedAt: now"),
  "Kolom penolakan tidak lengkap di update leaveRequests",
);

assert(
  "teamLeaveHistory menyertakan rejectionReason, rejectedBy, rejectedAt, rejectionStage di select",
  dalLeave.includes("rejectionReason: leaveRequests.rejectionReason") &&
  dalLeave.includes("rejectedBy: leaveRequests.rejectedBy") &&
  dalLeave.includes("rejectedAt: leaveRequests.rejectedAt") &&
  dalLeave.includes("rejectionStage: leaveRequests.rejectionStage"),
  "teamLeaveHistory tidak membaca kolom-kolom penolakan",
);

assert(
  "teamLeaveHistory memetakan kolom penolakan ke objek hasil kembalian",
  dalLeave.includes("rejectionReason: r.rejectionReason") &&
  dalLeave.includes("rejectedBy: r.rejectedBy") &&
  dalLeave.includes("rejectedAt: r.rejectedAt?.toISOString() ?? null") &&
  dalLeave.includes("rejectionStage: r.rejectionStage"),
  "teamLeaveHistory tidak mengembalikan kolom penolakan",
);

// 2. Verifikasi Route API leave (route.ts)
console.log("\n2. Verifikasi Route API (route.ts)");
const routeLeave = readFileSync("src/app/api/absensi/leave/route.ts", "utf8");

assert(
  "API view=team memproteksi rejectionReason sehingga hanya pemilik pengajuan yang membaca",
  routeLeave.includes("rejectionReason: r.userId === me.id ? r.rejectionReason : null"),
  "rejectionReason bocor ke user lain atau tidak diteruskan ke pemilik",
);

assert(
  "API view=team mengembalikan rejectedBy untuk pemilik pengajuan",
  routeLeave.includes("rejectedBy: r.userId === me.id ? r.rejectedBy : null"),
  "rejectedBy tidak dikembalikan untuk pemilik",
);

assert(
  "decideLeaveStage menerima body.notes dari request PATCH",
  routeLeave.includes("body.notes"),
  "body.notes tidak diteruskan ke decideLeaveStage",
);

// 3. Verifikasi PromptDialog.tsx
console.log("\n3. Verifikasi Komponen PromptDialog.tsx");
const promptDialog = readFileSync("src/components/absensi/PromptDialog.tsx", "utf8");

assert(
  "PromptDialog mendukung opsi type danger",
  promptDialog.includes('type?: "primary" | "danger"'),
  "PromptDialog tidak mendukung varian danger",
);

assert(
  "PromptDialog mendukung custom confirmLabel",
  promptDialog.includes("confirmLabel = \"Kirim\""),
  "PromptDialog tidak mendukung confirmLabel",
);

// 4. Verifikasi Approval Page (approvals/page.tsx)
console.log("\n4. Verifikasi Halaman Admin Approvals (approvals/page.tsx)");
const approvalsPage = readFileSync("src/app/absensi/admin/approvals/page.tsx", "utf8");

assert(
  "approvals/page.tsx mendefinisikan komponen ExpandableReason",
  approvalsPage.includes("function ExpandableReason"),
  "ExpandableReason tidak ditemukan",
);

assert(
  "ExpandableReason memiliki tombol 'Lihat Selengkapnya' dan 'Sembunyikan'",
  approvalsPage.includes("Lihat Selengkapnya") && approvalsPage.includes("Sembunyikan"),
  "Teks toggle expand/collapse tidak ada",
);

assert(
  "Pending Request tahap 1 (executive) menggunakan ExpandableReason",
  approvalsPage.includes("<ExpandableReason text={req.reason}"),
  "Pending request tidak memakai ExpandableReason",
);

assert(
  "Waiting HR tahap 2 menggunakan ExpandableReason",
  approvalsPage.includes("<ExpandableReason text={req.reason}"),
  "Waiting HR request tidak memakai ExpandableReason",
);

assert(
  "Cancellation Request menggunakan ExpandableReason untuk alasan batal",
  approvalsPage.includes("<ExpandableReason") && approvalsPage.includes('label="Alasan Batal"'),
  "Cancellation request tidak memakai ExpandableReason",
);

assert(
  "Riwayat Approval Cuti menggunakan ExpandableReason",
  approvalsPage.includes("<ExpandableReason") && approvalsPage.includes('label="Alasan"'),
  "History request tidak memakai ExpandableReason",
);

assert(
  "Riwayat Approval menampilkan alasan penolakan dan nama penolak jika ditolak",
  approvalsPage.includes("req.rejectionReason") && approvalsPage.includes("Alasan Ditolak"),
  "Riwayat tidak menampilkan alasan penolakan",
);

assert(
  "approvals/page.tsx memiliki dialog penolakan cuti (rejectingLeaveReq)",
  approvalsPage.includes("rejectingLeaveReq") && approvalsPage.includes("handleRejectLeave"),
  "Dialog penolakan cuti tidak ditemukan",
);

assert(
  "Tombol Tolak membuka dialog penolakan alasan (setRejectingLeaveReq)",
  approvalsPage.includes("setRejectingLeaveReq(req)"),
  "Tombol Tolak tidak membuka dialog",
);

assert(
  "handleRejectLeave mengirimkan action: 'reject' dan notes: reason ke /api/absensi/leave",
  approvalsPage.includes('action: "reject"') && approvalsPage.includes("notes: reason.trim()"),
  "handleRejectLeave tidak mengirim notes alasan penolakan",
);

// 5. Verifikasi Halaman Staf Requests (requests/page.tsx)
console.log("\n5. Verifikasi Halaman Staf Requests (requests/page.tsx)");
const requestsPage = readFileSync("src/app/absensi/(staff)/requests/page.tsx", "utf8");

assert(
  "TeamLeaveRow menyertakan rejectionReason dan rejectedBy",
  requestsPage.includes("rejectionReason?: string | null;") &&
  requestsPage.includes("rejectedBy?: string | null;"),
  "Tipe data TeamLeaveRow tidak lengkap",
);

assert(
  "RequestCard menampilkan kotak 'Alasan Penolakan' jika status = rejected",
  requestsPage.includes('req.status === "rejected"') &&
  requestsPage.includes("Alasan Penolakan"),
  "Kotak alasan penolakan tidak ditemukan di RequestCard",
);

assert(
  "RequestCard menampilkan siapa yang menolak (rejectedBy / rejectionStage)",
  requestsPage.includes("req.rejectedBy"),
  "Nama penolak tidak ditampilkan di RequestCard",
);

assert(
  "RequestCard memetakan label status ke bahasa Indonesia",
  requestsPage.includes('"DITOLAK"') &&
  requestsPage.includes('"MENUNGGU HR"') &&
  requestsPage.includes('"MENUNGGU EXECUTIVE"'),
  "Pemetaan statusLabel tidak sesuai",
);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  process.exit(1);
}
