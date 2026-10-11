/**
 * A gear-shift lever (adapted from a community "lever switch"; its markup used HTML `class`, and it shipped no CSS,
 * so the styles in index.css are ours). The stick tilts from the left gate to the right gate.
 */
export function LeverSwitch({
  checked,
  onChange,
  disabled,
  label,
  gates = ['', ''],
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  gates?: [string, string]; // letters on the plate: off side, on side
}) {
  return (
    <div className="toggle-container">
      <input
        className="toggle-input"
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="toggle-handle-wrapper">
        <div className="toggle-handle">
          <div className="toggle-handle-knob" />
          <div className="toggle-handle-bar-wrapper">
            <div className="toggle-handle-bar" />
          </div>
        </div>
      </div>
      <div className="toggle-base">
        <span className="toggle-gate toggle-gate--left" aria-hidden="true">{gates[0]}</span>
        <div className="toggle-base-inside" />
        <span className="toggle-gate toggle-gate--right" aria-hidden="true">{gates[1]}</span>
      </div>
    </div>
  );
}
