import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SocialSignIn from "./social-sign-in";
beforeEach(() => vi.stubGlobal("fetch",vi.fn()));
describe("social sign-in", () => {
  it("shows Google and GitHub without pretending an unconfigured provider works", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ available: true,google: { enabled: false },github: { enabled: false } }));
    render(<SocialSignIn next="/research" />);
    expect(screen.getByRole("button",{ name: "Continue with Google" })).toBeDisabled();
    expect(screen.getByRole("button",{ name: "Continue with GitHub" })).toBeDisabled();
    expect(await screen.findByText(/Google and GitHub sign-in are being configured/)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the target workspace and reports provider start failures", async () => {
    vi.mocked(fetch).mockImplementation(async (_url,options) => options?.method === "POST" ? Response.json({ error: "Please retry sign-in." },{ status: 503 }) : Response.json({ available: true,google: { enabled: true },github: { enabled: true } }));
    render(<SocialSignIn next="/research" />);
    await waitFor(() => expect(screen.getByRole("button",{ name: "Continue with GitHub" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{ name: "Continue with GitHub" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry sign-in.");
    expect(fetch).toHaveBeenCalledWith("/api/account/oauth/github/start",expect.objectContaining({ body: JSON.stringify({ next: "/research",intent: "login" }) }));
    expect(localStorage.length).toBe(0);
  });
  it("separates explicit linking from sign-in and shows the linked provider", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ available: true,google: { enabled: true,linked: true },github: { enabled: true,linked: false } }));
    render(<SocialSignIn next="/account" intent="link" />);
    expect(await screen.findByRole("button",{ name: "Google linked" })).toBeDisabled();
    expect(screen.getByRole("button",{ name: "Link GitHub" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledWith("/api/account/providers?intent=link",expect.anything());
  });
});
