// Teste de arranque dos fluxos 4, 5 e 7 de RH de exemplo (frente B): cada ecra novo abre, mostra o que o documento
// de fluxos pede, e as acoes principais mudam o estado em memoria. Sem base: tudo vive nos stores em memoria.
import { beforeEach, describe, expect, it, vi } from "vitest";
// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerFluxosB, reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { marcarFaltaDoRh } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { BotaoPicar } from "@/components/rh-exemplo/assiduidade/BotaoPicar";
import { JustificarFalhaDeMarcacao } from "@/components/rh-exemplo/fluxosB/alertas/JustificarFalhaDeMarcacao";
import {
  alertasDeDesvios,
  resumoDosAlertas,
  type JustificacoesDaPessoa,
} from "@/components/rh-exemplo/fluxosB/alertas/useJustificacoesDaPessoa";
import { FaltasPainel } from "@/components/rh-exemplo/fluxosB/faltas/FaltasPainel";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import type { Desvio } from "@/components/rh-exemplo/tiposAssiduidade";
import { rhExemploFluxosBTranslations } from "@/translations/rhExemploFluxosB";

/** Um turno planeado de hoje sem horas: o desvio que a base propoe e que a pessoa ainda pode justificar. */
const DESVIO_DA_SOFIA: Desvio = {
  organization_id: "org", pessoa_id: "p-sofia", data: hojeIso(), tipo: "planeado_sem_realizado", hora_inicio: "09:00:00",
  hora_fim: "13:00:00", minutos: 240, planeado_id: "plan-1", local_id: null, referencia_id: null, detalhe: null,
};

const noLingua = (elemento: JSX.Element) => render(<LanguageProvider>{elemento}</LanguageProvider>);

function semChavesPorTraduzir(): void {
  const texto = document.body.textContent ?? "";
  expect(texto.match(/\brhExemplo\.[A-Za-z]+\.[A-Za-z0-9_.]+/g) ?? []).toEqual([]);
}

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
});

describe("traducoes da frente B", () => {
  it("en e pt tem exatamente as mesmas chaves", () => {
    const { en, pt } = rhExemploFluxosBTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("fluxo 5: picagem com localizacao simulada", () => {
  const picar = vi.fn(async () => null);
  const botao = () =>
    noLingua(
      <BotaoPicar picagensDeHoje={[]} planeadoDeHoje={[]} locais={[]} podePicar aGravar={false} onPicar={picar} idPrefixo="t" />,
    );

  beforeEach(() => picar.mockClear());

  it("sem dizer onde esta, picar recusa e nao grava", async () => {
    botao();
    fireEvent.click(screen.getByRole("button", { name: /Entrar|Registar entrada|Picar/i }));
    expect(await screen.findByText("Escolha onde está para poder picar.")).toBeInTheDocument();
    expect(picar).not.toHaveBeenCalled();
  });

  it("«Estou fora do local» mostra a distancia de exemplo e marca fora do local, gravando na mesma", async () => {
    botao();
    fireEvent.click(screen.getByRole("radio", { name: "Estou fora do local" }));
    expect(screen.getByText(/640 m, acima de 200 m/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Entrar|Registar entrada|Picar/i }));
    expect(await screen.findByText(/marcado «fora do local» \(640 m\)|marcado «fora do local» \(6\d\d m\)/)).toBeInTheDocument();
    expect(picar).toHaveBeenCalledTimes(1);
    const args = picar.mock.calls[0] as unknown as [{ latitude: number | null }];
    expect(args[0].latitude).not.toBeNull();
  });

  it("«Estou no local» grava sem marcar fora do local", async () => {
    botao();
    fireEvent.click(screen.getByRole("radio", { name: "Estou no local" }));
    fireEvent.click(screen.getByRole("button", { name: /Entrar|Registar entrada|Picar/i }));
    await screen.findByRole("button", { name: /Entrar|Registar entrada|Picar/i });
    expect(picar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Registado e marcado/)).not.toBeInTheDocument();
  });
});

describe("fluxo 5: justificacao de falha de marcacao", () => {
  // A fila de alertas do fim do dia (Corrigir, Marcar falta, Anular) ja nao e de exemplo: le os desvios reais da base e
  // esta provada em alertas/filaDesviosReais.test.tsx. A lista «por justificar» da pessoa sai dos MESMOS desvios
  // (hr_assiduidade_desvios, so os turnos sem horas e as picagens por emparelhar). Enviar uma justificacao de picagem
  // nao tem onde gravar na base: a lista so se le.
  const justificacoesDeTeste = (parcial: Partial<JustificacoesDaPessoa> = {}): JustificacoesDaPessoa => ({
    ...resumoDosAlertas(alertasDeDesvios([DESVIO_DA_SOFIA], "p-sofia"), hojeIso()),
    pendentes: [], aceites: [], recusadas: [], loading: false, erro: false, recusado: false, ...parcial,
  });

  it("so entram os desvios da pessoa que sao falhas de marcacao, e a chave de cada um e unica", () => {
    const alertas = alertasDeDesvios(
      [
        DESVIO_DA_SOFIA,
        { ...DESVIO_DA_SOFIA, tipo: "realizado_sem_planeado" },
        { ...DESVIO_DA_SOFIA, tipo: "falta_coberta_por_ausencia" },
        { ...DESVIO_DA_SOFIA, pessoa_id: "p-rui" },
        { ...DESVIO_DA_SOFIA, tipo: "pendente_par", referencia_id: "pic-1" },
      ],
      "p-sofia",
    );
    expect(alertas.map((a) => a.tipo)).toEqual(["planeado_sem_realizado", "pendente_par"]);
    expect(new Set(alertas.map((a) => a.id)).size).toBe(2);
  });

  it("mostra as marcacoes por justificar da base com os dias que restam, sem oferecer o botao Justificar", () => {
    noLingua(<JustificarFalhaDeMarcacao pessoaId="p-sofia" justificacoes={justificacoesDeTeste()} />);
    expect(screen.getByText(/Dias úteis que restam à justificação mais urgente/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Justificar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Não há marcações por justificar nem justificações enviadas.")).not.toBeInTheDocument();
  });

  it("uma leitura falhada ou recusada diz-se, em vez de passar por «nao ha nada»", () => {
    const vazio = { porJustificar: [], menorPrazoDias: null, porFazer: 0 };
    const { unmount } = noLingua(<JustificarFalhaDeMarcacao pessoaId="p-sofia" justificacoes={justificacoesDeTeste({ ...vazio, erro: true })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler as marcações por justificar");
    expect(screen.queryByText("Não há marcações por justificar nem justificações enviadas.")).not.toBeInTheDocument();
    unmount();
    noLingua(<JustificarFalhaDeMarcacao pessoaId="p-sofia" justificacoes={justificacoesDeTeste({ ...vazio, recusado: true })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não tem permissão");
  });

  it("sem desvios e com a leitura feita, diz que nao ha nada por justificar", () => {
    noLingua(<JustificarFalhaDeMarcacao pessoaId="p-sofia" justificacoes={justificacoesDeTeste({ porJustificar: [], menorPrazoDias: null, porFazer: 0 })} />);
    expect(screen.getByText("Não há marcações por justificar nem justificações enviadas.")).toBeInTheDocument();
  });
});

/** A linha da lista de faltas de uma pessoa numa data (DD/MM/AAAA): a mesma pessoa tem varias faltas. */
const linhaDaFalta = (nome: string, data: string): HTMLElement => {
  const li = screen.getAllByText(nome).map((n) => n.closest("li") as HTMLElement).find((l) => l?.textContent?.includes(data));
  if (!li) throw new Error(`Sem falta de ${nome} em ${data}`);
  return li;
};

// O painel recebe a lista de faltas de fora (na aplicacao, a vista em vigor da base). Aqui alimenta-se com as faltas
// de exemplo; marcar, anular, registar e decidir sao RPCs reais e estao em faltas/faltasReais.test.tsx.
const PERMISSOES_FALTAS = {
  view: true, viewOwn: true, equipaView: true, picar: false, picarOutros: false, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};
// As sugestoes saem dos desvios reais (aqui um turno planeado sem horas); a lista de faltas, da vista em vigor.
const DESVIOS_DA_BASE = [
  {
    organization_id: "org", pessoa_id: "p-sofia", data: "2099-01-05", tipo: "planeado_sem_realizado" as const, hora_inicio: "09:00:00",
    hora_fim: "13:00:00", minutos: 240, planeado_id: "plan-1", local_id: null, referencia_id: null, detalhe: null,
  },
];
const painelDeFaltas = () => (
  <FaltasPainel
    faltas={lerGestao().faltas}
    desvios={DESVIOS_DA_BASE}
    pessoas={Object.values(lerEstado().fichas).map((f) => ({ id: f.pessoa.id, nome: f.pessoa.nome_completo }))}
    permissoes={PERMISSOES_FALTAS}
    onAlterado={() => undefined}
  />
);

describe("fluxo 7: faltas", () => {
  it("lista as faltas com o estado da justificacao em texto e as sugestoes do sistema", () => {
    noLingua(painelDeFaltas());
    expect(screen.getAllByText("Pendente de documento").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Justificada, não paga").length + screen.queryAllByText("Justificada, paga").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sem justificação").length).toBeGreaterThan(0);
    expect(screen.getByText("Sugeridas pelo sistema")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Marcar esta falta" }).length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });

  // Os quatro testes do detalhe que aqui estavam (ver texto, decidir, registar a justificacao e a conta do desconto)
  // provavam o store em memoria, que o detalhe ja nao usa. O equivalente, contra as RPCs reais, esta em
  // faltas/faltasReais.test.tsx.

  it("marcar falta que cruza tempo trabalhado, ou outra falta, recusa e diz o periodo", () => {
    const trabalhado = lerEstado().fichas["p-rui"].horarioRealizado[0];
    const cruzaTrabalho = marcarFaltaDoRh("p-rui", { data: trabalhado.data, inicio: "08:00", fim: "23:00" }, "doenca", "doenca");
    expect(cruzaTrabalho.erro).toBe("rhExemplo.fal.erro.tempo_trabalhado");
    expect(cruzaTrabalho.detalhe).toBe(`${trabalhado.hora_inicio.slice(0, 5)}-${trabalhado.hora_fim.slice(0, 5)}`);

    expect(marcarFaltaDoRh("p-rui", { data: "2000-01-03", inicio: "09:00", fim: "10:00" }, "doenca", "doenca").erro).toBeNull();
    const cruzaFalta = marcarFaltaDoRh("p-rui", { data: "2000-01-03", inicio: "09:30", fim: "11:00" }, "doenca", "doenca");
    expect(cruzaFalta).toMatchObject({ erro: "rhExemplo.fal.erro.outra_falta", detalhe: "09:00-10:00" });
  });

  it("o prazo da organizacao e configuravel", () => {
    noLingua(painelDeFaltas());
    fireEvent.change(screen.getByLabelText(/Prazo para justificar/), { target: { value: "8" } });
    expect(lerFluxosB().prazoFaltaDias).toBe(8);
  });
});
