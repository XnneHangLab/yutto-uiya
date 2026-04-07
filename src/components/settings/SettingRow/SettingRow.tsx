import type { PropsWithChildren, ReactNode } from 'react';

interface SettingRowProps extends PropsWithChildren {
  name: string;
  description?: string;
  icon?: string;
  trailing?: ReactNode;
  inset?: boolean;
}

export function SettingRow({
  name,
  description,
  icon,
  trailing,
  inset = false,
  children,
}: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-main">
        {icon ? (
          <div className="setting-icon" aria-hidden="true">
            {icon}
          </div>
        ) : null}

        <div className={`setting-text${inset ? ' inset' : ''}`}>
          <div className="setting-name">{name}</div>
          {description ? <div className="setting-desc">{description}</div> : null}
        </div>
      </div>

      <div className="setting-action">
        {children}
        {trailing}
      </div>
    </div>
  );
}
