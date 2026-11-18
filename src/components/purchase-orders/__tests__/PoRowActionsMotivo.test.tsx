// 18/11/2026: nas ações de uma PO que exigem várias permissões (todas), o motivo diz só as que FALTAM, ligadas com «e»
// (antes juntava sempre com «ou»: «requer purchase_orders.receive ou inventory.edit»).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

const perms = vi.hoisted(() => ({ codes: new Set<string>() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    loading: false,
    hasPermission: (c: string) => perms.codes.has(c),
    hasAnyPermission: (l: string[]) => l.some((c) => perms.codes.has(c)),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { PoRowActions } from "../PoRowActions";

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const noop = () => {};

function abrirMenu(status: string) {
  render(
    <TooltipProvider>
    <PoRowActions
      order={{ id: "po1", order_number: "PO-1", status }}
      deleted={false}
      onOpen={noop} onApproveSend={noop} onReceive={noop} onPdf={noop} onCancelRemainder={noop}
      onRevert={noop} onEdit={noop} onDelete={noop} onRestore={noop}
    />
    </TooltipProvider>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Mais ações para PO-1" }), { key: "Enter" });
  return screen.findByRole("menu");
}

describe("PoRowActions · motivo de sem permissão", () => {
  it("«Não vou receber o resto» com purchase_orders.receive mas sem inventory.edit: diz só que falta inventory.edit", async () => {
    perms.codes = new Set(["purchase_orders.receive", "receiving.view"]);
    const menu = await abrirMenu("ordered");
    const item = within(menu).getByRole("menuitem", { name: /^Não vou receber o resto/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveTextContent("Sem permissão: falta Editar inventário (inventory.edit). Peça acesso a um administrador.");
    expect(item).not.toHaveTextContent(" ou ");
    // O botão principal (Receber no armazém →, três permissões) também só diz a que falta.
    // (com o menu modal aberto o resto fica aria-hidden: procura-se com hidden.)
    expect(screen.getByRole("button", { name: /^Receber no armazém/, hidden: true })).toHaveAccessibleDescription(
      "Sem permissão: falta Editar inventário (inventory.edit). Peça acesso a um administrador.",
    );
  });

  it("«Reverter receção» sem nenhuma: as duas, ligadas com «e»", async () => {
    perms.codes = new Set();
    const menu = await abrirMenu("received");
    const item = within(menu).getByRole("menuitem", { name: /^Reverter receção/ });
    expect(item).toHaveTextContent(
      "Sem permissão: falta Reverter receção de encomendas de compra (purchase_orders.revert_receipt) e Editar inventário (inventory.edit).",
    );
  });

  it("com as permissões todas: ativa, sem motivo", async () => {
    perms.codes = new Set(["purchase_orders.receive", "inventory.edit", "receiving.view"]);
    const menu = await abrirMenu("ordered");
    const item = within(menu).getByRole("menuitem", { name: /^Não vou receber o resto/ });
    expect(item).not.toHaveAttribute("aria-disabled", "true");
    expect(item).not.toHaveTextContent("Sem permissão");
  });
});
