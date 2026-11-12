// 11/11 (Rúben: «testa e otimiza o fluxo todo; fácil, intuitivo e divertido»): o percurso inteiro na página de demonstração, só por cliques,
// como um utilizador. 12/11 (Rúben: «a validação das medidas e do plano da obra só vêm depois do Financeiro»): proposta enviada → o cliente
// aceita → fatura → pagamento → (Obra) medidas do supervisor e plano aprovado → contrato gerado e assinado → encomenda de cliente → o valor
// mudou: a adenda do acerto.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// sem conta (como no protótipo): sem empresa nem permissões reais
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn(), auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, loading: false }) }));

import PrototipoNegocioSimples from "./PrototipoNegocioSimples";

afterEach(cleanup);
// o jsdom não tem scrollIntoView (a página leva o passo aberto à vista)
Element.prototype.scrollIntoView = function () {};

const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });
const clicar = (nome: string | RegExp) => fireEvent.click(botao(nome));

describe("o fluxo todo, do aceite à obra (11/11)", () => {
  it("percorre-se por cliques, cada passo diz de quem é, e o caminho que falta vê-se desde a proposta enviada", async () => {
    render(<PrototipoNegocioSimples />);
    // antes de o cliente aceitar
    expect(await screen.findByText("À espera do cliente")).toBeTruthy();

    // o cliente aceita: passa ao Financeiro; a fatura (sem ERP, regista-se sem confirmar) e o pagamento
    clicar(/Aceitar a proposta pelo cliente/);
    clicar(/Mudar para .*Financeiro/);
    fireEvent.change(screen.getByPlaceholderText(/FAT/), { target: { value: "FT TESTE/1027" } });
    clicar("Registar fatura");
    clicar(await screen.findByRole("button", { name: "Registar sem confirmar" }).then((b) => b.textContent!.trim()));
    clicar("Validar à mão");

    // pago: na Obra, as Medidas são do supervisor; o Financeiro vê de quem é o passo
    expect(screen.getByText("Este passo é do supervisor, nas Operações.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar as medidas" })).toBeNull();
    clicar(/Mudar para .*Operações/);

    // o supervisor corrige o pavimento: o impacto no orçamento aparece logo
    fireEvent.change(screen.getByLabelText(/Pavimento.*retificada/), { target: { value: "13" } });
    expect(within(screen.getByRole("region", { name: "Impacto no orçamento" })).getByText(/\+.*€ s\/ IVA/)).toBeTruthy();
    clicar("Aceitar as medidas");

    // o plano: a pré-visualização no passo; aprova-se no Estúdio
    expect(screen.getByText(/dias úteis/)).toBeTruthy();
    clicar(/Abrir o estúdio/);
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: /Aprovar o plano/ })[0]);

    // o contrato (o da proposta aceite): é do comercial; falta um campo: a página leva-o lá
    clicar(/Mudar para .*Comercial/);
    fireEvent.click(screen.getAllByRole("button", { name: "Gerar o contrato" })[0]);
    const pen = screen.getByText("Penalização por atraso").closest("div")!.parentElement!;
    fireEvent.click(within(pen).getByRole("button", { name: "Não" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Gerar o contrato" })[0]);
    expect(screen.getByText(/O contrato está no portal do cliente, por assinar/)).toBeTruthy();
    clicar(/Assinar o contrato pelo cliente/);

    // assinado: sai a encomenda de cliente; as medidas mudaram o valor: o acerto numa adenda, preparada pelo comercial
    expect(screen.getByText("O valor mudou: o acerto faz-se numa adenda")).toBeTruthy();
    clicar("Preparar a adenda");
    expect(screen.getAllByText(/AD 2026\/1027-1/).length).toBeGreaterThan(0); // a adenda em rascunho, para verificar e enviar
    expect(screen.getByText("Antes de arrancar")).toBeTruthy();
    expect(await screen.findByText(/Encomenda EC-1027/, undefined, { timeout: 3000 })).toBeTruthy();
  }, 60_000);
});
