import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { WalletConnector } from "@/src/components/wallet/WalletConnector";
import * as useWalletModule from "@/src/hooks/useWallet";

vi.mock("@/src/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

describe("WalletConnector", () => {
  it("renders connect button and handles connect flow", async () => {
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(useWalletModule, "useWallet").mockReturnValue({
      status: "disconnected",
      account: null,
      connect: mockConnect,
      disconnect: vi.fn(),
    } as unknown as useWalletModule.UseWalletSyncReturn);

    render(<WalletConnector />);
    
    expect(screen.getByText("Wallet status: disconnected")).toBeInTheDocument();
    
    const connectBtn = screen.getByRole("button", { name: "Connect wallet" });
    await userEvent.click(connectBtn);
    
    expect(mockConnect).toHaveBeenCalled();
  });

  it("shows error when connection fails", async () => {
    const mockConnect = vi.fn().mockRejectedValue(new Error("User rejected request"));
    vi.spyOn(useWalletModule, "useWallet").mockReturnValue({
      status: "disconnected",
      account: null,
      connect: mockConnect,
      disconnect: vi.fn(),
    } as unknown as useWalletModule.UseWalletSyncReturn);

    render(<WalletConnector />);
    
    const connectBtn = screen.getByRole("button", { name: "Connect wallet" });
    await userEvent.click(connectBtn);
    
    expect(await screen.findByRole("alert")).toHaveTextContent("User rejected request");
  });

  it("shows disconnect button when connected", async () => {
    const mockDisconnect = vi.fn();
    vi.spyOn(useWalletModule, "useWallet").mockReturnValue({
      status: "connected",
      account: { address: "0x123" },
      connect: vi.fn(),
      disconnect: mockDisconnect,
    } as unknown as useWalletModule.UseWalletSyncReturn);

    render(<WalletConnector />);
    
    expect(screen.getByText("Wallet status: connected")).toBeInTheDocument();
    
    const disconnectBtn = screen.getByRole("button", { name: "Disconnect wallet" });
    await userEvent.click(disconnectBtn);
    
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
