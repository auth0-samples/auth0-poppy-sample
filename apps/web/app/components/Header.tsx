import Link from "next/link";
import { getVisitor } from "@/lib/visitor";
import { CartLink } from "./CartLink";
import { NavLinks } from "./NavLinks";

export async function Header() {
  const visitor = await getVisitor();
  const signedIn = visitor.kind === "person";

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden />
            Drift Bean Demo
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLinks />
          </nav>
          <div className="auth">
            {visitor.kind === "person" && <span className="who">{visitor.name}</span>}
            {visitor.kind === "guest" && <span className="who">Guest</span>}
            <CartLink />
            {signedIn ? (
              <a href="/auth/logout" className="btn btn-ghost">
                Log out
              </a>
            ) : (
              <>
                <a href="/auth/login" className="btn btn-ghost">
                  Log in
                </a>
                <a href="/auth/login?screen_hint=signup" className="btn btn-primary">
                  Sign up
                </a>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
