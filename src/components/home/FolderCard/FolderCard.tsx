import type { ManagedFolderItem } from '../../../services/runtime/runtime';

interface FolderCardProps {
  item: ManagedFolderItem;
  onOpen: (pathKey: string) => void;
}

export function FolderCard({ item, onOpen }: FolderCardProps) {
  return (
    <button
      type="button"
      className="folder-card"
      aria-label={`打开 ${item.title}`}
      onClick={() => onOpen(item.key)}
    >
      <span className="folder-left">
        <span className="folder-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="folder-text">
          <span className="folder-title">{item.title}</span>
          <span className="folder-sub">{item.path}</span>
        </span>
      </span>

      <span className="arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
