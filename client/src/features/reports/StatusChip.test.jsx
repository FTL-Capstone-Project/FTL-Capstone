// ── closure loop (StatusChip) · tests · owner: Ozias ──
// Card G1·03: confirm the closure chip renders for all four real review_status
// values (now written live by PATCH /api/indicators/:id/review), and renders
// nothing for an unknown/missing status.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusChip from "./StatusChip.jsx";

// [status value sent by the API] → [label the user should see]
const CASES = [
  ["pending review", "Pending review"],
  ["investigating", "Investigating"],
  ["confirmed malicious", "Confirmed malicious"],
  ["confirmed safe", "Confirmed safe"],
];

describe("StatusChip", () => {
  it.each(CASES)("renders the %s chip with its label", (status, label) => {
    render(<StatusChip status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders nothing for an unknown status", () => {
    const { container } = render(<StatusChip status="totally bogus" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when status is missing", () => {
    const { container } = render(<StatusChip status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
