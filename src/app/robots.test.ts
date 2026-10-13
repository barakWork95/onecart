import robots from "@/app/robots";

describe("robots.txt", () => {
  it("keeps crawlers off live search URLs and redirects, which spend store API quota", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule?.disallow).toEqual(expect.arrayContaining(["/search", "/go/", "/api/"]));
    expect(rule?.allow).toBe("/");
  });
});
