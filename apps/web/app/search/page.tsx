import { cartsApi } from "@/lib/carts-api";
import { getVisitor } from "@/lib/visitor";
import { searchProducts } from "@/lib/search";
import { ApiNotice } from "../components/ApiNotice";
import { ProductGrid } from "../components/ProductGrid";

export const metadata = { title: "Search" };

/** `/search?q=<words>`: the catalog, filtered. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q = "" }, products, visitor] = await Promise.all([searchParams, cartsApi.products(), getVisitor()]);
  const query = q.trim().slice(0, 100);
  const cart = visitor.kind === "visitor" ? undefined : await cartsApi.cart();
  const inCart = new Map((cart?.ok ? cart.data.items : []).map((i) => [i.productId, i.quantity]));
  const found = products.ok ? searchProducts(products.data, query) : [];

  return (
    <section aria-labelledby="search-heading" className="catalog">
      <form action="/search" className="search-form" role="search">
        <label className="field">
          Search the shop
          <input type="search" name="q" defaultValue={query} placeholder="Beans, grinder, kettle" />
        </label>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      <div className="catalog-head">
        <h1 id="search-heading" className="search-title">
          {query ? `Results for "${query}"` : "Search"}
        </h1>
        {query && <span className="muted">{found.length} {found.length === 1 ? "item" : "items"}</span>}
      </div>
      {!products.ok ? (
        <ApiNotice result={products} returnTo={`/search?q=${encodeURIComponent(query)}`} />
      ) : query && found.length === 0 ? (
        <p className="muted">
          No products match &quot;{query}&quot;. Try beans, machines, grinders or accessories, or <a href="/">see everything</a>.
        </p>
      ) : query ? (
        <ProductGrid products={found} inCart={inCart} />
      ) : (
        <p className="muted">Type what you are looking for, or <a href="/">browse the whole shop</a>.</p>
      )}
    </section>
  );
}
