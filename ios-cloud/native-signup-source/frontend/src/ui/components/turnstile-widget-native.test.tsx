import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnstileWidget } from "./turnstile-widget";

const platform = vi.hoisted(() => ({ name: "ios", native: true }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => platform.name, isNativePlatform: () => platform.native } }));
vi.mock("../../config", () => ({ turnstileSiteKey: "production-test-key" }));
afterEach(() => { cleanup(); document.getElementById("velora-turnstile-script")?.remove(); });

describe("native authentication without a web challenge", () => {
  for (const name of ["ios", "android"]) it(`${name} is ready without loading Cloudflare`, async () => {
    platform.name = name; platform.native = true;
    const onTokenChange = vi.fn(); const { container } = render(<TurnstileWidget onTokenChange={onTokenChange} />);
    await waitFor(() => expect(onTokenChange).toHaveBeenCalledWith(`${name}-native-bypass`));
    expect(container.textContent).toBe("");
    expect(document.getElementById("velora-turnstile-script")).toBeNull();
  });
  it("keeps website signup gated behind the real widget", async () => {
    platform.name = "web"; platform.native = false;
    const onTokenChange = vi.fn(); render(<TurnstileWidget onTokenChange={onTokenChange} />);
    expect(onTokenChange).toHaveBeenCalledWith("");
    expect(document.getElementById("velora-turnstile-script")).not.toBeNull();
    expect(onTokenChange).not.toHaveBeenCalledWith("ios-native-bypass");
    expect(onTokenChange).not.toHaveBeenCalledWith("android-native-bypass");
  });
});
