import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About the NutritiScan health journal",
  description:
    "Learn what NutritiScan does today, what is still in development, and how the early-access health journal fits alongside care from a qualified clinician.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">ABOUT THE PRODUCT</span>
      <h1>What is NutritiScan?</h1>
      <p>
        NutritiScan is an early-access educational health companion for adults.
        The website offers general health chat, and the Android beta includes a
        local journal for meals, health notes and saved conversations. It is
        designed to help people organize questions for a doctor visit—not to
        replace medical care.
      </p>

      <h2>What can I use today?</h2>
      <p>
        You can ask general health questions in the web chat and keep personal
        journal entries in the Android beta. Android journal entries are stored
        on your device and are not encrypted by NutritiScan. Web chat messages
        are sent to the server when you submit them and may be processed by a
        configured AI provider.
      </p>

      <h2>Are lab reports and shared health records available?</h2>
      <p>
        No. The private cloud health-record service, shared report storage,
        automatic lab extraction and shared health trends are not active in the
        current release. Do not rely on NutritiScan to interpret a test result.
        Check the health dashboard for the current service status.
      </p>

      <h2>Does NutritiScan provide medical advice?</h2>
      <p>
        No. NutritiScan is not clinically validated and does not diagnose,
        prescribe, recommend treatment or check medicine interactions. A
        qualified clinician should interpret symptoms, test results and
        treatment options. In an emergency, contact local emergency services.
      </p>

      <h2>How does NutritiScan handle health information?</h2>
      <p>
        NutritiScan does not use patient records for model training. Chat
        messages may be sent to a configured AI provider, whose handling is
        governed by its own terms. Review the <Link href="/privacy">privacy
        notice</Link> before sending health-related information.
      </p>

      <p>
        <Link href="/chat">Try the educational web chat</Link> or{" "}
        <Link href="https://github.com/Adarsh-9182/nutritiscan/releases">
          get the Android beta
        </Link>.
      </p>
    </main>
  );
}
