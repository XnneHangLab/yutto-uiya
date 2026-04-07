interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <div className="placeholder-kicker">Template Slot</div>
        <h1>{title} 页面建设中</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
