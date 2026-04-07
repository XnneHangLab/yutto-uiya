import type { SettingsTab, SettingsTabId } from '../../../data/settings';

interface SettingsTabsProps {
  items: SettingsTab[];
  activeTab: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
}

export function SettingsTabs({
  items,
  activeTab,
  onSelect,
}: SettingsTabsProps) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="设置标签">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`settings-tab-${item.id}`}
          aria-controls={`settings-panel-${item.id}`}
          aria-selected={item.id === activeTab}
          tabIndex={item.id === activeTab ? 0 : -1}
          className={`settings-tab${item.id === activeTab ? ' active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
