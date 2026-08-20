import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/src/components/providers/ThemeProvider";
import { ThemeToggle } from "@/src/components/layout/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("persists the high-contrast theme selection when toggled", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole("button", { name: /toggle high contrast mode/i });
    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(localStorage.getItem("a11y-theme")).toBe("highContrastLight");
    expect(document.documentElement.dataset.theme).toBe("highContrastLight");
  });
});
