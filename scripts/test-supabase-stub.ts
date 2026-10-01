/**
 * Smoke test untuk stub Supabase (`src/lib/supabase/client.ts`).
 *
 * Meniru POLA PEMAKAIAN nyata di halaman lama supaya regresi
 * (mis. `.on()` mengembalikan undefined sehingga `.subscribe()` crash)
 * ketahuan SEBELUM deploy, bukan setelah user membuka halaman.
 *
 * Jalankan: npx tsx scripts/test-supabase-stub.ts
 */

import { createClient } from "../src/lib/supabase/client";

let pass = 0;
let fail = 0;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e instanceof Error ? e.message : String(e)}`);
    fail++;
  }
}

async function main() {
const supabase = createClient();

console.log("\n=== Smoke test stub Supabase ===\n");

await check("channel().on().on().subscribe() tidak crash", () => {
  const ch = supabase
    .channel("attendance_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attendance" },
      () => {},
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leave_requests" },
      () => {},
    );
  assert(typeof ch.subscribe === "function", "subscribe harus berupa fungsi");
  ch.subscribe();
  assert(
    typeof ch.unsubscribe === "function",
    "unsubscribe harus berupa fungsi",
  );
});

await check("subscribe langsung tanpa .on()", () => {
  const ch = supabase.channel("x").subscribe();
  assert(typeof ch.subscribe === "function", "harus tetap chainable");
});

await check("await .select().eq().single() mengembalikan objek", async () => {
  const res = await supabase
    .from("absensi_settings")
    .select("*")
    .eq("id", 1)
    .single();
  assert(res != null, "result tidak boleh null/undefined");
  assert(
    Array.isArray(res.data) || res.data == null,
    "data harus array atau object kosong",
  );
});

await check(".data ?? [] bisa di-iterasi", async () => {
  const res = await supabase
    .from("attendance")
    .select("*")
    .eq("date", "2026-10-01");
  const rows = (res.data ?? []).map((r) => r.id);
  assert(Array.isArray(rows), "hasil map harus array");
});

await check("await tidak loop (thenable resolve ke nilai biasa)", async () => {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("TIMEOUT - await masuk loop tak berujung")),
      3000,
    ),
  );
  const res = await Promise.race([
    supabase.from("users").select("*").limit(1),
    timeout,
  ]);
  assert(res !== undefined, "harus resolve");
});

await check("rpc() tidak crash", async () => {
  const res = await supabase.rpc("process_leave_request", {
    p_request_id: "x",
  });
  assert(res !== undefined, "rpc harus mengembalikan objek");
});

await check("storage bucket", () => {
  const s = supabase.storage.from("overtime_proofs");
  const url = s.getPublicUrl("a.jpg");
  assert(typeof url.data.publicUrl === "string", "publicUrl harus string");
});

await check("auth.getSession() tidak crash", async () => {
  const r = await supabase.auth.getSession();
  assert(r.data.session === null, "session harus null");
});

await check("onAuthStateChange().data.subscription.unsubscribe", () => {
  const { data } = supabase.auth.onAuthStateChange(() => {});
  assert(
    typeof data.subscription.unsubscribe === "function",
    "unsubscribe harus ada",
  );
});

await check("removeChannel() mengembalikan promise", async () => {
  const ch = supabase.channel("y");
  await supabase.removeChannel(ch);
});

console.log(`\n=== ${pass} pass, ${fail} fail ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();