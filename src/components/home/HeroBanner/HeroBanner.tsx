import { heroCopy } from '../../../data/home';

export function HeroBanner() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-copy__eyebrow">{heroCopy.eyebrow}</div>
        <h1>{heroCopy.title}</h1>
        <p>{heroCopy.description}</p>
      </div>
    </section>
  );
}
