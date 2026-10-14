import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("installs as a standalone app (needed for Web Push on iPhone) with 192 and 512 icons", () => {
    const m = manifest();
    expect(m).toMatchObject({ start_url: "/", scope: "/", display: "standalone", short_name: "OneCart" });
    expect(m.icons?.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
  });
});
