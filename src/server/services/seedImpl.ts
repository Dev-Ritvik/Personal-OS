import { prisma } from "../db";

/** Default category taxonomy (ARCHITECTURE.md §8.2). User-editable day one. */
export async function seedDefaults(userId: string): Promise<void> {
  const existing = await prisma.category.count({ where: { userId } });
  if (existing > 0) return;

  const defaults: Array<{ name: string; valueClass: string; sort: number }> = [
    { name: "Deep Work", valueClass: "productive", sort: 0 },
    { name: "Learning", valueClass: "productive", sort: 1 },
    { name: "Health", valueClass: "productive", sort: 2 },
    { name: "Admin", valueClass: "maintenance", sort: 3 },
    { name: "Chores", valueClass: "maintenance", sort: 4 },
    { name: "Social", valueClass: "intentional_leisure", sort: 5 },
    { name: "Entertainment", valueClass: "intentional_leisure", sort: 6 },
    { name: "Rest", valueClass: "neutral", sort: 7 },
  ];
  await prisma.category.createMany({
    data: defaults.map((d) => ({
      id: crypto.randomUUID(),
      userId,
      name: d.name,
      valueClass: d.valueClass as never,
      sort: d.sort,
    })),
  });
}
