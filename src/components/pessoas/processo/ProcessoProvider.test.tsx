// O ProcessoProvider: os portões (quando o passo não pode avançar, o botão explica o que falta, na região live e junto ao botão, sem
// toast), o momento do aviso (só depois de o diálogo desmontar), o valor do contexto (estável) e o portão dentro do painel.
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { novaLinha } from "@/components/negocio-metas/levantamento";
import { paraOpcao } from "../pessoaOpcao";
import { cartoesDoQuadro } from "../quadro/cartoesQuadroPessoas";
import { LinhaNegociosPessoa } from "../quadro/LinhaNegociosPessoa";
import { QuadroPessoas } from "../quadro/QuadroPessoas";
import { pessoaBase, resumoBase } from "../fabricaTestes";
import { MORADA_VISITA_VAZIA } from "../moradaVisita";
import type { Pessoa, ResumoPessoa, VisitaPessoa } from "../pessoasTipos";
import { simularSaidaAnimada } from "../saidaAnimadaTeste";
import { itensDaPessoa } from "./itensProcesso";
import { passoDoItem } from "./passosProcesso";
import { ProcessoProvider, type AcoesProcesso } from "./ProcessoProvider";
import { useAcaoDoPasso, useProcesso } from "./processoContexto";
import type { ItemProcesso } from "./tiposProcesso";

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

const visita = (extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  data: "2026-10-12", hora: "", comercial: "Ana Ribeiro", igualALead: true, moradaVisita: MORADA_VISITA_VAZIA, ...extra,
});
const acoes = (): AcoesProcesso => ({
  registarChamada: vi.fn(), adiar: vi.fn(), perder: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(),
  marcarVisita: vi.fn(), marcarVisitaFeita: vi.fn(), guardarLevantamento: vi.fn(),
});

function Gatilho({ item }: { item: ItemProcesso }) {
  const processo = useProcesso();
  return <button type="button" onClick={(e) => processo?.executar(item, e.currentTarget)}>executar</button>;
}

/** Um botão feito com o mesmo gancho dos cartões do Quadro e da Lista: mostra a explicação do portão junto a si. */
function GatilhoDoCartao({ item }: { item: ItemProcesso }) {
  const acao = useAcaoDoPasso(item, () => {});
  return (
    <div>
      <button type="button" onClick={acao.aoClicar} {...acao.atributos}>passo</button>
      {acao.bloqueio && <p data-testid="explicacao">{acao.bloqueio}</p>}
    </div>
  );
}

interface Extras {
  aoAnunciar?: (texto: string) => void;
  opcoesPessoa?: Parameters<typeof ProcessoProvider>[0]["opcoesPessoa"];
}

const renderizar = (resumo: ResumoPessoa, filhos: ReactNode, extras: Extras = {}) => {
  const aoAnunciar = vi.fn(extras.aoAnunciar);
  const a = acoes();
  const aoCriarNegocio = vi.fn();
  const arvore = (r: ResumoPessoa) => (
    <ProcessoProvider
      hoje={HOJE_EXEMPLO} resumos={[r]} acoes={a} opcoesPessoa={extras.opcoesPessoa ?? []} aoCriarNegocio={aoCriarNegocio} aoAnunciar={aoAnunciar}
    >
      {filhos}
    </ProcessoProvider>
  );
  const { rerender } = render(arvore(resumo));
  return { aoAnunciar, a, aoCriarNegocio, mudarResumo: (novo: ResumoPessoa) => rerender(arvore(novo)) };
};
const montar = (resumo: ResumoPessoa, item: ItemProcesso) => {
  const resultado = renderizar(resumo, <Gatilho item={item} />);
  fireEvent.click(screen.getByRole("button", { name: "executar" }));
  return resultado;
};
const itemDe = (p: Pessoa) => {
  const r = resumoBase(p, [], HOJE_EXEMPLO);
  return { r, item: itensDaPessoa(r, HOJE_EXEMPLO)[0] };
};

beforeEach(() => { erro.mockClear(); sucesso.mockClear(); });

describe("ProcessoProvider: portões", () => {
  it("marcar como feita sem visita (uma ficha na fase Visita sem visita nem próximo contacto): explica que falta a visita e não abre nada", () => {
    const { r, item } = itemDe(pessoaBase("a", { etapa: "visitaMarcada" }));
    expect(passoDoItem(item).id).toBe("marcarVisitaFeita");
    const { aoAnunciar, a } = montar(r, item);
    const texto = "Marcar a visita como feita: ainda não é possível. Esta pessoa ainda não tem visita marcada.";
    expect(aoAnunciar).toHaveBeenCalledWith(texto);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.marcarVisitaFeita).not.toHaveBeenCalled();
  });

  // Os dois testes seguintes são defesa em profundidade: um item só diz "visita feita" ou "há linhas" se a pessoa o tiver (itensDaPessoa
  // lê a mesma pessoa), por isso o contraste constrói-se à mão, e os títulos dizem-no.
  it("defesa: um item que diz «visita feita», com a pessoa sem a visita feita, não abre o levantamento", () => {
    const { r } = itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita() }));
    const item: ItemProcesso = { ...itemDe(r.pessoa).item, visitaFeita: true };
    expect(passoDoItem(item).id).toBe("fazerLevantamento");
    const { aoAnunciar } = montar(r, item);
    expect(aoAnunciar).toHaveBeenCalledWith("Fazer o levantamento: ainda não é possível. Marque primeiro a visita como feita.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("defesa: um item que diz «há linhas guardadas», com a pessoa sem elas, não cria o negócio e diz que faltam as medidas", () => {
    const { r } = itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita({ feita: true }) }));
    const item: ItemProcesso = { ...itemDe(r.pessoa).item, levantamentoLinhas: 1 };
    expect(passoDoItem(item).id).toBe("criarNegocio");
    const { aoAnunciar, aoCriarNegocio } = montar(r, item);
    expect(aoAnunciar).toHaveBeenCalledWith("Criar o negócio: ainda não é possível. Falta pelo menos uma linha de medidas no levantamento.");
    expect(aoCriarNegocio).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("criar o negócio com linhas guardadas por acabar (o item sai da própria pessoa): o aviso diz que há linhas por acabar", () => {
    const linhaPorAcabar = { ...novaLinha("l1"), divisao: "cozinha" };
    const { r, item } = itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita({ feita: true, levantamento: { linhas: [linhaPorAcabar], observacoes: "", respostas: {} } }) }));
    expect(passoDoItem(item).id).toBe("criarNegocio");
    const { aoAnunciar } = montar(r, item);
    expect(aoAnunciar).toHaveBeenCalledWith("Criar o negócio: ainda não é possível. Há linhas de medidas por acabar.");
  });

  it("criar o negócio com a visita feita e linhas completas: abre o painel e não avisa de nada em falta", async () => {
    const linha = { ...novaLinha("l1"), divisao: "cozinha", trabalho: "bancada", medida: "3.5" };
    const pessoa = pessoaBase("a", { etapa: "visitaMarcada", visita: visita({ feita: true, levantamento: { linhas: [linha], observacoes: "", respostas: {} } }) });
    const { r, item } = itemDe(pessoa);
    expect(passoDoItem(item).id).toBe("criarNegocio");
    const resultado = renderizar(r, <Gatilho item={item} />, { opcoesPessoa: [paraOpcao(pessoa)] });
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(resultado.aoAnunciar).not.toHaveBeenCalled();
  });

  it("um passo das fases 4 e 5 não faz nada aqui (os botões abrem a ficha)", () => {
    const { r, item } = itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita() }));
    const { aoAnunciar } = montar(r, { ...item, tipo: "negocio", fase: "orcamento", orcamentos: 0 });
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("um item de uma pessoa que já não existe não faz nada", () => {
    const { r, item } = itemDe(pessoaBase("a", { etapa: "nova" }));
    const { aoAnunciar } = montar(r, { ...item, pessoaId: "x" });
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ProcessoProvider: a explicação do portão (região live e junto ao botão, nunca num toast que some)", () => {
  const SEM_VISITA = "Marcar a visita como feita: ainda não é possível. Esta pessoa ainda não tem visita marcada.";
  const bloqueado = () => itemDe(pessoaBase("a", { etapa: "visitaMarcada" }));

  it("avisa na região live uma vez, sem toast, e deixa a explicação visível junto ao botão", () => {
    const { r, item } = bloqueado();
    const { aoAnunciar } = renderizar(r, <GatilhoDoCartao item={item} />);
    expect(screen.queryByTestId("explicacao")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "passo" }));
    expect(aoAnunciar).toHaveBeenCalledExactlyOnceWith(SEM_VISITA);
    expect(erro).not.toHaveBeenCalled();
    expect(screen.getByTestId("explicacao")).toHaveTextContent(SEM_VISITA);
  });

  it("a explicação fica até o utilizador agir: um clique que já avança tira-a", async () => {
    const { r, item } = bloqueado();
    const { mudarResumo } = renderizar(r, <GatilhoDoCartao item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "passo" }));
    expect(screen.getByTestId("explicacao")).toBeInTheDocument();
    // A pessoa ganha a visita marcada: o mesmo passo já pode avançar.
    mudarResumo(itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita() })).r);
    expect(screen.getByTestId("explicacao")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "passo" }));
    expect(await screen.findByRole("dialog", { name: "A visita já foi feita?" })).toBeInTheDocument();
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
    expect(textos.map((t) => t.replace(/\s+$/, ""))).toEqual([SEM_VISITA, SEM_VISITA, SEM_VISITA]);
  });
});

describe("ProcessoProvider: o aviso do passo só sai depois de o diálogo desmontar", () => {
  let saida: ReturnType<typeof simularSaidaAnimada>;
  afterEach(() => saida?.restaurar());

  it("marcar a visita como feita: durante a saída animada nada é anunciado; depois de desmontar, anuncia (sem diálogo nem aria-hidden) e sem toast repetido", async () => {
    const { r, item } = itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita() }));
    const noAviso = { dialogos: -1, escondidos: -1 };
    const { aoAnunciar } = renderizar(r, <Gatilho item={item} />, {
      aoAnunciar: () => {
        noAviso.dialogos = document.querySelectorAll('[role="dialog"]').length;
        noAviso.escondidos = document.querySelectorAll("[data-aria-hidden]").length;
      },
    });
    saida = simularSaidaAnimada(); // antes de o diálogo montar: é aí que o Radix lê o estilo
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const dialogo = await screen.findByRole("dialog", { name: "A visita já foi feita?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como feita" }));
    // O diálogo ainda está a sair: o resto da página continua escondido do leitor de ecrã, por isso o aviso espera.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(aoAnunciar).not.toHaveBeenCalled();
    saida.acabar();
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(noAviso).toEqual({ dialogos: 0, escondidos: 0 });
    expect(aoAnunciar.mock.calls[0][0]).toMatch(/^Visita feita: a continua em Visita\./);
    // A região live diz tudo: o toast com o mesmo texto não se repete.
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("registar a chamada: o aviso espera pelo fim da saída do diálogo", async () => {
    const { r, item } = itemDe(pessoaBase("a", { etapa: "nova" }));
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
    const { r, item } = itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita() }));
    renderizar(r, <><Gatilho item={item} /><Consumidor /></>);
    const antes = renders;
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const dialogo = await screen.findByRole("dialog", { name: "A visita já foi feita?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(renders).toBe(antes);
  });

  it("o `executar` continua a usar os dados mais recentes (a pessoa que muda entre renders)", async () => {
    const semVisita = itemDe(pessoaBase("a", { etapa: "visitaMarcada" }));
    const { aoAnunciar, mudarResumo } = renderizar(semVisita.r, <Gatilho item={semVisita.item} />);
    mudarResumo(itemDe(pessoaBase("a", { etapa: "visitaMarcada", visita: visita() })).r);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    expect(await screen.findByRole("dialog", { name: "A visita já foi feita?" })).toBeInTheDocument();
    expect(aoAnunciar).not.toHaveBeenCalled();
  });
});

describe("ProcessoProvider: o portão do levantamento dentro do painel", () => {
  const escolher = async (dialogo: HTMLElement, campo: RegExp | string, opcao: string) => {
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: opcao }));
  };

  it("sem linhas (a visita deixou de estar «Feita»), mostra o motivo no próprio painel com role=alert, sem toast, sem guardar e sem fechar", async () => {
    const pessoa = pessoaBase("a", { etapa: "visitaMarcada", visita: visita({ feita: true }) });
    const { r, item } = itemDe(pessoa);
    expect(passoDoItem(item).id).toBe("fazerLevantamento");
    const { a, aoAnunciar } = renderizar(r, <Gatilho item={item} />, { opcoesPessoa: [paraOpcao(pessoa)] });
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog");
    // Com o estado da visita fora de «Feita» o formulário não exige linhas; o passo, sim.
    fireEvent.click(within(painel).getByRole("button", { name: /^Visitas/ }));
    await escolher(painel, "Estado", "Por fazer");
    expect(within(painel).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
    const alerta = await within(painel).findByRole("alert");
    expect(alerta).toHaveTextContent("Fazer o levantamento: ainda não é possível. Falta pelo menos uma linha de medidas no levantamento.");
    expect(a.guardarLevantamento).not.toHaveBeenCalled();
    expect(erro).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(painel);
  });
});

describe("ProcessoProvider: a explicação do portão junto aos cartões do Quadro e às sub-linhas da Lista", () => {
  const SEM_VISITA = "Marcar a visita como feita: ainda não é possível. Esta pessoa ainda não tem visita marcada.";
  const NOME_DO_BOTAO = "Marcar a visita como feita: Pedido novo de a";

  it("Quadro: o cartão do botão bloqueado mostra a explicação, ligada ao botão (aria-describedby), e fica até o utilizador agir", () => {
    const { r } = itemDe(pessoaBase("a", { etapa: "visitaMarcada" }));
    const itens = new Map(itensDaPessoa(r, HOJE_EXEMPLO).map((i) => [i.id, i]));
    renderizar(r, <QuadroPessoas cartoes={cartoesDoQuadro([r], HOJE_EXEMPLO)} itens={itens} hoje={HOJE_EXEMPLO} chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} />);
    const botao = screen.getByRole("button", { name: NOME_DO_BOTAO });
    expect(screen.queryByText(SEM_VISITA)).not.toBeInTheDocument();
    fireEvent.click(botao);
    const explicacao = screen.getByText(SEM_VISITA);
    expect(botao).toHaveAccessibleDescription(SEM_VISITA);
    expect(botao.closest("li")).toContainElement(explicacao);
    expect(erro).not.toHaveBeenCalled();
  });

  it("Lista: a sub-linha do botão bloqueado mostra a explicação, ligada ao botão", () => {
    const { r } = itemDe(pessoaBase("a", { etapa: "visitaMarcada" }));
    renderizar(r, <LinhaNegociosPessoa pessoaId="a" nome="a" itens={itensDaPessoa(r, HOJE_EXEMPLO)} hoje={HOJE_EXEMPLO} aoAbrir={vi.fn()} />);
    const botao = screen.getByRole("button", { name: NOME_DO_BOTAO });
    fireEvent.click(botao);
    expect(botao.closest("li")).toContainElement(screen.getByText(SEM_VISITA));
    expect(botao).toHaveAccessibleDescription(SEM_VISITA);
  });
});
