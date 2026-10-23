// A aba «Negócios» da ficha com o filtro «Lixo»: na ficha real, para quem pode restaurar, a lista traz o filtro; no exemplo (sem contexto) a lista
// fica como sempre.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import type { AcoesFicha } from "./PainelBase";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/hooks/pessoas/useNegociosNoLixo", () => ({ useNegociosNoLixo: () => ({ itens: [], isLoading: false, isError: false, repetir: vi.fn() }) }));

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const HOJE = "2026-10-13";
const acoes = (): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
});
const resumo = resumoBase(pessoaBase("a", { nome: "Ana" }), [negocioBase("n1", { pessoa: "Ana", servico: "Cozinha" })], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));

const outra = resumoBase(pessoaBase("b", { nome: "Bruno" }), [negocioBase("n2", { pessoa: "Bruno", servico: "Sala" })], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));

function propsDe(r: typeof resumo): FichaPessoaProps {
  return {
    resumo: r, aberto: true, aoFechar: vi.fn(), idsVisiveis: [], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[r.pessoa.id, r.pessoa]]), voltou: false, podeVerSubmissoes: false, acoes: acoes(), aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(),
  };
}

const arvore = (r: typeof resumo, comFicha: boolean, dados = {}) => (
  <MemoryRouter>
    {comFicha
      ? (
        <ComCostura
          mutacoes={mutacoesFalsas({ restaurar: vi.fn(async () => undefined), enviarParaLixo: vi.fn(async () => undefined) })}
          dados={dadosFalsos({ podeApagar: true, ...dados })}
        >
          <FichaPessoa {...propsDe(r)} />
        </ComCostura>
      )
      : <FichaPessoa {...propsDe(r)} />}
  </MemoryRouter>
);

const irParaNegocios = () => {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Negócios/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Negócios/ }));
};

function montar(comFicha: boolean, dados = {}) {
  const r = render(arvore(resumo, comFicha, dados));
  irParaNegocios();
  return r;
}

describe("a aba Negócios da ficha e o lixo", () => {
  it("na ficha real, com pessoas.delete, mostra o filtro e a lista de negócios", () => {
    montar(true);
    expect(screen.getByRole("group", { name: "Negócios a mostrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cozinha/ })).toBeInTheDocument();
  });

  it("escolher «Lixo» mostra o lixo (vazio) no lugar da lista", () => {
    montar(true);
    fireEvent.click(screen.getByRole("button", { name: "Lixo" }));
    expect(screen.getByText(/O lixo está vazio/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cozinha/ })).toBeNull();
  });

  it("sem pessoas.delete a lista fica sem filtro", () => {
    montar(true, { podeApagar: false });
    expect(screen.queryByRole("group", { name: "Negócios a mostrar" })).toBeNull();
    expect(screen.getByRole("button", { name: /Cozinha/ })).toBeInTheDocument();
  });

  it("no exemplo (sem ficha real) a lista fica igual: sem filtro", () => {
    montar(false);
    expect(screen.queryByRole("group", { name: "Negócios a mostrar" })).toBeNull();
    expect(screen.getByRole("button", { name: /Cozinha/ })).toBeInTheDocument();
  });
});

describe("o foco e a troca de pessoa", () => {
  it("abrir o separador Negócios não puxa o foco para o filtro", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    montar(true);
    expect(within(screen.getByRole("group", { name: "Negócios a mostrar" })).getByRole("button", { name: "Em lista" })).not.toHaveFocus();
  });

  it("depois de mandar um negócio para o lixo, o detalhe fecha-se e o foco vai para o filtro «Em lista»", async () => {
    montar(true);
    fireEvent.click(screen.getByRole("button", { name: /Cozinha/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar para o lixo" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar para o lixo" }));
    const filtro = await screen.findByRole("group", { name: "Negócios a mostrar" });
    await waitFor(() => expect(within(filtro).getByRole("button", { name: "Em lista" })).toHaveFocus());
  });

  it("trocar de pessoa com «Lixo» escolhido volta a «Em lista» (o estado do filtro não passa para a outra pessoa)", () => {
    const { rerender } = montar(true);
    fireEvent.click(screen.getByRole("button", { name: "Lixo" }));
    expect(screen.getByText(/O lixo está vazio/)).toBeInTheDocument();
    rerender(arvore(outra, true));
    irParaNegocios();
    expect(screen.getByRole("button", { name: "Em lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/O lixo está vazio/)).toBeNull();
    expect(screen.getByRole("button", { name: /Sala/ })).toBeInTheDocument();
  });
});
