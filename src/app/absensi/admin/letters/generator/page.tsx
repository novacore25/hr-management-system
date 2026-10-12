import { UniversalContractGenerator } from "@/components/documents/UniversalContractGenerator";

export const metadata = {
  title: "Generator Dokumen PKS · NovaCore HR",
  description: "Generator Perjanjian Kerjasama (PKS) Klien TNT & MCN Real-Time A4",
};

export default function AdminContractGeneratorPage() {
  return <UniversalContractGenerator backHref="/absensi/admin/letters" />;
}
