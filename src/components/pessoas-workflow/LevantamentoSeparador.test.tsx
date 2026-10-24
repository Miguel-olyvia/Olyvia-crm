// O separador «Levantamento»: edita o questionário (secções, perguntas, opções, condições) e grava tudo de uma vez com a versão lida.
// Os hooks de leitura e gravação são simulados (têm os seus testes em hooks/pessoas/workflow); o rascunho é o verdadeiro.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { lerQuestionario, paraEnvio, type QuestionarioEd, type SeccaoEd } from "@/hooks/pessoas/workflow/questionario";
import { copiarBruto, QUESTIONARIO_BRUTO, uuid } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import type { QuestionarioHook } from "@/hooks/pessoas/workflow/useQuestionarioLevantamento";
import { useRascunhoQuestionario } from "@/hooks/pessoas/workflow/useRascunhoQuestionario";
import { LevantamentoSeparador } from "./LevantamentoSeparador";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
beforeAll(prepararRadixNoJsdom);

const DADOS: QuestionarioEd = lerQuestionario(QUESTIONARIO_BRUTO)!;
const OK = { mudou: true, versao: 8, recarregou: true };
const hook = (sobre: Partial<QuestionarioHook> = {}): QuestionarioHook => ({
  dados: DADOS, erro: null, isLoading: false, isError: false, aGuardar: false,
  guardar: vi.fn().mockResolvedValue(OK), recarregar: vi.fn().mockResolvedValue(null), ...sobre,
});
function Harness({ q }: { q: QuestionarioHook }) {
  const rascunho = useRascunhoQuestionario(q.dados, true);
  return <LevantamentoSeparador questionario={q} rascunho={rascunho} />;
}
const desenhar = (sobre: Partial<QuestionarioHook> = {}) => {
  const q = hook(sobre);
  return { q, ...render(<Harness q={q} />) };
};
const regiao = (nome: string) => screen.getByRole("region", { name: nome });
const botao = (nome: string | RegExp, dentro?: HTMLElement) => (dentro ? within(dentro) : screen).getByRole("button", { name: nome });
const estado = () => screen.getByRole("status");
/** A caixa com os problemas da validação: um grupo com nome (e não uma região viva, que o leitor de ecrã repetiria a cada tecla). */
const caixaProblemas = () => screen.findByRole("group", { name: /Corrija antes de guardar/ });
const semCaixaProblemas = () => screen.queryByRole("group", { name: /Corrija antes de guardar/ });
const guardarBtn = () => screen.getByRole("button", { name: /guardar levantamento|a guardar/i });
const abrir = (pergunta: string) => {
  fireEvent.click(botao(pergunta));
  return screen.getByRole("group", { name: `Editar a pergunta ${pergunta}` });
};
const escrever = (campo: HTMLElement, valor: string) => fireEvent.change(campo, { target: { value: valor } });
const erroNeg = (codigo: string | null, mensagem = "texto da base") =>
  new ErroNeg(new Error(mensagem), codigo, codigo ? CHAVES_ERRO_NEG[codigo] : "pessoasPagina.erroNeg.generico");
/** O que o separador deu ao hook ao guardar: a versão e as secções já no formato que a função da base recebe. */
const enviado = (q: QuestionarioHook, chamada = 0): [number, Record<string, unknown>[]] => {
  const [versao, seccoes] = (q.guardar as ReturnType<typeof vi.fn>).mock.calls[chamada] as [number, SeccaoEd[]];
  return [versao, paraEnvio(seccoes) as Record<string, unknown>[]];
};

describe("LevantamentoSeparador: carregar", () => {
  it("enquanto lê mostra «A carregar» e ainda não o botão Guardar", () => {
    desenhar({ dados: null, isLoading: true });
    expect(screen.getByText("A carregar o levantamento...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });

  it("se a leitura falha: alerta com «Tentar de novo», que relê; sem Guardar (não se grava por cima do que não se viu)", () => {
    const recarregar = vi.fn().mockResolvedValue(null);
    desenhar({ dados: null, isError: true, recarregar });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o levantamento.");
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
    fireEvent.click(botao("Tentar de novo"));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("NG008 e 42501 na leitura dizem porquê, e não só «não foi possível»", () => {
    const { unmount } = desenhar({ dados: null, isError: true, erro: erroNeg("NG008") });
    expect(screen.getByRole("alert")).toHaveTextContent(/ainda não tem o levantamento/i);
    unmount();
    desenhar({ dados: null, isError: true, erro: erroNeg("42501") });
    expect(screen.getByRole("alert")).toHaveTextContent(/permissão de configurar/i);
  });
});

describe("LevantamentoSeparador: secções", () => {
  it("mostra as secções pela ordem da base, cada uma numa região com o seu título", () => {
    desenhar();
    const nomes = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label") ?? r.getAttribute("aria-labelledby"));
    expect(nomes).toHaveLength(4);
    for (const n of ["Visitas", "Exterior do edifício", "Medidas da área", "Qualificação"]) expect(regiao(n)).toBeInTheDocument();
  });

  it("Visitas e Medidas só se reordenam: sem campo de título, sem apagar, sem perguntas, e dizem-no", () => {
    desenhar();
    for (const n of ["Visitas", "Medidas da área"]) {
      const r = regiao(n);
      expect(within(r).queryByLabelText("Título da secção")).toBeNull();
      expect(within(r).queryByRole("button", { name: /apagar a secção/i })).toBeNull();
      expect(within(r).queryByRole("button", { name: /adicionar pergunta/i })).toBeNull();
      expect(within(r).queryByRole("checkbox", { name: "Secção ativa" })).toBeNull();
      expect(within(r).getByText(/só se pode mudar a posição/i)).toBeInTheDocument();
      expect(botao(new RegExp(`^Subir a secção ${n}`), r)).toBeInTheDocument();
    }
  });

  it("a Qualificação renomeia-se e tem perguntas, mas não se apaga", () => {
    desenhar();
    const r = regiao("Qualificação");
    expect(within(r).getByLabelText("Título da secção")).toHaveValue("Qualificação");
    expect(within(r).queryByRole("button", { name: /apagar a secção/i })).toBeNull();
    expect(within(r).getByText(/não se pode apagar/i)).toBeInTheDocument();
    expect(within(r).getByRole("button", { name: "Adicionar pergunta" })).toBeInTheDocument();
  });

  it("a secção normal renomeia-se, desativa-se e apaga-se", async () => {
    const { q } = desenhar();
    const r = regiao("Exterior do edifício");
    escrever(within(r).getByLabelText("Título da secção"), "Fachada");
    fireEvent.click(within(regiao("Fachada")).getByRole("checkbox", { name: "Secção ativa" }));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalledTimes(1));
    const [versao, seccoes] = enviado(q);
    expect(versao).toBe(7);
    expect(seccoes[1]).toMatchObject({ id: uuid(2), titulo: "Fachada", activa: false });
  });

  it("apagar uma secção tira-a do ecrã e do que se envia", async () => {
    const { q } = desenhar();
    fireEvent.click(botao("Apagar a secção Exterior do edifício"));
    expect(screen.queryByRole("region", { name: "Exterior do edifício" })).toBeNull();
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect(enviado(q)[1].map((s) => s.id)).toEqual([uuid(1), uuid(3), uuid(4)]);
  });

  it("adicionar secção põe-na no fim, com o foco no título; guarda-se com ref e sem id", async () => {
    const { q } = desenhar();
    fireEvent.click(botao("Adicionar secção"));
    const titulo = screen.getAllByLabelText("Título da secção").at(-1) as HTMLElement;
    expect(titulo).toHaveValue("");
    await waitFor(() => expect(titulo).toHaveFocus());
    escrever(titulo, "Cozinha");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    const seccoes = enviado(q)[1];
    expect(seccoes).toHaveLength(5);
    expect(seccoes[4]).toMatchObject({ titulo: "Cozinha", activa: true, perguntas: [] });
    expect(seccoes[4].id).toBeUndefined();
    expect(seccoes[4].ref).toMatch(/^[A-Za-z0-9_]{1,40}$/);
  });

  it("não deixa passar de 20 secções: o botão «Adicionar secção» fica aria-disabled", () => {
    desenhar();
    for (let i = 0; i < 16; i += 1) fireEvent.click(botao("Adicionar secção"));
    expect(screen.getAllByRole("region")).toHaveLength(20);
    expect(botao("Adicionar secção")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao("Adicionar secção"));
    expect(screen.getAllByRole("region")).toHaveLength(20);
  });

  it("reordenar: «Descer» troca com a seguinte, o foco fica no botão (agora noutra posição) e o leitor de ecrã ouve a nova posição", async () => {
    const { q } = desenhar();
    botao("Descer a secção Visitas").focus();
    fireEvent.click(botao("Descer a secção Visitas"));
    expect(screen.getAllByRole("region").map((r) => within(r).getAllByRole("heading")[0].textContent)).toEqual([
      "Exterior do edifício", "Visitas", "Medidas da área", "Qualificação",
    ]);
    await waitFor(() => expect(botao("Descer a secção Visitas")).toHaveFocus());
    expect(screen.getByRole("log")).toHaveTextContent("Visitas: posição 2 de 4");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect(enviado(q)[1].map((s) => s.id)).toEqual([uuid(2), uuid(1), uuid(3), uuid(4)]);
  });

  it("os botões dos extremos ficam aria-disabled (e continuam focáveis) e não fazem nada", () => {
    desenhar();
    expect(botao("Subir a secção Visitas")).toHaveAttribute("aria-disabled", "true");
    expect(botao("Subir a secção Visitas")).not.toBeDisabled();
    expect(botao("Descer a secção Qualificação")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao("Subir a secção Visitas"));
    expect(screen.getAllByRole("region")[0]).toBe(regiao("Visitas"));
  });
});

describe("LevantamentoSeparador: perguntas", () => {
  it("lista as perguntas fechadas, com o tipo e o estado; abrir mostra o editor e fecha com o mesmo botão", () => {
    desenhar();
    const sec = regiao("Exterior do edifício");
    expect(within(sec).getByRole("button", { name: "Acesso" })).toHaveAttribute("aria-expanded", "false");
    expect(within(sec).getAllByText("Escolha única").length).toBeGreaterThan(0);
    expect(within(sec).getByText("Texto")).toBeInTheDocument();
    fireEvent.click(botao("Acesso"));
    expect(botao("Acesso")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Editar a pergunta Acesso" })).toBeInTheDocument();
    fireEvent.click(botao("Acesso"));
    expect(screen.queryByRole("group", { name: "Editar a pergunta Acesso" })).toBeNull();
  });

  it("editar texto, subtítulo e ativa", async () => {
    const { q } = desenhar();
    const g = abrir("Notas sobre o exterior");
    escrever(within(g).getByLabelText("Texto da pergunta"), "Observações");
    escrever(within(g).getByLabelText("Subtítulo (opcional)"), "Fachada");
    fireEvent.click(within(g).getByRole("checkbox", { name: "Pergunta ativa" }));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    const notas = (enviado(q)[1][1].perguntas as Record<string, unknown>[])[2];
    expect(notas).toMatchObject({ id: uuid(12), texto: "Observações", bloco: "Fachada", activa: false, tipo: "texto" });
  });

  it("uma pergunta desativada diz-se desativada na lista", () => {
    desenhar();
    const g = abrir("Notas sobre o exterior");
    fireEvent.click(within(g).getByRole("checkbox", { name: "Pergunta ativa" }));
    expect(within(regiao("Exterior do edifício")).getByText("Desativada")).toBeInTheDocument();
  });

  it("os quatro tipos estão disponíveis, e cada um mostra os campos que lhe pertencem", () => {
    desenhar();
    const g = abrir("Notas sobre o exterior");
    const tipo = within(g).getByLabelText("Tipo de pergunta") as HTMLSelectElement;
    expect([...tipo.options].map((o) => o.textContent)).toEqual(["Escolha única", "Escolha múltipla", "Texto", "Número"]);
    expect(within(g).getByLabelText("Tamanho máximo da resposta (caracteres)")).toHaveValue(2000);
    expect(within(g).queryByLabelText("Mínimo")).toBeNull();
    expect(within(g).queryByRole("group", { name: "Opções de resposta" })).toBeNull();
    escrever(tipo, "numero");
    expect(within(g).getByLabelText("Mínimo")).toBeInTheDocument();
    expect(within(g).getByLabelText("Máximo")).toBeInTheDocument();
    expect(within(g).getByLabelText("Casas decimais")).toBeInTheDocument();
    expect(within(g).getByLabelText("Unidade (opcional)")).toBeInTheDocument();
    expect(within(g).queryByLabelText("Tamanho máximo da resposta (caracteres)")).toBeNull();
    escrever(tipo, "escolha_multipla");
    expect(within(g).getByRole("group", { name: "Opções de resposta" })).toBeInTheDocument();
    expect(within(g).queryByLabelText("Mínimo")).toBeNull();
  });

  it("número: escreve limites, casas e unidade e envia-os", async () => {
    const { q } = desenhar();
    const g = abrir("Orçamento do cliente");
    escrever(within(g).getByLabelText("Mínimo"), "100");
    escrever(within(g).getByLabelText("Máximo"), "5000.5");
    escrever(within(g).getByLabelText("Casas decimais"), "1");
    escrever(within(g).getByLabelText("Unidade (opcional)"), "euros");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    const orc = (enviado(q)[1][3].perguntas as Record<string, unknown>[])[1];
    expect(orc).toMatchObject({ tipo: "numero", numero: { min: 100, max: 5000.5, casas: 1, unidade: "euros" } });
  });

  it("texto: o tamanho máximo vai como número; deixar o de omissão envia null", async () => {
    const { q } = desenhar();
    const g = abrir("Notas sobre o exterior");
    escrever(within(g).getByLabelText("Tamanho máximo da resposta (caracteres)"), "300");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect((enviado(q)[1][1].perguntas as Record<string, unknown>[])[2]).toMatchObject({ tipo: "texto", texto_max: 300 });
  });

  it("adicionar pergunta: nova, aberta, com o foco no texto e duas opções vazias; guarda-se com ref", async () => {
    const { q } = desenhar();
    fireEvent.click(botao("Adicionar pergunta", regiao("Qualificação")));
    const g = await screen.findByRole("group", { name: /Editar a pergunta/ });
    const texto = within(g).getByLabelText("Texto da pergunta");
    expect(texto).toHaveFocus();
    expect(within(g).getAllByLabelText(/^Texto da opção/)).toHaveLength(2);
    escrever(texto, "Prefere visita de manhã?");
    escrever(within(g).getByLabelText("Texto da opção 1"), "Sim");
    escrever(within(g).getByLabelText("Texto da opção 2"), "Não");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    const nova = (enviado(q)[1][3].perguntas as Record<string, unknown>[])[2];
    expect(nova).toMatchObject({ texto: "Prefere visita de manhã?", tipo: "escolha_unica", activa: true });
    expect(nova.id).toBeUndefined();
    expect(nova.ref).toMatch(/^[A-Za-z0-9_]{1,40}$/);
    expect((nova.opcoes as { texto: string }[]).map((o) => o.texto)).toEqual(["Sim", "Não"]);
  });

  it("apagar pergunta tira-a; o foco passa para «Adicionar pergunta» da mesma secção", async () => {
    const { q } = desenhar();
    fireEvent.click(botao("Apagar a pergunta Notas sobre o exterior"));
    expect(screen.queryByRole("button", { name: "Notas sobre o exterior" })).toBeNull();
    await waitFor(() => expect(botao("Adicionar pergunta", regiao("Exterior do edifício"))).toHaveFocus());
    expect(screen.getByRole("log")).toHaveTextContent(/pergunta apagada/i);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect((enviado(q)[1][1].perguntas as { id: string }[]).map((p) => p.id)).toEqual([uuid(10), uuid(11)]);
  });

  it("reordenar perguntas dentro da secção", async () => {
    const { q } = desenhar();
    fireEvent.click(botao("Subir a pergunta Notas sobre o exterior"));
    expect(screen.getByRole("log")).toHaveTextContent("Notas sobre o exterior: posição 2 de 3");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect((enviado(q)[1][1].perguntas as { id: string }[]).map((p) => p.id)).toEqual([uuid(10), uuid(12), uuid(11)]);
  });

  it("não deixa passar de 150 perguntas: «Adicionar pergunta» fica aria-disabled e não faz nada", () => {
    const cheio = copiarBruto();
    const modelo = cheio.seccoes[1].perguntas[2];
    for (let i = 0; i < 145; i += 1) (cheio.seccoes[3].perguntas as unknown[]).push({ ...modelo, id: uuid(5000 + i), chave: `x${i}`, texto: `Pergunta extra ${i}` });
    desenhar({ dados: lerQuestionario(cheio) });
    const botaoQualificacao = () => botao("Adicionar pergunta", regiao("Qualificação"));
    expect(botaoQualificacao()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botaoQualificacao());
    expect(screen.queryByRole("group", { name: /Editar a pergunta/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Apagar a pergunta/ })).toHaveLength(150);
  });
});

describe("LevantamentoSeparador: opções", () => {
  it("adicionar, editar, desativar, reordenar e apagar opções", async () => {
    const { q } = desenhar();
    const g = abrir("Tipo de imóvel");
    fireEvent.click(botao("Adicionar opção", g));
    escrever(within(g).getByLabelText("Texto da opção 3"), "Loja");
    escrever(within(g).getByLabelText("Texto da opção 1"), "Apartamento T2");
    fireEvent.click(within(g).getByRole("checkbox", { name: "Opção 2 ativa" }));
    fireEvent.click(botao("Subir a opção 3", g));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    const opcoes = ((enviado(q)[1][3].perguntas as Record<string, unknown>[])[0].opcoes as Record<string, unknown>[]);
    expect(opcoes.map((o) => o.texto)).toEqual(["Apartamento T2", "Loja", "Moradia"]);
    expect(opcoes.map((o) => o.activa)).toEqual([true, true, false]);
    expect(opcoes[0].id).toBe(uuid(200));
    expect(opcoes[1].id).toBeUndefined();
  });

  it("apagar uma opção tira-a e o foco passa a «Adicionar opção»; ficar com menos de duas não deixa guardar", async () => {
    desenhar();
    const g = abrir("Tipo de imóvel");
    fireEvent.click(botao("Adicionar opção", g));
    fireEvent.click(botao("Apagar a opção 3", g));
    expect(within(g).getAllByLabelText(/^Texto da opção/)).toHaveLength(2);
    await waitFor(() => expect(botao("Adicionar opção", g)).toHaveFocus());
    fireEvent.click(botao("Apagar a opção 2", g));
    fireEvent.click(guardarBtn());
    const alerta = await caixaProblemas();
    expect(alerta).toHaveTextContent(/pelo menos 2 opções/i);
  });

  it("não deixa passar de 30 opções", () => {
    desenhar();
    const g = abrir("Tipo de imóvel");
    for (let i = 0; i < 30; i += 1) fireEvent.click(botao("Adicionar opção", g));
    expect(within(g).getAllByLabelText(/^Texto da opção/)).toHaveLength(30);
    expect(botao("Adicionar opção", g)).toHaveAttribute("aria-disabled", "true");
  });
});

describe("LevantamentoSeparador: condição de visibilidade", () => {
  it("mostra a condição que já existe e diz que só vale no ecrã", () => {
    desenhar();
    const g = abrir("Impacto no preço");
    expect(within(g).getByLabelText("Pergunta de que depende")).toHaveValue(uuid(10));
    expect(within(within(g).getByRole("group", { name: "Respostas que mostram esta pergunta" })).getByRole("checkbox", { name: "Difícil" })).toBeChecked();
    expect(within(g).getByText(/só se aplica no ecrã do levantamento/i)).toBeInTheDocument();
  });

  it("criar uma condição: escolher a pergunta, marcar a resposta, e vai por id", async () => {
    const { q } = desenhar();
    const g = abrir("Notas sobre o exterior");
    const alvo = within(g).getByLabelText("Pergunta de que depende") as HTMLSelectElement;
    expect([...alvo.options].map((o) => o.textContent)).toEqual(["Sem condição", "Acesso", "Tipo de imóvel"]);
    escrever(alvo, uuid(10));
    const respostas = within(g).getByRole("group", { name: "Respostas que mostram esta pergunta" });
    fireEvent.click(within(respostas).getByRole("checkbox", { name: "Difícil" }));
    fireEvent.click(within(g).getByRole("checkbox", { name: "Mostrar também quando ainda não há resposta" }));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect((enviado(q)[1][1].perguntas as Record<string, unknown>[])[2].depende).toEqual({ pergunta: uuid(10), opcoes: [uuid(101)], sem_resposta: true });
  });

  it("escolher a pergunta sem marcar uma resposta não deixa guardar (a condição ficaria vazia)", async () => {
    const { q } = desenhar();
    const g = abrir("Notas sobre o exterior");
    escrever(within(g).getByLabelText("Pergunta de que depende"), uuid(10));
    fireEvent.click(guardarBtn());
    expect(await caixaProblemas()).toHaveTextContent(/condição/i);
    expect(q.guardar).not.toHaveBeenCalled();
  });

  it("«Sem condição» tira a condição", async () => {
    const { q } = desenhar();
    const g = abrir("Impacto no preço");
    escrever(within(g).getByLabelText("Pergunta de que depende"), "");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    expect((enviado(q)[1][1].perguntas as Record<string, unknown>[])[1].depende).toBeUndefined();
  });

  it("uma pergunta que é condição de outras não pode ter condição própria (um só nível), e o ecrã diz porquê", () => {
    desenhar();
    const g = abrir("Acesso");
    expect(within(g).getByLabelText("Pergunta de que depende")).toBeDisabled();
    expect(within(g).getByText(/condição de outras perguntas/i)).toBeInTheDocument();
  });

  it("apagar a opção de que uma condição depende tira a condição (e o resto continua a guardar-se)", async () => {
    const { q } = desenhar();
    const g = abrir("Acesso");
    fireEvent.click(botao("Adicionar opção", g));
    escrever(within(g).getByLabelText("Texto da opção 3"), "Média");
    fireEvent.click(botao("Apagar a opção 2", g));
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(q.guardar).toHaveBeenCalled());
    const perguntas = enviado(q)[1][1].perguntas as Record<string, unknown>[];
    expect((perguntas[0].opcoes as { texto: string }[]).map((o) => o.texto)).toEqual(["Fácil", "Média"]);
    expect(perguntas[1].depende).toBeUndefined();
  });
});

describe("LevantamentoSeparador: guardar", () => {
  it("sem tocar em nada também se pode guardar; envia a versão lida e mostra «guardado»", async () => {
    const { q } = desenhar();
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Levantamento guardado."));
    expect(enviado(q)[0]).toBe(7);
  });

  it("se a base diz que não mudou, diz «sem alterações» e não «guardado»", async () => {
    desenhar({ guardar: vi.fn().mockResolvedValue({ mudou: false, versao: 7, recarregou: true }) });
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent(/sem alterações/i));
    expect(estado()).not.toHaveTextContent("Levantamento guardado.");
  });

  it("depois de guardar o rascunho desaparece: o ecrã mostra o que a base devolveu", async () => {
    const q = hook();
    const { rerender } = render(<Harness q={q} />);
    escrever(within(regiao("Exterior do edifício")).getByLabelText("Título da secção"), "Fachada");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("guardado"));
    const novo = copiarBruto();
    novo.versao = 8;
    novo.seccoes[1].titulo = "Fachada";
    rerender(<Harness q={{ ...q, dados: lerQuestionario(novo) }} />);
    expect(regiao("Fachada")).toBeInTheDocument();
  });

  it("gravou mas não conseguiu recarregar: avisa (para fechar e voltar a abrir) em vez de mostrar dados velhos como se fossem os da base", async () => {
    desenhar({ guardar: vi.fn().mockResolvedValue({ mudou: true, versao: 8, recarregou: false }) });
    fireEvent.click(guardarBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível recarregar/i);
  });

  it("a região de estado existe desde o início, vazia (as regiões que nascem com texto não são anunciadas)", () => {
    desenhar();
    expect(estado()).toHaveAttribute("aria-live", "polite");
    expect(estado()).toHaveTextContent("");
  });

  it("o botão tem 44 px de altura", () => {
    desenhar();
    expect(guardarBtn().className).toContain("min-h-11");
  });
});

describe("LevantamentoSeparador: validação antes de enviar", () => {
  it("com um problema não chama a base: lista-o num alerta, marca o campo e leva o foco ao primeiro campo com problema", async () => {
    const { q } = desenhar();
    const campo = within(regiao("Exterior do edifício")).getByLabelText("Título da secção");
    escrever(campo, "  ");
    fireEvent.click(guardarBtn());
    const alerta = await caixaProblemas();
    expect(alerta).toHaveTextContent(/Corrija antes de guardar/);
    expect(alerta).toHaveTextContent(/título/i);
    expect(q.guardar).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("a pergunta sem texto fica assinalada e, corrigida, o alerta desaparece", async () => {
    desenhar();
    const g = abrir("Notas sobre o exterior");
    const campo = within(g).getByLabelText("Texto da pergunta");
    escrever(campo, "");
    fireEvent.click(guardarBtn());
    await caixaProblemas();
    expect(campo).toHaveAttribute("aria-invalid", "true");
    escrever(campo, "Observações");
    expect(semCaixaProblemas()).toBeNull();
  });

  it("os limites do número (mínimo acima do máximo) são recusados antes de enviar", async () => {
    const { q } = desenhar();
    const g = abrir("Orçamento do cliente");
    escrever(within(g).getByLabelText("Mínimo"), "9");
    escrever(within(g).getByLabelText("Máximo"), "2");
    fireEvent.click(guardarBtn());
    expect(await caixaProblemas()).toHaveTextContent(/mínimo/i);
    expect(q.guardar).not.toHaveBeenCalled();
  });
});

describe("LevantamentoSeparador: ocupado", () => {
  it("a guardar: botão com aria-busy e aria-disabled (continua focável), texto «A guardar...», campos bloqueados e anúncio", () => {
    desenhar({ aGuardar: true });
    const b = guardarBtn();
    expect(b).toHaveTextContent("A guardar...");
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    expect(within(regiao("Exterior do edifício")).getByLabelText("Título da secção")).toBeDisabled();
    expect(botao("Adicionar secção")).toHaveAttribute("aria-disabled", "true");
    expect(estado()).toHaveTextContent("A guardar...");
  });

  it("duplo clique: só um pedido, e o foco fica no botão", async () => {
    let acabar: (v: typeof OK) => void = () => undefined;
    const guardar = vi.fn().mockReturnValue(new Promise<typeof OK>((r) => { acabar = r; }));
    desenhar({ guardar });
    const b = guardarBtn();
    b.focus();
    fireEvent.click(b);
    fireEvent.click(b);
    fireEvent.click(b);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(b).toHaveFocus();
    expect(within(regiao("Exterior do edifício")).getByLabelText("Título da secção")).toBeDisabled();
    await act(async () => { acabar(OK); });
    await waitFor(() => expect(estado()).toHaveTextContent("guardado"));
    expect(guardarBtn()).toHaveFocus();
    fireEvent.click(guardarBtn());
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  it("não deixa mexer nas operações do editor enquanto grava (apagar, subir)", () => {
    desenhar({ aGuardar: true });
    fireEvent.click(botao("Apagar a secção Exterior do edifício"));
    expect(regiao("Exterior do edifício")).toBeInTheDocument();
  });
});

describe("LevantamentoSeparador: erros", () => {
  it.each([
    ["NG008", /ainda não tem o levantamento/i],
    ["NG009", /um dos valores do levantamento não é válido/i],
    ["42501", /permissão de configurar/i],
  ])("%s mostra a mensagem própria num alerta e diz que nada foi guardado", async (codigo, texto) => {
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg(codigo)) });
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(texto);
    expect(alerta).toHaveTextContent(/nada foi guardado/i);
    expect(alerta).toHaveTextContent("Não foi possível guardar o levantamento.");
    expect(alerta).not.toHaveTextContent("texto da base");
  });

  it("NG009 da regra do tipo: mensagem traduzida mais a da base (que diz qual é a pergunta) e o alerta sai quando se mexe", async () => {
    desenhar({
      guardar: vi.fn().mockRejectedValue(erroNeg("NG009", "Questionário inválido: a pergunta «Tipo de imóvel» já tem respostas e não muda de tipo; crie uma pergunta nova.")),
    });
    const g = abrir("Tipo de imóvel");
    escrever(within(g).getByLabelText("Tipo de pergunta"), "texto");
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/já tem respostas.*crie uma pergunta nova/i);
    expect(alerta).toHaveTextContent("a pergunta «Tipo de imóvel» já tem respostas e não muda de tipo");
    expect(alerta).not.toHaveTextContent("Questionário inválido:");
    escrever(within(g).getByLabelText("Tipo de pergunta"), "escolha_unica");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("outro código (NG005) usa a mensagem de código; uma avaria usa a genérica", async () => {
    const { unmount } = desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG005")) });
    fireEvent.click(guardarBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/levantamento ligado/i);
    unmount();
    desenhar({ guardar: vi.fn().mockRejectedValue(new Error("rede")) });
    fireEvent.click(guardarBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível concluir a ação/i);
  });

  it("o que o utilizador escreveu fica no ecrã depois de um erro, e o foco fica no botão Guardar", async () => {
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG009")) });
    escrever(within(regiao("Exterior do edifício")).getByLabelText("Título da secção"), "Fachada");
    guardarBtn().focus();
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    expect(within(regiao("Fachada")).getByLabelText("Título da secção")).toHaveValue("Fachada");
    expect(guardarBtn()).toHaveFocus();
  });

  it("libertado o botão, dá para tentar de novo", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG009")).mockResolvedValueOnce(OK);
    desenhar({ guardar });
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("LevantamentoSeparador: NG021 (alguém guardou entretanto)", () => {
  const dadosNovos = (): QuestionarioEd => {
    const novo = copiarBruto();
    novo.versao = 9;
    return lerQuestionario(novo)!;
  };

  it("recarrega o questionário, avisa, não perde o que se escreveu, e o próximo Guardar já vai com a versão nova", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG021")).mockResolvedValueOnce(OK);
    const recarregar = vi.fn().mockResolvedValue(dadosNovos());
    desenhar({ guardar, recarregar });
    escrever(within(regiao("Exterior do edifício")).getByLabelText("Título da secção"), "Fachada");
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(alerta).toHaveTextContent(/outra pessoa guardou o levantamento entretanto/i);
    expect(alerta).toHaveTextContent(/as suas alterações continuam no ecrã/i);
    expect(within(regiao("Fachada")).getByLabelText("Título da secção")).toHaveValue("Fachada");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
    expect(enviado({ guardar } as unknown as QuestionarioHook, 1)[0]).toBe(9);
    expect(enviado({ guardar } as unknown as QuestionarioHook, 1)[1][1]).toMatchObject({ titulo: "Fachada" });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("«Descartar as minhas alterações» volta ao que está guardado e tira o aviso", async () => {
    const guardar = vi.fn().mockRejectedValue(erroNeg("NG021"));
    desenhar({ guardar, recarregar: vi.fn().mockResolvedValue(dadosNovos()) });
    escrever(within(regiao("Exterior do edifício")).getByLabelText("Título da secção"), "Fachada");
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(botao(/descartar as minhas alterações/i));
    expect(regiao("Exterior do edifício")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("se não conseguir recarregar, diz-o (feche e volte a abrir) em vez do aviso de «alterações no ecrã»", async () => {
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG021")), recarregar: vi.fn().mockResolvedValue(null) });
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não foi possível recarregá-lo/i);
    expect(screen.queryByRole("button", { name: /descartar as minhas alterações/i })).toBeNull();
  });

  it("o aviso sai quando se guarda com êxito", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG021")).mockResolvedValueOnce(OK);
    desenhar({ guardar, recarregar: vi.fn().mockResolvedValue(dadosNovos()) });
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("guardado"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("LevantamentoSeparador: NG021 com itens que a outra pessoa apagou", () => {
  type Bruto = { versao: number; seccoes: { perguntas: { id: string; opcoes?: { id: string }[] }[] }[] };
  /** A versão 9 da base: a outra pessoa apagou a pergunta «Notas sobre o exterior» e a opção «Moradia». */
  const semApagados = (): QuestionarioEd => {
    const novo = copiarBruto() as unknown as Bruto;
    novo.versao = 9;
    novo.seccoes[1].perguntas = novo.seccoes[1].perguntas.filter((p) => p.id !== uuid(12));
    novo.seccoes[3].perguntas[0].opcoes = novo.seccoes[3].perguntas[0].opcoes!.filter((o) => o.id !== uuid(201));
    return lerQuestionario(novo)!;
  };

  it("diz o que desapareceu da base e ainda está no ecrã (senão o Guardar seguinte falha e o utilizador fica sem saída)", async () => {
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG021")), recarregar: vi.fn().mockResolvedValue(semApagados()) });
    escrever(within(regiao("Qualificação")).getByLabelText("Título da secção"), "Qualificação nova");
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Pergunta: Notas sobre o exterior");
    expect(alerta).toHaveTextContent("Opção: Moradia (da pergunta Tipo de imóvel)");
    expect(alerta).toHaveTextContent(/apague-os do ecrã/i);
  });

  it("uma secção apagada conta uma vez (as perguntas dela não se repetem na lista)", async () => {
    const novo = copiarBruto() as unknown as Bruto & { seccoes: unknown[] };
    novo.versao = 9;
    novo.seccoes.splice(1, 1);
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG021")), recarregar: vi.fn().mockResolvedValue(lerQuestionario(novo)!) });
    escrever(within(regiao("Qualificação")).getByLabelText("Título da secção"), "Qualificação nova");
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Secção: Exterior do edifício");
    expect(alerta).not.toHaveTextContent("Pergunta: Acesso");
  });

  it("sem nada apagado não aparece lista", async () => {
    const novo = copiarBruto();
    novo.versao = 9;
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG021")), recarregar: vi.fn().mockResolvedValue(lerQuestionario(novo)!) });
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).not.toHaveTextContent(/apague-os do ecrã/i);
  });

  it("tirando do ecrã o que já não existe, o Guardar seguinte vai com a versão nova e sem esses ids", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG021")).mockResolvedValueOnce(OK);
    desenhar({ guardar, recarregar: vi.fn().mockResolvedValue(semApagados()) });
    escrever(within(regiao("Qualificação")).getByLabelText("Título da secção"), "Qualificação nova");
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(botao("Apagar a pergunta Notas sobre o exterior"));
    const g = abrir("Tipo de imóvel");
    fireEvent.click(botao("Apagar a opção 2", g));
    // Fica uma só opção, e a base pede duas: acrescenta-se uma nova.
    fireEvent.click(botao("Adicionar opção", g));
    escrever(within(g).getByLabelText("Texto da opção 2"), "Loja");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
    const [versao, seccoes] = enviado({ guardar } as unknown as QuestionarioHook, 1);
    expect(versao).toBe(9);
    expect((seccoes[1].perguntas as { id: string }[]).map((p) => p.id)).toEqual([uuid(10), uuid(11)]);
    expect(((seccoes[3].perguntas as { opcoes: { id: string }[] }[])[0].opcoes).map((o) => o.id)).toEqual([uuid(200), undefined]);
  });

  it("sem rascunho (nada escrito) não há lista: o ecrã passa a mostrar o que a base tem (a lista seria falsa)", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG021")).mockResolvedValueOnce(OK);
    desenhar({ guardar, recarregar: vi.fn().mockResolvedValue(semApagados()) });
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).not.toHaveTextContent(/apague-os do ecrã/i);
    expect(alerta).not.toHaveTextContent("Pergunta: Notas sobre o exterior");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
  });

  it("NG009 «desconhecida» (a base já não tem o item) tem mensagem própria, que manda apagá-lo do ecrã", async () => {
    desenhar({ guardar: vi.fn().mockRejectedValue(erroNeg("NG009", "Questionário inválido: pergunta desconhecida.")) });
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/já não existe na versão guardada/i);
    expect(alerta).toHaveTextContent(/nada foi guardado/i);
    expect(alerta).not.toHaveTextContent("pergunta desconhecida");
  });
});

describe("LevantamentoSeparador: o que o leitor de ecrã ouve", () => {
  const registo = () => screen.getByRole("log");
  const semInvisiveis = (s: string | null) => (s ?? "").replace(/​/g, "");

  it("os problemas não são uma região viva: a lista não é repetida a cada tecla, e ouve-se só a contagem, ao carregar em Guardar", async () => {
    desenhar();
    const campo = within(regiao("Exterior do edifício")).getByLabelText("Título da secção");
    escrever(campo, "  ");
    fireEvent.click(guardarBtn());
    const caixa = await caixaProblemas();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(caixa.closest("[aria-live]")).toBeNull();
    expect(semInvisiveis(registo().textContent)).toBe("Por corrigir antes de guardar: 1");
    escrever(campo, " ");
    escrever(campo, "");
    expect(semInvisiveis(registo().textContent)).toBe("Por corrigir antes de guardar: 1");
  });

  it("a contagem diz quantos problemas há", async () => {
    desenhar();
    escrever(within(regiao("Exterior do edifício")).getByLabelText("Título da secção"), "");
    const g = abrir("Orçamento do cliente");
    escrever(within(g).getByLabelText("Mínimo"), "9");
    escrever(within(g).getByLabelText("Máximo"), "2");
    fireEvent.click(guardarBtn());
    await caixaProblemas();
    expect(semInvisiveis(registo().textContent)).toBe("Por corrigir antes de guardar: 2");
  });

  it("a mesma ação duas vezes seguidas muda o texto da região (texto igual não é reanunciado)", () => {
    desenhar();
    fireEvent.click(botao("Adicionar secção"));
    const primeiro = registo().textContent;
    expect(semInvisiveis(primeiro)).toMatch(/secção adicionada/i);
    fireEvent.click(botao("Adicionar secção"));
    const segundo = registo().textContent;
    expect(segundo).not.toBe(primeiro);
    expect(semInvisiveis(segundo)).toBe(semInvisiveis(primeiro));
  });
});

describe("LevantamentoSeparador: o texto da organização é só texto (XSS armazenado)", () => {
  const PAYLOAD = "<img src=x onerror=alert(1)>";
  const SCRIPT = "<script>alert(2)</script>";
  type Cru = { seccoes: { titulo: string; perguntas: { texto: string; bloco: string | null; opcoes: { texto: string }[] }[] }[] };
  const perigoso = (): QuestionarioEd => {
    const cru = copiarBruto() as unknown as Cru;
    cru.seccoes[1].titulo = `Fachada ${PAYLOAD}`;
    cru.seccoes[1].perguntas[0].texto = `Acesso ${PAYLOAD}`;
    cru.seccoes[1].perguntas[0].bloco = `Subtítulo ${PAYLOAD}`;
    cru.seccoes[1].perguntas[0].opcoes[0].texto = `Fácil ${SCRIPT}`;
    return lerQuestionario(cru)!;
  };

  it("título, pergunta, subtítulo e opção aparecem como texto, sem criar elementos", () => {
    const { container } = desenhar({ dados: perigoso() });
    expect(screen.getByRole("heading", { name: `Fachada ${PAYLOAD}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Acesso ${PAYLOAD}` })).toBeInTheDocument();
    const g = abrir(`Acesso ${PAYLOAD}`);
    expect(within(g).getByLabelText("Subtítulo (opcional)")).toHaveValue(`Subtítulo ${PAYLOAD}`);
    expect(within(g).getByLabelText("Texto da opção 1")).toHaveValue(`Fácil ${SCRIPT}`);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("escrever uma etiqueta num campo também fica como texto (no ecrã e na lista)", () => {
    const { container } = desenhar();
    const g = abrir("Notas sobre o exterior");
    escrever(within(g).getByLabelText("Texto da pergunta"), PAYLOAD);
    expect(screen.getByRole("button", { name: PAYLOAD })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
