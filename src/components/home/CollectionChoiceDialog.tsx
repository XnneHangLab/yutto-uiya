import { useEffect, useRef } from 'react';

export function CollectionChoiceDialog({
  title,
  onChoose,
}: {
  title: string;
  onChoose: (choice: 'video' | 'collection' | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="collection-choice-dialog"
      aria-labelledby="collection-choice-title"
      onCancel={(event) => {
        event.preventDefault();
        onChoose(null);
      }}
    >
      <h2 id="collection-choice-title">选择解析范围</h2>
      <p>当前视频属于合集「{title}」。请选择要解析的内容。</p>
      <div className="collection-choice-dialog__actions">
        <button type="button" onClick={() => onChoose('video')}>
          当前视频（全部分 P）
        </button>
        <button type="button" onClick={() => onChoose('collection')}>
          整个合集
        </button>
        <button type="button" onClick={() => onChoose(null)}>
          取消
        </button>
      </div>
    </dialog>
  );
}
