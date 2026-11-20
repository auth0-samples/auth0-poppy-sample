import Image from "next/image";
export function Hero({ showGuestNote }: { showGuestNote: boolean }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1 className="text-balance">Your best cup starts here.</h1>
        <p className="hero-lede text-pretty">
          Single-origin beans roasted to order, plus the gear to brew them like a pro.
        </p>
        <div className="hero-actions">
          <a href="#catalog-heading" className="btn btn-primary">
            Shop beans and gear
          </a>
        </div>
        {showGuestNote && (
          <p className="hero-note">Shop as a guest. Sign in at checkout and your cart comes with you.</p>
        )}
      </div>
      <div className="hero-media">
        <Image className="hero-img" src="/hero.png" alt="A dual-boiler espresso machine pulling a shot into a porcelain cup beside a flat-burr grinder" width={1376} height={768} priority sizes="(max-width: 860px) 92vw, 600px" style={{ height: "auto" }} />
      </div>
    </section>
  );
}
