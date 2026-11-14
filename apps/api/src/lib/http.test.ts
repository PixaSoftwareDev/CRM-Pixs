import { describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, parseTrustProxy, toFetchHeaders } from "./http";

describe("headers para Better Auth", () => {
  it("descarta las IPs que manda el cliente y pone la que resolvió Fastify", () => {
    const h = toFetchHeaders(
      {
        cookie: "crm.session_token=abc",
        "x-forwarded-for": "9.9.9.9, 8.8.8.8",
        "x-real-ip": "9.9.9.9",
        forwarded: "for=9.9.9.9",
        [CLIENT_IP_HEADER]: "1.1.1.1",
      },
      "203.0.113.7",
    );
    expect(h.get("cookie")).toBe("crm.session_token=abc");
    expect(h.get("x-forwarded-for")).toBeNull();
    expect(h.get("x-real-ip")).toBeNull();
    expect(h.get("forwarded")).toBeNull();
    expect(h.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
  });

  it("conserva headers repetidos", () => {
    const h = toFetchHeaders({ "x-multi": ["a", "b"] }, "127.0.0.1");
    expect(h.get("x-multi")).toBe("a, b");
  });
});

describe("TRUST_PROXY", () => {
  it("vacío o false: no se confía en ningún proxy", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("lista de redes", () => {
    expect(parseTrustProxy("loopback, uniquelocal,172.18.0.0/16")).toEqual(["loopback", "uniquelocal", "172.18.0.0/16"]);
  });

  it("no acepta confiar en cualquiera", () => {
    expect(() => parseTrustProxy("true")).toThrow();
    expect(() => parseTrustProxy("*")).toThrow();
  });
});
