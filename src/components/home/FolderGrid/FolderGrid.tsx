import { placeholderFolders } from '../../../data/home';
import type { ManagedFolderItem } from '../../../services/runtime/runtime';
import { FolderCard } from '../FolderCard/FolderCard';

interface FolderGridProps {
  items: ManagedFolderItem[];
  onOpen: (pathKey: string) => void;
}

export function FolderGrid({ items, onOpen }: FolderGridProps) {
  if (items.length > 0) {
    return (
      <div className="folder-grid">
        {items.map((item) => (
          <FolderCard key={item.key} item={item} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  return (
    <div className="folder-grid">
      {placeholderFolders.map((item) => (
        <div key={item.key} className="folder-card folder-card--skeleton" aria-hidden="true">
          <span className="folder-left">
            <span className="folder-icon skel-block" />
            <span className="folder-text">
              <span className="skel-block skel-block--title" />
              <span className="skel-block skel-block--sub" />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
