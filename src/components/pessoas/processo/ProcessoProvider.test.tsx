// O ProcessoProvider: os portões (quando o passo não pode avançar, o botão explica o que falta, na região live e junto ao botão, sem
// toast), o painel de visita e levantamento aberto pelo passo certo, o momento do aviso (só depois de o diálogo desmontar) e o valor
// do contexto (estável). Guardar o painel e criar o negócio estão em `ProcessoPainel.test.tsx`. Os passos são da PESSOA: não há pedidos.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { cartoesDoQuadro } from "../quadro/cartoesQuadroPessoas";
import { LinhaNegociosPessoa } from "../quadro/LinhaNegociosPessoa";
import { QuadroPessoas } from "../quadro/QuadroPessoas";
import { simularSaidaAnimada } from "@/test/saidaAnimadaTeste";
import { passoDoItem } from "./passosProcesso";
import { useProcesso } from "./processoContexto";
import type { ItemProcesso } from "./tiposProcesso";
import {
  Gatilho, GatilhoDoCartao, GUARDAR, PAINEL, comVisitas, feitaComLinhas, itemDe, itensDe, montar, renderizar, resumoCom, visita,
} from "./arnesProcesso";

const { erro, sucesso } = vi.hoisted(() => ({ erro: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: erro, success: sucesso } }));

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

const SEM_VISITA = "Marcar a visita como feita: ainda não é possível. Esta pessoa ainda não tem visita marcada.";
const SEM_DATA = "Marcar a visita como feita: ainda não é possível. Falta o dia da visita.";

beforeEach(() => { erro.mockClear(); sucesso.mockClear(); reporRegistos(); });
afterEach(() => { cleanup(); reporRegistos(); });

describe("ProcessoProvider: portões", () => {
  it("defesa: marcar como feita num item da fase Visita cuja pessoa não tem visitas explica que falta a visita e não abre nada", () => {
    const { r, item } = itemDe(comVisitas([]));
    const naVisita: ItemProcesso = { ...item, fase: "visita" };
    expect(passoDoItem(naVisita).id).toBe("marcarVisitaFeita");
    const { aoAnunciar, a } = montar(r, naVisita);
    expect(aoAnunciar).toHaveBeenCalledWith(SEM_VISITA);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.guardarRegistos).not.toHaveBeenCalled();
  });

  it("uma visita sem dia não abre o painel: explica que falta o dia", () => {
    const { r, item } = itemDe(comVisitas([visita({ data: "" })]));
    expect(passoDoItem(item).id).toBe("marcarVisitaFeita");
    const { aoAnunciar } = montar(r, item);
    expect(aoAnunciar).toHaveBeenCalledWith(SEM_DATA);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marcar a visita como feita abre o painel de visita e levantamento da pessoa, na secção Visitas, com as visitas dela", async () => {
    const r = resumoCom(comVisitas([visita({ data: "2026-10-20" }), visita({ data: "2026-11-05" })].map((v, i) => ({ ...v, id: `rv-${i + 1}` }))));
    const [item] = itensDe(r);
    expect(item).toMatchObject({ id: "pessoa-a", tipo: "pessoa" });
    const resultado = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    expect(within(painel).getByRole("button", { name: /^Visitas/ })).toHaveAttribute("aria-current", "step");
    expect(within(painel).getAllByText(/20\/10\/2026/).length).toBeGreaterThan(0);
    expect(within(painel).getAllByText(/05\/11\/2026/).length).toBeGreaterThan(0);
    expect(resultado.aoAnunciar).not.toHaveBeenCalled();
  });

  it("o levantamento é opcional: uma pessoa com a visita feita e sem nenhuma linha abre o painel de criar o negócio, sem avisar de nada em falta", async () => {
    const { r, item } = itemDe(comVisitas([visita({ estado: "feita" })]));
    expect(passoDoItem(item).id).toBe("criarNegocio");
    const { aoAnunciar } = montar(r, item);
    expect(await screen.findByRole("dialog", { name: "Novo negócio de a" })).toBeInTheDocument();
    expect(aoAnunciar).not.toHaveBeenCalled();
  });

  it("a visita é opcional: um item de «Criar o negócio» com as visitas por fazer abre o painel, sem avisar de nada em falta", async () => {
    const { r, item } = itemDe(comVisitas([visita()]));
    const doItem: ItemProcesso = { ...item, visitaFeita: true };
    expect(passoDoItem(doItem).id).toBe("criarNegocio");
    const { aoAnunciar } = montar(r, doItem);
    expect(await screen.findByRole("dialog", { name: "Novo negócio de a" })).toBeInTheDocument();
    expect(aoAnunciar).not.toHaveBeenCalled();
  });

  it("criar o negócio com a visita feita e linhas completas: abre o painel e não avisa de nada em falta", async () => {
    const { r, item } = itemDe(feitaComLinhas());
    expect(passoDoItem(item).id).toBe("criarNegocio");
    const resultado = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    expect(await screen.findByRole("dialog", { name: "Novo negócio de a" })).toBeInTheDocument();
    expect(resultado.aoAnunciar).not.toHaveBeenCalled();
  });

  it("um passo das fases 4 e 5 não faz nada aqui (os botões abrem a ficha)", () => {
    const { r, item } = itemDe(comVisitas());
    const { aoAnunciar } = montar(r, { ...item, tipo: "negocio", fase: "orcamento", orcamentos: 0, id: "n9" });
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("um item de uma pessoa que já não existe não faz nada", () => {
    const { r, item } = itemDe(comVisitas());
    const { aoAnunciar } = montar(r, { ...item, pessoaId: "x" });
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ProcessoProvider: a explicação do portão (região live e junto ao botão, nunca num toast que some)", () => {
  const bloqueado = () => itemDe(comVisitas([visita({ data: "" })]));

  it("avisa na região live uma vez, sem toast, e deixa a explicação visível junto ao botão", () => {
    const { r, item } = bloqueado();
    const { aoAnunciar } = renderizar(r, <GatilhoDoCartao item={item} />);
    expect(screen.queryByTestId("explicacao")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "passo" }));
    expect(aoAnunciar).toHaveBeenCalledExactlyOnceWith(SEM_DATA);
    expect(erro).not.toHaveBeenCalled();
    expect(screen.getByTestId("explicacao")).toHaveTextContent(SEM_DATA);
  });

  it("a explicação fica até o utilizador agir: um clique que já avança tira-a", async () => {
    const { r, item } = bloqueado();
    const { mudarResumo } = renderizar(r, <GatilhoDoCartao item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "passo" }));
    expect(screen.getByTestId("explicacao")).toBeInTheDocument();
    // A visita ganha o dia: o mesmo passo já pode avançar.
    mudarResumo(itemDe(comVisitas()).r);
    expect(screen.getByTestId("explicacao")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "passo" }));
    expect(await screen.findByRole("dialog", { name: PAINEL })).toBeInTheDocument();
    expect(screen.queryByTestId("explicacao")).not.toBeInTheDocument();
  });

  it("a explicação só aparece no botão do item bloqueado", () => {
    const { r, item } = bloqueado();
    renderizar(r, <><GatilhoDoCartao item={item} /><GatilhoDoCartao item={{ ...item, id: "outro" }} /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "passo" })[0]);
    expect(screen.getAllByTestId("explicacao")).toHaveLength(1);
  });

  it("dois cliques seguidos num botão bloqueado anunciam duas vezes: o texto alterna um espaço inseparável para o leitor de ecrã o repetir", () => {
    const { r, item } = bloqueado();
    const { aoAnunciar } = renderizar(r, <GatilhoDoCartao item={item} />);
    const botao = screen.getByRole("button", { name: "passo" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    fireEvent.click(botao);
    const textos = aoAnunciar.mock.calls.map(([t]) => t as string);
    expect(textos).toHaveLength(3);
    expect(textos[1]).not.toBe(textos[0]);
    expect(textos[2]).not.toBe(textos[1]);
    expect(textos.map((t) => t.replace(/\s+$/, ""))).toEqual([SEM_DATA, SEM_DATA, SEM_DATA]);
  });
});

describe("ProcessoProvider: o aviso do passo só sai depois de o diálogo desmontar", () => {
  let saida: ReturnType<typeof simularSaidaAnimada>;
  afterEach(() => saida?.restaurar());

  it("guardar a visita e o levantamento: durante a saída animada nada é anunciado; depois de desmontar, anuncia (sem diálogo nem aria-hidden) e sem toast repetido", async () => {
    const { r, item } = itemDe(comVisitas([visita({ data: "2026-10-20" })]));
    const noAviso = { dialogos: -1, escondidos: -1 };
    const { aoAnunciar } = renderizar(r, <Gatilho item={item} />, {
      aoAnunciar: () => {
        noAviso.dialogos = document.querySelectorAll('[role="dialog"]').length;
        noAviso.escondidos = document.querySelectorAll("[data-aria-hidden]").length;
      },
    });
    saida = simularSaidaAnimada(); // antes de o diálogo montar: é aí que o Radix lê o estilo
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    // O painel ainda está a sair: o resto da página continua escondido do leitor de ecrã, por isso o aviso espera.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(aoAnunciar).not.toHaveBeenCalled();
    saida.acabar();
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(noAviso).toEqual({ dialogos: 0, escondidos: 0 });
    expect(aoAnunciar.mock.calls[0][0]).toMatch(/^Visita guardada: a continua em Visita\./);
    // A região live diz tudo: o toast com o mesmo texto não se repete.
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("registar a chamada: o aviso espera pelo fim da saída do diálogo", async () => {
    const { r, item } = itemDe({ contactos: [], visitas: [], levantamentos: [] });
    const { aoAnunciar } = renderizar(r, <Gatilho item={item} />);
    saida = simularSaidaAnimada();
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(aoAnunciar).not.toHaveBeenCalled();
    saida.acabar();
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });
});

describe("ProcessoProvider: o valor do contexto é estável", () => {
  it("abrir e fechar um diálogo não re-renderiza os consumidores do contexto", async () => {
    let renders = 0;
    function Consumidor() {
      useProcesso();
      renders += 1;
      return null;
    }
    const { r, item } = itemDe(comVisitas());
    renderizar(r, <><Gatilho item={item} /><Consumidor /></>);
    const antes = renders;
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(renders).toBe(antes);
  });

  it("o `executar` continua a usar os dados mais recentes (a pessoa que muda entre renders)", async () => {
    const semDia = itemDe(comVisitas([visita({ data: "" })]));
    const { aoAnunciar, mudarResumo } = renderizar(semDia.r, <Gatilho item={semDia.item} />);
    mudarResumo(itemDe(comVisitas()).r);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    expect(await screen.findByRole("dialog", { name: PAINEL })).toBeInTheDocument();
    expect(aoAnunciar).not.toHaveBeenCalled();
  });
});

describe("ProcessoProvider: a explicação do portão junto aos cartões do Quadro e às sub-linhas da Lista", () => {
  const NOME_DO_BOTAO = "Marcar a visita como feita: Abordagem de a";

  it("Quadro: o cartão do botão bloqueado mostra a explicação, ligada ao botão (aria-describedby), e fica até o utilizador agir", () => {
    const { r } = itemDe(comVisitas([visita({ data: "" })]));
    const itens = new Map(itensDe(r).map((i) => [i.id, i]));
    renderizar(r, <QuadroPessoas cartoes={cartoesDoQuadro([r], HOJE_EXEMPLO)} itens={itens} hoje={HOJE_EXEMPLO} chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} />);
    const botao = screen.getByRole("button", { name: NOME_DO_BOTAO });
    expect(screen.queryByText(SEM_DATA)).not.toBeInTheDocument();
    fireEvent.click(botao);
    const explicacao = screen.getByText(SEM_DATA);
    expect(botao).toHaveAccessibleDescription(SEM_DATA);
    expect(botao.closest("li")).toContainElement(explicacao);
    expect(erro).not.toHaveBeenCalled();
  });

  it("Lista: a sub-linha do botão bloqueado mostra a explicação, ligada ao botão", () => {
    const { r } = itemDe(comVisitas([visita({ data: "" })]));
    renderizar(r, <LinhaNegociosPessoa pessoaId="a" nome="a" itens={itensDe(r)} hoje={HOJE_EXEMPLO} aoAbrir={vi.fn()} />);
    const botao = screen.getByRole("button", { name: NOME_DO_BOTAO });
    fireEvent.click(botao);
    expect(botao.closest("li")).toContainElement(screen.getByText(SEM_DATA));
    expect(botao).toHaveAccessibleDescription(SEM_DATA);
  });
});
