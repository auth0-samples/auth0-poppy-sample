import Link from "next/link";
import { formatPrice } from "@/lib/format";

const GUEST_NOTE = "Shopping as a guest. Sign in at checkout and your cart comes with you.";

export function CartSummary({
  count,
  totalCents,
  guest
}: {
  count: number;
  totalCents: number;
  guest?: boolean;
}) {
  return (
    <aside className="summary" aria-label="Order summary">
      <h2>Summary</h2>
      <dl className="summary-rows">
        <div>
          <dt>Items</dt>
          <dd>{count}</dd>
        </div>
        <div className="summary-total">
          <dt>Total</dt>
          <dd>{formatPrice(totalCents)}</dd>
        </div>
      </dl>
      {guest && <p className="summary-note">{GUEST_NOTE}</p>}
      <Link href="/checkout" className="btn btn-primary">
        Check out
      </Link>
    </aside>
  );
}
