import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCookieCurrentUser,
  DEMO_USER_COOKIE,
  type CookieJar,
} from "@/infrastructure/auth/cookie-current-user";
import { createSupabaseCurrentUser } from "@/infrastructure/auth/supabase-current-user";

function jar(initial: Record<string, string> = {}): CookieJar & { set: jest.Mock } {
  const values = new Map(Object.entries(initial));
  return {
    get: (name) => (values.has(name) ? { value: values.get(name) ?? "" } : undefined),
    set: jest.fn((name: string, value: string) => values.set(name, value)),
  };
}

describe("createCookieCurrentUser (demo mode)", () => {
  it("has no user until one is ensured, then reuses it", async () => {
    const cookies = jar();
    const user = createCookieCurrentUser(cookies, { secure: true });
    expect(await user.getUserId()).toBeNull();

    const id = await user.ensureUserId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cookies.set).toHaveBeenCalledWith(DEMO_USER_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 31_536_000,
    });
    expect(await user.ensureUserId()).toBe(id);
    expect(cookies.set).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed cookie values", async () => {
    const user = createCookieCurrentUser(jar({ [DEMO_USER_COOKIE]: "'; drop table" }), { secure: false });
    expect(await user.getUserId()).toBeNull();
  });
});

function fakeAuth(auth: { getClaims: jest.Mock; signInAnonymously: jest.Mock }): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

describe("createSupabaseCurrentUser", () => {
  it("reads the user id from verified JWT claims", async () => {
    const auth = {
      getClaims: jest.fn(async () => ({ data: { claims: { sub: "user-1" } }, error: null })),
      signInAnonymously: jest.fn(),
    };
    const user = createSupabaseCurrentUser(fakeAuth(auth));
    expect(await user.getUserId()).toBe("user-1");
    expect(await user.ensureUserId()).toBe("user-1");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously on first write", async () => {
    const auth = {
      getClaims: jest.fn(async () => ({ data: null, error: null })),
      signInAnonymously: jest.fn(async () => ({ data: { user: { id: "anon-1" } }, error: null })),
    };
    const user = createSupabaseCurrentUser(fakeAuth(auth));
    expect(await user.getUserId()).toBeNull();
    expect(await user.ensureUserId()).toBe("anon-1");
  });

  it("treats claim errors or a non-string sub as signed out", async () => {
    for (const result of [
      { data: null, error: { message: "bad jwt" } },
      { data: { claims: { sub: 42 } }, error: null },
    ]) {
      const user = createSupabaseCurrentUser(
        fakeAuth({ getClaims: jest.fn(async () => result), signInAnonymously: jest.fn() }),
      );
      expect(await user.getUserId()).toBeNull();
    }
  });

  it("fails loudly when anonymous sign-in is disabled", async () => {
    const auth = {
      getClaims: jest.fn(async () => ({ data: null, error: null })),
      signInAnonymously: jest.fn(async () => ({
        data: { user: null },
        error: { message: "Anonymous sign-ins are disabled" },
      })),
    };
    await expect(createSupabaseCurrentUser(fakeAuth(auth)).ensureUserId()).rejects.toThrow(
      "Anonymous sign-ins are disabled",
    );
    const noUser = {
      ...auth,
      signInAnonymously: jest.fn(async () => ({ data: { user: null }, error: null })),
    };
    await expect(createSupabaseCurrentUser(fakeAuth(noUser)).ensureUserId()).rejects.toThrow(
      "no user returned",
    );
  });
});
