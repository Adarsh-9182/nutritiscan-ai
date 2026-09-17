"use client";
import { useEffect, useState } from "react";
import { Send, LoaderCircle, Check } from "lucide-react";

type Status = {
  configured: boolean;
  connected: boolean;
  timeZone: string | null;
  settings: { titles: boolean; morning: boolean; evening: boolean };
};

async function call<T>(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api/workspace/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Opt-in proactive messages. Nothing is sent until the person connects. */
export default function TelegramSettings({ demo }: { demo: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    call<Status>("notify")
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [demo]);

  // While a link is open, check back so the page updates once connected.
  useEffect(() => {
    if (!link || status?.connected) return;
    const timer = setInterval(() => {
      call<Status>("notify")
        .then((s) => {
          if (s.connected) {
            setStatus(s);
            setLink("");
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [link, status?.connected]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update(settings: Status["settings"]) {
    await run(async () => {
      await call("notify", "PUT", { settings, timeZone: zone() });
      setStatus((s) => (s ? { ...s, settings, timeZone: zone() } : s));
      setSaved(true);
    });
  }

  return (
    <section className="ns-card tg-card" aria-labelledby="tg-title">
      <div className="tg-head">
        <span className="tg-icon">
          <Send size={17} />
        </span>
        <div>
          <h2 className="ns-card-title" id="tg-title">
            Telegram companion
          </h2>
          <p className="ns-small-note">
            Get reminders when they’re due, a morning list and an evening
            check-in. Reply in Telegram to log meals, sleep and mood or to set
            reminders. Optional and off until you connect.
          </p>
        </div>
      </div>
      {demo ? (
        <p className="ns-small-note">
          Create an account to connect Telegram. The demo never sends messages.
        </p>
      ) : !status ? (
        error ? (
          <p role="alert" className="ns-error">
            {error}
          </p>
        ) : (
          <LoaderCircle className="ns-spin" size={18} />
        )
      ) : !status.configured ? (
        <p className="ns-small-note">
          Telegram messages aren’t switched on for this site yet.
        </p>
      ) : status.connected ? (
        <>
          <p className="tg-connected">
            <Check size={15} /> Connected · times follow {status.timeZone}
          </p>
          <div className="tg-toggles">
            {(
              [
                ["morning", "Morning list at 8:00"],
                ["evening", "Evening check-in at 21:00 if nothing is logged"],
                [
                  "titles",
                  "Show reminder titles in messages (off: “You have a reminder due”)",
                ],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="ns-check">
                <input
                  type="checkbox"
                  checked={status.settings[key]}
                  disabled={busy}
                  onChange={(e) =>
                    void update({ ...status.settings, [key]: e.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="ns-small-note">
            Messages you send the bot are processed by NutritiScan and delivered
            through Telegram, which has its own privacy terms. Telegram is not
            for emergencies.
          </p>
          <button
            className="ns-button ns-light"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call("notify", "DELETE");
                setStatus({ ...status, connected: false });
              })
            }
          >
            Disconnect Telegram
          </button>
        </>
      ) : link ? (
        <div className="tg-link">
          <a
            className="ns-button ns-dark"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send size={15} /> Open Telegram and tap Start
          </a>
          <p className="ns-small-note">
            The link works once and expires in 15 minutes. This page updates
            when you’re connected.
          </p>
        </div>
      ) : (
        <button
          className="ns-button ns-dark"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await call<{ url: string }>("notify/link", "POST", {
                timeZone: zone(),
              });
              setLink(r.url);
            })
          }
        >
          <Send size={15} /> Connect Telegram
        </button>
      )}
      {status && error && (
        <p role="alert" className="ns-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="tg-connected">
          <Check size={13} /> Saved
        </p>
      )}
    </section>
  );
}
