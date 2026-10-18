// A Direção (simulada), editar o orçamento a partir da verificação, fechar sem mudar nada e os portões dos passos do orçamento.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { alteracoesAtuais, repor as reporNegocios } from "@/components/negocio-metas/negociosAlterados";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { pessoaBase, resumoBase } from "../fabricaTestes";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { HOJE, negocioEmOrcamento } from "@/test/fabricaProcessoTestes";
import { PaginaDeTeste } from "@/test/PaginaDeTeste";
import { itensDaPessoa } from "./itensProcesso";
import type { LinhaTrabalho } from "./orcamentoCalculo";
import type { OrcamentoDetalhado } from "./orcamentoDetalhado";
import { passoDoItem } from "./passosProcesso";
import { extrasAtuais, gravarTransicao, repor as reporExtras } from "./processoNegocios";
import { ProcessoProvider } from "./ProcessoProvider";
import { useProcesso } from "./processoContexto";
import type { ItemProcesso } from "./tiposProcesso";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);
beforeEach(() => { reporExtras(); reporNegocios(); });
afterEach(() => { reporExtras(); reporNegocios(); });

const botao = (passo: string) => screen.getByRole("button", { name: `${passo}: Cozinha de a` });
const aviso = () => screen.getByTestId("aviso");
const esperarSemDialogo = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

/** Pavimento: custo 18 €. A 24 € a margem é 25 % (bloqueio mole); a 17 € o preço está abaixo do custo (bloqueio duro). */
const linhas = (preco: number): LinhaTrabalho[] => [{ ...novaLinhaDoCatalogo("pavimento", "l1"), quantidade: 10, precoUnitario: preco }];

/** O negócio como ficaria depois de "Criar o orçamento" (o orçamento escolhido e os seus detalhes), antes de a página abrir. */
function negocioComOrcamentoGuardado(preco: number, extra: Partial<OrcamentoDetalhado> = {}) {
  const base = negocioEmOrcamento();
  const guardado = { ...base, orcamentos: [{ id: "o-novo-1", valor: Math.round(10 * preco * 1.06 * 100) / 100, escolhido: true }] };
  const orcamento: OrcamentoDetalhado = { orcamentoId: "o-novo-1", linhas: linhas(preco), desconto: 0, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra };
  gravarTransicao({ negocio: base, extras: undefined, sequencia: 1 }, { ok: true, negocio: guardado, extras: { orcamento } });
  return base;
}

describe("pedir a aprovação à Direção e a resposta (simulada)", () => {
  it("com a margem a 25 % pede-se a aprovação: o orçamento fica à espera da Direção e o 'A fazer' passa a aguardar", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(24)} />);
    fireEvent.click(botao("Verificar o orçamento"));
    const dialogo = await screen.findByRole("dialog", { name: "Verificar o orçamento de Cozinha" });
    expect(within(dialogo).getByText(/Margem de 25 %, abaixo do mínimo de 28 %\./)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Pedir aprovação à Direção" }));
    await esperarSemDialogo();
    expect(extrasAtuais().n1.orcamento).toMatchObject({ direcao: "pedida", verificado: false });
    await waitFor(() => expect(aviso()).toHaveTextContent("Pedido de aprovação enviado à Direção: a. A fazer: Aguardar a aprovação da direção."));
    expect(botao("Aguardar a aprovação da direção")).toHaveFocus();
  });

  it("aprovar a exceção: o orçamento fica verificado e o próximo passo é enviar a proposta", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(24, { direcao: "pedida" })} />);
    fireEvent.click(botao("Aguardar a aprovação da direção"));
    const dialogo = await screen.findByRole("dialog", { name: "Direção (simulada): Cozinha" });
    expect(dialogo).toHaveAccessibleDescription(/margem de 25 %/);
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Aprovar a exceção" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    await esperarSemDialogo();
    expect(extrasAtuais().n1.orcamento).toMatchObject({ direcao: "aprovada", verificado: true });
    await waitFor(() => expect(aviso()).toHaveTextContent("Exceção aprovada pela Direção: a. A fazer: Enviar a proposta."));
    expect(botao("Enviar a proposta")).toBeInTheDocument();
  });

  it("recusar: o pedido cai e o próximo passo volta a ser verificar o orçamento", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(24, { direcao: "pedida" })} />);
    fireEvent.click(botao("Aguardar a aprovação da direção"));
    const dialogo = await screen.findByRole("dialog", { name: "Direção (simulada): Cozinha" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Recusar" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    await esperarSemDialogo();
    expect(extrasAtuais().n1.orcamento).toMatchObject({ direcao: null, verificado: false });
    await waitFor(() => expect(aviso()).toHaveTextContent("Exceção recusada pela Direção: a. A fazer: Verificar o orçamento."));
    expect(botao("Verificar o orçamento")).toBeInTheDocument();
  });

  it("sem escolher a resposta o diálogo fica aberto e diz que falta escolher", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(24, { direcao: "pedida" })} />);
    fireEvent.click(botao("Aguardar a aprovação da direção"));
    const dialogo = await screen.findByRole("dialog", { name: "Direção (simulada): Cozinha" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Escolha a resposta da Direção.");
    expect(extrasAtuais().n1.orcamento?.direcao).toBe("pedida");
  });
});

describe("editar o orçamento a partir da verificação", () => {
  it("'Editar o orçamento' fecha a verificação e abre o editor, com as linhas guardadas; ao guardar volta a pedir a verificação e o foco regressa ao cartão", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(17)} />);
    fireEvent.click(botao("Verificar o orçamento"));
    const verificacao = await screen.findByRole("dialog", { name: "Verificar o orçamento de Cozinha" });
    fireEvent.click(within(verificacao).getByRole("button", { name: "Editar o orçamento" }));
    const editor = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    expect(screen.queryByRole("dialog", { name: /^Verificar/ })).not.toBeInTheDocument();
    expect(within(editor).getByLabelText("Preço unit. (€) de Pavimento")).toHaveValue("17");
    fireEvent.change(within(editor).getByLabelText("Preço unit. (€) de Pavimento"), { target: { value: "25" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Guardar o orçamento" }));
    await esperarSemDialogo();
    expect(alteracoesAtuais().editados.n1.orcamentos).toEqual([{ id: "o-novo-1", valor: 265, escolhido: true }]);
    expect(extrasAtuais().n1.orcamento).toMatchObject({ verificado: false, versao: 1 });
    await waitFor(() => expect(aviso()).toHaveTextContent("Orçamento guardado: a. A fazer: Verificar o orçamento."));
    await waitFor(() => expect(botao("Verificar o orçamento")).toHaveFocus());
  });

  it("cancelar o editor aberto a partir da verificação não muda nada e devolve o foco ao cartão", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(17)} />);
    fireEvent.click(botao("Verificar o orçamento"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Verificar o orçamento de Cozinha" })).getByRole("button", { name: "Editar o orçamento" }));
    const editor = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    fireEvent.click(within(editor).getByRole("button", { name: "Cancelar" }));
    await esperarSemDialogo();
    expect(alteracoesAtuais().editados.n1.orcamentos[0].valor).toBe(180.2);
    await waitFor(() => expect(botao("Verificar o orçamento")).toHaveFocus());
  });
});

describe("fechar sem mudar nada", () => {
  it("Esc na verificação não grava nada, não avisa e devolve o foco ao cartão", async () => {
    const aoAnunciar = vi.fn();
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(24)} aoAnunciar={aoAnunciar} />);
    const antes = extrasAtuais();
    fireEvent.click(botao("Verificar o orçamento"));
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Verificar o orçamento de Cozinha" }), { key: "Escape" });
    await esperarSemDialogo();
    expect(extrasAtuais()).toBe(antes);
    expect(aoAnunciar).not.toHaveBeenCalled();
    await waitFor(() => expect(botao("Verificar o orçamento")).toHaveFocus());
  });

  it("Esc na proposta não envia nada e devolve o foco ao cartão", async () => {
    render(<PaginaDeTeste negocio={negocioComOrcamentoGuardado(30, { verificado: true })} />);
    fireEvent.click(botao("Enviar a proposta"));
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Enviar a proposta de Cozinha" }), { key: "Escape" });
    await esperarSemDialogo();
    expect(alteracoesAtuais().editados.n1.proposta).toBeNull();
    await waitFor(() => expect(botao("Enviar a proposta")).toHaveFocus());
  });
});

function Gatilho({ item }: { item: ItemProcesso }) {
  const processo = useProcesso();
  return <button type="button" onClick={(e) => processo?.executar(item, e.currentTarget)}>executar</button>;
}

const negocioAtual = () => alteracoesAtuais().editados.n1 ?? negocioEmOrcamento();
/** O item que a página dá ao negócio, tal como está nos stores. */
const itemDoNegocio = (): ItemProcesso => itensDaPessoa(resumoBase(pessoaBase("a"), [negocioAtual()], HOJE), HOJE, extrasAtuais())[0];

function comProvider(item: ItemProcesso) {
  const aoAnunciar = vi.fn();
  render(
    <ProcessoProvider
      hoje={HOJE} resumos={[resumoBase(pessoaBase("a"), [negocioAtual()], HOJE)]} acoes={{} as never} opcoesPessoa={[]}
      aoCriarNegocio={vi.fn()} aoAnunciar={aoAnunciar}
    >
      <Gatilho item={item} />
    </ProcessoProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "executar" }));
  return aoAnunciar;
}

// Defesa em profundidade: um item só diz "verificar" ou "enviar" se o negócio o tiver, por isso o contraste constrói-se à mão.
describe("os portões dos passos do orçamento dizem o que falta e não abrem nada", () => {
  it("verificar sem orçamento detalhado: 'Crie primeiro o orçamento'", () => {
    const item: ItemProcesso = { ...itemDoNegocio(), orcamentos: 1, verificacao: "porVerificar" };
    expect(passoDoItem(item).id).toBe("verificarOrcamento");
    expect(comProvider(item)).toHaveBeenCalledWith("Verificar o orçamento: ainda não é possível. Crie primeiro o orçamento.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("enviar a proposta com o orçamento por verificar: 'Verifique primeiro o orçamento'", () => {
    negocioComOrcamentoGuardado(30);
    const item: ItemProcesso = { ...itemDoNegocio(), verificacao: "verificado" };
    expect(passoDoItem(item).id).toBe("enviarProposta");
    expect(comProvider(item)).toHaveBeenCalledWith(
      "Enviar a proposta: ainda não é possível. Verifique primeiro o orçamento (ou espere pela resposta da Direção).",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
