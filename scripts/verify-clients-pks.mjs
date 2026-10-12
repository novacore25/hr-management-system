import { createRequire } from "module";
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = { exports: {} };

async function test() {
  const { searchClients, upsertClient, saveClientContract, listClientContracts, getClientContractById } =
    await import("../src/server/dal/clients.ts");

  console.log("=== TEST 1: UPSERT CLIENT (PARAGON TAVI) ===");
  const upsert1 = await upsertClient({
    name: "PT Paragon Technology and Innovation",
    brandName: "TAVI",
    entityType: "perseroan terbatas",
    address: "Jl. Ciledug Raya No.10 RT.18/RW.3, Ulujami, Pesanggrahan, Jakarta Selatan 12250",
    phone: "081234567890",
    email: "legal@paragon-tavi.com",
    contact: {
      signeeName: "DARA TITANIA MUTHMAINNAH",
      signeePosition: "AFFILIATE SPECIALIST",
      signeeBasis: "Direksi",
      isPrimary: true,
    },
  });
  console.log("Client created/updated:", upsert1.client.id, upsert1.client.name);
  console.log("Contact created/updated:", upsert1.contact?.signeeName);

  console.log("\n=== TEST 2: ADD SECOND CONTACT (RIAN PRATAMA) ===");
  const upsert2 = await upsertClient({
    id: upsert1.client.id,
    name: upsert1.client.name,
    brandName: upsert1.client.brandName,
    contact: {
      signeeName: "RIAN PRATAMA",
      signeePosition: "BRAND MARKETING LEAD",
      signeeBasis: "Kuasa Direksi",
      isPrimary: false,
    },
  });
  console.log("Second contact added:", upsert2.contact?.signeeName);

  console.log("\n=== TEST 3: SEARCH CLIENTS (AUTO-FILL CHECK) ===");
  const search = await searchClients("Paragon");
  console.log("Search results count:", search.length);
  const found = search[0];
  console.log("Found client:", found.name, "Brand:", found.brandName);
  console.log("Total contacts available:", found.contacts.length);
  found.contacts.forEach((c) => console.log(`  - [${c.isPrimary ? 'UTAMA' : 'OPSI'}] ${c.signeeName} (${c.signeePosition})`));

  console.log("\n=== TEST 4: SAVE CLIENT CONTRACT (PKS MCN ARCHIVE) ===");
  const save = await saveClientContract({
    clientId: found.id,
    clientData: {
      name: found.name,
      brandName: found.brandName,
      entityType: found.entityType,
      address: found.address,
      signeeName: "DARA TITANIA MUTHMAINNAH",
      signeePosition: "AFFILIATE SPECIALIST",
      signeeBasis: "Direksi",
    },
    contractNumber: "015/PKS-TNT/NHN/X/2026",
    company: "TNT",
    signDate: "2026-10-09",
    startDate: "2026-09-23",
    endDate: "2026-10-29",
    contractValue: 4500000,
    taxType: "pph_0_5",
    taxAmount: 22613,
    totalAmount: 4522613,
    programName: "Live Exclusive Creator MCN",
    platform: "TikTok Live",
    creators: [
      { name: "Storyandine", sessions: 10 },
      { name: "Anisarobiyanti", sessions: 10 },
    ],
    totalSessions: 20,
    sessionDuration: 120,
    bankDetails: {
      bank: "Bank Central Asia (BCA)",
      accountName: "TNT KREATIF DIGITAL PT",
      accountNumber: "7613472888",
      kcp: "Karawaci",
    },
    signeeName: "DARA TITANIA MUTHMAINNAH",
    signeePosition: "AFFILIATE SPECIALIST",
    clientAddress: found.address,
    tntSigneeName: "RUBEN ARIANTO",
    tntSigneePosition: "DIREKTUR UTAMA",
    courtJurisdiction: "Pengadilan Negeri Tangerang",
    documentPayload: { sample: true, version: 1 },
    registerLetterNumber: true,
  });
  console.log("Contract saved:", save.contract.id, "No:", save.contract.contractNumber, "Total:", save.contract.totalAmount);

  console.log("\n=== TEST 5: LIST CONTRACTS ARCHIVE ===");
  const list = await listClientContracts({ clientId: found.id });
  console.log("Contracts archive count:", list.length);
  list.forEach((c) => console.log(`  - No: ${c.contractNumber} | Client: ${c.clientName} | Total: Rp ${Number(c.totalAmount).toLocaleString('id-ID')}`));

  console.log("\n=== TEST 6: GET CONTRACT BY ID SNAPSHOT ===");
  const single = await getClientContractById(save.contract.id);
  console.log("Snapshot retrieved:", single?.contractNumber, "Payload:", single?.documentPayload);

  console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
  process.exit(0);
}

test().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
