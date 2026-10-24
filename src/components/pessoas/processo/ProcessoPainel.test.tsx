// O painel de visita e levantamento do ProcessoProvider: guardar numa só gravação nos registos da PESSOA (nunca num pedido), o passo «Fazer o
// levantamento» de um negócio em Levantamento (guarda e liga o levantamento ao negócio) e criar o negócio à mão, que liga registos existentes.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { alteracoesAtuais, repor as reporAlterados } from "@/components/negocio-metas/negociosAlterados";
import { guardarVisitasELevantamento, registarContacto, registarLevantamento, registarVisita, registosAtuais, repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import { levantamentoBase, negocioBase, pessoaBase, resumoBase } from "../fabricaTestes";
import type { ResumoPessoa } from "../pessoasTipos";
import {
  Gatilho, GatilhoVisitaLevantamento, GUARDAR, PAINEL, comVisitas, feitaComLinhas, itemDe, itensDe, levantamento, linha, renderizar, resumoCom, visita,
} from "./arnesProcesso";

const { erro } = vi.hoisted(() => ({ erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: erro, success: vi.fn() } }));

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

beforeEach(() => { erro.mockClear(); reporRegistos(); reporAlterados(); });
afterEach(() => { cleanup(); reporRegistos(); reporAlterados(); });

describe("ProcessoProvider: guardar a visita e o levantamento do painel", () => {
  it("guarda na pessoa, numa só gravação, as visitas, o levantamento e o comercial do painel, e fecha o painel", async () => {
    const r = resumoCom(comVisitas());
    const { a } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(a.guardarRegistos).toHaveBeenCalledTimes(1);
    const [pessoaId, dados] = (a.guardarRegistos as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pessoaId).toBe("a");
    expect(dados.visitas.map((v: { id: string }) => v.id)).toEqual(["rv-1"]);
    expect(dados.levantamento).toMatchObject({ linhas: [] });
    expect(dados.comercial).toBe("Ana Ribeiro");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("«Visita e levantamento» (o menu da ficha) abre o painel mesmo sem visitas: nem a visita nem o levantamento são obrigatórios", async () => {
    const r = resumoCom({ contactos: [], visitas: [], levantamentos: [] });
    const { a, aoAnunciar } = renderizar(r, <GatilhoVisitaLevantamento />);
    fireEvent.click(screen.getByRole("button", { name: "visita e levantamento" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    expect(within(painel).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(a.guardarRegistos).toHaveBeenCalledTimes(1);
    expect(erro).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
  });

  it("uma linha de medidas por acabar mostra o motivo no próprio painel (role=alert), sem toast, sem guardar e sem fechar", async () => {
    const r = resumoCom(comVisitas([visita({ estado: "feita" })]));
    const { a, aoAnunciar } = renderizar(r, <GatilhoVisitaLevantamento />);
    fireEvent.click(screen.getByRole("button", { name: "visita e levantamento" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    // O próprio formulário recusa linhas por acabar (e nada chega ao provider).
    expect(a.guardarRegistos).not.toHaveBeenCalled();
    expect(erro).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(painel);
  });

  it("o painel diz de que pessoa é e já não fala de pedidos", async () => {
    const r = resumoCom(comVisitas());
    renderizar(r, <GatilhoVisitaLevantamento />);
    fireEvent.click(screen.getByRole("button", { name: "visita e levantamento" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    expect(painel).not.toHaveTextContent(/pedido/i);
  });
});

/** A mesma pessoa, já com a abordagem encerrada ou perdida: o que acontece a quem tinha o painel aberto, ou um botão velho. */
const comoFechada = (extra: "perdida" | "encerrada"): ResumoPessoa =>
  resumoBase(
    pessoaBase("a", extra === "perdida"
      ? { perdida: { motivo: "preco", data: "2026-10-01" } }
      : { encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-01" } }),
    [], HOJE_EXEMPLO, "lead", comVisitas(),
  );

describe("ProcessoProvider: pessoa perdida ou encerrada (nada falha em silêncio nem anuncia um sucesso que não houve)", () => {
  it.each(["perdida", "encerrada"] as const)("um botão de um passo de uma pessoa %s não abre nada: explica, na região live e junto ao botão", (como) => {
    const { item } = itemDe(comVisitas());
    const { aoAnunciar } = renderizar(comoFechada(como), <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    expect(aoAnunciar).toHaveBeenCalledTimes(1);
    expect((aoAnunciar.mock.calls[0] as string[])[0].replace(/ /g, "")).toBe(
      "Marcar a visita como feita: ainda não é possível. Esta pessoa já não está em abordagem (perdida ou com a abordagem encerrada): reative-a primeiro.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("guardar o painel de uma pessoa que entretanto ficou encerrada: o motivo diz-se no painel, nada se guarda, nada se anuncia e o painel fica aberto", async () => {
    const r = resumoCom(comVisitas());
    const { a, aoAnunciar, mudarResumo } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    mudarResumo(comoFechada("encerrada"));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    expect(await within(painel).findByRole("alert")).toHaveTextContent("Esta pessoa já não está em abordagem");
    expect(a.guardarRegistos).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(painel);
  });
});

describe("ProcessoProvider: o comercial escolhido no painel não se perde", () => {
  it("guardar leva o comercial do painel (mudado) para os registos", async () => {
    const r = resumoCom(comVisitas());
    const { a } = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: PAINEL });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Geral/ }));
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /^Comercial/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Diogo Lopes" }));
    fireEvent.click(within(painel).getByRole("button", { name: GUARDAR }));
    const [, dados] = (a.guardarRegistos as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(dados.comercial).toBe("Diogo Lopes");
  });
});

describe("ProcessoProvider: fazer o levantamento de um negócio em Levantamento", () => {
  const emLevantamento = (decisao: "ligado" | "porDecidir" = "ligado", extra: Partial<RegistosDaPessoa> = {}): ResumoPessoa =>
    resumoBase(
      pessoaBase("a"), [{ ...negocioBase("n1", { servico: "Cozinha", decisaoLevantamento: decisao }), pessoaId: "a" }], HOJE_EXEMPLO, "lead",
      comVisitas([visita({ estado: "feita" })], extra),
    );
  const abrirLevantamento = (r: ResumoPessoa = emLevantamento()) => {
    const resultado = renderizar(r, <Gatilho item={itensDe(r)[0]} />);
    (resultado.a.guardarRegistos as ReturnType<typeof vi.fn>).mockImplementation((pessoaId: string, dados: object) => {
      guardarVisitasELevantamento(pessoaId, { ...(dados as Parameters<typeof guardarVisitasELevantamento>[1]), hoje: HOJE_EXEMPLO });
    });
    return resultado;
  };

  it("o item é do negócio, na fase Levantamento, e o painel chama-se «Levantamento de a»", async () => {
    const r = emLevantamento();
    expect(itensDe(r)[0]).toMatchObject({ id: "n1", tipo: "negocio", fase: "levantamento" });
    abrirLevantamento();
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Levantamento de a" });
    expect(painel).toHaveAccessibleDescription(/Faça o levantamento do negócio Cozinha/);
  });

  it("sem medidas nem observações, e sem nenhum levantamento por ligar, diz que falta o levantamento e não guarda", async () => {
    const { a } = abrirLevantamento();
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Levantamento de a" });
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
    expect(await within(painel).findByRole("alert")).toHaveTextContent("Falta o levantamento");
    expect(a.guardarRegistos).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(painel);
  });

  it("guarda o levantamento na pessoa e liga-o ao negócio (um registo só vai para um negócio); o negócio fica com o levantamento ligado e segue para Orçamento", async () => {
    const { a, aoAnunciar } = abrirLevantamento(emLevantamento("porDecidir"));
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Levantamento de a" });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /^Divisão ou zona/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Cozinha" }));
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Bancada nova" }));
    fireEvent.change(within(painel).getByLabelText(/^Medida(?!s)/), { target: { value: "3" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
    expect(a.guardarRegistos).toHaveBeenCalledTimes(1);
    expect(registosAtuais().levantamentos).toHaveLength(1);
    expect(registosAtuais().levantamentos[0]).toMatchObject({ pessoaId: "a", negocioId: "n1" });
    expect(alteracoesAtuais().editados.n1?.decisaoLevantamento).toBe("ligado");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(aoAnunciar.mock.calls[0][0]).toMatch(/^Levantamento ligado/);
  });

  it("com um levantamento da pessoa já por ligar, basta guardar: liga esse ao negócio", async () => {
    registarLevantamento({ pessoaId: "a", visitaId: null, data: "2026-10-11", feitoPor: "Ana", rascunho: levantamento([linha]) });
    const { a } = abrirLevantamento(emLevantamento("ligado", { levantamentos: [{ ...levantamentoBase("rl-1"), rascunho: levantamento([linha]) }] }));
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Levantamento de a" });
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
    expect(a.guardarRegistos).toHaveBeenCalledTimes(1);
    expect(registosAtuais().levantamentos.filter((l) => l.negocioId === "n1")).toHaveLength(1);
  });
});

describe("ProcessoProvider: criar o negócio à mão, ligando registos da pessoa", () => {
  /** Os registos de `feitaComLinhas()` também no store, porque o painel «Novo negócio» lê os registos de lá. */
  const semearStore = () => {
    registarContacto({ pessoaId: "a", data: "2026-10-10", resultado: "atendeuInteressado", nota: "" });
    registarVisita({ ...visita({ estado: "feita" }), pessoaId: "a" });
    registarLevantamento({ pessoaId: "a", visitaId: "rv-1", data: "2026-10-12", feitoPor: "Ana", rascunho: levantamento() });
  };

  it("abre o painel «Novo negócio» da pessoa e cria-o com os registos marcados: nada se copia, não há pedido nem serviço herdado", async () => {
    semearStore();
    const { r, item } = itemDe(feitaComLinhas());
    const { aoCriarNegocio, aoAnunciar } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de a" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriarNegocio).toHaveBeenCalledTimes(1);
    const dados = (aoCriarNegocio.mock.calls[0] as unknown[])[0] as { pessoa: { id: string }; ligar: unknown };
    expect(dados.pessoa.id).toBe("a");
    expect(dados.ligar).toEqual({
      registos: [{ tipo: "contacto", id: "rc-1" }, { tipo: "visita", id: "rv-1" }], levantamento: { tipo: "existente", id: "rl-1" },
    });
    for (const campo of ["servico", "levantamento", "visitas"]) expect(dados, campo).not.toHaveProperty(campo);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // O negócio entra pelo seu próprio store: o aviso espera até a pessoa o ter, por isso aqui ainda não há nenhum.
    expect(aoAnunciar).not.toHaveBeenCalled();
  });

  it("criar o negócio de uma pessoa sem visita nem levantamento também se pode (só a pessoa é obrigatória)", async () => {
    const { r, item } = itemDe(comVisitas([visita({ estado: "feita" })]));
    const { aoCriarNegocio } = renderizar(r, <Gatilho item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "executar" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de a" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriarNegocio).toHaveBeenCalledTimes(1);
  });
});
