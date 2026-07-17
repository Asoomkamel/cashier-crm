import { CatalogItem, TechInventoryItem } from "@/lib/types";

export function getProductStock(catalog: CatalogItem[], catalogId: string): number {
  return catalog.find((item) => item.id === catalogId)?.stock || 0;
}

export function getTechnicianStock(techInventory: TechInventoryItem[], technicianId: string | undefined, technicianName: string, catalogId: string): number {
  return techInventory
    .filter((item) => item.catalogId === catalogId && (item.technicianId === technicianId || item.technicianName === technicianName))
    .reduce((sum, item) => sum + item.qty, 0);
}
