import {
  createUserListsService,
  MAX_PRICE_ALERTS,
  MAX_SAVED_ITEMS,
} from "@/application/user-lists/user-lists";
import { money } from "@/domain/shared/money";
import { fakeUserListsRepository } from "@/test/fakes";
import { makeProduct } from "@/test/product-factory";

const OFFER = makeProduct({ provider: "aliexpress", sku: "1", title: "Life P3", total: 89_00 });
const REF = { productId: OFFER.id, searchText: "אוזניות אלחוטיות" };

function setup(findOffer = jest.fn(async (id: string) => (id === OFFER.id ? OFFER : null))) {
  return { service: createUserListsService({ findOffer }), repo: fakeUserListsRepository(), findOffer };
}

describe("saveProduct", () => {
  it("saves a server-side snapshot of the offer found by id + search", async () => {
    const { service, repo, findOffer } = setup();
    const result = await service.saveProduct(repo, REF);
    expect(findOffer).toHaveBeenCalledWith(OFFER.id, "אוזניות אלחוטיות");
    expect(result).toMatchObject({
      ok: true,
      value: { productId: OFFER.id, title: "Life P3", price: money(89_00, "ILS") },
    });
  });

  it("refuses products that can't be found in today's results", async () => {
    const { service, repo } = setup();
    expect(await service.saveProduct(repo, { ...REF, productId: "aliexpress:missing" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await repo.listSaved()).toEqual([]);
  });

  it("enforces the saved-items limit, but still allows re-saving an existing item", async () => {
    const { service, repo } = setup(
      jest.fn(async (id: string) => makeProduct({ sku: id.split(":")[1], total: 10_00 })),
    );
    for (let i = 0; i < MAX_SAVED_ITEMS; i++)
      await service.saveProduct(repo, { productId: `aliexpress:${i}`, searchText: "x" });
    expect(await service.saveProduct(repo, { productId: "aliexpress:new", searchText: "x" })).toEqual({
      ok: false,
      error: "limit_reached",
    });
    expect((await service.saveProduct(repo, { productId: "aliexpress:0", searchText: "x" })).ok).toBe(true);
  });

  it("removes saved products", async () => {
    const { service, repo } = setup();
    await service.saveProduct(repo, REF);
    await service.removeSaved(repo, OFFER.id);
    expect(await repo.listSaved()).toEqual([]);
  });
});

describe("createAlert", () => {
  it("creates an alert with a validated target and today's price as baseline", async () => {
    const { service, repo } = setup();
    const result = await service.createAlert(repo, { ...REF, targetAgorot: 80_00 });
    expect(result).toMatchObject({
      ok: true,
      value: { target: money(80_00, "ILS"), baseline: money(89_00, "ILS"), status: "active" },
    });
  });

  it.each([
    [89_00, "target_not_below_current"],
    [0, "target_not_positive"],
    [80.5, "target_not_positive"],
  ] as const)("rejects target %p with %s", async (targetAgorot, error) => {
    const { service, repo } = setup();
    expect(await service.createAlert(repo, { ...REF, targetAgorot })).toEqual({ ok: false, error });
  });

  it("rejects unknown products without validating a target", async () => {
    const { service, repo } = setup();
    expect(await service.createAlert(repo, { ...REF, productId: "ebay:nope", targetAgorot: 1_00 })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("enforces the alert limit, but allows updating an existing alert", async () => {
    const { service, repo } = setup(
      jest.fn(async (id: string) => makeProduct({ sku: id.split(":")[1], total: 100_00 })),
    );
    for (let i = 0; i < MAX_PRICE_ALERTS; i++)
      await service.createAlert(repo, { productId: `aliexpress:${i}`, searchText: "x", targetAgorot: 50_00 });
    expect(
      await service.createAlert(repo, { productId: "aliexpress:new", searchText: "x", targetAgorot: 50_00 }),
    ).toEqual({ ok: false, error: "limit_reached" });
    expect(
      (await service.createAlert(repo, { productId: "aliexpress:0", searchText: "x", targetAgorot: 60_00 }))
        .ok,
    ).toBe(true);
  });

  it("deletes alerts", async () => {
    const { service, repo } = setup();
    await service.createAlert(repo, { ...REF, targetAgorot: 80_00 });
    await service.deleteAlert(repo, OFFER.id);
    expect(await repo.listAlerts()).toEqual([]);
  });
});

describe("listState", () => {
  it("reports which products are saved and tracked", async () => {
    const { service, repo } = setup();
    await service.saveProduct(repo, REF);
    await service.createAlert(repo, { ...REF, targetAgorot: 80_00 });
    const state = await service.listState(repo);
    expect([...state.savedIds]).toEqual([OFFER.id]);
    expect([...state.alertIds]).toEqual([OFFER.id]);
  });
});
