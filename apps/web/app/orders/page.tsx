import Link from "next/link";
import { cartsApi } from "@/lib/carts-api";
import { getVisitor } from "@/lib/visitor";
import { ApiNotice } from "../components/ApiNotice";
import { OrderCard, orderNumber } from "../components/orders/OrderCard";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const { placed } = await searchParams;
  const visitor = await getVisitor();

  if (visitor.kind === "visitor" || visitor.kind === "guest") {
    return (
      <>
        <PageHeader title="Orders" />
        <Notice signInTo="/orders">Sign in to see your orders.</Notice>
      </>
    );
  }

  const [orders, products] = await Promise.all([cartsApi.orders(), cartsApi.products()]);
  const catalog = products.ok ? products.data : [];
  const newestFirst = orders.ok
    ? [...orders.data].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    : [];

  return (
    <>
      <PageHeader title="Orders">Everything you have ordered.</PageHeader>
      {placed && <p className="form-note ok">Order {orderNumber(placed)} placed.</p>}
      {!orders.ok ? (
        <ApiNotice result={orders} returnTo="/orders" />
      ) : newestFirst.length === 0 ? (
        <div className="empty">
          <p>No orders yet.</p>
          <Link href="/" className="btn btn-primary">
            Shop the store
          </Link>
        </div>
      ) : (
        <ul className="orders">
          {newestFirst.map((o) => (
            <OrderCard key={o.id} order={o} catalog={catalog} />
          ))}
        </ul>
      )}
    </>
  );
}
