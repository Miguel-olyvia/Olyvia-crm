import { describe, expect, it } from "vitest";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase, pessoaBase, resumoBase } from "../fabricaTestes";
import { novaLinhaDoCatalogo, type ChaveTrabalho } from "./catalogoTrabalhos";
import type { CondicoesForm } from "./condicoesProposta";
import { itensDaPessoa } from "./itensProcesso";
import type { LinhaTrabalho } from "./orcamentoCalculo";
import { passoDoItem } from "./passosProcesso";
import type { ExtrasNegocio, OrcamentoDetalhado } from "./orcamentoDetalhado";
import {
  enviarProposta, guardarOrcamento, pedirAprovacaoDirecao, responderDirecao, verificarOrcamento,
  type EstadoTransicao, type Transicao,
} from "./transicoes";
import type { ItemProcesso } from "./tiposProcesso";

const HOJE = "2026-10-13";

/** Congela o objeto e tudo o que ele tem: uma transição que o tocar rebenta (modo estrito dos módulos). */
function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

const linha = (trabalho: ChaveTrabalho, quantidade: number, precoUnitario?: number): LinhaTrabalho => ({
  ...novaLinhaDoCatalogo(trabalho, `l-${trabalho}`), quantidade, ...(precoUnitario === undefined ? {} : { precoUnitario }),
});
const detalhado = (extra: Partial<OrcamentoDetalhado> = {}): OrcamentoDetalhado => ({
  orcamentoId: "o-novo-1", linhas: [linha("pavimento", 10)], desconto: 0, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra,
});
/** Os extras de um negócio com este orçamento detalhado. */
const extra = (o: Partial<OrcamentoDetalhado> = {}): ExtrasNegocio => ({ orcamento: detalhado(o) });
const comOrcamento = (valor = 318, extra: Partial<NegocioMes> = {}): NegocioMes =>
  negocioBase("n1", { servico: "Cozinha", orcamentos: [{ id: "o-novo-1", valor, escolhido: true }], ...extra });

/** O item como a página o vê (a pessoa com este negócio e os extras), e o estado que a transição recebe. */
function cenario(negocio: NegocioMes, extras?: ExtrasNegocio, sequencia = 4) {
  const item = itensDaPessoa(resumoBase(pessoaBase("a"), [negocio], HOJE), HOJE, extras ? { [negocio.id]: extras } : {})[0];
  const estado: EstadoTransicao = congelar({ negocio, extras, sequencia });
  return { item, estado };
}

function ok(r: Transicao): Extract<Transicao, { ok: true }> {
  if (r.ok === false) throw new Error(`devia ter dado certo, mas falta: ${r.emFalta.join(", ")}`);
  return r;
}

const CONDICOES: CondicoesForm = { validade: "30", prazo: "20", inicio: "2026-11-16", pagamento: "metade", garantia: "2", notas: " Ligar antes. " };

describe("guardarOrcamento: o primeiro orçamento", () => {
  const dados = congelar({ linhas: [linha("pavimento", 10)], desconto: 0, vendaDireta: true });
  const sem = negocioBase("n1", { servico: "Cozinha" });

  it("acrescenta um orçamento escolhido, com o total com IVA, e guarda o detalhe nos extras: as duas coisas juntas", () => {
    const { item, estado } = cenario(sem);
    expect(passoDoItem(item).id).toBe("criarOrcamento");
    const r = ok(guardarOrcamento(estado, item, dados, HOJE));
    expect(r.negocio.orcamentos).toEqual([{ id: "o-novo-4", valor: 318, escolhido: true }]);
    expect(valorDoNegocio(r.negocio)).toBe(318);
    expect(faseDoNegocio(r.negocio)).toBe("orcamento");
    expect(r.extras.orcamento).toEqual({
      orcamentoId: "o-novo-4", linhas: dados.linhas, desconto: 0, vendaDireta: true, verificado: false, direcao: null, versao: 1,
    });
    expect(r.novoOrcamento).toEqual({ id: "o-novo-4", detalhe: { data: HOJE, estado: "rascunho" } });
  });

  it("não toca no negócio nem nos extras que recebe (imutável) e devolve objetos novos", () => {
    const { item, estado } = cenario(sem);
    const r = ok(guardarOrcamento(estado, item, dados, HOJE));
    expect(r.negocio).not.toBe(sem);
    expect(sem.orcamentos).toEqual([]);
  });

  it("o total sai arredondado ao cêntimo (418,20 €, e não 418,2000000000001)", () => {
    const { item, estado } = cenario(sem);
    const r = ok(guardarOrcamento(estado, item, { linhas: [linha("azulejos", 10)], desconto: 0, vendaDireta: false }, HOJE));
    expect(r.negocio.orcamentos[0].valor).toBe(418.2);
  });

  it("sem nenhuma linha não guarda: falta pelo menos uma linha", () => {
    const { item, estado } = cenario(sem);
    expect(guardarOrcamento(estado, item, { linhas: [], desconto: 0, vendaDireta: false }, HOJE)).toEqual({ ok: false, emFalta: ["orcamentoLinhas"] });
  });

  it("um total acima do máximo que um orçamento aceita (10 milhões) não guarda", () => {
    const { item, estado } = cenario(sem);
    const r = guardarOrcamento(estado, item, { linhas: [linha("pavimento", 1_000_000)], desconto: 0, vendaDireta: false }, HOJE);
    expect(r).toEqual({ ok: false, emFalta: ["orcamentoValor"] });
  });

  it("noutro passo (aqui o de criar a proposta, de um orçamento sem detalhe) não se aplica: nada se grava", () => {
    const { item, estado } = cenario(comOrcamento());
    expect(passoDoItem(item).id).toBe("criarProposta");
    expect(guardarOrcamento(estado, item, dados, HOJE)).toEqual({ ok: false, emFalta: [] });
  });
});

describe("guardarOrcamento: o que não se pode guardar diz-se, nunca fica calado", () => {
  const dados = congelar({ linhas: [linha("pavimento", 10)], desconto: 0, vendaDireta: false });

  it("se o negócio já não aceita orçamentos (ficou ganho entretanto) devolve a falta 'orcamentoNaoGuardado', e não 'nada a explicar'", () => {
    const sem = negocioBase("n1", { servico: "Cozinha" });
    const { item, estado } = cenario(sem);
    const ganho = { ...sem, contrato: { estado: "assinado" } } as unknown as NegocioMes;
    expect(guardarOrcamento({ ...estado, negocio: ganho }, item, dados, HOJE)).toEqual({ ok: false, emFalta: ["orcamentoNaoGuardado"] });
  });

  it.each([-1, 50.5, 80, Number.NaN, Number.POSITIVE_INFINITY])("um desconto de %s não está entre 0 e 50: o portão recusa, mesmo que o formulário o deixasse passar", (desconto) => {
    const { item, estado } = cenario(negocioBase("n1", { servico: "Cozinha" }));
    expect(guardarOrcamento(estado, item, { ...dados, desconto }, HOJE)).toEqual({ ok: false, emFalta: ["descontoInvalido"] });
  });

  it.each([0, 25, 50])("um desconto de %s está dentro do intervalo e passa o portão do desconto", (desconto) => {
    const { item, estado } = cenario(negocioBase("n1", { servico: "Cozinha" }));
    expect(guardarOrcamento(estado, item, { ...dados, desconto }, HOJE).ok).toBe(true);
  });
});

describe("guardarOrcamento: editar o que já existe", () => {
  const novos = congelar({ linhas: [linha("pavimento", 20)], desconto: 0, vendaDireta: true });

  it("muda o valor do MESMO orçamento, volta a pedir verificação e mantém a versão", () => {
    const outro = { id: "o-x", valor: 100, escolhido: false };
    const negocio = comOrcamento(318, { orcamentos: [{ id: "o-novo-1", valor: 318, escolhido: true }, outro] });
    const { item, estado } = cenario(negocio, extra({ versao: 3, direcao: null }));
    expect(passoDoItem(item).id).toBe("verificarOrcamento");
    const r = ok(guardarOrcamento(estado, item, novos, HOJE));
    expect(r.negocio.orcamentos).toEqual([{ id: "o-novo-1", valor: 636, escolhido: true }, outro]);
    expect(r.novoOrcamento).toBeUndefined();
    expect(r.extras.orcamento).toMatchObject({ orcamentoId: "o-novo-1", linhas: novos.linhas, vendaDireta: true, verificado: false, direcao: null, versao: 3 });
  });

  it("guarda também as condições da proposta que os extras já tinham", () => {
    const condicoes = { validade: 30, prazo: 20, inicio: "2026-11-16", pagamento: "metade", garantia: 2, notas: "" } as const;
    const { item, estado } = cenario(comOrcamento(), { orcamento: detalhado(), condicoes });
    expect(ok(guardarOrcamento(estado, item, novos, HOJE)).extras.condicoes).toEqual(condicoes);
  });
});

describe("verificarOrcamento", () => {
  it("sem bloqueios: fica verificado; o negócio não muda (é a mesma referência)", () => {
    const { item, estado } = cenario(comOrcamento(), extra());
    const r = ok(verificarOrcamento(estado, item));
    expect(r.extras.orcamento).toMatchObject({ verificado: true, direcao: null });
    expect(r.negocio).toBe(estado.negocio);
  });

  it("com um bloqueio mole (margem abaixo dos 28 %) não verifica: há bloqueios de margem por resolver", () => {
    const { item, estado } = cenario(comOrcamento(), extra({ linhas: [linha("pavimento", 10, 24)] }));
    expect(verificarOrcamento(estado, item)).toEqual({ ok: false, emFalta: ["margem"] });
  });

  it("com um preço abaixo do custo não verifica, e diz que a Direção não o pode aprovar", () => {
    const { item, estado } = cenario(comOrcamento(), extra({ linhas: [linha("pavimento", 10, 10)] }));
    expect(verificarOrcamento(estado, item)).toEqual({ ok: false, emFalta: ["abaixoDoCusto"] });
  });

  it("já verificado (o passo seguinte é enviar a proposta): não se aplica", () => {
    const { item, estado } = cenario(comOrcamento(), extra({ verificado: true }));
    expect(verificarOrcamento(estado, item)).toEqual({ ok: false, emFalta: [] });
  });

  it("defesa: um item que diz 'verificar', com o negócio sem orçamento detalhado, não verifica", () => {
    const { item, estado } = cenario(comOrcamento());
    const forjado: ItemProcesso = { ...item, verificacao: "porVerificar" };
    expect(verificarOrcamento(estado, forjado)).toEqual({ ok: false, emFalta: ["semOrcamento"] });
  });
});

describe("pedirAprovacaoDirecao e responderDirecao", () => {
  const mole = () => cenario(comOrcamento(), extra({ linhas: [linha("pavimento", 10, 24)] }));

  it("com um bloqueio mole pede a aprovação: fica à espera da Direção, ainda por verificar", () => {
    const { item, estado } = mole();
    const r = ok(pedirAprovacaoDirecao(estado, item));
    expect(r.extras.orcamento).toMatchObject({ direcao: "pedida", verificado: false });
    expect(r.negocio).toBe(estado.negocio);
  });

  it("um preço abaixo do custo nunca é aprovável: não pede", () => {
    const { item, estado } = cenario(comOrcamento(), extra({ linhas: [linha("pavimento", 10, 10)] }));
    expect(pedirAprovacaoDirecao(estado, item)).toEqual({ ok: false, emFalta: ["abaixoDoCusto"] });
  });

  it("sem bloqueios não há nada a aprovar", () => {
    const { item, estado } = cenario(comOrcamento(), extra());
    expect(pedirAprovacaoDirecao(estado, item)).toEqual({ ok: false, emFalta: [] });
  });

  const pedida = () => cenario(comOrcamento(), extra({ linhas: [linha("pavimento", 10, 24)], direcao: "pedida" }));

  it("aprovada: a exceção fica aprovada e o orçamento verificado", () => {
    const { item, estado } = pedida();
    expect(passoDoItem(item).id).toBe("aguardarDirecao");
    const r = ok(responderDirecao(estado, item, { aprovada: true }));
    expect(r.extras.orcamento).toMatchObject({ direcao: "aprovada", verificado: true });
  });

  it("recusada: o pedido cai e o orçamento continua por verificar", () => {
    const { item, estado } = pedida();
    const r = ok(responderDirecao(estado, item, { aprovada: false }));
    expect(r.extras.orcamento).toMatchObject({ direcao: null, verificado: false });
  });

  it("sem pedido à Direção não há resposta a registar", () => {
    const { item, estado } = mole();
    expect(responderDirecao(estado, item, { aprovada: true })).toEqual({ ok: false, emFalta: ["semPedido"] });
  });
});

describe("enviarProposta", () => {
  const verificado = () => cenario(comOrcamento(), extra({ verificado: true }));

  it("o negócio passa a Proposta (enviada), sem mexer no valor, e as condições ficam nos extras: as duas coisas juntas", () => {
    const { item, estado } = verificado();
    expect(passoDoItem(item).id).toBe("enviarProposta");
    const r = ok(enviarProposta(estado, item, CONDICOES, HOJE));
    expect(r.negocio.proposta).toEqual({ estado: "enviada" });
    expect(faseDoNegocio(r.negocio)).toBe("proposta");
    expect(valorDoNegocio(r.negocio)).toBe(318);
    expect(r.negocio.orcamentos).toEqual(estado.negocio.orcamentos);
    expect(r.negocio.parado).toBe(0);
    expect(r.negocio.proximoPrazo).toBe("2026-10-16");
    expect(r.extras.condicoes).toEqual({ validade: 30, prazo: 20, inicio: "2026-11-16", pagamento: "metade", garantia: 2, notas: "Ligar antes." });
    expect(r.extras.orcamento).toEqual(estado.extras?.orcamento);
  });

  it("não altera o que recebe", () => {
    const { item, estado } = verificado();
    ok(enviarProposta(estado, item, CONDICOES, HOJE));
    expect(estado.negocio.proposta).toBeNull();
    expect(estado.extras?.condicoes).toBeUndefined();
  });

  it("condições incompletas não enviam, e dizem que faltam as condições", () => {
    const { item, estado } = verificado();
    expect(enviarProposta(estado, item, { ...CONDICOES, inicio: "" }, HOJE)).toEqual({ ok: false, emFalta: ["condicoes"] });
    expect(enviarProposta(estado, item, { ...CONDICOES, prazo: "61" }, HOJE)).toEqual({ ok: false, emFalta: ["condicoes"] });
  });

  it("com o orçamento por verificar (o passo é o de verificar) não envia", () => {
    const { item, estado } = cenario(comOrcamento(), extra());
    expect(enviarProposta(estado, item, CONDICOES, HOJE)).toEqual({ ok: false, emFalta: ["porVerificar"] });
  });

  it("defesa: um item que diz 'enviar', com o orçamento por verificar, não envia", () => {
    const { item, estado } = cenario(comOrcamento(), extra());
    const forjado: ItemProcesso = { ...item, verificacao: "verificado" };
    expect(enviarProposta(estado, forjado, CONDICOES, HOJE)).toEqual({ ok: false, emFalta: ["porVerificar"] });
  });

  it("uma exceção aprovada pela Direção também deixa enviar", () => {
    const { item, estado } = cenario(comOrcamento(), extra({ linhas: [linha("pavimento", 10, 24)], direcao: "aprovada", verificado: true }));
    expect(ok(enviarProposta(estado, item, CONDICOES, HOJE)).negocio.proposta).toEqual({ estado: "enviada" });
  });

  it("uma proposta que já estava em rascunho (sem orçamento detalhado) passa a enviada, e só as condições vão para os extras", () => {
    const rascunho = comOrcamento(5600, { proposta: { estado: "rascunho" } });
    const { item, estado } = cenario(rascunho);
    expect(passoDoItem(item).id).toBe("enviarProposta");
    const r = ok(enviarProposta(estado, item, CONDICOES, HOJE));
    expect(r.negocio.proposta).toEqual({ estado: "enviada" });
    expect(r.extras.orcamento).toBeUndefined();
    expect(r.extras.condicoes?.garantia).toBe(2);
  });
});
