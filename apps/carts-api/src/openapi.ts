import { CATEGORIES } from './catalog.js';
import { SCOPES } from './accounts.js';
import { MAX_QUANTITY } from './storage/index.js';

// The OpenAPI 3.1 document clients read to learn the API, at `GET /openapi.json`. `auth0 poppy setup --api-url`
// points at it, so the storefront's discovery document can list it under `apis`.

const error = { $ref: '#/components/schemas/Error' };
const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: error } } });
const bearerSecurity = [{ bearer: [] }];

export function openApiDocument(publicUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Drift Bean Demo Carts API',
      version: '0.1.0',
      description:
        'Cart and checkout for the Drift Bean Demo coffee store. Browsing needs no token. The cart works with a guest (anonymous session) token or an account token; orders need an account token.',
    },
    servers: [{ url: publicUrl }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'An Auth0 access token for this API.' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'string' }, error_description: { type: 'string' } },
        },
        Product: {
          type: 'object',
          required: ['id', 'name', 'priceCents', 'images', 'description', 'category', 'weightGrams'],
          properties: {
            id: { type: 'string', examples: ['beans-konga'] },
            name: { type: 'string' },
            priceCents: { type: 'integer', description: 'USD cents.' },
            images: { type: 'array', items: { type: 'string' }, description: 'Paths on the storefront origin.' },
            description: { type: 'string' },
            category: { type: 'string', enum: [...CATEGORIES] },
            weightGrams: { type: 'integer' },
          },
        },
        CartLine: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            quantity: { type: 'integer' },
            name: { type: 'string' },
            priceCents: { type: 'integer' },
            lineTotalCents: { type: 'integer' },
          },
        },
        Cart: {
          type: 'object',
          properties: {
            cartKey: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartLine' } },
            totalCents: { type: 'integer' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartLine' } },
            totalCents: { type: 'integer' },
            placedVia: { type: ['string', 'null'], description: 'Who placed it for the customer, or null when the customer did.' },
          },
        },
      },
    },
    paths: {
      '/products': {
        get: {
          operationId: 'listProducts',
          summary: 'List products',
          parameters: [{ name: 'category', in: 'query', required: false, schema: { type: 'string', enum: [...CATEGORIES] } }],
          responses: {
            200: {
              description: 'The catalog.',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { products: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } },
                },
              },
            },
          },
        },
      },
      '/products/{id}': {
        get: {
          operationId: 'getProduct',
          summary: 'Get one product',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'The product.',
              content: { 'application/json': { schema: { type: 'object', properties: { product: { $ref: '#/components/schemas/Product' } } } } },
            },
            404: errorResponse('No product with that id.'),
          },
        },
      },
      '/cart': {
        get: {
          operationId: 'getCart',
          summary: 'Read the cart',
          description: 'Works with a guest token. POST /cart/merge moves a guest cart into the account at sign-in.',
          security: bearerSecurity,
          responses: {
            200: { description: 'The cart.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Cart' } } } },
            401: errorResponse('No token, or an invalid or expired one.'),
          },
        },
      },
      '/cart/items': {
        post: {
          operationId: 'setCartItem',
          summary: 'Set the quantity of a product in the cart',
          description: 'Sets (not adds) the quantity, so a retried request is safe. Quantity 0 removes the line.',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['productId', 'quantity'],
                  properties: { productId: { type: 'string' }, quantity: { type: 'integer', minimum: 0, maximum: MAX_QUANTITY } },
                },
              },
            },
          },
          responses: {
            200: { description: 'The cart.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Cart' } } } },
            400: errorResponse('Unknown product or bad quantity.'),
          },
        },
      },
      '/cart/items/{productId}': {
        delete: {
          operationId: 'removeCartItem',
          summary: 'Remove a product from the cart',
          security: bearerSecurity,
          parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'The cart.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Cart' } } } } },
        },
      },
      '/orders': {
        get: {
          operationId: 'listOrders',
          summary: 'List the account orders',
          security: bearerSecurity,
          responses: {
            200: {
              description: 'The orders.',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { orders: { type: 'array', items: { $ref: '#/components/schemas/Order' } } } },
                },
              },
            },
            401: errorResponse(`Signed out or a guest. WWW-Authenticate names scope ${SCOPES.ordersRead}: sign the customer in with it.`),
          },
        },
        post: {
          operationId: 'placeOrder',
          summary: 'Check out the cart',
          description:
            'Needs the customer signed in. As a guest the API answers 401 with the scope to ask for. Checkout asks for no address and no saved card: the order ships to a sample address and the payment is simulated, so no money moves. The body is optional; send {"payment":{"card":"4000 0000 0000 0002"}} to see a declined card.',
          security: bearerSecurity,
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { payment: { type: 'object', properties: { card: { type: 'string', description: 'A test card number. Defaults to 4242 4242 4242 4242 (approved).' } } } } } } },
          },
          responses: {
            402: errorResponse('card_declined or invalid_card. The cart is kept.'),
            201: { description: 'The order.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
            401: errorResponse(`Signed out or a guest. WWW-Authenticate names scope ${SCOPES.ordersWrite}.`),
            409: errorResponse('empty_cart.'),
          },
        },
      },
    },
  };
}
