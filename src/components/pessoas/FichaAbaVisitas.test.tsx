// A aba «Visitas» da ficha da pessoa: a ordem das abas e o contador, o Resumo que só mostra a «Próxima visita» (com «Ver todas»), a aba que
// reutiliza a secção de visitas tal como está, e o que acontece sem próxima visita.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key);
  return { useTranslation: () => ({ language: "pt", t }) };
});

beforeAll(prepararRadixNoJsdom);

const HOJE = "2026-10-13";
const acoesBase = (): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
});

function montar(resumo: ResumoPessoa, sobre: Partial<FichaPessoaProps> = {}) {
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: [], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: false, acoes: acoesBase(),
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), ...sobre,
  };
  render(<FichaPessoa {...props} />);
  return props;
}

const pessoa = (v: VisitaPessoa[], extra: Partial<Pessoa> = {}) =>
  resumoBase(pessoaBase("a", { nome: "Ana", ...extra }), [], HOJE, "lead", registosBase({ contactos: [contactoBase()], visitas: v }));
const abrirAba = (nome: RegExp) => {
  fireEvent.mouseDown(screen.getByRole("tab", { name: nome }));
  fireEvent.click(screen.getByRole("tab", { name: nome }));
};
const TRES = () => [
  visitaPessoaBase("v-cedo", { data: "2026-10-20", hora: "09:00" }),
  visitaPessoaBase("v-tarde", { data: "2026-10-27", hora: "11:00" }),
  visitaPessoaBase("v-cancelada", { data: "2026-10-15", estado: "cancelada" }),
];

describe("Ficha: a aba Visitas", () => {
  it("as abas seguem a ordem Resumo, Visitas, Negócios, Submissões, Notas, Atividade", () => {
    montar(pessoa(TRES()), { podeVerSubmissoes: true });
    const nomes = screen.getAllByRole("tab").map((a) => /^[^\d,]+/.exec(a.textContent ?? "")?.[0].trim());
    expect(nomes).toEqual(["Resumo", "Visitas", "Negócios", "Submissões", "Notas", "Atividade"]);
  });

  it("o contador conta as visitas que não estão canceladas", () => {
    montar(pessoa(TRES()));
    expect(screen.getByRole("tab", { name: /^Visitas/ })).toHaveTextContent(/Visitas.*2/);
  });

  it("a aba mostra a secção de visitas com todas, por ordem, as canceladas marcadas, sem o botão do passo repetido", () => {
    montar(pessoa(TRES()));
    abrirAba(/^Visitas/);
    const painel = screen.getByRole("tabpanel");
    expect(within(painel).getByRole("heading", { name: "Visitas" })).toBeInTheDocument();
    expect(within(painel).getAllByRole("listitem")).toHaveLength(3);
    expect(within(painel).getByText("Cancelada")).toBeInTheDocument();
  });

  it("sem visitas a aba diz que não há (e o contador é 0)", () => {
    montar(pessoa([]));
    expect(screen.getByRole("tab", { name: /^Visitas/ })).toHaveTextContent(/Visitas.*0/);
    abrirAba(/^Visitas/);
    expect(within(screen.getByRole("tabpanel")).getByText("Esta pessoa ainda não tem visitas.")).toBeInTheDocument();
  });

  it("só canceladas na primeira página mas há mais por carregar: a aba oferece «Carregar mais» em vez de ficar só com o texto de vazio", () => {
    const aoPedir = vi.fn();
    montar(pessoa([visitaPessoaBase("v-c", { data: "2026-10-15", estado: "cancelada" })]), {
      maisItens: { visitas: { temMais: true, aCarregar: false, erro: null, aoPedir } },
    });
    abrirAba(/^Visitas/);
    const botao = within(screen.getByRole("tabpanel")).getByRole("button", { name: /more\.visitas|mais visitas/i });
    fireEvent.click(botao);
    expect(aoPedir).toHaveBeenCalledTimes(1);
  });

  it("com mais visitas por carregar o contador diz «2+» e o leitor de ecrã ouve «ou mais»", () => {
    montar(pessoa(TRES()), { maisItens: { visitas: { temMais: true, aCarregar: false, erro: null, aoPedir: vi.fn() } } });
    const aba = screen.getByRole("tab", { name: /^Visitas/ });
    expect(aba).toHaveTextContent(/Visitas.*2\+/);
    expect(aba).toHaveTextContent(/2 ou mais/);
  });

  it("uma pessoa perdida não tem visitas à vista, como no Resumo", () => {
    montar(pessoa(TRES(), { perdida: { motivo: "preco", data: "2026-10-01" } }));
    expect(screen.getByRole("tab", { name: /^Visitas/ })).toHaveTextContent(/Visitas.*0/);
  });
});

describe("Ficha: o Resumo só mostra a próxima visita", () => {
  it("lista só a primeira por fazer a partir de hoje, sem a secção «Visitas» nem as outras", () => {
    montar(pessoa(TRES()));
    const resumo = screen.getByRole("tabpanel");
    expect(within(resumo).getByRole("heading", { name: "Próxima visita" })).toBeInTheDocument();
    expect(within(resumo).queryByRole("heading", { name: "Visitas" })).toBeNull();
    const bloco = within(resumo).getByRole("heading", { name: "Próxima visita" }).closest("section")!;
    expect(within(bloco).getAllByRole("listitem")).toHaveLength(1);
    expect(bloco).toHaveTextContent(/20\/10\/2026/);
    expect(resumo).not.toHaveTextContent(/27\/10\/2026/);
  });

  it("«Ver todas» passa à aba Visitas, com todas as visitas", () => {
    montar(pessoa(TRES()));
    fireEvent.click(screen.getByRole("button", { name: /^Ver todas/ }));
    expect(screen.getByRole("tab", { name: /^Visitas/ })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("uma visita que já passou, por concluir, não é a próxima: o bloco não aparece", () => {
    montar(pessoa([visitaPessoaBase("v-passou", { data: "2026-10-12" })]));
    const resumo = screen.getByRole("tabpanel");
    expect(within(resumo).queryByRole("heading", { name: "Próxima visita" })).toBeNull();
    expect(within(resumo).queryByRole("button", { name: /^Ver todas/ })).toBeNull();
    expect(resumo).not.toHaveTextContent(/ainda não foi concluída/);
  });

  it("só visitas feitas ou canceladas: o bloco não aparece", () => {
    montar(pessoa([visitaPessoaBase("v-feita", { data: "2026-10-20", estado: "feita" }), visitaPessoaBase("v-c", { data: "2026-10-21", estado: "cancelada" })]));
    expect(within(screen.getByRole("tabpanel")).queryByRole("heading", { name: "Próxima visita" })).toBeNull();
  });

  it("o passo remete para o bloco «Próxima visita» quando ele existe", () => {
    montar(pessoa([visitaPessoaBase("v1", { data: "2026-10-20" })]));
    expect(within(screen.getByRole("tabpanel")).getByText(/vê o bloco «Próxima visita» acima/)).toBeInTheDocument();
  });

  it("sem próxima visita o passo remete para a aba «Visitas»", () => {
    montar(pessoa([visitaPessoaBase("v-passou", { data: "2026-10-12" })]));
    expect(within(screen.getByRole("tabpanel")).getByText(/aba «Visitas»/)).toBeInTheDocument();
  });
});
