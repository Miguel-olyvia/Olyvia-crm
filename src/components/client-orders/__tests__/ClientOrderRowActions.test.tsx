// «Eliminar» na linha de uma encomenda de cliente segue a regra do servidor: com client_orders.delete mas fora da
// organização/âmbito (rpc_client_orders_can_delete não devolve a encomenda) fica desativada, com o motivo.
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

import { ClientOrderRowActions, DELETE_OUT_OF_SCOPE_REASON } from "../ClientOrderRowActions";

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

function abrirMenu(remove: { deletable: boolean; busy: boolean; onSelect: () => void; outOfScope?: boolean }) {
  render(
    <ClientOrderRowActions
      orderLabel="EC-1"
      onView={() => {}}
      onPdf={() => {}}
      pdfBusy={false}
      edit={null}
      onRequestMissing={() => {}}
      proforma={null}
      remove={remove}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Mais ações para EC-1" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

describe("ClientOrderRowActions · Eliminar", () => {
  it("com client_orders.delete e dentro do âmbito: ativa e chama onSelect", async () => {
    perms.codes = new Set(["client_orders.delete"]);
    const onSelect = vi.fn();
    const menu = await abrirMenu({ deletable: true, busy: false, onSelect, outOfScope: false });
    const item = within(menu).getByRole("menuitem", { name: /^Eliminar/ });
    expect(item).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("com client_orders.delete mas fora do âmbito: desativada com o motivo (o servidor recusaria)", async () => {
    perms.codes = new Set(["client_orders.delete"]);
    const onSelect = vi.fn();
    const menu = await abrirMenu({ deletable: true, busy: false, onSelect, outOfScope: true });
    const item = within(menu).getByRole("menuitem", { name: /^Eliminar/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByText(DELETE_OUT_OF_SCOPE_REASON)).toBeInTheDocument();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sem client_orders.delete: desativada pela permissão, como antes", async () => {
    perms.codes = new Set();
    const menu = await abrirMenu({ deletable: true, busy: false, onSelect: vi.fn(), outOfScope: false });
    expect(within(menu).getByRole("menuitem", { name: /^Eliminar/ })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).queryByText(DELETE_OUT_OF_SCOPE_REASON)).toBeNull();
  });
});
