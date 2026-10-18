import { SCHEMA_VERSION, type Catalog } from '../types/catalog';

export async function loadCatalog(): Promise<Catalog> {
  const url = new URL(`catalog.json?v=${__CATALOG_HASH__}`, document.baseURI);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalog.json returned HTTP ${res.status}`);
  const data = (await res.json()) as Partial<Catalog>;
  if (data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.artifacts) || !data.marketplace) {
    throw new Error('catalog.json has an unsupported format');
  }
  return data as Catalog;
}
