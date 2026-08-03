import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MedicineScreen } from "@/components/screens/medicine";
import { MEDICINES, medicineById } from "@/lib/v2/medicines";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return MEDICINES.map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: medicineById(id)?.name ?? "Medicine" };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const medicine = medicineById(id);
  if (!medicine) notFound();
  return <MedicineScreen medicine={medicine} />;
}
