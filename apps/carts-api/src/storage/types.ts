import type { ShippingAddress } from '../shipping.js';
import type { PaymentRecord } from '../payments.js';
// Storage contracts. The app talks only to these interfaces, so moving to a database means writing one new
// implementation file next to `memory.ts` and changing `createStores()` in `index.ts`.

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface PricedCartLine extends CartLine {
  name: string;
  priceCents: number;
  lineTotalCents: number;
}

export interface Order {
  id: string;
  createdAt: string;
  items: PricedCartLine[];
  totalCents: number;
  /** The account that placed it: `claims.sub` of a signed-in request. */
  account: string;
  /** Who placed it for the customer (such as an agent's URL), else `null` when the customer placed it. */
  placedVia: string | null;
  /** The simulated payment. Absent on orders stored before checkout took a payment. */
  payment?: PaymentRecord;
  /** The sample delivery address. Absent on orders stored before checkout recorded one. */
  shipping?: ShippingAddress;
}

/** Carts keyed by an opaque cart key, such as `user:${claims.sub}`. */
export interface CartStore {
  get(cartKey: string): Promise<CartLine[]>;
  /** Adds the item, or sets its quantity when it is already in the cart. */
  setItem(cartKey: string, productId: string, quantity: number): Promise<CartLine[]>;
  removeItem(cartKey: string, productId: string): Promise<CartLine[]>;
  clear(cartKey: string): Promise<void>;
  /**
   * Returns the cart's lines and deletes the cart, as one step, so two checkouts of one cart cannot both take it and an
   * item added during checkout lands in a new cart instead of being lost.
   */
  take(cartKey: string): Promise<CartLine[]>;
  /** Puts lines taken by `take` back (adding quantities, capped at `MAX_QUANTITY`), when the checkout did not go ahead. */
  restore(cartKey: string, lines: CartLine[]): Promise<void>;
  /**
   * Moves every line of `fromKey` into `toKey` (adding quantities, capped at `MAX_QUANTITY`) and deletes `fromKey`, as
   * one step: a database implementation needs a transaction. Returns how many lines moved; a second call moves none.
   */
  merge(fromKey: string, toKey: string): Promise<number>;
}

/** The most of one product a cart line holds, the same limit `POST /cart/items` applies. */
export const MAX_QUANTITY = 99;

/** Orders, listed by account. */
export interface OrderStore {
  add(order: Order): Promise<Order>;
  listByAccount(account: string): Promise<Order[]>;
}
