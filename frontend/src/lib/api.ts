import type { BuyerRequest, DemoResult, SellerProduct } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function runDemo(
  request: Omit<BuyerRequest, "request_id"> & { request_id?: string },
): Promise<DemoResult> {
  const res = await fetch(`${API_BASE}/api/run-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`run-demo failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface BuyerScenario {
  request_id: string;
  raw_request: string;
  region?: string;
  priority?: string;
  structured_requirements?: { use_case?: string };
}

export async function getScenarios(): Promise<BuyerScenario[]> {
  const res = await fetch(`${API_BASE}/api/scenarios`);
  if (!res.ok) {
    throw new Error(`scenarios failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getSellerInventory(): Promise<SellerProduct[]> {
  const res = await fetch(`${API_BASE}/api/seller-inventory`);
  if (!res.ok) {
    throw new Error(`seller-inventory failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : flattenNestedInventory(data);
}

function flattenNestedInventory(data: unknown): SellerProduct[] {
  if (!data || typeof data !== "object" || !("merchants" in data)) return [];
  const merchants = (data as { merchants?: unknown[] }).merchants ?? [];
  return merchants.flatMap((merchant) => {
    if (!merchant || typeof merchant !== "object") return [];
    const m = merchant as {
      seller_id?: string;
      seller_name?: string;
      inventories?: { products?: SellerProduct[] }[];
    };
    return (m.inventories ?? []).flatMap((inventory) =>
      (inventory.products ?? []).map((product) => ({
        ...product,
        seller_id: m.seller_id ?? product.seller_id,
        seller_name: m.seller_name ?? product.seller_name,
      })),
    );
  });
}
