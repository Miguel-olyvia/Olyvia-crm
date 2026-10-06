import { describe, expect, it } from "vitest";
import { isOtherAppRoute } from "../notificationPresentation";

describe("isOtherAppRoute", () => {
  it("reconhece as aplicações servidas à parte", () => {
    expect(isOtherAppRoute("/operacao")).toBe(true);
    expect(isOtherAppRoute("/operacao/obras/OB-2026-0001")).toBe(true);
    expect(isOtherAppRoute("/operacao?obra=1")).toBe(true);
    expect(isOtherAppRoute("/duc-app/x")).toBe(true);
  });

  it("deixa as rotas do CRM no router", () => {
    expect(isOtherAppRoute("/proposals?open=1")).toBe(false);
    expect(isOtherAppRoute("/operacoes-crm")).toBe(false);
    expect(isOtherAppRoute("/scheduling")).toBe(false);
  });
});
