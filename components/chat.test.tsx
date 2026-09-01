/**
 * The conversation surface, as a user meets it.
 *
 * Everything here was previously only ever checked by opening a browser and
 * looking, which is why the composer could be in two places at once and
 * nothing would say so. These assert the shape the interface promises —
 * where the input is, what the empty screen offers, that a follow-up asks a
 * question, and that editing a message drops the answers that were reasoning
 * about the old wording.
 *
 * Deliberately not pixel assertions: layout is the reviewer's job. These
 * cover the structure the layout depends on.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Chat from "./chat";
import { demoProfile } from "@/lib/memory/profile";
import { newThread, readActiveThread, saveThread } from "@/lib/memory/store";
import type { UIMessage } from "ai";

/**
 * The transport is the network. Stubbing `useChat` instead would test a
 * mock; stubbing fetch leaves the real hook, the real streaming protocol and
 * the real message parts in place, which is where the behaviour under test
 * actually lives.
 */
function streamOf(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(`data: ${c}\n\n`));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

const answer = (text: string) =>
  streamOf([
    JSON.stringify({ type: "start" }),
    JSON.stringify({ type: "text-start", id: "t1" }),
    JSON.stringify({ type: "text-delta", id: "t1", delta: text }),
    JSON.stringify({ type: "text-end", id: "t1" }),
    JSON.stringify({ type: "finish" }),
  ]);

const msg = (role: UIMessage["role"], text: string): UIMessage =>
  ({ id: `m_${Math.random().toString(36).slice(2)}`, role, parts: [{ type: "text", text }] }) as UIMessage;

/** Seed a conversation that already has a turn in it. */
function seed(messages: UIMessage[]) {
  const thread = readActiveThread();
  saveThread(thread.id, messages);
  return thread;
}

beforeEach(() => {
  // A Response body can only be consumed once, so build a new one per call.
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => answer("Aim for 1.6 g per kg.")));
});

/** The transcript region, so assertions cannot match the header's title. */
const transcript = () => within(screen.getByRole("log"));

describe("the empty screen", () => {
  it("puts the composer on the page, not a panel footer under a transcript", async () => {
    render(<Chat profile={demoProfile} />);
    // The greeting is the page; the input is the thing to do next.
    expect(await screen.findByText(/how are you feeling/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/describe how you feel/i)).toBeInTheDocument();
  });

  it("offers openers, and one of them starts the conversation", async () => {
    render(<Chat profile={demoProfile} />);
    const opener = await screen.findByRole("button", { name: "Am I eating enough protein?" });
    fireEvent.click(opener);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(transcript().getByText("Am I eating enough protein?")).toBeInTheDocument();
  });

  it("shows exactly one composer — never the centred and the floating one at once", async () => {
    render(<Chat profile={demoProfile} />);
    await screen.findByText(/how are you feeling/i);
    expect(screen.getAllByLabelText(/describe how you feel/i)).toHaveLength(1);
  });
});

describe("a running conversation", () => {
  it("replaces the greeting with the transcript once something is said", async () => {
    seed([msg("user", "Am I eating enough protein?"), msg("assistant", "Aim for 1.6 g per kg.")]);
    render(<Chat profile={demoProfile} />);

    expect(await screen.findByText("Aim for 1.6 g per kg.")).toBeInTheDocument();
    expect(screen.queryByText(/how are you feeling/i)).not.toBeInTheDocument();
    // Still exactly one composer, now the floating one.
    expect(screen.getAllByLabelText(/describe how you feel/i)).toHaveLength(1);
  });

  it("suggests where to go next, and the suggestion asks the question", async () => {
    seed([msg("user", "Am I eating enough protein?"), msg("assistant", "Aim for 1.6 g per kg.")]);
    render(<Chat profile={demoProfile} />);

    const next = await screen.findByText(/ask next/i);
    const list = next.parentElement!;
    const [first] = within(list).getAllByRole("button");
    const question = first.textContent!.replace(/\+$/, "").trim();

    fireEvent.click(first);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(question)).toBeInTheDocument();
  });

  it("never suggests something already asked in this conversation", async () => {
    // A suggestion the reader typed two turns ago is the clearest possible
    // signal that nothing is listening.
    seed([msg("user", "Am I eating enough protein?"), msg("assistant", "Aim for 1.6 g per kg.")]);
    render(<Chat profile={demoProfile} />);

    const next = await screen.findByText(/ask next/i);
    for (const b of within(next.parentElement!).getAllByRole("button")) {
      expect(b.textContent).not.toContain("Am I eating enough protein?");
    }
  });
});

describe("editing an earlier message", () => {
  it("drops the answers that were reasoning about the old wording", async () => {
    // Keeping them would render a conversation that never happened, which in
    // a clinical transcript is worse than losing them.
    seed([msg("user", "I have had a fever since Tuesday."), msg("assistant", "Three days of fever is worth watching.")]);
    render(<Chat profile={demoProfile} />);

    fireEvent.click(await screen.findByRole("button", { name: /edit this message/i }));
    const box = screen.getByLabelText(/edit your message/i);
    fireEvent.change(box, { target: { value: "I have had a fever since Monday." } });
    fireEvent.click(screen.getByRole("button", { name: /ask again/i }));

    expect(await screen.findByText("I have had a fever since Monday.")).toBeInTheDocument();
    // Scoped to the transcript: the header still carries the thread's title,
    // which was derived from the original wording and is not part of the
    // conversation being rewritten.
    await waitFor(() => {
      expect(transcript().queryByText("Three days of fever is worth watching.")).not.toBeInTheDocument();
      expect(transcript().queryByText("I have had a fever since Tuesday.")).not.toBeInTheDocument();
    });
  });

  it("says plainly that it is not recoverable, before you commit to it", async () => {
    seed([msg("user", "fever since Tuesday"), msg("assistant", "noted")]);
    render(<Chat profile={demoProfile} />);

    fireEvent.click(await screen.findByRole("button", { name: /edit this message/i }));
    expect(screen.getByText(/replies after this one will be replaced/i)).toBeInTheDocument();
  });
});

describe("conversations", () => {
  it("keeps each thread's messages to itself", async () => {
    const first = seed([msg("user", "fever since Tuesday"), msg("assistant", "noted")]);
    render(<Chat profile={demoProfile} />);
    expect(await transcript().findByText("fever since Tuesday")).toBeInTheDocument();

    const second = newThread();
    expect(second.id).not.toBe(first.id);

    // Switching conversations remounts the transcript; the previous one must
    // not bleed through into the new, empty thread.
    await waitFor(() => expect(screen.queryByRole("log")).not.toBeInTheDocument());
    expect(screen.getByText(/how are you feeling/i)).toBeInTheDocument();
  });
});
