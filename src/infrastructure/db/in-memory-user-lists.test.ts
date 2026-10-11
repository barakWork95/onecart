import { money } from "@/domain/shared/money";
import type { ProductSnapshot } from "@/domain/user-lists/product-snapshot";
import { createInMemoryUserLists } from "@/infrastructure/db/in-memory-user-lists";

const ils = (agorot: number) => money(agorot, "ILS");
const snapshot = (productId: string, price = 89_00): ProductSnapshot => ({
  productId,
  provider: "aliexpress",
  title: productId,
  imageUrl: null,
  productUrl: "https://www.aliexpress.com/item/1.html",
  price: ils(price),
  searchText: "earbuds",
});

function setup() {
  const clock = { ms: Date.parse("2026-10-11T09:00:00.000Z") };
  const store = createInMemoryUserLists(() => new Date(clock.ms));
  const tick = () => (clock.ms += 1000);
  return { store, tick };
}

describe("createInMemoryUserLists", () => {
  it("keeps each user's lists separate", async () => {
    const { store } = setup();
    await store.forUser("a").save(snapshot("p1"));
    expect(await store.forUser("b").listSaved()).toEqual([]);
    expect(await store.forUser("a").listSaved()).toHaveLength(1);
  });

  it("lists newest first and treats re-saving as an update", async () => {
    const { store, tick } = setup();
    const repo = store.forUser("a");
    const first = await repo.save(snapshot("p1"));
    tick();
    await repo.save(snapshot("p2"));
    tick();
    const again = await repo.save(snapshot("p1", 79_00));
    expect(again).toMatchObject({ id: first.id, savedAt: first.savedAt, price: ils(79_00) });
    expect((await repo.listSaved()).map((s) => s.productId)).toEqual(["p2", "p1"]);
    await repo.removeSaved("p2");
    expect((await repo.listSaved()).map((s) => s.productId)).toEqual(["p1"]);
  });

  it("upserts alerts, re-arming them from the current price", async () => {
    const { store } = setup();
    const repo = store.forUser("a");
    const created = await repo.upsertAlert(snapshot("p1"), ils(80_00));
    expect(created).toMatchObject({
      target: ils(80_00),
      baseline: ils(89_00),
      lastSeen: ils(89_00),
      status: "active",
    });
    const updated = await repo.upsertAlert(snapshot("p1", 85_00), ils(75_00));
    expect(updated).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      target: ils(75_00),
      baseline: ils(85_00),
    });
    expect(await repo.listAlerts()).toHaveLength(1);
  });

  it("exposes active alerts across users to the checker and saves observations back", async () => {
    const { store, tick } = setup();
    await store.forUser("a").upsertAlert(snapshot("p1"), ils(80_00));
    tick();
    await store.forUser("b").upsertAlert(snapshot("p2"), ils(70_00));

    const active = await store.alertCheck.listActiveAlerts(10);
    expect(active.map((a) => a.productId)).toEqual(["p1", "p2"]);
    expect(await store.alertCheck.listActiveAlerts(1)).toHaveLength(1);

    const [first] = active;
    if (!first) throw new Error("expected an alert");
    await store.alertCheck.saveObservations([
      { ...first, status: "triggered", triggeredAt: "2026-10-12T00:00:00.000Z" },
    ]);
    expect((await store.forUser("a").listAlerts())[0]?.status).toBe("triggered");
    expect((await store.alertCheck.listActiveAlerts(10)).map((a) => a.productId)).toEqual(["p2"]);
  });

  it("forgets deleted alerts, including for the checker", async () => {
    const { store } = setup();
    const repo = store.forUser("a");
    const alert = await repo.upsertAlert(snapshot("p1"), ils(80_00));
    await repo.deleteAlert("p1");
    await repo.deleteAlert("never-existed");
    await store.alertCheck.saveObservations([alert]);
    expect(await repo.listAlerts()).toEqual([]);
  });

  it("works with the default clock", async () => {
    const store = createInMemoryUserLists();
    expect((await store.forUser("a").save(snapshot("p1"))).savedAt).toMatch(/^\d{4}-/);
  });
});
