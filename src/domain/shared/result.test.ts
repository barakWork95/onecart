import { err, ok, type Result } from "@/domain/shared/result";

describe("Result", () => {
  it("narrows on the ok discriminant", () => {
    const results: Result<number, string>[] = [ok(1), err("boom")];
    const values = results.map((r) => (r.ok ? r.value : r.error));
    expect(values).toEqual([1, "boom"]);
  });
});
