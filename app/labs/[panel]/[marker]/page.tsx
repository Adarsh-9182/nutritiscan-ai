import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BiomarkerScreen } from "@/components/screens/biomarker";
import { PANELS, markerById, panelById } from "@/lib/v2/labs";

type Props = { params: Promise<{ panel: string; marker: string }> };

export function generateStaticParams() {
  return PANELS.flatMap((p) => p.markers.map((m) => ({ panel: p.id, marker: m.id })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { panel: panelId, marker: markerId } = await params;
  const panel = panelById(panelId);
  const marker = panel && markerById(panel, markerId);
  return {
    title: marker?.name ?? "Marker",
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { panel: panelId, marker: markerId } = await params;
  const panel = panelById(panelId);
  if (!panel) notFound();
  const marker = markerById(panel, markerId);
  if (!marker) notFound();
  return <BiomarkerScreen panel={panel} marker={marker} />;
}
