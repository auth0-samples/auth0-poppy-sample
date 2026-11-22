import { cartsApi } from "@/lib/carts-api";
import { getVisitor } from "@/lib/visitor";
import { ApiNotice } from "../components/ApiNotice";
import { CartLines } from "../components/cart/CartLines";
import { CartSummary } from "../components/cart/CartSummary";
import { EmptyCart } from "../components/cart/EmptyCart";
import { toRows } from "../components/cart/rows";
import { PageHeader } from "../components/ui/PageHeader";

export default async function CartPage() {
  const visitor = await getVisitor();
  // No session yet means nothing was added: the first "Add to cart" starts a guest session.
  if (visitor.kind === "visitor") {
    return (
      <>
        <PageHeader title="Your cart" />
        <EmptyCart />
      </>
    );
  }

  const [cart, products] = await Promise.all([cartsApi.cart(), cartsApi.products()]);
  if (!cart.ok) {
    return (
      <>
        <PageHeader title="Your cart" />
        <ApiNotice result={cart} returnTo="/cart" />
      </>
    );
  }

  const rows = toRows(cart.data, products.ok ? products.data : []);

  return (
    <>
      <PageHeader title="Your cart" />
      {rows.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="cart-layout">
          <CartLines rows={rows} />
          <CartSummary
            count={rows.reduce((n, r) => n + r.quantity, 0)}
            totalCents={rows.reduce((n, r) => n + r.line, 0)}
            guest={visitor.kind === "guest"}
          />
        </div>
      )}
    </>
  );
}
