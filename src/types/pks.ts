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

export type PksCalendarPromoNote = {
  date: string;
  description: string;
};

export type PksCreatorCalendar = {
  creatorName: string;
  targetInfo: string; // e.g. "Storyandine - TnT (10x Sesi Oktober)"
  monthName: string; // e.g. "OKTOBER"
  year?: number;
  themeColor?: "blue" | "pink" | "purple" | "emerald";
  // Key: tanggal string (misal "prev_30", "1", "6", "10", dll.) -> Value: text sesi (misal "1 sesi exc tavi")
  slots: Record<string, string>;
  notes?: PksCalendarPromoNote[];
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
  appendixFormat?: "calendar" | "table"; // default "calendar"
  calendarRosters?: PksCreatorCalendar[];
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
  appendixFormat: "calendar",
  calendarRosters: [
    {
      creatorName: "Storyandine",
      targetInfo: "Storyandine - TnT (10x Sesi Oktober)",
      monthName: "OKTOBER",
      themeColor: "blue",
      slots: {
        "prev_30": "1 sesi exc tavi",
        "6": "1 sesi mix tavi & IP",
        "8": "1 sesi exc IP",
        "10": "1 sesi mix tavi & IP",
        "13": "1 sesi exc tavi",
        "15": "1 sesi exc tavi",
        "20": "1 sesi exc tavi",
        "25": "1 sesi mix tavi & IP",
        "27": "1 sesi exc tavi",
        "29": "1 sesi mix tavi & IP",
      },
      notes: [
        { date: "30 Sept", description: "Promo Beauty Rush" },
        { date: "10 Okt", description: "Promo 10.10" },
        { date: "6, 13, 20, 27 Okt", description: "Promo Tuesday Made Easy" },
        { date: "25 Okt", description: "Promo Payday" },
      ],
    },
    {
      creatorName: "Anisarobiyanti",
      targetInfo: "Anisarobiyanti - TnT (10x Sesi Oktober)",
      monthName: "OKTOBER",
      themeColor: "pink",
      slots: {
        "prev_30": "1 sesi exc tavi",
        "6": "1 sesi exc tavi",
        "9": "1 sesi exc tavi",
        "10": "1 sesi exc tavi",
        "13": "1 sesi exc tavi",
        "15": "1 sesi mix tavi & IP",
        "20": "1 sesi exc tavi",
        "22": "1 sesi mix tavi & IP",
        "25": "1 sesi exc tavi",
        "27": "1 sesi exc tavi",
      },
      notes: [
        { date: "30 Sept", description: "Promo Beauty Rush" },
        { date: "10 Okt", description: "Promo 10.10" },
        { date: "6, 13, 20, 27 Okt", description: "Promo Tuesday Made Easy" },
        { date: "25 Okt", description: "Promo Payday" },
      ],
    },
  ],
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

export type PksTemplateType = "PKS_KLIEN_MCN" | "PKS_KLIEN_TNT" | "PKS_HYPE";

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

// ═══════════════════════════════════════════════════════════════
// PKS HYPE (PACKAGE ACTIVATION TIKTOK GO)
// ═══════════════════════════════════════════════════════════════

export interface PksHypeData {
  header: {
    contractNumber: string;
    signDate: string; // YYYY-MM-DD
    signCity: string;
  };
  client: {
    id?: string;
    name: string;
    brandName: string;
    entityType: string; // "perseroan terbatas", "perseroan komanditer", "perorangan"
    address: string;
    signeeName: string;
    signeePosition: string;
    signeeBasis: string; // "Direksi", "Kuasa Direksi", dll.
    businessDescription: string;
    phone?: string;
    email?: string;
  };
  agency: {
    company: "HYPE";
    companyLegalName: string;
    address: string;
    signeeName: string;
    signeePosition: string;
  };
  campaign: {
    programName: string; // "Package Activation Tiktok GO"
    outletName: string;
    outletAddress: string;
    creatorsCount: number;
    minVtPerCreator: number;
    totalVt: number;
    targetStartDate?: string;
  };
  term: {
    startDate: string; // YYYY-MM-DD
    prepDurationDays: number; // 30 hari
    prepStartDate: string;
    prepEndDate: string;
    firstVtDate: string; // Tanggal Mulai Campaign First VT
    runningDurationDays: number; // 30 hari
    runningEndDate: string;
    noticeDays: number; // 14 hari kerja
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
    };
  };
  approval: {
    maxRevisions: number; // 3 kali
    replyDays: number; // 3 hari kerja
  };
  legal: {
    nonCircumventionMonths: number; // 3 bulan
    disputeDays: number; // 30 hari kalender
    courtJurisdiction: string; // Pengadilan Negeri Tangerang
  };
}

export const DEFAULT_PKS_HYPE_DATA: PksHypeData = {
  header: {
    contractNumber: "001/PKS-HMI/NHN/X/2026",
    signDate: "2026-10-20",
    signCity: "Tangerang",
  },
  client: {
    name: "PT Urban Wellness Indonesia",
    brandName: "Urban Wellness",
    entityType: "perseroan terbatas",
    address:
      "Jl. Boulevard BSD Timur, Ruko Golden Vienna Blok CA No. 12, Serpong, Tangerang Selatan, Banten 15310",
    signeeName: "ANDI SETIAWAN",
    signeePosition: "DIREKTUR",
    signeeBasis: "Direksi",
    businessDescription: "perusahaan yang bergerak di bidang klinik kesehatan dan kecantikan",
    phone: "",
    email: "",
  },
  agency: {
    company: "HYPE",
    companyLegalName: "CV HYPE MEDIA INDONESIA",
    address:
      "Jalan Kavling Perkebunan Raya, RT 006 / RW 013, Panunggangan Barat, Kecamatan Cibodas, Kota Tangerang, Banten 15139",
    signeeName: "RUBEN ARIANTO",
    signeePosition: "MANAJER UMUM (General Manager)",
  },
  campaign: {
    programName: "Package Activation Tiktok GO",
    outletName: "Urban Wellness BSD",
    outletAddress:
      "Jl. Boulevard BSD Timur, Ruko Golden Vienna Blok CA No. 12, Serpong, Tangerang Selatan",
    creatorsCount: 10,
    minVtPerCreator: 1,
    totalVt: 10,
    targetStartDate: "2026-10-20",
  },
  term: {
    startDate: "2026-10-20",
    prepDurationDays: 30,
    prepStartDate: "2026-10-20",
    prepEndDate: "2026-11-19",
    firstVtDate: "2026-11-20",
    runningDurationDays: 30,
    runningEndDate: "2026-12-20",
    noticeDays: 14,
  },
  financial: {
    contractValue: 15000000,
    taxType: "ppn_11",
    taxRate: 0.11,
    taxAmount: 1650000,
    totalAmount: 16650000,
    bank: {
      bankName: "Bank Central Asia (BCA)",
      accountName: "SYNERA KREATIF GRUP PT",
      accountNumber: "8832372730",
    },
  },
  approval: {
    maxRevisions: 3,
    replyDays: 3,
  },
  legal: {
    nonCircumventionMonths: 3,
    disputeDays: 30,
    courtJurisdiction: "Pengadilan Negeri Tangerang",
  },
};


