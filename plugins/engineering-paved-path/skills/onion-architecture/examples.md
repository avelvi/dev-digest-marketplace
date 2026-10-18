# Onion Architecture (Backend) — Code Examples

Good/bad patterns for each rule in [SKILL.md](SKILL.md). All code is
illustrative: an invented `orders` / `invoices` domain in an example layout
(`src/modules/<feature>/{routes,service,repository}.ts`). Substitute the
project's own file names and libraries from its layer mapping.

---

## Transport Handlers as Thin Adapters

```ts
// BAD - src/modules/invoices/routes.ts
// The handler imports the schema, runs raw queries, calls a billing API,
// runs backfill logic and aggregates totals - all inside the handler body.
import * as t from '../../db/schema.js';
// ...
app.get('/customers/:id/invoices', { schema: { params: IdParams } }, async (req) => {
  const [customer] = await container.db
    .select()
    .from(t.customers)
    .where(and(eq(t.customers.accountId, accountId), eq(t.customers.id, req.params.id)));
  // ...billing-API sync loop with insert-or-update...
  // ...backfill loop calling billing.getInvoice() for each missing row...
  // ...totalsByInvoice aggregation via more container.db queries...
});
```

```ts
// GOOD - src/modules/customers/routes.ts
// Transport layer only: parses requests, maps status codes, and delegates all
// business logic to CustomerService.
export default async function customersRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CustomerService(app.container);

  app.post('/customers', { schema: { body: CustomerInput } }, async (req, reply) => {
    const { accountId, userId } = await getContext(app.container, req);
    const { customer, created } = await service.add(accountId, userId, req.body.email);
    reply.status(created ? 201 : 200);
    return customer;
  });
}
```

---

## Repository as the Sole ORM Boundary

```ts
// BAD - a row type leaking two layers up
// service.ts
import type { OrderRow } from '../../db/rows.js'; // inferred from the table
export class OrderService {
  async getOpen(): Promise<OrderRow[]> { /* ... */ } // leaks the ORM row
}
```

```ts
// GOOD - repository.ts + service.ts
// The row type is defined and consumed only inside repository.ts:
export type CustomerRow = typeof t.customers.$inferSelect;
export class CustomerRepository {
  async list(accountId: string): Promise<CustomerRow[]> { /* ... */ }
}

// service.ts maps to the shared domain contract before returning anything:
import { type Customer } from '@acme/shared';
export class CustomerService {
  async list(accountId: string): Promise<Customer[]> {
    const rows = await this.repo.list(accountId);
    return rows.map(toCustomerDto); // CustomerRow -> Customer, never returns CustomerRow
  }
}
```

---

## Validation at the Edge Only

```ts
// BAD - service re-validates data its own repository returned
import { Customer } from '@acme/shared';
export class CustomerService {
  async list(accountId: string): Promise<Customer[]> {
    const rows = await this.repo.list(accountId);
    return rows.map((r) => Customer.parse(toCustomerDto(r))); // pointless second parse
  }
}
```

```ts
// GOOD - the schema is referenced only at the route boundary
// routes.ts
import { CustomerInput } from '@acme/shared';
app.post('/customers', { schema: { body: CustomerInput } }, async (req, reply) => {
  // req.body is already validated by the framework's schema integration here -
  // service.add() below deals only in plain types.
  const { customer, created } = await service.add(accountId, userId, req.body.email);
});
```

---

## Framework-Free Core

```ts
// GOOD - src/core/pricing/quote.ts
// Zero web-framework / ORM / HTTP-client imports. The only side effect is
// through the injected RateProvider port. This is the template for
// framework-free business logic - anything with no I/O of its own belongs
// here, not in the service layer.
export interface QuoteInput {
  items: LineItem[];
  currency: string;
  rates: RateProvider; // injected port, not a concrete provider SDK
  discountPolicy?: DiscountPolicy;
}

export async function quoteOrder(input: QuoteInput): Promise<Quote> {
  // load rates through the port -> apply discounts -> round -> return plain data
}
```

---

## Composition Root

```ts
// GOOD - src/platform/container.ts
// The one file that knows every concrete adapter. Everything else receives
// ports (interfaces), never the concrete class.
export function buildContainer(config: Config): Container {
  const mailer: MailerPort = new SmtpMailer(config.smtp);
  const billing: BillingPort = new HttpBillingClient(config.billingUrl);
  return { db: createDb(config.db), mailer, billing };
}
```
