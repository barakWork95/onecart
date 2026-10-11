import {
  circuitAfterFailure,
  circuitAfterSuccess,
  CLOSED_CIRCUIT,
  decideCircuit,
  type CircuitBreakerPolicy,
} from "@/domain/search/circuit-breaker";

const policy: CircuitBreakerPolicy = { failureThreshold: 3, cooldownMs: 1_000 };

describe("decideCircuit", () => {
  it("allows calls when there is no state or the circuit is closed", () => {
    expect(decideCircuit(null, 0, policy)).toBe("allow");
    expect(decideCircuit({ status: "closed", consecutiveFailures: 2 }, 0, policy)).toBe("allow");
  });

  it("rejects while the cooldown is running", () => {
    expect(decideCircuit({ status: "open", openedAtMs: 10_000 }, 10_999, policy)).toBe("reject");
  });

  it("allows a probe once the cooldown has elapsed (half-open)", () => {
    expect(decideCircuit({ status: "open", openedAtMs: 10_000 }, 11_000, policy)).toBe("probe");
  });
});

describe("circuitAfterFailure", () => {
  it("counts consecutive failures while closed", () => {
    expect(circuitAfterFailure(null, "allow", 0, policy)).toEqual({
      status: "closed",
      consecutiveFailures: 1,
    });
    expect(circuitAfterFailure({ status: "closed", consecutiveFailures: 1 }, "allow", 0, policy)).toEqual({
      status: "closed",
      consecutiveFailures: 2,
    });
  });

  it("opens at the threshold", () => {
    expect(circuitAfterFailure({ status: "closed", consecutiveFailures: 2 }, "allow", 5_000, policy)).toEqual(
      {
        status: "open",
        openedAtMs: 5_000,
      },
    );
  });

  it("re-opens with a fresh cooldown when a probe fails", () => {
    expect(circuitAfterFailure({ status: "open", openedAtMs: 0 }, "probe", 9_000, policy)).toEqual({
      status: "open",
      openedAtMs: 9_000,
    });
  });
});

describe("circuitAfterSuccess", () => {
  it("closes and resets the failure count", () => {
    expect(circuitAfterSuccess()).toEqual(CLOSED_CIRCUIT);
  });
});
