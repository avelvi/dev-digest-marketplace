# Frontend Architecture — Code Examples

Good/bad patterns for each rule in [SKILL.md](SKILL.md).

---

## Feature-Based Structure

```
# BAD: organized by technical role, features scattered across every folder
src/
  components/
    UserAvatar.tsx
    InvoiceTable.tsx
    ProductCard.tsx
  hooks/
    useUser.ts
    useInvoices.ts
    useProducts.ts

# GOOD: organized by feature, shared code promoted only once it's shared
src/
  features/
    invoices/
      components/InvoiceTable.tsx
      hooks/useInvoices.ts
      api/getInvoices.ts
    products/
      components/ProductCard.tsx
      hooks/useProducts.ts
  components/          # used by 2+ features
    UserAvatar.tsx
  hooks/
    useUser.ts
```

---

## Constants/Utils Promotion Rule

```ts
// BAD: created in shared utils/ before any second consumer exists
// utils/formatInvoiceNumber.ts
export function formatInvoiceNumber(id: string) { /* ... */ }

// GOOD: lives inside the one feature that uses it
// features/invoices/utils/formatInvoiceNumber.ts
export function formatInvoiceNumber(id: string) { /* ... */ }

// Once `products` also needs it, THEN promote:
// utils/formatDocumentNumber.ts
```

---

## Business Logic Placement

```tsx
// BAD: query + authorization inlined in a Server Action
'use server'
export async function deleteInvoice(id: string) {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id));
  // no auth check — reachable directly via POST
  await db.delete(invoices).where(eq(invoices.id, id));
}

// GOOD: Server Action is a thin entry point into a Data Access Layer
// lib/dal.ts
export async function getInvoiceForUser(id: string, userId: string) {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!invoice || invoice.ownerId !== userId) throw new Error('Unauthorized');
  return toInvoiceDTO(invoice); // return a DTO, not the raw row
}

// actions.ts
'use server'
export async function deleteInvoice(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  await dal.deleteInvoiceForUser(id, session.user.id);
  revalidatePath('/invoices');
}
```

```tsx
// BAD: business logic inline in the component body
function InvoiceList({ userId }: { userId: string }) {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => {
    fetch(`/api/invoices?user=${userId}`)
      .then(r => r.json())
      .then(data => setInvoices(data.filter(i => i.status !== 'draft')));
  }, [userId]);
  // ...
}

// GOOD: logic lives in a hook, named for what it does
function useVisibleInvoices(userId: string) {
  const { data } = useApiQuery(['invoices', userId], () => getInvoices(userId));
  return data?.filter(i => i.status !== 'draft') ?? [];
}

function InvoiceList({ userId }: { userId: string }) {
  const invoices = useVisibleInvoices(userId);
  // ...
}
```

---

## Next.js Colocation with Private Folders

```
# GOOD: non-routable UI/utils colocated with the route that uses them,
# `_components` and `_lib` opted out of routing via the underscore prefix
app/
  invoices/
    page.tsx
    _components/
      InvoiceTable.tsx
    _lib/
      formatInvoiceNumber.ts
```

---

## Server/Client Boundary

```tsx
// BAD: whole layout marked client because one child needs interactivity
'use client'
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />       {/* now also bundled to the client, unnecessarily */}
      <Search />    {/* the only part that actually needs client state */}
      <main>{children}</main>
    </>
  );
}

// GOOD: 'use client' pushed down to only the component that needs it
// layout.tsx (stays a Server Component)
import Search from './search';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <Search />
      <main>{children}</main>
    </>
  );
}

// search.tsx
'use client'
export default function Search() { /* useState, onChange, etc. */ }
```
