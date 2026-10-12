import {
  applyTheme,
  storedTheme,
  storeTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/components/layout/theme";

function mockSystemDark(dark: boolean) {
  window.matchMedia = jest
    .fn()
    .mockReturnValue({ matches: dark, addEventListener: jest.fn(), removeEventListener: jest.fn() });
}

const runInitScript = () => new Function(THEME_INIT_SCRIPT)();

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("THEME_INIT_SCRIPT (runs before first paint)", () => {
  it("follows the OS setting when the user hasn't chosen", () => {
    mockSystemDark(true);
    runInitScript();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    mockSystemDark(false);
    runInitScript();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("lets the stored choice win over the OS setting", () => {
    mockSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("never throws, even when storage is unavailable", () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(runInitScript).not.toThrow();
    getItem.mockRestore();
  });
});

describe("theme helpers", () => {
  it("applies and stores a theme", () => {
    applyTheme("dark");
    storeTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(storedTheme()).toBe("dark");
    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("ignores unknown stored values and storage failures", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(storedTheme()).toBeNull();

    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(storedTheme()).toBeNull();
    expect(() => storeTheme("dark")).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
