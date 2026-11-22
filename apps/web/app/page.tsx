import { cartsApi } from "@/lib/carts-api";
import { categoryHref } from "@/lib/format";
import { getVisitor } from "@/lib/visitor";
import { ApiNotice } from "./components/ApiNotice";
import { Hero } from "./components/home/Hero";
import { ProductGrid } from "./components/ProductGrid";
import { FilterChips } from "./components/ui/FilterChips";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [{ category }, products, visitor] = await Promise.all([searchParams, cartsApi.products(), getVisitor()]);
  // A visitor has no session, so no cart to look up yet.
  const cart = visitor.kind === "visitor" ? undefined : await cartsApi.cart();
  const inCart = new Map((cart?.ok ? cart.data.items : []).map((i) => [i.productId, i.quantity]));
  const all = products.ok ? products.data : [];
  const categories = [...new Set(all.map((p) => p.category).filter((c): c is string => Boolean(c)))];
  const active = categories.find((c) => c.toLowerCase() === category?.toLowerCase());
  const shown = active ? all.filter((p) => p.category === active) : all;

  const chips = [
    { label: "All", href: "/", current: !active },
    ...categories.map((c) => ({ label: c, href: categoryHref(c), current: c === active }))
  ];

  return (
    <>
      <Hero showGuestNote={visitor.kind === "visitor" || visitor.kind === "guest"} />

      <section aria-labelledby="catalog-heading" className="catalog">
        <div className="catalog-head">
          <h2 id="catalog-heading">{active ?? "Beans and gear"}</h2>
          <span className="muted">{shown.length} items</span>
        </div>

        {categories.length > 0 && <FilterChips label="Categories" chips={chips} />}

        {!products.ok ? (
          <ApiNotice result={products} returnTo="/" />
        ) : shown.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <ProductGrid products={shown} inCart={inCart} />
        )}
      </section>
    </>
  );
}
