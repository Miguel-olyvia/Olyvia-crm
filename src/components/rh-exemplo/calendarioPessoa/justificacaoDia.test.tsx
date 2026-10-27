// Arranque de «justificar um dia com falta sugerida ou atraso». A pessoa (Sofia, dia 8/10: atraso de 12 min e falta sugerida)
// justifica, o RH vê a linha na fila e decide, e o calendário, a aba Justificações e o desconto acompanham. Tudo em memória,
// com a data fixa de 14/10/2026 (HOJE_EXEMPLO_RH). O desconto é o da regra das faltas, lido do cálculo do mês.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// O limite anual da pessoa vem do contrato real; aqui, sem base, vale o limite por omissão da organização.
vi.mock("@/components/rh-exemplo/fluxosC/limitePessoa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/rh-exemplo/fluxosC/limitePessoa")>()),
  useLimiteAnualMin: (_pessoaId: string, omissaoMin: number) => omissaoMin,
}));
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { definirPrazoDeJustificacao } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { decidirJustificacaoDeDia } from "@/components/rh-exemplo/dados/accoesJustificacaoDia";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerJustificacaoDia, reporJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { FilaJustificacoesDoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/FilaJustificacoesDoDia";
import { fecharMesNaLoja, lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { entradaSalarioDaFicha } from "@/components/rh-exemplo/fluxosC/salarioEntrada";
import { PessoaAssiduidadeTab } from "@/components/rh-exemplo/PessoaAssiduidadeTab";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { rhExemploJustificacoesTranslations } from "@/translations/rhExemploJustificacoes";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: true, picarOutros: true, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};

const envolver = (conteudo: JSX.Element) => render(<LanguageProvider><MemoryRouter>{conteudo}</MemoryRouter></LanguageProvider>);
const ficha = (id: string, nome: string, souAPessoa: boolean, aba = "calendario") =>
  envolver(<PessoaAssiduidadeTab pessoaId={id} pessoaNome={nome} souAPessoa={souAPessoa} permissoes={TUDO} aba={aba} />);
const celula = (iso: string): HTMLElement => document.getElementById(`cal-dia-${iso}`) as HTMLElement;
const abrirDia = (iso: string): HTMLElement => {
  fireEvent.click(celula(iso));
  return screen.getByTestId("rhcal-detalhe");
};
const minutosEmFalta = (pessoaId: string): number =>
  entradaSalarioDaFicha(lerEstado().fichas[pessoaId], lerFluxosC(), 2026, 10).minutosEmFalta;

function preencher(detalhe: HTMLElement, motivo = "O autocarro avariou a meio do caminho") {
  fireEvent.change(within(detalhe).getByLabelText("Tipo"), { target: { value: "transporte" } });
  fireEvent.change(within(detalhe).getByLabelText("Motivo"), { target: { value: motivo } });
}

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporJustificacaoDia();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("traduções", () => {
  it("en e pt têm exactamente as mesmas chaves", () => {
    const { en, pt } = rhExemploJustificacoesTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("vista da própria pessoa", () => {
  it("o dia de falta sugerida diz «Podes justificar» na célula e mostra o botão «Justificar»; sem «Corrigir»", () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Podes justificar");
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByText(/Atraso de 12 min/)).toBeInTheDocument();
    expect(within(detalhe).getByText(/falta sugerida/i)).toBeInTheDocument();
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Podes justificar");
    expect(within(detalhe).getByRole("button", { name: "Justificar" })).toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /Corrigir|Pedir justificação|Ver o registo/ })).not.toBeInTheDocument();
  });

  it("um dia sem falta sugerida nem atraso não mostra «Justificar» nem indicador", () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    expect(celula("2026-10-06").getAttribute("aria-label")).not.toContain("justificar");
    const detalhe = abrirDia("2026-10-06");
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    expect(within(detalhe).queryByTestId("rhjd-pessoa")).not.toBeInTheDocument();
  });

  it("o formulário mostra um erro por campo, ligado ao campo por aria-describedby", () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
    fireEvent.change(within(detalhe).getByLabelText("Motivo"), { target: { value: "ab" } });
    expect(within(detalhe).getByText("2 caracteres (mínimo 3)")).toBeInTheDocument();
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    const tipo = within(detalhe).getByLabelText("Tipo");
    const motivo = within(detalhe).getByLabelText("Motivo");
    expect(tipo).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(tipo.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Escolhe o tipo de justificação.");
    expect(motivo.getAttribute("aria-describedby")).toContain("-motivo-erro");
    expect(within(detalhe).getByText("Escreve o motivo (mínimo 3 caracteres).")).toBeInTheDocument();
    expect(lerJustificacaoDia().justificacoes.some((j) => j.pessoaId === "p-sofia")).toBe(false);
  });

  it("os anexos são só nomes, no máximo 4, e podem remover-se", () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
    const campo = within(detalhe).getByLabelText(/Anexos \(opcional, até 4\)/) as HTMLInputElement;
    const ficheiros = ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"].map((n) => new File(["x"], n));
    fireEvent.change(campo, { target: { files: ficheiros } });
    expect(within(detalhe).getByLabelText("Anexos escolhidos").querySelectorAll("li")).toHaveLength(4);
    expect(within(detalhe).getByText("No máximo 4 anexos.")).toBeInTheDocument();
    fireEvent.click(within(detalhe).getByRole("button", { name: "Remover a.pdf" }));
    expect(within(detalhe).getByLabelText("Anexos escolhidos").querySelectorAll("li")).toHaveLength(3);
  });

  it("enviar muda o dia para «a aguardar o RH», com o motivo e a data, e deixa de mostrar «Justificar» (sem «Corrigir»)", () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
    preencher(detalhe);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação enviada · a aguardar o RH");
    expect(within(detalhe).getByText("O autocarro avariou a meio do caminho")).toBeInTheDocument();
    expect(within(detalhe).getByText(/Enviada a 14\/10\/2026/)).toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /Corrigir|Pedir justificação/ })).not.toBeInTheDocument();
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Justificação enviada");
  });

  it("depois do prazo da organização mostra «Prazo terminado» e «Sem justificação», sem botão", () => {
    definirPrazoDeJustificacao(1);
    ficha("p-sofia", "Sofia Rebelo", true);
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Sem justificação");
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Prazo terminado");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Sem justificação");
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
  });
});

describe("o RH decide", () => {
  function pessoaJustifica() {
    const { unmount } = ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
    preencher(detalhe);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    unmount();
  }

  it("a fila mostra a linha «Justificação por decidir» e Aceitar · paga tira-a da fila e atualiza o calendário e a aba", () => {
    pessoaJustifica();
    envolver(<FilaJustificacoesDoDia />);
    const linha = screen.getByTestId("rhjd-fila-" + lerJustificacaoDia().justificacoes.find((j) => j.pessoaId === "p-sofia")?.id);
    expect(linha).toHaveTextContent("Justificação por decidir");
    expect(linha).toHaveTextContent("Sofia");
    expect(linha).toHaveTextContent("Transporte");
    expect(linha).toHaveTextContent("O autocarro avariou");
    expect(screen.getByTestId("rhjd-fila")).toHaveTextContent("2 por decidir");
    fireEvent.click(within(linha).getByRole("button", { name: /Aceitar a justificação de Sofia/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · paga" }));
    expect(screen.queryByTestId(linha.getAttribute("data-testid") ?? "")).not.toBeInTheDocument();
    expect(screen.getByTestId("rhjd-fila-aviso")).toHaveTextContent("Justificação aceite · paga.");
    cleanup();

    ficha("p-sofia", "Sofia Rebelo", true);
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Falta justificada · paga");
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Falta justificada · paga");
    expect(within(detalhe).queryByText(/falta sugerida/i)).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    cleanup();

    ficha("p-sofia", "Sofia Rebelo", true, "justificacoes");
    const aceites = screen.getByTestId("rha-just-aceites");
    expect(aceites).toHaveTextContent("Falta justificada · paga");
    expect(aceites).toHaveTextContent("O autocarro avariou a meio do caminho");
  });

  it("Aceitar · não paga fica justificada e com desconto; Recusar pede motivo e a pessoa pode voltar a enviar", () => {
    pessoaJustifica();
    const id = lerJustificacaoDia().justificacoes.find((j) => j.pessoaId === "p-sofia")?.id ?? "";
    envolver(<FilaJustificacoesDoDia />);
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${id}`)).getByRole("button", { name: /Recusar a justificação de Sofia/ }));
    const dialogo = screen.getByRole("alertdialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "ab" } });
    expect(within(dialogo).getByRole("button", { name: "Recusar" })).toBeDisabled();
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Sem comprovativo do transporte" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(screen.queryByTestId(`rhjd-fila-${id}`)).not.toBeInTheDocument();
    cleanup();

    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação recusada");
    expect(within(detalhe).getByText("Motivo do RH: Sem comprovativo do transporte")).toBeInTheDocument();
    expect(within(detalhe).getByText(/falta sugerida/i)).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: "Justificar de novo" })).toBeInTheDocument();
  });

  it("no painel do dia da ficha, o RH vê as ações e decide; recusar exige motivo", () => {
    ficha("p-ines", "Inês Cardoso", false);
    const detalhe = abrirDia("2026-10-07");
    expect(within(detalhe).getByText("O autocarro avariou a meio do caminho e só cheguei 15 minutos depois da hora.")).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: "Aceitar · paga" })).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: "Aceitar · não paga" })).toBeInTheDocument();
    expect(within(detalhe).getByTestId("rhjd-efeito")).toHaveTextContent(/Aceitar · não paga: desconta 0 h 15 \(\d+,\d{2} €\)/);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Aceitar · não paga" }));
    expect(within(detalhe).getByText("Justificação aceite · não paga.")).toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Aceitar · paga" })).not.toBeInTheDocument();
    expect(within(detalhe).getByTestId("rhjd-efeito")).toHaveTextContent(/Falta justificada e não paga: desconta 0 h 15/);
  });

  it("o texto de uma consulta médica fica atrás de «Ver texto», que regista quem leu", () => {
    ficha("p-andre", "André Silva", false);
    const detalhe = abrirDia("2026-10-06");
    expect(within(detalhe).queryByText(/Consulta de rotina no centro de saúde/)).not.toBeInTheDocument();
    fireEvent.click(within(detalhe).getByRole("button", { name: "Ver texto" }));
    expect(within(detalhe).getByTestId("rhjd-texto")).toHaveTextContent("Consulta de rotina no centro de saúde");
    expect(lerJustificacaoDia().acessos).toHaveLength(1);
    expect(within(detalhe).getByLabelText("Quem leu este texto").querySelectorAll("li")).toHaveLength(1);
  });

  it("dados de exemplo: uma pendente na fila, uma aceite e uma recusada", () => {
    const estados = Object.fromEntries(lerJustificacaoDia().justificacoes.map((j) => [j.pessoaId, j.estado]));
    expect(estados).toEqual({ "p-ines": "pendente", "p-andre": "aceite_paga", "p-beatriz": "recusada" });
    envolver(<FilaJustificacoesDoDia />);
    expect(screen.getAllByTestId(/^rhjd-fila-jd-/)).toHaveLength(1);
  });
});

describe("o desconto acompanha a decisão (regra das faltas, cálculo do mês)", () => {
  it("aceitar paga não desconta; aceitar não paga desconta o tempo; recusar não altera", () => {
    const antes = minutosEmFalta("p-ines");
    expect(decidirJustificacaoDeDia("jd-ines", "aceitar_paga", "").erro).toBeNull();
    expect(minutosEmFalta("p-ines")).toBe(antes);
    reporGestao();
    reporJustificacaoDia();
    expect(decidirJustificacaoDeDia("jd-ines", "aceitar_nao_paga", "").erro).toBeNull();
    expect(minutosEmFalta("p-ines")).toBe(antes + 15);
    const falta = lerGestao().faltas.find((f) => f.id === lerJustificacaoDia().justificacoes.find((j) => j.id === "jd-ines")?.faltaId);
    expect(falta).toMatchObject({ justificacao_estado: "justificada", remunerada: false, minutos: 15, data: "2026-10-07" });
    reporGestao();
    reporJustificacaoDia();
    expect(decidirJustificacaoDeDia("jd-ines", "recusar", "Sem comprovativo").erro).toBeNull();
    expect(minutosEmFalta("p-ines")).toBe(antes);
  });

  it("a aceitação paga cria a falta justificada e paga, sem desconto", () => {
    decidirJustificacaoDeDia("jd-ines", "aceitar_paga", "");
    const j = lerJustificacaoDia().justificacoes.find((x) => x.id === "jd-ines");
    expect(lerGestao().faltas.find((f) => f.id === j?.faltaId)).toMatchObject({ justificacao_estado: "justificada", remunerada: true });
  });

  it("num mês já fechado a decisão fica registada e o desconto não muda", () => {
    expect(fecharMesNaLoja("2026-10", [])).not.toBeNull();
    const antes = lerGestao().faltas.length;
    const r = decidirJustificacaoDeDia("jd-ines", "aceitar_nao_paga", "");
    expect(r).toEqual({ erro: null, mesFechado: true });
    expect(lerJustificacaoDia().justificacoes.find((j) => j.id === "jd-ines")).toMatchObject({ estado: "aceite_nao_paga", mesFechado: true });
    expect(lerGestao().faltas.length).toBe(antes + 1);
  });

  it("decidir duas vezes a mesma justificação recusa a segunda", () => {
    expect(decidirJustificacaoDeDia("jd-ines", "aceitar_paga", "").erro).toBeNull();
    expect(decidirJustificacaoDeDia("jd-ines", "recusar", "motivo").erro).toBe("rhJust.erro.jaDecidida");
  });
});
