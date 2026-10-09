import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to prepare for a doctor appointment: checklist",
  description:
    "A practical checklist for preparing questions, symptom notes, medicines and follow-up details before a doctor appointment, based on trusted health sources.",
  alternates: { canonical: "/guides/doctor-appointment-checklist" },
};

export default function DoctorAppointmentChecklistPage() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">PATIENT PREPARATION GUIDE</span>
      <h1>How to prepare for a doctor appointment</h1>
      <p>
        A short appointment can feel easier to use when you bring a clear list
        of what you want to discuss. This checklist helps you organize your
        notes before a visit. It does not help diagnose symptoms or replace
        advice from your healthcare professional.
      </p>

      <h2>Before the appointment</h2>
      <ol>
        <li>
          <strong>Choose your top two or three questions.</strong> Write the
          most important ones first so you can cover them if time is limited.
        </li>
        <li>
          <strong>Make a brief symptom note.</strong> If you are going in about
          a symptom, note when it began, how often it happens, what seems to
          change it, and how it affects your day. Share your observations with
          your clinician; do not use this list to self-diagnose.
        </li>
        <li>
          <strong>List medicines and supplements.</strong> Include prescription
          and over-the-counter medicines, vitamins, and herbal products. Note
          any allergies and any effects you want to ask about. Do not stop or
          change a medicine based on this guide.
        </li>
        <li>
          <strong>Gather relevant history.</strong> Jot down important past or
          current conditions, surgeries, and family history that may be
          relevant to the reason for your visit. Bring reports or records you
          already have if your clinician asks for them.
        </li>
        <li>
          <strong>Plan for access needs.</strong> Contact the clinic ahead of
          time if you need an interpreter, mobility support, or help with
          communication. If you want, ask someone you trust to join you.
        </li>
      </ol>

      <h2>During the visit</h2>
      <ul>
        <li>Start with the concern that matters most to you.</li>
        <li>Ask the clinician to explain unfamiliar words or instructions.</li>
        <li>
          For a proposed test, ask what it is for, how and when you will receive
          results, and who to contact if you do not hear back.
        </li>
        <li>
          Write down the agreed next steps, including any follow-up date or
          contact details.
        </li>
      </ul>

      <h2>Before you leave</h2>
      <p>
        Check that your main questions were covered and that you understand
        what happens next. If medicine instructions are unclear, ask the
        prescribing professional or a pharmacist to explain them. For urgent or
        worsening symptoms, contact a healthcare professional or local
        emergency service instead of waiting for a routine appointment.
      </p>

      <h2>Quick checklist</h2>
      <ul>
        <li>My top questions and concerns</li>
        <li>A short note about symptoms and when they occur</li>
        <li>My current medicines, vitamins, supplements and allergies</li>
        <li>Relevant health history and records I already have</li>
        <li>Space to note answers, follow-up steps and contact details</li>
      </ul>

      <h2>Sources</h2>
      <p>
        This checklist summarizes patient-preparation guidance from the
        <a href="https://medlineplus.gov/ency/patientinstructions/000860.htm" target="_blank" rel="noreferrer">
          U.S. National Library of Medicine’s MedlinePlus
        </a>
        , the
        <a href="https://www.ahrq.gov/questions/be-engaged/index.html" target="_blank" rel="noreferrer">
          Agency for Healthcare Research and Quality
        </a>
        , and the
        <a href="https://www.nhs.uk/nhs-services/gps/what-to-ask-your-doctor/" target="_blank" rel="noreferrer">
          NHS
        </a>
        . Reviewed 9 October 2026. Follow the instructions of your own care
        team; this general guide may not fit every appointment.
      </p>

      <p>
        NutritiScan is an early-access educational health companion. Its web
        chat and Android journal do not diagnose, prescribe, or replace a
        clinician. See <Link href="/about">what is available today</Link> and
        the <Link href="/privacy">privacy notice</Link> before sharing health
        information.
      </p>
    </main>
  );
}
