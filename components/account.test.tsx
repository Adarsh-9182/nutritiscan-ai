import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccountLogin from "./account-login";
import AccountControls from "./account-controls";
import AccountWorkspace from "./account-workspace";
import { publicPlans } from "@/lib/billing/config";
const anonymous = { configured: true, account: null, plan: "free", subscription: null, plans: publicPlans(), checkoutAvailable: false, premiumModelsEnabled: false, billingAvailable: true };
beforeEach(() => { vi.stubGlobal("fetch",vi.fn(async () => Response.json(anonymous))); });
describe("shared account and subscription experience", () => {
  it("offers an upgrade comparison without accepting money when billing is unconfigured", async () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    render(<AccountControls returnTo="/research" />);
    expect(await screen.findByRole("link",{ name: "Sign in" })).toHaveAttribute("href","/login?next=%2Fresearch");
    fireEvent.click(screen.getByRole("button",{ name: "Upgrade" }));
    expect(screen.getByRole("dialog",{ name: "Upgrade your workspace" })).toBeVisible();
    expect(screen.getAllByRole("button",{ name: "Checkout opens soon" })).toHaveLength(2);
    for (const button of screen.getAllByRole("button",{ name: "Checkout opens soon" })) expect(button).toBeDisabled();
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("uses the existing account service and reports incorrect credentials", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("/auth/login") ? Response.json({ detail: "Email or password is incorrect." },{ status: 401 }) : Response.json({ available: true, google: { enabled: false }, github: { enabled: false } }));
    render(<AccountLogin next="/research" />);
    fireEvent.change(screen.getByLabelText("Email"),{ target: { value: "synthetic@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"),{ target: { value: "synthetic-password-123" } });
    fireEvent.click(screen.getByRole("button",{ name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(fetch).toHaveBeenCalledWith("/api/health/auth/login",expect.objectContaining({ method: "POST" }));
    expect(localStorage.length).toBe(0);
  });
  it("requires a separate confirmation before canceling renewal", async () => {
    const paid = { ...anonymous, account: { id: "synthetic-account",expiresAt: 1790000000 }, plan: "pro", management: { provider: "razorpay",cancelAtPeriodEnd: false }, subscription: { plan: "pro",periodEnd: "2026-11-30T00:00:00Z",cancelAtPeriodEnd: false,budgetMicrousd: 5_000_000,usedMicrousd: 100_000 } };
    vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("/cancel") ? Response.json({ canceled: true,message: "Renewal has been canceled." }) : Response.json(paid));
    render(<AccountWorkspace />);
    fireEvent.click(await screen.findByRole("button",{ name: "Cancel renewal" }));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/cancel"))).toBe(false);
    fireEvent.click(screen.getByRole("button",{ name: "Confirm cancellation" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/billing/cancel",{ method: "POST" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Renewal has been canceled.");
  });
});
