/**
 * Model data lengkap untuk generator dokumen PKS Klien MCN.
 */

export type PksCreatorItem = {
  name: string;
  sessions: number;
};

export type PksScheduleItem = {
  sessionNo: number;
  date: string;
  time: string;
  creator: string;
  notes: string;
};

export type PksTaxType = "pph_0_5" | "pph_23" | "ppn_11" | "none";

export interface PksMcnData {
  header: {
    contractNumber: string;
    signDate: string; // YYYY-MM-DD
    signCity: string;
  };
  client: {
    id?: string;
    name: string;
    brandName: string;
    entityType: string; // "perseroan terbatas", "CV", "perorangan"
    address: string;
    signeeName: string;
    signeePosition: string;
    signeeBasis: string; // "Direksi", "Kuasa Direksi"
    phone?: string;
    email?: string;
  };
  agency: {
    company: "TNT" | "HYPE" | "GOAT" | "NOVA";
    companyLegalName: string;
    tradeName: string;
    address: string;
    signeeName: string;
    signeePosition: string;
  };
  deliverables: {
    programName: string;
    platform: string;
    creators: PksCreatorItem[];
    totalSessions: number;
    sessionDuration: number; // menit
  };
  term: {
    startDate: string;
    endDate: string;
    firstLiveDate: string;
    noticeDays: number;
    replyDays: number;
  };
  financial: {
    contractValue: number;
    taxType: PksTaxType;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    bank: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      kcp: string;
    };
  };
  legal: {
    nonCircumventionMonths: number;
    curePeriodDays: number;
    courtJurisdiction: string;
  };
  schedule: PksScheduleItem[];
}

export const DEFAULT_PKS_MCN_DATA: PksMcnData = {
  header: {
    contractNumber: "015/PKS-TNT/NHN/X/2026",
    signDate: "2026-10-09",
    signCity: "Tangerang",
  },
  client: {
    name: "PT Paragon Technology and Innovation",
    brandName: "TAVI",
    entityType: "perseroan terbatas",
    address:
      "Jl. Ciledug Raya No.10 RT.18/RW.3, Ulujami, Kec. Pesanggrahan, Kota Adm. Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12250",
    signeeName: "DARA TITANIA MUTHMAINNAH",
    signeePosition: "AFFILIATE SPECIALIST",
    signeeBasis: "Direksi",
    phone: "",
    email: "",
  },
  agency: {
    company: "TNT",
    companyLegalName: "PT TNT KREATIF DIGITAL",
    tradeName: "Thick and Thin Media Indonesia",
    address:
      "Jalan Kavling Perkebunan Raya, RT 006 / RW 013, Panunggangan Barat, Kec. Cibodas, Kota Tangerang, Banten 15139",
    signeeName: "RUBEN ARIANTO",
    signeePosition: "DIREKTUR UTAMA",
  },
  deliverables: {
    programName: "Live Exclusive Creator MCN",
    platform: "TikTok Live",
    creators: [
      { name: "Storyandine", sessions: 10 },
      { name: "Anisarobiyanti", sessions: 10 },
    ],
    totalSessions: 20,
    sessionDuration: 120,
  },
  term: {
    startDate: "2026-09-23",
    endDate: "2026-10-29",
    firstLiveDate: "2026-10-06",
    noticeDays: 30,
    replyDays: 14,
  },
  financial: {
    contractValue: 4500000,
    taxType: "pph_0_5",
    taxRate: 0.005,
    taxAmount: 22613,
    totalAmount: 4522613,
    bank: {
      bankName: "Bank Central Asia (BCA)",
      accountName: "TNT KREATIF DIGITAL PT",
      accountNumber: "7613472888",
      kcp: "Karawaci",
    },
  },
  legal: {
    nonCircumventionMonths: 12,
    curePeriodDays: 14,
    courtJurisdiction: "Pengadilan Negeri Tangerang",
  },
  schedule: [
    {
      sessionNo: 1,
      date: "06 Oktober 2026",
      time: "19:00 - 21:00 WIB",
      creator: "Storyandine",
      notes: "First Live Kickoff",
    },
    {
      sessionNo: 2,
      date: "07 Oktober 2026",
      time: "19:00 - 21:00 WIB",
      creator: "Anisarobiyanti",
      notes: "Live Session 2",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// PKS KLIEN TNT (AFFILIATE BOOSTER / YELLOW CART TIKTOK)
// ═══════════════════════════════════════════════════════════════

export type PksTemplateType = "PKS_KLIEN_MCN" | "PKS_KLIEN_TNT";

export type PksCreatorTier = {
  mega: number; // > 1.000.000 followers
  macro: number; // 100.000 - 999.999 followers
  micro: number; // 10.000 - 99.999 followers
  nano: number; // 1.000 - 9.999 followers
};

export interface PksTntData {
  header: {
    contractNumber: string;
    signDate: string; // YYYY-MM-DD
    signCity: string;
  };
  client: {
    id?: string;
    name: string;
    brandName: string;
    entityType: string;
    address: string;
    signeeName: string;
    signeePosition: string;
    signeeBasis: string;
    phone?: string;
    email?: string;
  };
  agency: {
    company: "TNT" | "HYPE" | "GOAT" | "NOVA";
    companyLegalName: string;
    tradeName: string;
    address: string;
    signeeName: string;
    signeePosition: string;
  };
  campaign: {
    programName: string; // "Affiliate Booster"
    totalCreators: number;
    totalVideos: number;
    tiers: PksCreatorTier;
  };
  term: {
    startDate: string; // Tanggal Mulai Perjanjian
    prepDurationDays: number; // default 14 hari
    prepStartDate: string;
    prepEndDate: string;
    firstVtDate: string; // Tanggal Target First VT
    runningDurationDays: number; // default 30 hari
    runningEndDate: string;
    noticeDays: number; // 30 hari
    replyDays: number; // 14 hari
  };
  financial: {
    contractValue: number;
    taxType: PksTaxType;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    bank: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      kcp: string;
    };
  };
  approval: {
    maxRevisions: number; // 3 kali
    replyDays: number; // 3 hari kerja
    maxExtensionDays: number; // 14 hari kalender
  };
  legal: {
    nonCircumventionMonths: number; // 12 bulan
    curePeriodDays: number; // 14 hari kalender
    courtJurisdiction: string; // Pengadilan Negeri Tangerang
  };
}

export const DEFAULT_PKS_TNT_DATA: PksTntData = {
  header: {
    contractNumber: "016/PKS-TNT/NHN/X/2026",
    signDate: "2026-10-12",
    signCity: "Tangerang",
  },
  client: {
    name: "PT Paragon Technology and Innovation",
    brandName: "TAVI",
    entityType: "perseroan terbatas",
    address:
      "Jl. Ciledug Raya No.10 RT.18/RW.3, Ulujami, Kec. Pesanggrahan, Kota Adm. Jakarta Selatan, Daerah Khusus Ibukota Jakarta 12250",
    signeeName: "DARA TITANIA MUTHMAINNAH",
    signeePosition: "AFFILIATE SPECIALIST",
    signeeBasis: "Direksi",
    phone: "",
    email: "",
  },
  agency: {
    company: "TNT",
    companyLegalName: "PT TNT KREATIF DIGITAL",
    tradeName: "Thick and Thin Media Indonesia",
    address:
      "Jalan Kavling Perkebunan Raya, RT 006 / RW 013, Panunggangan Barat, Kec. Cibodas, Kota Tangerang, Banten 15139",
    signeeName: "RUBEN ARIANTO",
    signeePosition: "DIREKTUR UTAMA",
  },
  campaign: {
    programName: "Affiliate Booster",
    totalCreators: 50,
    totalVideos: 100,
    tiers: {
      mega: 2,
      macro: 8,
      micro: 20,
      nano: 20,
    },
  },
  term: {
    startDate: "2026-10-12",
    prepDurationDays: 14,
    prepStartDate: "2026-10-12",
    prepEndDate: "2026-10-25",
    firstVtDate: "2026-10-26",
    runningDurationDays: 30,
    runningEndDate: "2026-11-25",
    noticeDays: 30,
    replyDays: 14,
  },
  financial: {
    contractValue: 50000000,
    taxType: "pph_0_5",
    taxRate: 0.005,
    taxAmount: 250000,
    totalAmount: 50250000,
    bank: {
      bankName: "Bank Central Asia (BCA)",
      accountName: "TNT KREATIF DIGITAL PT",
      accountNumber: "7613472888",
      kcp: "Karawaci",
    },
  },
  approval: {
    maxRevisions: 3,
    replyDays: 3,
    maxExtensionDays: 14,
  },
  legal: {
    nonCircumventionMonths: 12,
    curePeriodDays: 14,
    courtJurisdiction: "Pengadilan Negeri Tangerang",
  },
};

