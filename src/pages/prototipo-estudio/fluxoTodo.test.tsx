// 11/11 (Rúben: «testa e otimiza o fluxo todo; fácil, intuitivo e divertido»): o percurso inteiro na página de demonstração, só por cliques,
// como um utilizador: proposta enviada → o cliente aceita → medidas (do supervisor) → plano aprovado → o valor mudou: proposta nova → o
// cliente aceita a versão nova (medidas e plano saltam-se) → contrato gerado e assinado → fatura → pagamento → Obra.
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
    // antes de o cliente aceitar: o caminho todo à vista, fechado
    expect(await screen.findByText("À espera do cliente")).toBeTruthy();
    expect(screen.getAllByText(/fechado até o cliente aceitar/).length).toBeGreaterThanOrEqual(3);

    // o cliente aceita: abre nas Medidas; o comercial vê de quem é o passo
    clicar(/Aceitar a proposta pelo cliente/);
    expect(screen.getByText("Este passo é do supervisor, nas Operações.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar as medidas" })).toBeNull();
    clicar(/Mudar para .*Operações/);

    // o supervisor corrige o pavimento: o impacto no orçamento aparece logo
    fireEvent.change(screen.getByLabelText(/Pavimento.*retificada/), { target: { value: "13" } });
    expect(within(screen.getByRole("region", { name: "Impacto no orçamento" })).getByText(/\+.*€ s\/ IVA/)).toBeTruthy();
    clicar("Aceitar as medidas");

    // o plano: a pré-visualização no passo (11/11: o plano em miniatura, as datas e a equipa); aprova-se no Estúdio
    expect(screen.getByText(/dias úteis/)).toBeTruthy();
    clicar(/Abrir o estúdio/);
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: /Aprovar o plano/ })[0]);

    // o valor mudou: a proposta nova é do comercial, com os euros à frente
    expect(screen.getByText("O valor mudou: a proposta tem de ser refeita")).toBeTruthy();
    clicar(/Mudar para .*Comercial/);
    clicar("Refazer a proposta com o orçamento novo");
    expect(screen.getAllByText(/Refeita com as medidas do local/).length).toBeGreaterThan(0);
    clicar(/Enviar a versão 2/);
    clicar(/Aceitar a proposta pelo cliente/);

    // a versão nova aceite: medidas e plano saltam-se; segue o contrato (falta um campo: a página leva-o lá)
    expect(screen.getByText("Plano aprovado. Gerar o contrato")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Gerar o contrato" })[0]);
    const pen = screen.getByText("Penalização por atraso").closest("div")!.parentElement!;
    fireEvent.click(within(pen).getByRole("button", { name: "Não" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Gerar o contrato" })[0]);
    expect(screen.getByText(/O contrato está no portal do cliente, por assinar/)).toBeTruthy();
    clicar(/Assinar o contrato pelo cliente/);

    // o Financeiro: a fatura (sem ERP, regista-se sem confirmar) e o pagamento; passa à Obra
    clicar(/Mudar para .*Financeiro/);
    fireEvent.change(screen.getByPlaceholderText(/FAT/), { target: { value: "FT TESTE/1027" } });
    clicar("Registar fatura");
    clicar(await screen.findByRole("button", { name: "Registar sem confirmar" }).then((b) => b.textContent!.trim()));
    clicar("Validar à mão");
    expect(screen.getByText("Antes de arrancar")).toBeTruthy();
    expect(await screen.findByText(/Encomenda EC-1027/, undefined, { timeout: 3000 })).toBeTruthy();
  }, 60_000);
});
