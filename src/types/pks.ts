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
