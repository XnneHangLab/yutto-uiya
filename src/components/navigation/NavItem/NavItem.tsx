import type { NavItemData } from '../../../data/nav';

interface NavItemProps {
  item: NavItemData;
  active: boolean;
  onSelect: (item: NavItemData) => void;
}

export function NavItem({ item, active, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      className={`nav-item${active ? ' active' : ''}`}
      aria-pressed={active}
      onClick={() => onSelect(item)}
    >
      <span className="nav-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
    </button>
  );
}
