import huixinLogo from '../../../assets/brand/logo-square.jpg';
import type { NavItemData, PageId } from '../../../data/nav';
import { openUrl } from '../../../services/runtime/bridge';
import type { ThemeMode } from '../../../services/theme/theme';
import { NavItem } from '../NavItem/NavItem';

interface SidebarProps {
  items: NavItemData[];
  activePage: PageId;
  onSelect: (id: PageId) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export function Sidebar({
  items,
  activePage,
  onSelect,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const primaryItems = items.filter((item) => item.section === 'primary');
  const secondaryItems = items.filter((item) => item.section === 'secondary');
  const handleSelect = (item: NavItemData) => {
    if (item.type === 'action') {
      onToggleTheme();
      return;
    }
    if (item.type === 'link') {
      void openUrl(item.href);
      return;
    }
    onSelect(item.id);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={huixinLogo} alt="绘心 Logo" />
        <span>绘心</span>
      </div>

      <nav className="nav" aria-label="主导航">
        {primaryItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={item.id === activePage}
            onSelect={handleSelect}
          />
        ))}

        <div className="nav-spacer" />

        {secondaryItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={
              item.type === 'action' ? theme === 'day' : item.id === activePage
            }
            onSelect={handleSelect}
          />
        ))}
      </nav>
    </aside>
  );
}
