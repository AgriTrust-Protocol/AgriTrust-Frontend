/**
 * Tests for the declarative PermissionGate component: hide / disable /
 * redirect fallback modes, render-prop children, and synchronous
 * re-render of active gates when the wallet role changes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PermissionGate } from "@/src/components/common/PermissionGate";
import { defaultRoleStore } from "@/src/stores/roleStore";
import { useWallet } from "@/src/hooks/useWallet";
import type { UseWalletSyncReturn } from "@/src/hooks/useWallet";

vi.mock("@/src/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const replaceMock = vi.fn();

const mockedUseWallet = vi.mocked(useWallet);

function mockAccount(account: string | null) {
  mockedUseWallet.mockReturnValue({
    account,
    status: account ? "ready" : "disconnected",
    chainId: null,
    isSwitching: false,
    provider: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    activeTabs: 1,
  } satisfies UseWalletSyncReturn);
}

beforeEach(() => {
  defaultRoleStore.reset();
  replaceMock.mockClear();
  mockAccount("0xmanager");
});

describe("PermissionGate", () => {
  it("renders children when access is granted", () => {
    defaultRoleStore.setWalletRole("0xmanager", "CERTIFICATION_MANAGER");
    render(
      <PermissionGate resource="certificate" action="issue">
        <button type="button">Issue Certificate</button>
      </PermissionGate>,
    );
    expect(screen.getByRole("button", { name: "Issue Certificate" })).toBeInTheDocument();
  });

  it('renders nothing in "hide" mode when denied', () => {
    defaultRoleStore.setWalletRole("0xviewer", "VIEWER");
    mockAccount("0xviewer");
    render(
      <PermissionGate resource="certificate" action="revoke">
        <button type="button">Revoke Certificate</button>
      </PermissionGate>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it('clones children with disabled prop in "disable" mode when denied', () => {
    defaultRoleStore.setWalletRole("0xinspector", "FIELD_INSPECTOR");
    mockAccount("0xinspector");
    render(
      <PermissionGate resource="certificate" action="revoke" fallback="disable">
        <button type="button">Revoke Certificate</button>
      </PermissionGate>,
    );
    const button = screen.getByRole("button", { name: "Revoke Certificate" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it('navigates in "redirect" mode when denied', () => {
    defaultRoleStore.setWalletRole("0xviewer", "VIEWER");
    mockAccount("0xviewer");
    render(
      <PermissionGate
        resource="organization"
        action="admin"
        fallback="redirect"
        redirectTo="/settings"
      >
        <div>Admin panel</div>
      </PermissionGate>,
    );
    expect(replaceMock).toHaveBeenCalledWith("/settings");
    expect(screen.queryByText("Admin panel")).not.toBeInTheDocument();
  });

  it("supports a render-prop child receiving can + role", () => {
    defaultRoleStore.setWalletRole("0xinspector", "FIELD_INSPECTOR");
    mockAccount("0xinspector");
    let observedCan: boolean | undefined;
    render(
      <PermissionGate resource="certificate" action="verify">
        {({ can, role }) => {
          observedCan = can("certificate", "verify");
          return <span data-testid="ctx">{`${can("batch", "update")}:${role}`}</span>;
        }}
      </PermissionGate>,
    );
    expect(observedCan).toBe(true);
    expect(screen.getByTestId("ctx")).toHaveTextContent("true:FIELD_INSPECTOR");
  });

  it("denies anonymous (disconnected) users", () => {
    mockAccount(null);
    render(
      <PermissionGate resource="dashboard" action="read">
        <div>Dashboard content</div>
      </PermissionGate>,
    );
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("re-renders all gates within 100ms of a wallet role update", async () => {
    defaultRoleStore.setWalletRole("0xmanager", "VIEWER");
    const { getByTestId } = render(
      <>
        <PermissionGate resource="certificate" action="issue" fallback="hide">
          <span data-testid="gate-a">A</span>
        </PermissionGate>
        <PermissionGate resource="certificate" action="revoke" fallback="hide">
          <span data-testid="gate-b">B</span>
        </PermissionGate>
      </>,
    );

    // VIEWER may neither issue nor revoke: both gates hidden.
    expect(screen.queryByTestId("gate-a")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-b")).not.toBeInTheDocument();

    const start = performance.now();
    act(() => {
      // Contract role event arrives → store notifies synchronously.
      defaultRoleStore.setWalletRole("0xmanager", "CERTIFICATION_MANAGER");
    });
    const elapsed = performance.now() - start;

    // Both gates flipped open within a single synchronous commit.
    expect(getByTestId("gate-a")).toBeInTheDocument();
    expect(getByTestId("gate-b")).toBeInTheDocument();
    expect(elapsed).toBeLessThan(100);
  });
});
