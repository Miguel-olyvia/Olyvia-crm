// O fluxo dos pedidos, de ponta a ponta e em memória: a visita e o levantamento são de CADA pedido, uma pessoa tem vários pedidos e
// negócios em paralelo, e o negócio criado substitui o pedido e herda o serviço dele. Duas partes: um arnês com o Quadro e o
// `ProcessoProvider` (pedidos com serviços diferentes, para os nomes dos botões serem únicos) e a página real (o cliente que cria o
// negócio com ou sem visita, e o Quadro de Negócios real).
import { useMemo, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NegocioMetas from "@/pages/NegocioMetas";
import Pessoas from "@/pages/Pessoas";
import { faseDoNegocio } from "@/components/negocio-metas/negocioMetas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negociosNovos, repor as reporNegocios, criarNegocioNovo, useNegociosNovos } from "@/components/negocio-metas/negociosNovos";
import {
  alterarVisitaDoPedido, criarPedidoGuardado, guardarPedido, marcarVisitaDaPessoa, removerPedido, type EstadoPedidos,
} from "../acoesPedido";
import { registarChamada } from "../acoesPessoa";
import { pedidoBase, pessoaBase, visitaBase } from "../fabricaTestes";
import { juntarPessoas } from "../juntarPessoas";
import { paraOpcao } from "../pessoaOpcao";
import { repor as reporPessoas } from "../pessoasNovas";
import { CHAVE_PREFS_PESSOAS } from "../preferenciasPessoas";
import { cartoesDoQuadro } from "../quadro/cartoesQuadroPessoas";
import { QuadroPessoas } from "../quadro/QuadroPessoas";
import { itensDaPessoa } from "./itensProcesso";
import { ProcessoProvider, type AcoesProcesso } from "./ProcessoProvider";

vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, "sidebar.crm": "CRM" };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

/** Os fluxos abrem painéis e preenchem formulários compridos: com a máquina ocupada passam dos 5 s por omissão. */
const TEMPO = 30_000;
const HOJE = HOJE_EXEMPLO;
const GUARDAR = "Guardar a visita e o levantamento";

const botao = (nome: string) => screen.getByRole("button", { name: nome });
const coluna = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;
const escolher = async (dialogo: HTMLElement, campo: RegExp | string, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};
const marcarFeitaNoPainel = (painel: HTMLElement) => fireEvent.click(within(painel).getByRole("button", { name: /^Marcar como feita a visita de/ }));
const preencherLinha = async (painel: HTMLElement) => {
  fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
  fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
  await escolher(painel, /^Divisão ou zona/, "Cozinha");
  await escolher(painel, /^Trabalho a fazer/, "Bancada nova");
  fireEvent.change(within(painel).getByLabelText(/^Medida(?!s)/), { target: { value: "3.5" } });
};
beforeEach(() => window.localStorage.clear());
afterEach(() => { reporPessoas(); reporNegocios(); });

// O arnês: uma pessoa com dois pedidos em paralelo, cada um com o seu serviço e a sua visita.
const ANA = pessoaBase("a", { nome: "Ana", morada: { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" } });
const pedidosIniciais = () => [
  pedidoBase("pd-1", { pessoaId: "a", servico: "Cozinha", contactado: true, visitas: [visitaBase("pd-1-v1", { data: "2026-10-20", hora: "10:00" })] }),
  pedidoBase("pd-2", { pessoaId: "a", servico: "Janelas", contactado: true, visitas: [visitaBase("pd-2-v1", { data: "2026-11-05", hora: "14:00" })] }),
];

function Arnes({ onEstado }: { onEstado?: (e: EstadoPedidos) => void }) {
  const [estado, setEstado] = useState<EstadoPedidos>({ pessoas: [ANA], pedidos: pedidosIniciais(), atividade: [], contactadas: [] });
  onEstado?.(estado);
  const negocios = useNegociosNovos();
  const resumos = useMemo(() => juntarPessoas(estado.pessoas, negocios, HOJE, estado.pedidos), [estado.pessoas, estado.pedidos, negocios]);
  const nada = () => {};
  const acoes: AcoesProcesso = {
    registarChamada: (id, d) => setEstado((e) => registarChamada(e, id, { ...d, hoje: HOJE })),
    adiar: nada, perder: nada, reativar: nada, juntarNota: nada,
    alterarVisita: (pedidoId, visitaId, d) => setEstado((e) => alterarVisitaDoPedido(e, pedidoId, visitaId, d, HOJE)),
    marcarVisita: (pessoaId, escolha, d) => setEstado((e) => marcarVisitaDaPessoa(e, pessoaId, escolha, d, HOJE)),
    guardarPedido: (pedidoId, d) => setEstado((e) => guardarPedido(e, pedidoId, d, HOJE)),
    criarPedidoComVisitas: (d, guardar) => setEstado((e) => criarPedidoGuardado(e, d, guardar, HOJE)),
    removerPedido: (pedidoId) => setEstado((e) => removerPedido(e, pedidoId)),
  };
  const itens = new Map(resumos.flatMap((r) => itensDaPessoa(r, HOJE)).map((i) => [i.id, i]));
  return (
    <ProcessoProvider
      hoje={HOJE} resumos={resumos} acoes={acoes} opcoesPessoa={[paraOpcao(ANA)]} aoCriarNegocio={(d) => criarNegocioNovo(d, HOJE).id} aoAnunciar={() => {}}
    >
      <QuadroPessoas cartoes={cartoesDoQuadro(resumos, HOJE)} itens={itens} hoje={HOJE} chip="todas" aoAbrir={() => {}} aoLimpar={() => {}} />
    </ProcessoProvider>
  );
}

const MARCAR_COZINHA = "Marcar a visita como feita: Cozinha de Ana";
const MARCAR_JANELAS = "Marcar a visita como feita: Janelas de Ana";

describe("pedidos em paralelo na mesma pessoa", () => {
  it("dois pedidos dão dois cartões na fase Visita, com botões de nome único (o passo, o trabalho e a pessoa)", () => {
    render(<Arnes />);
    const visita = within(coluna("Visita"));
    expect(visita.getAllByRole("listitem")).toHaveLength(2);
    expect(visita.getByRole("button", { name: MARCAR_COZINHA })).toBeInTheDocument();
    expect(visita.getByRole("button", { name: MARCAR_JANELAS })).toBeInTheDocument();
  });

  it("«Marcar a visita como feita» abre as 7 secções, na secção Visitas, com a visita do pedido certo e não a do outro", async () => {
    render(<Arnes />);
    fireEvent.click(botao(MARCAR_JANELAS));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Ana · Janelas" });
    const seccoes = within(painel).getByRole("navigation", { name: "Secções da visita" });
    expect(within(seccoes).getAllByRole("listitem")).toHaveLength(7);
    expect(within(seccoes).getByRole("button", { name: /^Visitas/ })).toHaveAttribute("aria-current", "step");
    expect(within(painel).getByText(/Por fazer · 05\/11\/2026 · 14:00/)).toBeInTheDocument();
    expect(within(painel).queryByText(/20\/10\/2026/)).not.toBeInTheDocument();
    cleanup();
    render(<Arnes />);
    fireEvent.click(botao(MARCAR_COZINHA));
    const outro = await screen.findByRole("dialog", { name: "Visita e levantamento de Ana · Cozinha" });
    expect(within(outro).getByText(/Por fazer · 20\/10\/2026 · 10:00/)).toBeInTheDocument();
    expect(within(outro).queryByText(/05\/11\/2026/)).not.toBeInTheDocument();
  }, TEMPO);

  it("guardar a visita feita de um pedido não mexe no outro: o outro continua por marcar como feito", async () => {
    render(<Arnes />);
    fireEvent.click(botao(MARCAR_JANELAS));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Ana · Janelas" });
    marcarFeitaNoPainel(painel);
    await preencherLinha(painel);
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Criar o negócio: Janelas de Ana")).toBeInTheDocument();
    expect(botao(MARCAR_COZINHA)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar o negócio: Cozinha de Ana" })).not.toBeInTheDocument();
  }, TEMPO);

  it("guardar com a visita feita e sem linhas guarda na mesma (o levantamento é opcional): o painel fecha e o passo passa a «Criar o negócio»", async () => {
    render(<Arnes />);
    fireEvent.click(botao(MARCAR_JANELAS));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Ana · Janelas" });
    marcarFeitaNoPainel(painel);
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Criar o negócio: Janelas de Ana")).toBeInTheDocument();
  }, TEMPO);

  it("o negócio criado a partir de um pedido com a visita feita e sem linhas nasce em Orçamento, herda o serviço e fica sem orçamento (o passo seguinte é «Criar o orçamento»)", async () => {
    render(<Arnes />);
    fireEvent.click(botao(MARCAR_JANELAS));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Ana · Janelas" });
    marcarFeitaNoPainel(painel);
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(botao("Criar o negócio: Janelas de Ana"));
    const criar = await screen.findByRole("dialog", { name: "Novo negócio de Ana" });
    fireEvent.click(within(criar).getByRole("button", { name: "Criar negócio" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({ servico: "Janelas", orcamentos: [] });
    expect(faseDoNegocio(negociosNovos()[0])).toBe("orcamento");
    expect(within(coluna("Orçamento")).getByRole("button", { name: "Criar o orçamento: Janelas de Ana" })).toBeInTheDocument();
  }, TEMPO);

  it("criar o negócio de um pedido remove esse pedido (o outro fica) e o negócio herda o serviço dele", async () => {
    render(<Arnes />);
    fireEvent.click(botao(MARCAR_JANELAS));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Ana · Janelas" });
    marcarFeitaNoPainel(painel);
    await preencherLinha(painel);
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(botao("Criar o negócio: Janelas de Ana"));
    const criar = await screen.findByRole("dialog", { name: "Novo negócio de Ana" });
    fireEvent.click(within(criar).getByRole("button", { name: "Criar negócio" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({ pessoaId: "a", servico: "Janelas" });
    expect(negociosNovos()[0].visitas?.map((v) => v.estado)).toEqual(["feita"]);
    // O pedido das Janelas saiu da fase Visita e entrou o negócio em Orçamento; o da Cozinha continua onde estava.
    expect(within(coluna("Visita")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(coluna("Visita")).getByRole("button", { name: MARCAR_COZINHA })).toBeInTheDocument();
    expect(within(coluna("Orçamento")).getByText("Janelas")).toBeInTheDocument();
  }, TEMPO);
});

// A página real: o cliente escolhe criar o negócio com ou sem visita.
const aplicacao = (endereco: string) => (
  <MemoryRouter initialEntries={[endereco]}>
    <Routes>
      <Route path="/pessoas" element={<Pessoas />} />
      <Route path="/negocio-metas" element={<NegocioMetas />} />
    </Routes>
  </MemoryRouter>
);
const abrirFicha = (id: string, vista: "quadro" | "lista" = "quadro") => {
  window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista }));
  render(aplicacao(`/pessoas?open=${id}`));
  return screen.getByRole("dialog");
};
/** O botão «Mais» da ficha abre com o teclado (o menu do Radix não abre com um clique simulado). */
const abrirMenuMais = (ficha: HTMLElement) => fireEvent.keyDown(within(ficha).getByRole("button", { name: "Mais" }), { key: "Enter" });

describe("o cliente cria o negócio com visita ou sem visita", () => {
  it("o menu «Mais» de um cliente tem «Novo negócio com visita» e «Novo negócio sem visita» (e não «Criar negócio»); o de uma lead tem «Novo negócio com visita» e «Criar negócio» (o sem visita dela)", async () => {
    const ficha = abrirFicha("p-marta");
    abrirMenuMais(ficha);
    expect(await screen.findByRole("menuitem", { name: "Novo negócio com visita" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Novo negócio sem visita" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Criar negócio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Visita concluída → Criar negócio" })).not.toBeInTheDocument();
    cleanup();
    const fichaLead = abrirFicha("p-beatriz");
    abrirMenuMais(fichaLead);
    expect(await screen.findByRole("menuitem", { name: "Criar negócio" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Novo negócio com visita" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Novo negócio sem visita" })).not.toBeInTheDocument();
  });

  it("uma lead também pode escolher «Novo negócio com visita»: abre o painel de visita e levantamento para um pedido novo dela", async () => {
    const ficha = abrirFicha("p-beatriz");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio com visita" }));
    expect(await screen.findByRole("dialog", { name: "Visita e levantamento de Beatriz Sampaio" })).toBeInTheDocument();
  }, TEMPO);

  it("«Adiar» fica desativado, com a explicação em texto, quando o próximo contacto é uma visita; numa lead com chamada agendada continua a funcionar", async () => {
    const fichaRita = abrirFicha("p-rita");
    abrirMenuMais(fichaRita);
    const adiar = await screen.findByRole("menuitem", { name: /^Adiar/ });
    expect(adiar).toHaveAttribute("aria-disabled", "true");
    expect(adiar).toHaveTextContent("O próximo contacto é uma visita: altere-a em «Alterar visita».");
    cleanup();
    const fichaHugo = abrirFicha("p-hugo");
    abrirMenuMais(fichaHugo);
    const outro = await screen.findByRole("menuitem", { name: "Adiar" });
    expect(outro).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(outro);
    expect(await screen.findByRole("heading", { name: "Adiar o próximo contacto" })).toBeInTheDocument();
  }, TEMPO);

  it("«Novo negócio sem visita»: cancelar devolve o foco ao botão «Mais» da ficha; criar leva-o ao nome da pessoa (o item que abriu o painel já não é o ponto de partida)", async () => {
    const ficha = abrirFicha("p-marta");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio sem visita" }));
    let painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).not.toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Mais" })).toHaveFocus());
    abrirMenuMais(screen.getByRole("dialog"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio sem visita" }));
    painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).not.toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Marta Silveira", level: 2 })).toHaveFocus());
  }, TEMPO);

  it("«Criar negócio» de uma lead: cancelar devolve o foco ao «Mais»; criar leva-o ao nome da pessoa", async () => {
    const ficha = abrirFicha("p-hugo");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Criar negócio" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Mais" })).toHaveFocus());
  }, TEMPO);

  it("com visita: abre o painel de visita e levantamento e, ao guardar uma visita, cria um pedido já em Visita (ainda sem negócio)", async () => {
    const ficha = abrirFicha("p-marta");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio com visita" }));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Marta Silveira" });
    expect(within(painel).getByRole("button", { name: /^Visitas/ })).toHaveAttribute("aria-current", "step");
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar visita" }));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Visita e levantamento de Marta Silveira" })).not.toBeInTheDocument());
    expect(negociosNovos()).toHaveLength(0);
    // O pedido novo aparece no Quadro, na fase Visita, com o passo de marcar a visita como feita.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByRole("button", { name: "Marcar a visita como feita: Pedido de 13/10/2026 de Marta Silveira" })).toBeInTheDocument();
  }, TEMPO);

  it("com visita e sem nenhuma visita: o painel recusa guardar e diz que falta a visita", async () => {
    const ficha = abrirFicha("p-marta");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio com visita" }));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Marta Silveira" });
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(await within(painel).findByRole("alert")).toHaveTextContent("Este pedido ainda não tem visita marcada.");
    expect(screen.getByRole("dialog", { name: "Visita e levantamento de Marta Silveira" })).toBe(painel);
  }, TEMPO);

  it("sem visita: abre o painel «Novo negócio» como sempre (visitas vazias) e o negócio nasce em Orçamento, sem exigir levantamento nem criar pedido", async () => {
    const ficha = abrirFicha("p-marta");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio sem visita" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    expect(within(painel).getByRole("combobox", { name: /Pessoa/ })).toHaveTextContent("Marta Silveira");
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({ pessoaId: "p-marta", pessoa: "Marta Silveira", servico: "" });
    expect(faseDoNegocio(negociosNovos()[0])).toBe("orcamento");
    expect(negociosNovos()[0].visitas ?? []).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).not.toBeInTheDocument());
    // Nenhum pedido novo para a Marta: nada de «Pedido novo» dela no Quadro.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Pedido de 13\/10\/2026 de Marta Silveira/ })).not.toBeInTheDocument();
  }, TEMPO);

  it("uma lead por contactar (sem visita nem levantamento) cria o negócio pela ficha, sem exigência, e troca o pedido dela pelo negócio: o pedido sai do Quadro e o negócio entra em Orçamento", async () => {
    const ficha = abrirFicha("p-hugo");
    expect(within(ficha).getByText(/Lead · Por contactar/)).toBeInTheDocument();
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Criar negócio" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({ pessoaId: "p-hugo" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).not.toBeInTheDocument());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Pedido de 12\/10\/2026 de Hugo Teixeira/ })).not.toBeInTheDocument();
    expect(within(coluna("Orçamento")).getByText("Hugo Teixeira")).toBeInTheDocument();
  }, TEMPO);
});

describe("o Quadro de Negócios real", () => {
  const cartoesDe = (nome: string) => screen.queryAllByRole("button", { name: new RegExp(`^${nome} · `) });
  const abrirQuadroDeNegocios = () => {
    render(aplicacao("/negocio-metas"));
    fireEvent.click(within(screen.getByRole("group", { name: "Mostrar" })).getByRole("button", { name: "Todos" }));
  };

  it("conta o negócio criado em Pessoas uma só vez (nem duplicado pelo pedido nem perdido)", async () => {
    abrirQuadroDeNegocios();
    const antes = cartoesDe("Marta Silveira").length;
    cleanup();
    const ficha = abrirFicha("p-marta");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Novo negócio sem visita" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    cleanup();
    abrirQuadroDeNegocios();
    expect(cartoesDe("Marta Silveira")).toHaveLength(antes + 1);
  }, TEMPO);
});
