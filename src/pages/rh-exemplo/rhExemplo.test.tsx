// A lista de pessoas de RH e a ficha em painel, LIGADAS À BASE: as pessoas, os cargos e as contas vêm do Supabase (simulado por
// src/test/rhExemploProviders.tsx), já não de uma loja de exemplo em memória.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
// O simulado devolve a lista inteira de `pessoas` a qualquer filtro; a ficha pede UMA pessoa (`eq("id", ...)`), por isso aqui
// `pessoas` obedece a esse filtro. Tudo o resto fica como no utilitário.
vi.mock("@/integrations/supabase/client", async () => {
  const { moduloSupabaseFalso, rhTeste: estado } = await import("@/test/rhExemploProviders");
  const { supabase: base } = moduloSupabaseFalso();
  const pessoasPorId = () => {
    let id: unknown;
    const linhas = () => (estado.respostas["pessoas"] as Array<{ id: string }> | undefined ?? []).filter((p) => id === undefined || p.id === id);
    const cadeia: unknown = new Proxy(() => undefined, {
      get: (_alvo, nome) => {
        if (nome === "eq") return (coluna: string, valor: unknown) => { if (coluna === "id") id = valor; return cadeia; };
        if (nome === "then") return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: linhas(), error: null }).then(ok, ko);
        if (nome === "single" || nome === "maybeSingle") return () => Promise.resolve({ data: linhas()[0] ?? null, error: null });
        return () => cadeia;
      },
      apply: () => cadeia,
    });
    return cadeia;
  };
  return { supabase: { ...base, from: (tabela: string) => (tabela === "pessoas" ? pessoasPorId() : base.from(tabela)) } };
});

const renderEm = (endereco: string) =>
  renderRh(
    <Routes>
      <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
      <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
    </Routes>,
    { rota: endereco },
  );

const pessoa = (id: string, primeiro: string, apelido: string, extra: Record<string, unknown> = {}) => ({
  id, organization_id: "org-teste", numero_interno: null, primeiro_nome: primeiro, apelido, nome_completo: `${primeiro} ${apelido}`,
  email_trabalho: null, email_pessoal: null, telefone_trabalho: null, cargo: null, cargo_id: null, local_trabalho: null, local_id: null,
  entidade_legal_org_id: null, reporta_a_pessoa_id: null, data_admissao: "2024-03-01", data_antiguidade: null, data_saida: null,
  estado_registo: "activo", notas: null, fotografia_anexo_id: null, ...extra,
});

/** Por ordem alfabética do nome completo, como a base devolve. */
const PESSOAS = [
  pessoa("p-beatriz", "Beatriz", "Lopes"),
  pessoa("p-marta", "Marta", "Figueiredo"),
  pessoa("p-rui", "Rui", "Amaral", { cargo: "Gerente de Loja", cargo_id: "cargo-gerente" }),
  pessoa("p-tiago", "Tiago", "Sousa"),
];

beforeAll(() => {
  // O Radix precisa de APIs que o jsdom não traz.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  reporRhTeste();
  window.localStorage.setItem("language", "pt");
  rhTeste.isSystemAdmin = true;
  rhTeste.respostas["pessoas"] = PESSOAS;
  rhTeste.respostas["hr_cargos"] = [
    { id: "cargo-gerente", organization_id: "org-teste", nome: "Gerente de Loja", horas_referencia: 40, activo: true, created_at: "2026-01-01", updated_at: "2026-01-01" },
  ];
});

describe("RH de exemplo: lista de pessoas", () => {
  it("abre e mostra, vindas da base, os totais e as pessoas", async () => {
    renderEm("/rh-exemplo/pessoas");
    const tabela = await screen.findByRole("table");
    expect(await within(tabela).findByText("Marta Figueiredo")).toBeInTheDocument();
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + PESSOAS.length);
    expect(within(tabela).getByText("Rui Amaral")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("filtra pela pesquisa", async () => {
    renderEm("/rh-exemplo/pessoas");
    await screen.findByText("Marta Figueiredo");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Beatriz" } });
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(2);
    expect(within(tabela).getByText("Beatriz Lopes")).toBeInTheDocument();
  });

  it("sem pessoas na base, não inventa nenhuma", async () => {
    rhTeste.respostas["pessoas"] = [];
    renderEm("/rh-exemplo/pessoas");
    await screen.findByRole("heading", { level: 1, name: /Pessoas/ });
    expect(screen.queryByText("Marta Figueiredo")).not.toBeInTheDocument();
  });
});

describe("RH de exemplo: ficha da pessoa (painel lateral)", () => {
  it("a ligação direta abre a lista com a ficha em painel, com o nome, a linha Filial · Cargo e as oito abas (a última é o Custo)", async () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const ficha = await screen.findByRole("dialog");
    expect(await within(ficha).findByRole("heading", { level: 1, name: /Rui Amaral/ })).toBeInTheDocument();
    // O cargo vem do catálogo da base; a filial, do centro de trabalho (esta pessoa não tem).
    expect(within(ficha).getByText(/^.+ · Gerente de Loja$/)).toBeInTheDocument();
    const abas = within(ficha).getAllByRole("tab");
    expect(abas).toHaveLength(8);
    expect(abas[7]).toHaveTextContent("Custo");
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
  });

  it("muda de aba dentro do painel", async () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    await within(await screen.findByRole("dialog")).findByRole("heading", { level: 1, name: /Rui Amaral/ });
    const abas = within(screen.getByRole("dialog")).getAllByRole("tab");
    fireEvent.mouseDown(abas[3], { button: 0 });
    expect(within(screen.getByRole("dialog")).getAllByRole("tab")[3]).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(abas[4], { button: 0 });
    expect(within(screen.getByRole("dialog")).getAllByRole("tab")[4]).toHaveAttribute("aria-selected", "true");
  });

  it("um clique numa linha da lista abre a ficha dessa pessoa por cima da lista", async () => {
    renderEm("/rh-exemplo/pessoas");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(within(await screen.findByRole("table")).getByText("Beatriz Lopes"));
    expect(await within(await screen.findByRole("dialog")).findByRole("heading", { level: 1, name: /Beatriz Lopes/ })).toBeInTheDocument();
  });

  it("anterior e seguinte passam à pessoa vizinha e mostram n de N; Fechar fecha o painel", async () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const ficha = () => screen.getByRole("dialog");
    await within(await screen.findByRole("dialog")).findByRole("heading", { level: 1, name: /Rui Amaral/ });
    expect(within(ficha()).getByText(`3 de ${PESSOAS.length}`)).toBeInTheDocument();
    fireEvent.click(within(ficha()).getByRole("button", { name: "Pessoa seguinte" }));
    expect(await within(ficha()).findByRole("heading", { level: 1, name: /Tiago Sousa/ })).toBeInTheDocument();
    expect(within(ficha()).getByText(`4 de ${PESSOAS.length}`)).toBeInTheDocument();
    fireEvent.click(within(ficha()).getByRole("button", { name: "Pessoa anterior" }));
    expect(await within(ficha()).findByRole("heading", { level: 1, name: /Rui Amaral/ })).toBeInTheDocument();
    fireEvent.click(within(ficha()).getByRole("button", { name: "Fechar a ficha" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a tecla ] passa à pessoa seguinte", async () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    await within(await screen.findByRole("dialog")).findByRole("heading", { level: 1, name: /Rui Amaral/ });
    fireEvent.keyDown(document.body, { key: "]" });
    expect(await within(screen.getByRole("dialog")).findByRole("heading", { level: 1, name: /Tiago Sousa/ })).toBeInTheDocument();
  });

  it("tem um só botão primário no cabeçalho: Criar acesso, a quem ainda não tem conta", async () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const ficha = await screen.findByRole("dialog");
    await within(ficha).findByRole("heading", { level: 1, name: /Rui Amaral/ });
    expect(within(ficha).getByRole("button", { name: "Mais ações desta pessoa" })).toBeInTheDocument();
    expect(within(ficha).getAllByRole("button", { name: /Criar acesso/ })).toHaveLength(1);
  });

  it("uma pessoa que não existe abre o painel com o aviso de não encontrada", async () => {
    renderEm("/rh-exemplo/pessoas/nao-existe");
    const ficha = await screen.findByRole("dialog");
    expect(await within(ficha).findByText("Esta pessoa não existe (ou já não existe).")).toBeInTheDocument();
    expect(within(ficha).queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
