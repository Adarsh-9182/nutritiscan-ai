import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabSummary } from "@/components/screens/lab-summary";
import { PANELS, panelById, steadyCount } from "@/lib/v2/labs";

type Props = { params: Promise<{ panel: string }> };

export function generateStaticParams() {
  return PANELS.map((p) => ({ panel: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { panel: id } = await params;
  const panel = panelById(id);
  if (!panel) return { title: "Panel" };
  const { steady, total } = steadyCount(panel);
  return {
    title: panel.label,
    description: `${steady} of ${total} markers are where they should be.`,
    // A lab summary is the single most private page in the app.
    // It should never reach a search index or a cached snapshot.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { panel: id } = await params;
  const panel = panelById(id);
  if (!panel) notFound();
  return <LabSummary panel={panel} />;
}
