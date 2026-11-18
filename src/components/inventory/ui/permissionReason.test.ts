// 18/11/2026: o aviso de «sem permissão» diz só o que falta (todas de → «falta A e B») ou as alternativas (qualquer de → «requer A ou B»).
import { afterEach, describe, expect, it } from "vitest";
import { missingPermissionsReason, permissionLabel, permissionReason, registerPermissionNames } from "./permissionReason";

const tem = (...codigos: string[]) => (c: string) => codigos.includes(c);
const SUFIXO = "Peça acesso a um administrador.";

describe("permissionLabel", () => {
  it("nome legível com o código entre parênteses", () => {
    expect(permissionLabel("inventory.edit")).toBe("Editar inventário (inventory.edit)");
    expect(permissionLabel("purchase_orders.receive")).toBe("Receber encomendas de compra (purchase_orders.receive)");
  });
  it("sem nome conhecido, só o código", () => {
    expect(permissionLabel("codigo.que.nao.existe")).toBe("codigo.que.nao.existe");
  });
});

// 18/11/2026: o nome vem primeiro da base (anew_permissions.name, o mesmo do servidor e do editor); sem ele, o estático.
describe("permissionLabel — nomes da base (registerPermissionNames)", () => {
  afterEach(() => registerPermissionNames([]));

  it("o nome da base ganha ao estático", () => {
    registerPermissionNames([{ code: "inventory.edit", name: "Editar registos de inventário" }]);
    expect(permissionLabel("inventory.edit")).toBe("Editar registos de inventário (inventory.edit)");
  });
  it("código sem nome na base (ou nome vazio/null): fica o estático", () => {
    registerPermissionNames([
      { code: "inventory.edit", name: "Editar registos de inventário" },
      { code: "purchase_orders.receive", name: null },
      { code: "purchase_orders.view", name: "  " },
    ]);
    expect(permissionLabel("purchase_orders.receive")).toBe("Receber encomendas de compra (purchase_orders.receive)");
    expect(permissionLabel("purchase_orders.view")).toBe("Ver encomendas de compra (purchase_orders.view)");
  });
  it("sem base nem estático: só o código; com base, mesmo sem estático, o nome da base", () => {
    registerPermissionNames([{ code: "so.na.base", name: "Só na base" }]);
    expect(permissionLabel("codigo.que.nao.existe")).toBe("codigo.que.nao.existe");
    expect(permissionLabel("so.na.base")).toBe("Só na base (so.na.base)");
  });
  it("um novo registo substitui o anterior; [] volta ao estático", () => {
    registerPermissionNames([{ code: "inventory.edit", name: "Nome antigo" }]);
    registerPermissionNames([{ code: "inventory.edit", name: "Editar registos de inventário" }]);
    expect(permissionLabel("inventory.edit")).toBe("Editar registos de inventário (inventory.edit)");
    registerPermissionNames([]);
    expect(permissionLabel("inventory.edit")).toBe("Editar inventário (inventory.edit)");
  });
  it("os motivos usam o nome da base", () => {
    registerPermissionNames([{ code: "inventory.edit", name: "Editar registos de inventário" }]);
    expect(missingPermissionsReason(["purchase_orders.receive", "inventory.edit"], true, tem("purchase_orders.receive"))).toBe(
      `Sem permissão: falta Editar registos de inventário (inventory.edit). ${SUFIXO}`,
    );
  });
});

describe("missingPermissionsReason — todas de (requireAll)", () => {
  const RECEBER_PO = ["purchase_orders.receive", "inventory.edit"];

  it("com uma em falta diz só essa, e não usa «ou»", () => {
    const r = missingPermissionsReason(RECEBER_PO, true, tem("purchase_orders.receive"));
    expect(r).toBe(`Sem permissão: falta Editar inventário (inventory.edit). ${SUFIXO}`);
    expect(r).not.toContain("purchase_orders.receive");
    expect(r).not.toContain(" ou ");
  });

  it("com duas em falta liga-as com «e»", () => {
    expect(missingPermissionsReason(RECEBER_PO, true, tem())).toBe(
      `Sem permissão: falta Receber encomendas de compra (purchase_orders.receive) e Editar inventário (inventory.edit). ${SUFIXO}`,
    );
  });

  it("com três em falta: «A, B e C»", () => {
    const r = missingPermissionsReason(["receiving.receive", "purchase_orders.receive", "inventory.edit"], true, tem());
    expect(r).toBe(
      "Sem permissão: falta Receber mercadoria por leitura (receiving.receive), Receber encomendas de compra "
        + `(purchase_orders.receive) e Editar inventário (inventory.edit). ${SUFIXO}`,
    );
  });

  it("confirmar saída de EC: só as que faltam das três", () => {
    const r = missingPermissionsReason(
      ["inventory.edit", "client_orders.confirm_stock_exit", "client_orders.view"], true, tem("client_orders.view"),
    );
    expect(r).toBe(
      "Sem permissão: falta Editar inventário (inventory.edit) e Confirmar saída de stock em Encomendas Clientes "
        + `(client_orders.confirm_stock_exit). ${SUFIXO}`,
    );
  });

  it("com todas: null", () => {
    expect(missingPermissionsReason(RECEBER_PO, true, tem(...RECEBER_PO))).toBeNull();
  });
});

describe("missingPermissionsReason — qualquer de", () => {
  it("sem nenhuma: as alternativas com «ou»", () => {
    expect(missingPermissionsReason(["purchase_orders.view", "purchase_orders.receive"], false, tem())).toBe(
      `Sem permissão: requer Ver encomendas de compra (purchase_orders.view) ou Receber encomendas de compra (purchase_orders.receive). ${SUFIXO}`,
    );
  });
  it("com uma: null", () => {
    expect(missingPermissionsReason(["purchase_orders.view", "purchase_orders.receive"], undefined, tem("purchase_orders.receive"))).toBeNull();
  });
  it("uma só permissão (string)", () => {
    expect(missingPermissionsReason("inventory.edit", false, tem())).toBe(`Sem permissão: requer Editar inventário (inventory.edit). ${SUFIXO}`);
    expect(missingPermissionsReason("inventory.edit", true, tem())).toBe(`Sem permissão: falta Editar inventário (inventory.edit). ${SUFIXO}`);
  });
  it("lista vazia: null", () => {
    expect(missingPermissionsReason([], true, tem())).toBeNull();
  });
  it("permissionReason mantém o formato «requer …»", () => {
    expect(permissionReason(["fleet.view"])).toBe(`Sem permissão: requer fleet.view. ${SUFIXO}`);
  });
});
