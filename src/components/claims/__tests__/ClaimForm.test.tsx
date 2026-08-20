import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ClaimForm } from "@/src/components/claims/ClaimForm";

describe("ClaimForm interactions", () => {
  it("navigates through steps and submits successfully", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ClaimForm onSubmit={onSubmit} />);

    // STEP 1
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    
    const continueBtn = screen.getByRole("button", { name: "Continue" });
    expect(continueBtn).toBeDisabled();

    // Fill form
    await user.type(screen.getByLabelText(/Crop/), "Winter Wheat");
    await user.type(screen.getByLabelText(/Field name/), "North 40");
    await user.type(screen.getByLabelText(/Location/), "Kansas");
    // For date input
    const dateInput = screen.getByLabelText(/Incident date/);
    await user.type(dateInput, "2026-08-15");

    // After filling required fields, continue is enabled
    expect(continueBtn).toBeEnabled();
    await user.click(continueBtn);

    // STEP 2
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    
    // Fill description
    await user.type(screen.getByLabelText(/What happened\?/), "Heavy rain damage");
    
    // Toggle parametric checkbox
    const parametricCheck = screen.getByRole("checkbox", { name: /Enable automatic drought payout/i });
    expect(parametricCheck).toBeChecked(); // default is true
    await user.click(parametricCheck);
    expect(parametricCheck).not.toBeChecked();

    const continueBtn2 = screen.getByRole("button", { name: "Continue" });
    expect(continueBtn2).toBeEnabled();
    await user.click(continueBtn2);

    // STEP 3 (Review)
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("Winter Wheat")).toBeInTheDocument();
    expect(screen.getByText("North 40")).toBeInTheDocument();
    expect(screen.getByText("Heavy rain damage")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Submit claim" });
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      crop: "Winter Wheat",
      field: "North 40",
      location: "Kansas",
      incidentDate: "2026-08-15",
      description: "Heavy rain damage",
      parametric: false,
    }));
  });
});
