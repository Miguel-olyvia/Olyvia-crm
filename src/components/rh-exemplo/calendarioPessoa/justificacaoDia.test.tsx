// «Justificar um dia com falta sugerida ou atraso», agora guardado na base. A pessoa (Sofia, dia 8/10: atraso de 12 min e falta
// sugerida) justifica, o RH vê a linha na fila e decide, e o calendário e a aba Justificações acompanham. A base está simulada
// em memória (src/test/justificacoesDoDiaFalso.ts) e SOBREVIVE a desmontar e montar de novo o ecrã, que é o que a memória do
// browser não fazia ao recarregar. Data fixa de 14/10/2026. O que a base faz por dentro (marcar a falta, justificá-la e decidi-la na
// mesma transacção) é da base: aqui prova-se o que o ecrã manda, o que mostra e como reage quando a base recusa.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// O limite anual da pessoa vem do contrato real; aqui, sem base, vale o limite por omissão da organização.
vi.mock("@/components/rh-exemplo/fluxosC/limitePessoa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/rh-exemplo/fluxosC/limitePessoa")>()),
  useLimiteAnualMin: (_pessoaId: string, omissaoMin: number) => omissaoMin,
}));
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());
// O mes da pessoa, o mapa de desvios da organizacao, os centros, os tipos de ausencia, a regra do subsidio e o relatorio
// mensal falam com a base por wrappers: aqui entram simulados (mesmo conjunto do calendarioPessoa.test).
vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", async (importOriginal) =>
  (await import("@/test/assiduidadeDaPessoaFalso")).wrapperAssiduidadeDaPessoaFalso(
    await importOriginal<typeof import("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa")>(),
  ));
vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao", async (importOriginal) =>
  (await import("@/test/assiduidadeDaPessoaFalso")).wrapperAssiduidadeDaOrganizacaoFalso(
    await importOriginal<typeof import("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao")>(),
  ));
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => {
  const resultado = { locais: [] as never[], loading: false, recusado: false };
  return { useLocaisTrabalho: () => resultado };
});
vi.mock("@/components/rh-exemplo/hooks/useAusenciasTipos", async () => {
  const tipos = (await import("@/components/rh-exemplo/dados/catalogos")).catalogos().tiposAusencia;
  const resultado = { tipos, loading: false, recusado: false, vazio: false };
  return { useAusenciasTipos: () => resultado };
});
vi.mock("@/components/rh-exemplo/hooks/useRegrasSubsidioAlimentacao", () => {
  const resultado = { regra: { minutosMinimosDia: 240 }, error: null };
  return { useRegrasSubsidioAlimentacao: () => resultado };
});
vi.mock("@/components/rh-exemplo/hooks/PessoaRelatorioAssiduidadeMensalReal", () => ({ PessoaRelatorioAssiduidadeMensal: () => null }));
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
// O prazo para justificar e da organizacao e vem da base: aqui e simulado, e o teste escolhe os dias.
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderRh, reporRhTeste } from "@/test/rhExemploProviders";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { definirGestao, lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { FilaJustificacoesDoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/FilaJustificacoesDoDia";
import { usePendentesJustificacaoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/usePendentesJustificacaoDia";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { PessoaAssiduidadeTab } from "@/components/rh-exemplo/PessoaAssiduidadeTab";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { rhExemploJustificacoesTranslations } from "@/translations/rhExemploJustificacoes";
import { reporAssiduidadeFalsa } from "@/test/assiduidadeDaPessoaFalso";
import { baseFalsa, FALTA_DA_BASE, reporBaseFalsa, semearJustificacao } from "@/test/justificacoesDoDiaFalso";
import { prazoFalso, reporPrazoFalso } from "@/test/prazoJustificacaoFalso";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: true, picarOutros: true, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};

const NOMES = new Map([["p-sofia", "Sofia Rebelo"], ["p-ines", "Inês Cardoso"]]);

function FilaLida({ minhaPessoaId = null }: { minhaPessoaId?: string | null }) {
  const pendentes = usePendentesJustificacaoDia();
  return <FilaJustificacoesDoDia pendentes={pendentes} nomePorPessoaId={NOMES} minhaPessoaId={minhaPessoaId} />;
}

const envolver = (conteudo: JSX.Element) => renderRh(conteudo);
const ficha = (id: string, nome: string, souAPessoa: boolean, aba = "calendario") =>
  envolver(<PessoaAssiduidadeTab pessoaId={id} pessoaNome={nome} souAPessoa={souAPessoa} permissoes={TUDO} aba={aba} />);
const celula = (iso: string): HTMLElement => document.getElementById(`cal-dia-${iso}`) as HTMLElement;
const abrirDia = (iso: string): HTMLElement => {
  fireEvent.click(celula(iso));
  return screen.getByTestId("rhcal-detalhe");
};

function preencher(detalhe: HTMLElement, motivo = "O autocarro avariou a meio do caminho") {
  fireEvent.change(within(detalhe).getByLabelText("Tipo"), { target: { value: "transporte" } });
  fireEvent.change(within(detalhe).getByLabelText("Motivo"), { target: { value: motivo } });
}

/** A Sofia abre o dia 8/10, preenche e envia; espera pela resposta da base. */
async function sofiaEnvia(): Promise<HTMLElement> {
  const detalhe = abrirDia("2026-10-08");
  fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
  preencher(detalhe);
  fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
  await waitFor(() => expect(baseFalsa.registos).toHaveLength(1));
  return detalhe;
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
  reporBaseFalsa();
  reporPrazoFalso();
  reporRhTeste();
  reporAssiduidadeFalsa();
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

  it("as mensagens dos erros da base existem nas duas línguas e nenhuma está vazia", () => {
    const chaves = [
      "rhJust.erro.foraDoPrazo", "rhJust.erro.jaHaFalta", "rhJust.erro.jaEnviada", "rhJust.erro.jaDecidida", "rhJust.erro.faltaDivergente",
      "rhJust.erro.dataFutura", "rhJust.erro.motivoCurto", "rhJust.erro.inexistente", "rhJust.erro.pessoaInvalida", "rhJust.erro.semPermissao",
      "rhJust.erro.indisponivel", "rhJust.erro.leitura", "rhJust.erro.aceitarFalhou", "rhJust.rh.mesFechado", "rhJust.fila.titulo",
    ];
    for (const lingua of ["pt", "en"] as const) {
      for (const chave of chaves) expect(rhExemploJustificacoesTranslations[lingua][chave]?.trim(), `${lingua} ${chave}`).toBeTruthy();
    }
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

  it("o formulário mostra um erro por campo, ligado ao campo por aria-describedby, e não chama a base", () => {
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
    expect(baseFalsa.registos).toEqual([]);
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

  it("enviar grava na base (pessoa, dia, tipo, motivo, período) e o dia passa a «a aguardar o RH»", async () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = await sofiaEnvia();
    expect(baseFalsa.registos[0]).toMatchObject({
      pessoaId: "p-sofia", data: "2026-10-08", tipo: "transporte", motivo: "O autocarro avariou a meio do caminho", horaReal: null, anexosNomes: [],
    });
    await waitFor(() => expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação enviada · a aguardar o RH"));
    expect(within(detalhe).getByText("O autocarro avariou a meio do caminho")).toBeInTheDocument();
    expect(within(detalhe).getByText(/Enviada a 14\/10\/2026/)).toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /Corrigir|Pedir justificação/ })).not.toBeInTheDocument();
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Justificação enviada");
  });

  it("ao recarregar (desmontar e montar de novo) a justificação continua lá: está na base, não na memória do ecrã", async () => {
    const { unmount } = ficha("p-sofia", "Sofia Rebelo", true);
    await sofiaEnvia();
    await waitFor(() => expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Justificação enviada"));
    unmount();
    ficha("p-sofia", "Sofia Rebelo", true);
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Justificação enviada");
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação enviada · a aguardar o RH");
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    expect(baseFalsa.justificacoes).toHaveLength(1);
  });

  it("se a base recusa o envio (fora do prazo), mostra o erro e não perde o texto escrito", async () => {
    baseFalsa.erroDeEscrita = "rhJust.erro.foraDoPrazo";
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar" }));
    preencher(detalhe);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    expect(await within(detalhe).findByText("O prazo para justificar terminou.")).toBeInTheDocument();
    expect((within(detalhe).getByLabelText("Motivo") as HTMLTextAreaElement).value).toBe("O autocarro avariou a meio do caminho");
    expect(within(detalhe).getByTestId("rhjd-form")).toBeInTheDocument();
    expect(baseFalsa.justificacoes).toEqual([]);
  });

  it("se as RPCs ainda não estão na base, diz-o e não oferece «Justificar» (o ecrã não parte)", () => {
    baseFalsa.indisponivel = true;
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-leitura")).toHaveTextContent("As justificações do dia ainda não estão disponíveis nesta base de dados.");
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
  });

  it("depois do prazo da organização mostra «Prazo terminado» e «Sem justificação», sem botão", () => {
    prazoFalso.dias = 1;
    ficha("p-sofia", "Sofia Rebelo", true);
    expect(celula("2026-10-08").getAttribute("aria-label")).toContain("Sem justificação");
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Prazo terminado");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Sem justificação");
    expect(within(detalhe).queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
  });

  it("a leitura do dia pede só esse dia da pessoa", () => {
    ficha("p-sofia", "Sofia Rebelo", true);
    abrirDia("2026-10-08");
    expect(baseFalsa.leituras).toContainEqual({ pessoaId: "p-sofia", de: "2026-10-08", ate: "2026-10-08", soPendentes: false });
  });
});

describe("o RH decide", () => {
  async function pessoaJustifica() {
    const { unmount } = ficha("p-sofia", "Sofia Rebelo", true);
    await sofiaEnvia();
    unmount();
  }
  const idDaSofia = (): string => baseFalsa.justificacoes.find((j) => j.pessoaId === "p-sofia")?.id ?? "";

  it("a fila lê as pendentes da base, mostra a linha e «Aceitar · paga» faz UMA decisão e tira-a da fila", async () => {
    await pessoaJustifica();
    envolver(<FilaLida />);
    const linha = screen.getByTestId(`rhjd-fila-${idDaSofia()}`);
    expect(linha).toHaveTextContent("Justificação por decidir");
    expect(linha).toHaveTextContent("Sofia");
    expect(linha).toHaveTextContent("Transporte");
    expect(linha).toHaveTextContent("O autocarro avariou");
    expect(screen.getByTestId("rhjd-fila")).toHaveTextContent("1 por decidir");
    expect(baseFalsa.leituras.some((l) => l.soPendentes && l.pessoaId === null)).toBe(true);
    const faltasEmMemoria = lerGestao().faltas.length;

    fireEvent.click(within(linha).getByRole("button", { name: /Aceitar a justificação de Sofia/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · paga" }));
    await waitFor(() => expect(screen.queryByTestId(`rhjd-fila-${idDaSofia()}`)).not.toBeInTheDocument());
    expect(baseFalsa.decisoes).toEqual([{ justificacaoId: idDaSofia(), decisao: "aceitar_paga", motivo: null }]);
    expect(screen.getByTestId("rhjd-fila-aviso")).toHaveTextContent("Justificação aceite · paga.");
    // A falta é a da base: a justificação guarda o id que ela devolveu e não nasce nenhuma falta de exemplo em memória.
    expect(baseFalsa.justificacoes.find((j) => j.pessoaId === "p-sofia")?.faltaId).toBe(FALTA_DA_BASE);
    expect(lerGestao().faltas.length).toBe(faltasEmMemoria);
    cleanup();

    // A base marcou a falta ao aceitar (id FALTA_DA_BASE); ao reler o mês, a assiduidade da pessoa traz essa falta.
    definirGestao((g) => ({
      ...g,
      faltas: [...g.faltas, {
        id: FALTA_DA_BASE, pessoa_id: "p-sofia", organization_id: "org-teste", data: "2026-10-08", planeado_id: null, vinculo_id: null,
        local_id: null, hora_inicio: "09:00:00", hora_fim: "09:12:00", minutos: 12, motivo_codigo: "atraso",
        justificacao_estado: "justificada", justificada: true, remunerada: true, desconta_saldo: false, justificacao_decidida_por: null,
        justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null, corrige_falta_id: null, correccao_motivo: null,
        estado: "activa", anulado_em: null, anulacao_motivo: null, created_at: "2026-10-14T12:00:00Z",
      }],
    }));
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

  it("Recusar pede motivo, grava a recusa sem falta, e a pessoa vê o motivo e pode voltar a enviar", async () => {
    await pessoaJustifica();
    const id = idDaSofia();
    envolver(<FilaLida />);
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${id}`)).getByRole("button", { name: /Recusar a justificação de Sofia/ }));
    const dialogo = screen.getByRole("alertdialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "ab" } });
    expect(within(dialogo).getByRole("button", { name: "Recusar" })).toBeDisabled();
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Sem comprovativo do transporte" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(screen.queryByTestId(`rhjd-fila-${id}`)).not.toBeInTheDocument());
    expect(baseFalsa.decisoes).toEqual([{ justificacaoId: id, decisao: "recusar", motivo: "Sem comprovativo do transporte" }]);
    expect(baseFalsa.justificacoes.find((j) => j.id === id)).toMatchObject({ estado: "recusada", faltaId: null });
    cleanup();

    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação recusada");
    expect(within(detalhe).getByText("Motivo do RH: Sem comprovativo do transporte")).toBeInTheDocument();
    expect(within(detalhe).getByText(/falta sugerida/i)).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: "Justificar de novo" })).toBeInTheDocument();
  });

  it("reenviar depois de uma recusa cria outra linha; a recusada fica como histórico", async () => {
    await pessoaJustifica();
    envolver(<FilaLida />);
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${idDaSofia()}`)).getByRole("button", { name: /Recusar a justificação de Sofia/ }));
    fireEvent.change(within(screen.getByRole("alertdialog")).getByRole("textbox"), { target: { value: "Falta o comprovativo" } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(baseFalsa.justificacoes[0].estado).toBe("recusada"));
    cleanup();

    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Justificar de novo" }));
    preencher(detalhe, "Segue o bilhete do autocarro");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Enviar justificação" }));
    await waitFor(() => expect(baseFalsa.justificacoes).toHaveLength(2));
    expect(baseFalsa.justificacoes.map((j) => j.estado)).toEqual(["recusada", "pendente"]);
    await waitFor(() => expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação enviada"));
  });

  it("se a base recusa a aceitação, a linha fica na fila e o erro diz que nada ficou registado", async () => {
    await pessoaJustifica();
    baseFalsa.erroDeEscrita = "rhJust.erro.faltaDivergente";
    envolver(<FilaLida />);
    const id = idDaSofia();
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${id}`)).getByRole("button", { name: /Aceitar a justificação de Sofia/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · não paga" }));
    await waitFor(() => expect(screen.getByTestId("rhjd-fila-aviso")).toHaveAttribute("role", "alert"));
    expect(screen.getByTestId("rhjd-fila-aviso")).toHaveTextContent("nada ficou registado e a justificação continua por decidir");
    expect(screen.getByTestId(`rhjd-fila-${id}`)).toBeInTheDocument();
    expect(baseFalsa.decisoes).toEqual([]);
  });

  it("num mês já fechado pede confirmação; só «Aceitar na mesma» decide, e o aviso di-lo", async () => {
    await pessoaJustifica();
    baseFalsa.mesFechado = true;
    envolver(<FilaLida />);
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${idDaSofia()}`)).getByRole("button", { name: /Aceitar a justificação de Sofia/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · não paga" }));
    // A base recusou sem escrever: abre a confirmação, sem erro e sem decisão.
    const confirmar = await screen.findByTestId("rhjd-mes-fechado");
    expect(baseFalsa.decisoes).toEqual([]);
    expect(screen.queryByText(/nada ficou registado/)).not.toBeInTheDocument();
    fireEvent.click(within(confirmar).getByRole("button", { name: "Aceitar na mesma" }));
    await waitFor(() => expect(screen.getByTestId("rhjd-fila-aviso")).toHaveTextContent("O mês já está fechado: o desconto não se altera"));
    expect(baseFalsa.justificacoes.find((j) => j.pessoaId === "p-sofia")).toMatchObject({ estado: "aceite_nao_paga", mesFechado: true });
  });

  it("num mês já fechado, cancelar a confirmação não decide e a linha fica na fila", async () => {
    await pessoaJustifica();
    baseFalsa.mesFechado = true;
    envolver(<FilaLida />);
    const id = idDaSofia();
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${id}`)).getByRole("button", { name: /Aceitar a justificação de Sofia/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · paga" }));
    const confirmar = await screen.findByTestId("rhjd-mes-fechado");
    fireEvent.click(within(confirmar).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByTestId("rhjd-fila-aviso")).toHaveTextContent("Nada foi decidido"));
    expect(baseFalsa.decisoes).toEqual([]);
    expect(screen.getByTestId(`rhjd-fila-${id}`)).toBeInTheDocument();
  });

  it("na fila, a linha da própria pessoa do RH não tem botões de decidir", async () => {
    await pessoaJustifica();
    envolver(<FilaLida minhaPessoaId="p-sofia" />);
    const linha = screen.getByTestId(`rhjd-fila-${idDaSofia()}`);
    expect(within(linha).queryByRole("button", { name: /Aceitar a justificação/ })).not.toBeInTheDocument();
    expect(within(linha).queryByRole("button", { name: /Recusar a justificação/ })).not.toBeInTheDocument();
    expect(linha).toHaveTextContent("É uma justificação tua: outra pessoa do RH decide-a.");
  });

  it("se a base recusa decidir a própria (outro caminho), diz porquê e não decide", async () => {
    await pessoaJustifica();
    baseFalsa.minhaPessoaId = "p-sofia";
    envolver(<FilaLida />);
    const id = idDaSofia();
    fireEvent.click(within(screen.getByTestId(`rhjd-fila-${id}`)).getByRole("button", { name: /Recusar a justificação de Sofia/ }));
    fireEvent.change(within(screen.getByRole("alertdialog")).getByRole("textbox"), { target: { value: "Sem comprovativo" } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(screen.getByTestId("rhjd-fila-aviso")).toHaveTextContent("Não podes decidir uma justificação tua"));
    expect(baseFalsa.decisoes).toEqual([]);
    expect(screen.getByTestId(`rhjd-fila-${id}`)).toBeInTheDocument();
  });

  it("na ficha da própria pessoa, o painel do dia não mostra os botões de decidir", async () => {
    semearJustificacao({ id: "jd-propria", pessoaId: "p-sofia", data: "2026-10-08" });
    ficha("p-sofia", "Sofia Rebelo", true);
    const detalhe = abrirDia("2026-10-08");
    await waitFor(() => expect(within(detalhe).getByTestId("rhjd-estado")).toHaveTextContent("Justificação enviada"));
    for (const nome of ["Aceitar · paga", "Aceitar · não paga", "Recusar", "Aceitar"]) {
      expect(within(detalhe).queryByRole("button", { name: nome })).not.toBeInTheDocument();
    }
  });

  it("a fila não diz «nada por decidir» quando a base não responde", () => {
    baseFalsa.indisponivel = true;
    envolver(<FilaLida />);
    expect(screen.getByTestId("rhjd-fila-indisponivel")).toBeInTheDocument();
    // O título da fila continua lá; o que não pode aparecer é a contagem nem o «não há nada».
    expect(screen.queryByText(/^\d+ por decidir$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Não há justificações por decidir.")).not.toBeInTheDocument();
  });

  it("no painel do dia da ficha, o RH vê as ações e decide; aceitar não paga mostra o efeito no desconto", async () => {
    semearJustificacao({ id: "jd-ines", pessoaId: "p-ines", data: "2026-10-07", motivo: "O autocarro avariou a meio do caminho e só cheguei 15 minutos depois da hora." });
    ficha("p-ines", "Inês Cardoso", false);
    const detalhe = abrirDia("2026-10-07");
    expect(within(detalhe).getByText("O autocarro avariou a meio do caminho e só cheguei 15 minutos depois da hora.")).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: "Aceitar · paga" })).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: "Aceitar · não paga" })).toBeInTheDocument();
    expect(within(detalhe).getByTestId("rhjd-efeito")).toHaveTextContent(/Aceitar · não paga: desconta 0 h 15/);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Aceitar · não paga" }));
    await waitFor(() => expect(within(detalhe).getByText("Justificação aceite · não paga.")).toBeInTheDocument());
    expect(baseFalsa.decisoes).toEqual([{ justificacaoId: "jd-ines", decisao: "aceitar_nao_paga", motivo: null }]);
    expect(within(detalhe).queryByRole("button", { name: "Aceitar · paga" })).not.toBeInTheDocument();
    expect(within(detalhe).getByTestId("rhjd-efeito")).toHaveTextContent(/Falta justificada e não paga: desconta 0 h 15/);
  });

  it("o texto de uma consulta médica fica atrás de «Ver texto», que pede o texto à base e lista quem leu", async () => {
    semearJustificacao({ id: "jd-andre", pessoaId: "p-andre", data: "2026-10-06", tipo: "consulta_medica", motivo: "" });
    baseFalsa.textos["jd-andre"] = "Consulta de rotina no centro de saúde";
    ficha("p-andre", "André Silva", false);
    const detalhe = abrirDia("2026-10-06");
    expect(within(detalhe).queryByText(/Consulta de rotina no centro de saúde/)).not.toBeInTheDocument();
    expect(baseFalsa.textosLidos).toEqual([]);
    fireEvent.click(within(detalhe).getByRole("button", { name: "Ver texto" }));
    await waitFor(() => expect(within(detalhe).getByTestId("rhjd-texto")).toHaveTextContent("Consulta de rotina no centro de saúde"));
    expect(baseFalsa.textosLidos).toEqual(["jd-andre"]);
    expect(await within(detalhe).findByLabelText("Quem leu este texto")).toBeInTheDocument();
    expect(within(detalhe).getByLabelText("Quem leu este texto").querySelectorAll("li")).toHaveLength(1);
  });

  it("sem permissão para ver o texto, o erro aparece e o texto continua reservado", async () => {
    semearJustificacao({ id: "jd-andre", pessoaId: "p-andre", data: "2026-10-06", tipo: "consulta_medica", motivo: "" });
    ficha("p-andre", "André Silva", false);
    const detalhe = abrirDia("2026-10-06");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Ver texto" }));
    expect(await within(detalhe).findByTestId("rhjd-texto-erro")).toHaveTextContent("Não tens permissão para fazer isto.");
    expect(within(detalhe).queryByTestId("rhjd-texto")).not.toBeInTheDocument();
  });

  it("as pessoas de exemplo (Inês, André, Beatriz) já não trazem justificações escondidas: a base começa vazia", () => {
    envolver(<FilaLida />);
    expect(screen.queryAllByTestId(/^rhjd-fila-/).filter((e) => e.tagName === "LI")).toHaveLength(0);
    expect(baseFalsa.justificacoes).toEqual([]);
  });
});
