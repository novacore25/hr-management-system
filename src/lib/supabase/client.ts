/**
 * STUB SUPABASE - JANGAN PAKAI UNTUK KODE BARU.
 *
 * Kenapa file ini masih ada:
 *   Halaman /absensi/** masih memanggilnya. Halaman tersebut akan
 *   ditulis ulang di Fase 4. Stub ini membuat halaman tetap bisa
 *   dirender (data kosong) alih-alih crash, sehingga dashboard KPI
 *   yang SUDAH migrated tetap bisa dipakai sekarang.
 *
 * Semua logika sudah pindah ke Route Handler:
 *   /api/users  /api/kpis  /api/assignments  /api/assignments/period
 *   /api/daily-reports  /api/departments  /api/kpi-settings  /api/me
 *
 * TODO(Fase 4): hapus setelah /absensi/** selesai dimigrasi.
 */

/** Method query builder yang bisa dirangkai. */
const CHAIN_METHODS = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte",
  "like", "ilike", "in", "not", "is", "notIs",
  "order", "limit", "range", "single", "maybeSingle",
  "or", "and", "filter", "from", "innerJoin", "leftJoin",
  "set", "values", "onConflict", "contains", "overlaps",
] as const;

/**
 * Tipe hasil query stub.
 *
 * Penting: `data` bertipe Record<string, any>[] (bukan any) supaya
 * kode lama seperti `(res.data ?? []).forEach((r) => ...)` mendapat
 * tipe parameter yang benar dan tidak kena error implicit-any.
 */
/** Bentuk hasil query (data kosong). */
export type StubResult = {
  data: Record<string, any>[];
  error: any;
  count: null;
  status: number;
  statusText: string;
};

export type StubSingle = Omit<StubQuery, "data"> & { data: any };

export type StubQuery = {
  data: Record<string, any>[];
  error: any;
  count: null;
  status: number;
  statusText: string;

  // Builder chainable
  select: (...a: any[]) => StubQuery;
  insert: (...a: any[]) => StubQuery;
  update: (...a: any[]) => StubQuery;
  upsert: (...a: any[]) => StubQuery;
  delete: (...a: any[]) => StubQuery;
  eq: (...a: any[]) => StubQuery;
  neq: (...a: any[]) => StubQuery;
  gt: (...a: any[]) => StubQuery;
  gte: (...a: any[]) => StubQuery;
  lt: (...a: any[]) => StubQuery;
  lte: (...a: any[]) => StubQuery;
  like: (...a: any[]) => StubQuery;
  ilike: (...a: any[]) => StubQuery;
  in: (...a: any[]) => StubQuery;
  not: (...a: any[]) => StubQuery;
  is: (...a: any[]) => StubQuery;
  notIs: (...a: any[]) => StubQuery;
  order: (...a: any[]) => StubQuery;
  limit: (...a: any[]) => StubQuery;
  range: (...a: any[]) => StubQuery;
  // .single() / .maybeSingle() -> satu baris (object), bukan array
  single: () => StubSingle;
  maybeSingle: () => StubSingle;
  or: (...a: any[]) => StubQuery;
  and: (...a: any[]) => StubQuery;
  filter: (...a: any[]) => StubQuery;
  from: (...a: any[]) => StubQuery;
  innerJoin: (...a: any[]) => StubQuery;
  leftJoin: (...a: any[]) => StubQuery;
  set: (...a: any[]) => StubQuery;
  values: (...a: any[]) => StubQuery;
  onConflict: (...a: any[]) => StubQuery;
  contains: (...a: any[]) => StubQuery;
  overlaps: (...a: any[]) => StubQuery;
  match: (...a: any[]) => StubQuery;
};

/** Query builder: chainable, tapi `await` menghasilkan data kosong. */
function makeBuilder(): StubQuery {
  const builder = {
    data: [] as Record<string, any>[],
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  } as StubQuery;

  for (const m of CHAIN_METHODS) {
    (builder as Record<string, unknown>)[m] = () => builder;
  }

  // `await builder` resolve ke builder itu sendiri (data kosong).
  // Objects ini thenable, jadi HARUS resolve ke nilai non-thenable
  // -- kalau tidak, await akan loop tak berujung.
  (builder as any).then = (resolve: (v: unknown) => void) => {
    resolve({
      data: [] as Record<string, any>[],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });
  };
  (builder as any).catch = async () => builder;
  (builder as any).finally = async (cb: () => void) => {
    cb();
    return builder;
  };

  return builder;
}

export type SupabaseStub = {
  from: (table: string) => StubQuery;
  auth: {
    getSession: () => Promise<{ data: { session: null }; error: null }>;
    getUser: () => Promise<{ data: { user: null }; error: null }>;
    onAuthStateChange: (...args: any[]) => {
      data: { subscription: { unsubscribe: () => void } };
    };
    signInWithOAuth: (...args: any[]) => Promise<{ data: null; error: null }>;
    signInWithPassword: (...args: any[]) => Promise<{ data: null; error: null }>;
    signOut: () => Promise<{ error: null }>;
  };
  storage: {
    from: (bucket: string) => {
      upload: (...args: any[]) => Promise<{ data: null; error: null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      list: (...args: any[]) => Promise<{ data: any[]; error: null }>;
      remove: (...args: any[]) => Promise<{ data: null; error: null }>;
    };
  };
  rpc: (fn: string, args?: unknown) => StubQuery;
  channel: (name: string) => {
    on: (...args: any[]) => any;
    subscribe: (...args: any[]) => any;
    unsubscribe: () => Promise<void>;
    send: (...args: any[]) => Promise<void>;
  };
  removeChannel: (ch: unknown) => Promise<void>;
  functions: {
    invoke: (...args: any[]) => Promise<{ data: null; error: null }>;
  };
};

export function createClient(): SupabaseStub {
  return {
    from: () => makeBuilder(),

    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithOAuth: async () => ({ data: null, error: null }),
      signInWithPassword: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },

    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: null, error: null }),
      }),
    },

    rpc: () => makeBuilder(),
    channel: () => ({
      on: () => undefined,
      subscribe: () => undefined,
      unsubscribe: async () => {},
      send: async () => {},
    }),
    removeChannel: async () => {},
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
}

export default createClient;

/** Tipe database lama, dipertahankan agar import tidak pecah. */
export type Database = Record<string, never>;