import { adminAccess } from "@/app/_admin-auth";

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const PASSWORD = "correct horse battery staple";

describe("adminAccess", () => {
  it("is disabled without a configured password", () => {
    expect(adminAccess(basic("me", PASSWORD), undefined)).toBe("disabled");
  });

  it("grants the right password under any user name", () => {
    expect(adminAccess(basic("me", PASSWORD), PASSWORD)).toBe("granted");
    expect(adminAccess(basic("", PASSWORD), PASSWORD)).toBe("granted");
    // A colon in the password stays part of it.
    expect(adminAccess(basic("me", "a:b-long-enough-pass"), "a:b-long-enough-pass")).toBe("granted");
  });

  it("denies a wrong, missing or malformed credential", () => {
    expect(adminAccess(basic("me", "wrong"), PASSWORD)).toBe("denied");
    expect(adminAccess(null, PASSWORD)).toBe("denied");
    expect(adminAccess(`Bearer ${PASSWORD}`, PASSWORD)).toBe("denied");
    expect(adminAccess(`Basic ${Buffer.from("no-colon").toString("base64")}`, PASSWORD)).toBe("denied");
  });
});
