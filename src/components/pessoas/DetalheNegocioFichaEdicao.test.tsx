// O detalhe de um negócio na ficha REAL, com editar e lixo: cada botão só aparece com a permissão certa (pessoas.edit para editar, pessoas.edit e
// pessoas.delete para o lixo) e só na ficha real (o exemplo fica igual); as condições da proposta aparecem na secção da proposta.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DadosNegocio, PropostaCondicoes } from "@/components/negocio-metas/costuraNegocio";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [{ id: "u1", nome: "Ana Gomes" }], isLoading: false, isError: false, repetir: vi.fn() }),
}));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => sucesso.mockReset());
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-19";
const aberto = {
  ...negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" } }),
  notas: "Tudo branco", comercialId: "u1",
};
const ganho = { ...negocioBase("n3", { pessoa: "Ana", servico: "Casa de banho", estadoReal: "ganho" }), resultado: "ganho" as const, mes: "2026-10", notas: "", comercialId: null };
const PROPOSTA: PropostaCondicoes = { id: "p1", estado: "enviada", condicoes: { prazo: 20, inicio: "2026-11-02", pagamento: "metade", garantia: 2 }, legivel: true };

const escritas = (): Partial<MutacoesNegocio> => ({
  editar: vi.fn(async () => ({ mudou: true })), enviarParaLixo: vi.fn(async () => undefined), restaurar: vi.fn(async () => undefined),
  guardarCondicoes: vi.fn(async () => undefined),
});

function abrir(negocio: Parameters<typeof DetalheNegocioFicha>[0]["negocio"], dados: Partial<DadosNegocio> = {}, extra: Partial<MutacoesNegocio> = escritas()) {
  const aoVoltar = vi.fn();
  const mutacoes = mutacoesFalsas(extra);
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos({ podeApagar: true, proposta: () => PROPOSTA, ...dados })}>
        <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={aoVoltar} />
      </ComCostura>
    </MemoryRouter>,
  );
  return { mutacoes, aoVoltar };
}

describe("editar negócio", () => {
  it("aparece com permissão de editar e abre o diálogo com os valores do negócio", () => {
    abrir(aberto);
    fireEvent.click(screen.getByRole("button", { name: "Editar negócio" }));
    const d = screen.getByRole("dialog", { name: "Editar o negócio" });
    expect(within(d).getByRole("textbox", { name: /^Título do negócio/ })).toHaveValue("Cozinha");
    expect(within(d).getByRole("textbox", { name: "Notas" })).toHaveValue("Tudo branco");
  });

  it("guardar chama a base, avisa e devolve o foco ao botão «Editar negócio»", async () => {
    const { mutacoes } = abrir(aberto);
    fireEvent.click(screen.getByRole("button", { name: "Editar negócio" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Título do negócio/ }), { target: { value: "Cozinha nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mutacoes.editar).toHaveBeenCalledWith(expect.objectContaining({ negocioId: "n1", depois: expect.objectContaining({ titulo: "Cozinha nova" }) }));
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: negócio Cozinha atualizado."));
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar negócio" })).toHaveFocus());
  });

  it("sem pessoas.edit não aparece", () => {
    abrir(aberto, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Editar negócio" })).toBeNull();
  });

  it("sem as mutações de editar não aparece", () => {
    abrir(aberto, {}, {});
    expect(screen.queryByRole("button", { name: "Editar negócio" })).toBeNull();
  });

  it("um negócio ganho só se edita depois de reaberto (decisão de 21/10: ver DetalheNegocioFichaFechado.test.tsx)", () => {
    abrir(ganho);
    expect(screen.queryByRole("button", { name: "Editar negócio" })).toBeNull();
  });
});

describe("enviar para o lixo", () => {
  it("aparece com pessoas.edit e pessoas.delete, pede confirmação e só então chama a base", async () => {
    const { mutacoes, aoVoltar } = abrir(aberto);
    fireEvent.click(screen.getByRole("button", { name: "Enviar para o lixo" }));
    expect(mutacoes.enviarParaLixo).not.toHaveBeenCalled();
    const d = screen.getByRole("dialog", { name: "Enviar o negócio para o lixo" });
    fireEvent.click(within(d).getByRole("button", { name: "Enviar para o lixo" }));
    expect(mutacoes.enviarParaLixo).toHaveBeenCalledWith("n1");
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: negócio Cozinha enviado para o lixo."));
    // O negócio já não existe na lista: a ficha volta à lista de negócios.
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });

  it("se o lixo falha, o detalhe fica aberto (não volta à lista)", async () => {
    const enviarParaLixo = vi.fn(async () => { throw Object.assign(new Error("x"), { chave: "pessoasPagina.neg.write.error.permission", codigo: "42501" }); });
    const { aoVoltar } = abrir(aberto, {}, { ...escritas(), enviarParaLixo });
    fireEvent.click(screen.getByRole("button", { name: "Enviar para o lixo" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar para o lixo" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Não tem permissão");
    expect(aoVoltar).not.toHaveBeenCalled();
  });

  it("sem pessoas.delete não aparece", () => {
    abrir(aberto, { podeApagar: false });
    expect(screen.queryByRole("button", { name: "Enviar para o lixo" })).toBeNull();
  });

  it("sem pessoas.edit não aparece (a base exige as duas)", () => {
    abrir(aberto, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Enviar para o lixo" })).toBeNull();
  });

  it("sem a mutação de lixo não aparece", () => {
    abrir(aberto, {}, { editar: vi.fn(async () => ({ mudou: true })) });
    expect(screen.queryByRole("button", { name: "Enviar para o lixo" })).toBeNull();
  });
});

describe("condições da proposta na ficha do negócio", () => {
  it("a secção da proposta mostra as condições", () => {
    abrir(aberto);
    const regiao = screen.getByRole("region", { name: "Condições da proposta" });
    expect(within(regiao).getByText("20 dias úteis")).toBeInTheDocument();
    expect(within(regiao).getByRole("button", { name: "Editar condições" })).toBeInTheDocument();
  });

  it("um negócio sem proposta não mostra a secção de condições", () => {
    abrir({ ...aberto, proposta: null });
    expect(screen.queryByRole("region", { name: "Condições da proposta" })).toBeNull();
  });
});

describe("o exemplo (sem ficha real) fica igual", () => {
  it("não oferece editar nem lixo nem condições", () => {
    render(
      <MemoryRouter>
        <DetalheNegocioFicha negocio={aberto} hoje={HOJE} aoVoltar={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Editar negócio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar para o lixo" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Condições da proposta" })).toBeNull();
  });
});
