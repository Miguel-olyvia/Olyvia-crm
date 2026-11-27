// 27/11 (Rúben: «um botão para dar "ok" aos materiais de uma obra … no negócio step materiais»): só no modo de teste do super admin.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { acoes, seed, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { MateriaisObra } from "./MateriaisObra";
import { definirModoTeste } from "./real/modoTeste";
import { limparProntidoes } from "./inventario/prontidaoReal";

afterEach(() => { cleanup(); definirModoTeste(null); limparProntidoes(); });

function abrir() {
  const S = seed();
  const d = S.deals.find((x) => x.obra.ec) as Negocio;
  d.obra.ec = { ...d.obra.ec!, contrato: "c-1029", ref: undefined };
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  return render(<MateriaisObra {...ctx} d={d} />);
}
const NOME = "Dar os materiais como garantidos (teste)";

describe("o botão de teste dos materiais (27/11)", () => {
  it("sem o modo de teste, não aparece", () => {
    abrir();
    expect(screen.queryByRole("button", { name: NOME })).toBeNull();
  });
  it("com o modo de teste, aparece e chama a ação com o contrato da encomenda de cliente", async () => {
    const garantirMateriais = vi.fn(async () => {});
    definirModoTeste({ aceitarProposta: vi.fn(), assinarContrato: vi.fn(), confirmarFornecedor: vi.fn(), garantirMateriais });
    abrir();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: NOME })); });
    expect(garantirMateriais).toHaveBeenCalledWith("c-1029");
  });
});
