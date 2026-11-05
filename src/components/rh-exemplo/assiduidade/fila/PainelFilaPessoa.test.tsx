// A lista de pessoas da fila de trabalho e o painel de cada pessoa: foco e Escape, uma só lista com a etiqueta de cada tipo,
// acções sem permissão desactivadas COM o motivo escrito, filtros guardados no endereço e leituras que falham (nunca «vazio»).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useFilaDeTrabalho", () => ({ useFilaDeTrabalho: vi.fn() }));
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({ usePessoas: () => ({ pessoas: [] }) }));

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { FilaDeTrabalho, PessoaNaFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { agruparPorPessoa, construirItens, ordenarPessoas } from "@/lib/hr/filaDeTrabalho";
import { accoesDoDesvio, chaveDoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { Desvio, PermissoesAssiduidade } from "@/types/hrAssiduidade";
import { ListaFilaPessoas } from "./ListaFilaPessoas";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
});

const hora = {
  id: "h1", pessoaId: "p-ana", data: "2026-10-14", minutos: 90, nocturnoMin: 0, origem: "diaria", motivoOrigem: "saiu às 19:30",
  estado: "pendente", acimaDoLimite: true, motivoDecisao: null, decididoPor: null, pessoaNome: "Ana Silva",
} as HoraExtra;
const desvio = {
  organization_id: "o", pessoa_id: "p-ana", data: "2026-10-12", tipo: "planeado_sem_realizado", hora_inicio: "09:00", hora_fim: "13:00",
  minutos: 240, planeado_id: "pl", local_id: null, referencia_id: null, detalhe: null,
} as Desvio;

const PESSOAS = (): PessoaNaFila[] =>
  ordenarPessoas(
    agruparPorPessoa(construirItens({ horasExtra: [hora], justificacoes: [], desvios: [desvio] }, { accoesDoDesvio, chaveDoDesvio }), () => "Ana Silva"),
    { hoje: "2026-11-05", periodo: null },
  );

const permissoes = (parcial: Partial<PermissoesAssiduidade> = {}): PermissoesAssiduidade =>
  ({ view: true, gerir: false, corrigir: false, faltasEdit: false, justificacaoEdit: true, ...parcial }) as PermissoesAssiduidade;

const filaCom = (parcial: Partial<FilaDeTrabalho> = {}): FilaDeTrabalho => {
  const pessoas = parcial.pessoas ?? PESSOAS();
  return {
    pessoas,
    totalPendencias: pessoas.reduce((s, p) => s + p.total, 0),
    contador: String(pessoas.length),
    horasExtraCortadas: false,
    horasExtra: { lidas: 1, total: 1 },
    fontes: { horas_extra: "ok", justificacoes: "ok", desvios: "ok" },
    aCarregar: false,
    lidaComSucesso: true,
    periodo: { de: "2026-10-22", ate: "2026-11-21" },
    hoje: "2026-11-05",
    recarregar: async () => undefined,
    ...parcial,
  };
};

const arvore = (fila: FilaDeTrabalho, p: PermissoesAssiduidade = permissoes(), url = "/") => (
  <LanguageProvider>
    <MemoryRouter initialEntries={[url]}>
      <ListaFilaPessoas fila={fila} permissoes={p} locais={[]} minhaPessoaId={null} aoAlterarMapa={() => undefined} />
    </MemoryRouter>
  </LanguageProvider>
);
const montar = (fila: FilaDeTrabalho, p: PermissoesAssiduidade = permissoes(), url = "/") => render(arvore(fila, p, url));

const abrirAna = () => {
  const linha = screen.getByRole("button", { name: /^Ana Silva, 2 pendências/ });
  fireEvent.click(linha);
  return linha;
};

describe("lista de pessoas", () => {
  it("é uma lista com nome acessível; cada linha diz as contagens por tipo em texto, o total e o mais antigo", () => {
    montar(filaCom());
    const lista = screen.getByRole("list", { name: "Pessoas com pendências" });
    const linha = within(lista).getByRole("button", { name: /^Ana Silva, 2 pendências: 1 hora extra, 1 alerta, mais antigo: 12\/10\/2026, há 24 dias, abrir$/ });
    expect(linha).toHaveAttribute("aria-haspopup", "dialog");
    expect(linha).toHaveTextContent("1 hora extra");
    expect(linha).toHaveTextContent("1 alerta");
  });

  it("mostra o selo «Fecha em N dias» perto do fim do período da folha", () => {
    const dentro = { ...hora, id: "h2", data: "2026-11-02" } as HoraExtra;
    const itens = construirItens({ horasExtra: [dentro], justificacoes: [], desvios: [] }, { accoesDoDesvio, chaveDoDesvio });
    const pessoas = ordenarPessoas(agruparPorPessoa(itens, () => "Ana Silva"), { hoje: "2026-11-19", periodo: { de: "2026-10-22", ate: "2026-11-21" } });
    montar(filaCom({ pessoas, hoje: "2026-11-19" }));
    expect(screen.getByText("Fecha em 2 dias")).toBeInTheDocument();
  });

  it("o filtro e a pesquisa vêm do endereço da página, e «Limpar filtros» tira-os", () => {
    montar(filaCom(), permissoes(), "/?fila_q=zzz");
    expect(screen.getByLabelText("Pesquisar por nome")).toHaveValue("zzz");
    expect(screen.getByText("Nenhuma pessoa com este filtro.")).toBeInTheDocument();
    expect(screen.getByTestId("rhd-fila-contagem-filtrada")).toHaveTextContent("0 de 1 pessoas");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByRole("button", { name: /^Ana Silva/ })).toBeInTheDocument();
  });

  it("uma fonte que falhou aparece escrita e a lista vazia NÃO diz que não há nada", () => {
    montar(filaCom({ pessoas: [], lidaComSucesso: false, fontes: { horas_extra: "ok", justificacoes: "erro", desvios: "ok" } }));
    expect(screen.getByTestId("rhd-fila-aviso-justificacoes")).toHaveTextContent("Não foi possível ler as justificações");
    expect(screen.queryByTestId("rhd-fila-vazia")).not.toBeInTheDocument();
  });

  it("só diz «Ninguém tem nada por tratar» quando as três fontes leram bem", () => {
    montar(filaCom({ pessoas: [] }));
    expect(screen.getByTestId("rhd-fila-vazia")).toHaveTextContent("Ninguém tem nada por tratar.");
  });

  it("a carregar mostra cinco linhas de esqueleto e nenhum «vazio»", () => {
    montar(filaCom({ pessoas: [], aCarregar: true, lidaComSucesso: false }));
    expect(screen.getByTestId("rhd-fila-a-carregar").children).toHaveLength(6);
    expect(screen.queryByTestId("rhd-fila-vazia")).not.toBeInTheDocument();
  });

  it("com as horas extra cortadas no limite di-lo com os números", () => {
    montar(filaCom({ horasExtraCortadas: true, horasExtra: { lidas: 500, total: 612 } }));
    expect(screen.getByTestId("rhd-fila-cortada")).toHaveTextContent("A mostrar 500 de 612 horas extra pendentes");
  });
});

describe("painel da pessoa", () => {
  it("abre com o foco no título, numa só lista cronológica com a etiqueta de cada tipo, e a ligação à ficha", () => {
    montar(filaCom());
    abrirAna();
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    expect(within(painel).getByText("Ana Silva")).toHaveFocus();
    const lista = within(painel).getByRole("list", { name: "Pendências de Ana Silva, da mais antiga para a mais recente" });
    const itens = within(lista).getAllByTestId(/^item-fila-/).filter((e) => !(e.getAttribute("data-testid") ?? "").endsWith("-porque"));
    // O alerta (12/10) vem antes da hora extra (14/10): da mais antiga para a mais recente.
    expect(itens).toHaveLength(2);
    expect(itens[0].getAttribute("data-testid")).toMatch(/^item-fila-alerta-/);
    expect(itens[1].getAttribute("data-testid")).toBe("item-fila-hora-extra-h1");
    expect(within(itens[0]).getByText("Alerta: Turno planeado sem horas")).toBeInTheDocument();
    expect(within(itens[1]).getByText("Hora extra")).toBeInTheDocument();
    expect(within(painel).getByRole("link", { name: "Abrir ficha (Assiduidade)" })).toHaveAttribute("href", "/rh-exemplo/pessoas/p-ana?aba=planeamento");
  });

  it("sem permissão a acção fica desactivada com o motivo escrito, item a item", () => {
    montar(filaCom(), permissoes({ gerir: false, faltasEdit: false }));
    abrirAna();
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    const alerta = within(painel).getAllByTestId(/^item-fila-alerta-/)[0];
    const marcar = within(alerta).getByRole("button", { name: /^Marcar falta/ });
    expect(marcar).toHaveAttribute("aria-disabled", "true");
    expect(marcar).toHaveAccessibleDescription("Sem permissão para marcar ou anular faltas");
    const extra = within(painel).getByTestId("item-fila-hora-extra-h1");
    expect(within(extra).getByRole("button", { name: /^Confirmar hora extra/ })).toHaveAttribute("aria-disabled", "true");
    expect(within(extra).getByTestId("item-fila-hora-extra-h1-porque")).toHaveTextContent("Sem permissão para decidir horas extra");
    // «Registar tempo a mais» é só para quem gere.
    expect(within(painel).queryByRole("button", { name: "Registar tempo a mais" })).not.toBeInTheDocument();
  });

  it("com permissão as acções ficam activas e «Registar tempo a mais» abre o diálogo", () => {
    montar(filaCom(), permissoes({ gerir: true, corrigir: true, faltasEdit: true }));
    abrirAna();
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    expect(within(painel).getByRole("button", { name: /^Confirmar hora extra/ })).not.toHaveAttribute("aria-disabled");
    expect(within(painel).getByRole("button", { name: /^Marcar falta/ })).not.toHaveAttribute("aria-disabled");
    fireEvent.click(within(painel).getByRole("button", { name: "Registar tempo a mais" }));
    expect(screen.getAllByRole("dialog").at(-1)).not.toBe(painel);
  });

  it("nunca diz «Nada por tratar» se uma fonte não foi lida bem: avisa que os itens podem estar desactualizados", () => {
    const { rerender } = montar(filaCom());
    abrirAna();
    const comFalha = filaCom({ pessoas: [], lidaComSucesso: false, fontes: { horas_extra: "ok", justificacoes: "ok", desvios: "erro" } });
    rerender(arvore(comFalha));
    const painel = screen.getByRole("dialog", { name: "Ana Silva" });
    expect(within(painel).queryByText("Nada por tratar para Ana Silva.")).not.toBeInTheDocument();
    expect(within(painel).getByTestId("painel-fila-desactualizado")).toHaveTextContent("Não foi possível ler os alertas do fim do dia");
    // Com as três fontes lidas e nada por tratar, di-lo.
    rerender(arvore(filaCom({ pessoas: [] })));
    expect(within(screen.getByRole("dialog", { name: "Ana Silva" })).getByText("Nada por tratar para Ana Silva.")).toBeInTheDocument();
  });

  it("sem período da folha lido mostra a nota e nenhum selo de fecho; com período diz que inclui o anterior", () => {
    montar(filaCom({ periodo: null }));
    expect(screen.getByTestId("rhd-fila-periodo")).toHaveTextContent("Sem o período da folha");
    expect(screen.queryByText(/^Fecha/)).not.toBeInTheDocument();
  });

  it("com período a nota diz que os alertas incluem o período anterior", () => {
    montar(filaCom());
    expect(screen.getByTestId("rhd-fila-periodo")).toHaveTextContent("incluem o período anterior");
  });

  it("Escape fecha o painel e o foco volta à linha da pessoa", async () => {
    montar(filaCom());
    const linha = abrirAna();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Ana Silva" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(linha).toHaveFocus());
  });
});
