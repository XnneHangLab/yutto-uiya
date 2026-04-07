import { FolderGrid } from '../../components/home/FolderGrid/FolderGrid';
import { HeroBanner } from '../../components/home/HeroBanner/HeroBanner';
import { NoticePanel } from '../../components/home/NoticePanel/NoticePanel';
import { notices, versionMeta } from '../../data/home';
import type { ManagedFolderItem } from '../../services/runtime/runtime';
import '../../styles/home.css';

interface HomePageProps {
  folders: ManagedFolderItem[];
  onOpenPath: (pathKey: string) => void;
  onOpenModels: () => void;
}

export function HomePage({
  folders,
  onOpenPath,
  onOpenModels,
}: HomePageProps) {
  return (
    <div className="home-page">
      <HeroBanner />

      <div className="main-grid">
        <div>
          <h2 className="section-title">文件夹</h2>
          <FolderGrid items={folders} onOpen={onOpenPath} />

          <div className="meta">
            {versionMeta.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>

        <NoticePanel
          notices={notices}
          onOpenModels={onOpenModels}
        />
      </div>
    </div>
  );
}
