"use client";

import { ArrowUpRight, FileText, LockKeyhole, Upload } from "lucide-react";
import type { Report, Saved } from "@/lib/workspace/types";

export default function RecordSources({
  reports,
  pending,
  changeAccess,
  addReport,
  openReport,
}: {
  reports: Saved<Report>[];
  pending: boolean;
  changeAccess: (report: Saved<Report>, allowed: boolean) => void;
  addReport: () => void;
  openReport: (report: Saved<Report>) => void;
}) {
  const available = reports.filter((r) => r.assistantAccess !== false).length;
  return (
    <div className="ns-sources-page">
      <div className="ns-page-heading">
        <div>
          <span className="ns-eyebrow">YOUR RECORDS. YOUR CHOICE.</span>
          <h1>Sources & access</h1>
          <p>
            Know where a record came from. Choose what your companion can read.
          </p>
        </div>
        <button className="ns-button ns-dark" onClick={addReport}>
          <Upload size={17} /> Add a report
        </button>
      </div>
      <section className="ns-access-summary">
        <LockKeyhole size={23} strokeWidth={1.5} />
        <div>
          <h2>
            {available} of {reports.length} reports available to your companion
          </h2>
          <p>
            Turning access off excludes a report from future companion
            summaries, comparisons and visit questions. Your record stays in My
            records and exports. Changing access starts a fresh chat on this
            device; it cannot remove copies of earlier answers.
          </p>
        </div>
      </section>
      <div className="ns-source-section-heading">
        <h2>Records you added</h2>
        <span>
          {reports.length} {reports.length === 1 ? "record" : "records"}
        </span>
      </div>
      {reports.length === 0 ? (
        <div className="ns-source-empty">
          <FileText size={30} strokeWidth={1.3} />
          <h3>Your history starts with you.</h3>
          <p>
            Add a PDF, paste report text or enter results. You review every
            value before it becomes part of your record.
          </p>
          <button className="ns-text-button" onClick={addReport}>
            Add your first report <ArrowUpRight size={16} />
          </button>
        </div>
      ) : (
        <div className="ns-source-list">
          {reports.map((report) => (
            <article className="ns-source-item" key={report.id}>
              <div className="ns-source-icon">
                <FileText size={22} strokeWidth={1.5} />
              </div>
              <div className="ns-source-detail">
                <button
                  className="ns-source-title"
                  onClick={() => openReport(report)}
                >
                  {report.title}
                  <ArrowUpRight size={15} />
                </button>
                <p>
                  {report.lab || "Provider not recorded"} <span>·</span>{" "}
                  {report.date}
                </p>
                <dl>
                  <div>
                    <dt>Origin</dt>
                    <dd>
                      {report.source
                        ? `${report.source.method === "pdf" ? "PDF import" : report.source.method === "text" ? "Text import" : "Manual entry"} · ${report.source.label}`
                        : "Source details not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Saved</dt>
                    <dd>
                      {new Date(report.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · Confirmed by you
                    </dd>
                  </div>
                </dl>
                {report.source?.fingerprint && (
                  <details className="ns-source-fingerprint">
                    <summary>Original file fingerprint</summary>
                    <code>{report.source.fingerprint}</code>
                    <p>
                      SHA-256 of the imported file. Values may have been edited
                      during review. This identifies the file; it does not
                      verify the provider or clinical accuracy. The original
                      file is not stored.
                    </p>
                  </details>
                )}
              </div>
              <label className="ns-access-control">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Use ${report.title} in assistant`}
                  checked={report.assistantAccess !== false}
                  disabled={pending}
                  onChange={(e) => changeAccess(report, e.target.checked)}
                />
                <span>
                  Use in assistant
                  <small>
                    {report.assistantAccess === false
                      ? "Excluded"
                      : "Available"}
                  </small>
                </span>
              </label>
            </article>
          ))}
        </div>
      )}
      <section className="ns-connection-note">
        <span className="ns-eyebrow">CONNECTED RECORDS · PLANNED</span>
        <h2>Bring your history together.</h2>
        <p>
          For now, records come from your own uploads and entries. Hospital
          connections and automatic retrieval are not available. Any future
          connection will need its own authorization.
        </p>
      </section>
    </div>
  );
}
