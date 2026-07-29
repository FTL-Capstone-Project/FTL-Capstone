// ── shared: inline "Try again" link-button · owner: David ──
// Every fetch-error state used to end with "Please try again." — an instruction with nothing to
// click, so the only real retry was a full browser reload. This gives those states a one-click
// affordance. Styled as an inline text button (not a block button) so it drops into the existing
// dim sentence without a layout change.
const RetryButton = ({ onClick, label = "Try again" }) => {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", padding: 0, font: "inherit",
        color: "var(--primary)", fontWeight: 700, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
};

export default RetryButton;
