interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function ToggleSwitch({
  label,
  checked,
  onChange,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      className={`switch${checked ? ' on' : ''}`}
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    />
  );
}
