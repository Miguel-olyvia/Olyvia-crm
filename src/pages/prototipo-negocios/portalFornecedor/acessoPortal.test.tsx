// O Portal do Fornecedor simulado (20/10, demo): o acesso (convite com email editável → primeiro acesso no portal → ativo → as POs passam a ir
// para o portal; revogado → "Acesso revogado" e as POs voltam ao email), o catálogo editável e os dados da empresa gravados na ficha.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario, executar, lerInventario } from "../inventario/loja";
import { esquecerPerfil } from "../inventario/perfil";
import { criarPoManual, enviarPo } from "../inventario/po";
import { acessoPortal } from "../inventario/regrasForn";
import type { Po } from "../inventario/tipos";
import { posDoPortal } from "./dadosPortal";
import PortalFornecedor from "./PortalFornecedor";

const forn = (id: string) => lerInventario().suppliers.find((x) => x.id === id)!;
const po = (id: string): Po => lerInventario().pos.find((p) => p.id === id)!;
function novaPo(sup: string, sku: string, packs: number): string {
  const r = executar((db) => { const p = criarPoManual(db, { sup, wh: "LIS", linhas: [{ sku, packs }] }); enviarPo(db, p); return p.id; });
  expect(r.erro).toBe("");
  return r.valor;
}
const portal = (sup: string) => render(<PortalFornecedor sup={sup} aoMudarFornecedor={() => {}} aoVoltar={() => {}} />);

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Portal do Fornecedor simulado · acesso", () => {
  it("sem acesso a PO segue por email; convite (email editado) → primeiro acesso no portal → ativo → a PO seguinte vai para o portal", async () => {
    expect(forn("gama").portal).toBe("none");
    expect(po(novaPo("gama", "CD-80", 2)).portal.state).toBe("email");
    expect(executar((db) => acessoPortal(db, "gama", "invite", "mau-email")).erro).toBe("Email do convite inválido.");
    expect(executar((db) => acessoPortal(db, "gama", "invite", "portal@gama.exemplo")).erro).toBe("");
    expect(forn("gama")).toMatchObject({ portal: "invited", email: "portal@gama.exemplo", invite: { email: "portal@gama.exemplo", state: "pending" } });
    expect(executar((db) => acessoPortal(db, "gama", "resend")).erro).toBe("");
    expect(forn("gama").emails!.map((e) => e.t)).toEqual(["Convite para o portal do fornecedor", "Reenvio de acesso"]);
    // convidado: ainda por email
    expect(po(novaPo("gama", "CD-80", 1)).portal.state).toBe("email");

    portal("gama");
    expect(screen.getByText(/Convite enviado para portal@gama\.exemplo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar convite" }));
    fireEvent.change(screen.getByLabelText("Nova password"), { target: { value: "segredo123" } });
    fireEvent.change(screen.getByLabelText("Repetir password"), { target: { value: "outra1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Definir password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("As passwords não coincidem.");
    fireEvent.change(screen.getByLabelText("Repetir password"), { target: { value: "segredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Definir password" }));
    fireEvent.change(screen.getByLabelText("Morada"), { target: { value: "Rua da Gama 5" } });
    fireEvent.change(screen.getByLabelText("Código postal"), { target: { value: "4700-001" } });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "253 000 000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar dados" }));
    expect(screen.getByText("Acesso ativo")).toBeInTheDocument();
    expect(forn("gama")).toMatchObject({ portal: "active", addr: "Rua da Gama 5", cp: "4700-001", phone: "253 000 000", dataConfirmed: true });
    expect(forn("gama").ativoDesde).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entrar no portal" }));
    expect(screen.getByRole("navigation", { name: "Portal do Fornecedor" })).toBeInTheDocument();

    // ativo: a PO seguinte vai para o portal e aparece por confirmar
    const id = novaPo("gama", "CD-80", 3);
    expect(po(id).portal.state).toBe("sent");
    expect(posDoPortal(lerInventario(), "gama").map((p) => p.id)).toEqual([id]);
    expect(await screen.findByLabelText("1 por confirmar")).toBeInTheDocument();
  });

  it("revogado: o portal mostra \"Acesso revogado\" e não deixa agir; as POs voltam ao email", () => {
    expect(executar((db) => acessoPortal(db, "zeta", "revoke")).erro).toBe("");
    portal("zeta");
    expect(screen.getByRole("heading", { name: "Acesso revogado" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Portal do Fornecedor" })).toBeNull();
    expect(po(novaPo("zeta", "PV-450", 30)).portal.state).toBe("email");
  });
});

describe("Portal do Fornecedor simulado · catálogo e os meus dados", () => {
  it("catálogo editável (novo, editar com preço por aprovar, desativar e mostrar inativos) e os dados gravam na ficha do fornecedor", () => {
    portal("alfa");
    fireEvent.click(screen.getByRole("button", { name: /^Catálogo$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    let dlg = screen.getByRole("dialog", { name: "Novo artigo" });
    fireEvent.change(within(dlg).getByLabelText("Referência"), { target: { value: "ALF-NOVO-1" } });
    fireEvent.change(within(dlg).getByLabelText("Descrição"), { target: { value: "Calha técnica 2 m" } });
    fireEvent.change(within(dlg).getByLabelText("Preço por embalagem (€)"), { target: { value: "12,5" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Acrescentar artigo" }));
    expect(lerInventario().catalog.find((c) => c.ref === "ALF-NOVO-1")).toMatchObject({ sup: "alfa", name: "Calha técnica 2 m", price: 12.5, state: "unlinked" });

    // o preço novo de um artigo que a empresa compra segue como alteração por aprovar
    fireEvent.click(screen.getByRole("button", { name: "Editar ALF-EST4" }));
    dlg = screen.getByRole("dialog", { name: "Editar artigo ALF-EST4" });
    fireEvent.change(within(dlg).getByLabelText("Preço por embalagem (€)"), { target: { value: "170" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Gravar artigo" }));
    expect(lerInventario().catalog.find((c) => c.ref === "ALF-EST4")!.price).toBe(170);
    const comprado = lerInventario().items.find((i) => i.sup === "alfa" && i.ref === "ALF-EST4")!;
    expect(lerInventario().prices.filter((x) => x.itemId === comprado.id && x.state === "pending").map((x) => x.nw)).toEqual([170]);

    fireEvent.click(screen.getByRole("button", { name: "Desativar ALF-NOVO-1" }));
    expect(lerInventario().catalog.find((c) => c.ref === "ALF-NOVO-1")!.inactive).toBe(true);
    expect(screen.queryByRole("button", { name: "Ativar ALF-NOVO-1" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar inativos" }));
    fireEvent.click(screen.getByRole("button", { name: "Ativar ALF-NOVO-1" }));
    expect(lerInventario().catalog.find((c) => c.ref === "ALF-NOVO-1")!.inactive).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Os meus dados/ }));
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "211 222 333" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Gravar dados" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email inválido.");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "novo@alfa.exemplo" } });
    fireEvent.click(screen.getByRole("button", { name: "Gravar dados" }));
    expect(forn("alfa")).toMatchObject({ phone: "211 222 333", email: "novo@alfa.exemplo" });
    expect(screen.getByText("Dados gravados. A empresa já vê a ficha atualizada.")).toBeInTheDocument();
  });
});
