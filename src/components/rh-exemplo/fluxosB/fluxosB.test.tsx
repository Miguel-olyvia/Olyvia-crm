// Teste de arranque dos fluxos 4, 5 e 7 de RH de exemplo (frente B): cada ecra novo abre, mostra o que o documento
// de fluxos pede, e as acoes principais mudam o estado em memoria. Sem base: tudo vive nos stores em memoria.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerFluxosB, reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { marcarFaltaDoRh } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { BotaoPicar } from "@/components/rh-exemplo/assiduidade/BotaoPicar";
import { FilaAlertasFimDoDia } from "@/components/rh-exemplo/fluxosB/alertas/FilaAlertasFimDoDia";
import { JustificarFalhaDeMarcacao } from "@/components/rh-exemplo/fluxosB/alertas/JustificarFalhaDeMarcacao";
import { FaltasPainel } from "@/components/rh-exemplo/fluxosB/faltas/FaltasPainel";
import { HorarioTipoPainel } from "@/components/rh-exemplo/fluxosB/horario/HorarioTipoPainel";
import { rhExemploFluxosBTranslations } from "@/translations/rhExemploFluxosB";

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

describe("fluxo 4: horario por tipo", () => {
  const painel = () => noLingua(<HorarioTipoPainel pessoaId="p-sofia" podeEditar podeCorrigir horasContratadasSemanais={40} />);

  it("mostra o tipo em vigor, a tolerancia de 5 minutos e o historico com as duas versoes", () => {
    painel();
    expect(screen.getByTestId("rhb-horario-vigente")).toHaveTextContent("Padrão");
    expect(screen.getByText(/até 5 minutos de atraso não é atraso/)).toBeInTheDocument();
    expect(screen.getByText(/Horário inicial do contrato/)).toBeInTheDocument();
    expect(screen.getByText(/acordo-horario\.pdf/)).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("a nova versao oferece os cinco tipos, cada um com o seu editor", () => {
    painel();
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    for (const nome of ["Padrão", "Repartido", "Isenção", "Livre", "Banco de horas"]) {
      expect(screen.getByRole("radio", { name: new RegExp(nome) })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("radio", { name: /Livre/ }));
    expect(screen.getByLabelText("Horas por semana")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Banco de horas/ }));
    expect(screen.getByText("Limites do banco de horas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Repartido/ }));
    expect(screen.getByText("Segundo período")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Isenção/ }));
    expect(screen.getByText(/não há controlo de pausas/)).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("sem motivo recusa; com motivo grava a versao nova e a antiga fecha na vespera, sem se apagar", () => {
    painel();
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    fireEvent.click(screen.getByRole("radio", { name: /Isenção/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar nova versão" }));
    expect(screen.getByRole("alert")).toHaveTextContent("O motivo é obrigatório");
    expect(lerFluxosB().horarios["p-sofia"].versoes).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/Motivo \(obrigatório/), { target: { value: "Passa a isenção de horário" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nova versão" }));
    const versoes = lerFluxosB().horarios["p-sofia"].versoes;
    expect(versoes).toHaveLength(3);
    expect(versoes[1].ate).not.toBeNull();
    expect(versoes[2]).toMatchObject({ motivo: "Passa a isenção de horário", ate: null });
    expect(versoes[2].config.tipo).toBe("isencao");
    expect(screen.getByTestId("rhb-horario-vigente")).toHaveTextContent("Isenção");
  });

  it("corrigir o passado pede autorizacao e motivo, e fica marcado", () => {
    painel();
    fireEvent.click(screen.getAllByRole("button", { name: "Corrigir" })[0]);
    const formulario = screen.getByRole("region", { name: "Corrigir uma versão do passado" });
    fireEvent.click(within(formulario).getByRole("button", { name: "Corrigir" }));
    const dialogo = screen.getByRole("alertdialog");
    const confirmar = within(dialogo).getByRole("button", { name: "Corrigir" });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "Tipo errado" } });
    expect(confirmar).toBeDisabled();
    fireEvent.click(within(dialogo).getByLabelText("Tenho autorização para corrigir o passado"));
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);
    const corrigida = lerFluxosB().horarios["p-sofia"].versoes.find((v) => v.correccao);
    expect(corrigida).toMatchObject({ motivo: "Tipo errado", autorizadaPor: "Sofia Rebelo" });
    expect(screen.getByText(/Correção autorizada por Sofia Rebelo/)).toBeInTheDocument();
  });

  it("a excecao de um dia no passado recusa; no futuro grava", () => {
    painel();
    fireEvent.click(screen.getByRole("button", { name: "Exceção de um dia" }));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText(/Motivo \(obrigatório/), { target: { value: "Consulta" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar exceção" }));
    expect(screen.getByRole("alert")).toHaveTextContent("está no passado");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2099-01-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar exceção" }));
    expect(lerFluxosB().horarios["p-sofia"].excecoes).toHaveLength(1);
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

describe("fluxo 5: alertas do fim do dia e justificacao", () => {
  it("lista os cinco tipos com chips de texto", () => {
    noLingua(<FilaAlertasFimDoDia />);
    for (const chip of ["Planeado sem realizado", "Parcialmente realizado", "Realizado sem planeado", "Picagem pendente de par", "Fora do local"]) {
      expect(screen.getAllByText(chip).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Sem justificação: falta sugerida/).length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });

  it("«Aceitar diferença» tira o alerta da lista de por tratar", () => {
    noLingua(<FilaAlertasFimDoDia />);
    const linha = screen.getByTestId("rhb-alerta-alb-ines");
    fireEvent.click(within(linha).getByRole("button", { name: "Aceitar diferença" }));
    expect(screen.queryByTestId("rhb-alerta-alb-ines")).not.toBeInTheDocument();
    expect(lerFluxosB().alertas.find((a) => a.id === "alb-ines")?.estado).toBe("aceite");
  });

  it("«Corrigir» exige motivo de 3 caracteres", () => {
    noLingua(<FilaAlertasFimDoDia />);
    fireEvent.click(within(screen.getByTestId("rhb-alerta-alb-rui")).getByRole("button", { name: "Corrigir" }));
    const dialogo = screen.getByRole("alertdialog");
    const confirmar = within(dialogo).getByRole("button", { name: "Corrigir" });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "ab" } });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "Relógio do quiosque atrasado" } });
    fireEvent.click(confirmar);
    expect(lerFluxosB().alertas.find((a) => a.id === "alb-rui")).toMatchObject({ estado: "corrigido", motivo: "Relógio do quiosque atrasado" });
  });

  it("«Pedir justificação» muda o estado sem pedir motivo", () => {
    noLingua(<FilaAlertasFimDoDia />);
    fireEvent.click(within(screen.getByTestId("rhb-alerta-alb-tiago")).getByRole("button", { name: "Pedir justificação" }));
    expect(lerFluxosB().alertas.find((a) => a.id === "alb-tiago")?.estado).toBe("justificacao_pedida");
  });

  it("o RH aceita a justificacao enviada: a picagem fica lancada a mao", () => {
    noLingua(<FilaAlertasFimDoDia />);
    const antes = lerGestao().picagens.length;
    fireEvent.click(within(screen.getByTestId("rhb-alerta-alb-andre")).getByRole("button", { name: "Aceitar justificação" }));
    expect(lerFluxosB().alertas.find((a) => a.id === "alb-andre")?.estado).toBe("corrigido");
    const novas = lerGestao().picagens.slice(antes);
    expect(novas).toHaveLength(1);
    expect(novas[0]).toMatchObject({ origem: "manual_rh", pessoa_id: "p-andre", hora_local: "18:00:00" });
  });

  it("recusar a justificacao exige motivo e a diferenca volta a pendente", () => {
    noLingua(<FilaAlertasFimDoDia />);
    fireEvent.click(within(screen.getByTestId("rhb-alerta-alb-andre")).getByRole("button", { name: "Recusar justificação" }));
    const dialogo = screen.getByRole("alertdialog");
    const confirmar = within(dialogo).getByRole("button", { name: "Recusar justificação" });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "A hora não confere" } });
    fireEvent.click(confirmar);
    expect(lerFluxosB().alertas.find((a) => a.id === "alb-andre")?.estado).toBe("pendente");
    expect(lerFluxosB().justificacoesPicagem[0]).toMatchObject({ estado: "recusada", motivoRecusa: "A hora não confere" });
  });

  it("a pessoa justifica em 5 dias uteis: ve os dias que restam e envia hora real e motivo", () => {
    noLingua(<JustificarFalhaDeMarcacao pessoaId="p-sofia" />);
    expect(screen.getByText(/dias úteis para justificar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Justificar" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar justificação" }));
    expect(screen.getByRole("alert")).toHaveTextContent("O motivo é obrigatório");
    fireEvent.change(screen.getByLabelText(/Motivo \(obrigatório/), { target: { value: "Esqueci-me de picar a saída" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar justificação" }));
    const enviada = lerFluxosB().justificacoesPicagem.find((j) => j.pessoaId === "p-sofia");
    expect(enviada).toMatchObject({ estado: "pendente", motivo: "Esqueci-me de picar a saída" });
    expect(lerFluxosB().alertas.find((a) => a.id === "alb-sofia")?.estado).toBe("justificacao_recebida");
  });
});

describe("fluxo 7: faltas", () => {
  it("lista as faltas com o estado da justificacao em texto e as sugestoes do sistema", () => {
    noLingua(<FaltasPainel />);
    expect(screen.getAllByText("Pendente de documento").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Justificada, não paga").length + screen.queryAllByText("Justificada, paga").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sem justificação").length).toBeGreaterThan(0);
    expect(screen.getByText("Sugeridas pelo sistema")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Marcar esta falta" }).length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });

  it("o texto de justificacao so aparece com «Ver texto», que regista quem leu", () => {
    noLingua(<FaltasPainel />);
    const linha = screen.getByText("Tiago Pinheiro").closest("li") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Ver detalhe" }));
    expect(screen.queryByTestId("rhb-texto-falta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver texto" }));
    expect(screen.getByTestId("rhb-texto-falta")).toHaveTextContent("Consulta de urgência");
    expect(lerFluxosB().acessosTexto).toHaveLength(1);
    expect(lerFluxosB().acessosTexto[0].quem).toBe("Sofia Rebelo");
    expect(screen.getByText(/Sofia Rebelo leu em/)).toBeInTheDocument();
  });

  it("justificada e paga nao desconta; o detalhe mostra a conta", () => {
    noLingua(<FaltasPainel />);
    const linha = screen.getByText("Tiago Pinheiro").closest("li") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Ver detalhe" }));
    expect(screen.getByTestId("rhb-desconto")).toHaveTextContent("Pendente de documento: desconta por agora");
    fireEvent.click(screen.getByRole("button", { name: "Justificada, paga" }));
    expect(lerGestao().faltas.find((f) => f.id === "fa-tiago")).toMatchObject({ justificacao_estado: "justificada", remunerada: true });
    expect(screen.getByTestId("rhb-desconto")).toHaveTextContent("Justificada e paga: não desconta");
  });

  it("recusar a justificacao exige motivo; sem justificacao a falta desconta (4 h x valor da hora)", () => {
    noLingua(<FaltasPainel />);
    const lista = within(screen.getByRole("region", { name: "Faltas marcadas" }));
    const linha = lista.getByText("Carolina Matos").closest("li") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Ver detalhe" }));
    expect(screen.getByTestId("rhb-desconto")).toHaveTextContent(/4 h × .* = .* a descontar/);
    fireEvent.change(screen.getByLabelText(/Texto da justificação/), { target: { value: "Assistência à família" } });
    fireEvent.click(screen.getByRole("button", { name: "Registar justificação" }));
    expect(lerGestao().faltas.find((f) => f.id === "fa-carolina")?.justificacao_estado).toBe("sem_justificacao");
  });

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
    noLingua(<FaltasPainel />);
    fireEvent.change(screen.getByLabelText(/Prazo para justificar/), { target: { value: "8" } });
    expect(lerFluxosB().prazoFaltaDias).toBe(8);
  });
});
