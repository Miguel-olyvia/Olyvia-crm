// Os painéis da ficha com uma ação ASSÍNCRONA (a ficha real): ficam a guardar (aria-busy), mostram o erro traduzido em role="alert",
// fecham só em sucesso. Os testes síncronos de cada painel (a ficha de exemplo) estão nos ficheiros próprios e não mudam.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DialogoResultadoVisita } from "./DialogoResultadoVisita";
import { FormChamada } from "./FormChamada";
import { pessoaBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { PainelAdiar } from "./PainelAdiar";
import { PainelEncerrar } from "./PainelEncerrar";
import { PainelNota } from "./PaineisChamadaNota";
import type { AcoesFicha } from "./PainelBase";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => sucesso.mockReset());

const NG011 = "Perca ou ganhe os negócios abertos antes de encerrar.";
const GENERICA = "Não foi possível concluir a ação. Tente novamente.";
const erroNeg = (chave: string) => Object.assign(new Error("x"), { chave });

/** Uma ação que fica pendente até o teste a resolver ou rejeitar. */
function pendente() {
  let resolver: () => void = () => undefined;
  let rejeitar: (e: unknown) => void = () => undefined;
  const promessa = new Promise<void>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}
const terminar = (p: ReturnType<typeof pendente>) => act(async () => { p.resolver(); await p.promessa; });
const falhar = (p: ReturnType<typeof pendente>, e: unknown) => act(async () => { p.rejeitar(e); await p.promessa.catch(() => undefined); });

const ANA = pessoaBase("a", { nome: "Ana" });
const propsPainel = (acoes: Partial<AcoesFicha>) => ({
  id: "p", ativo: true, pessoa: ANA, resumo: resumoBase(ANA), hoje: "2026-10-13", acoes: acoes as AcoesFicha,
  aoFechar: vi.fn(), aoConcluir: vi.fn(), aoMudarConteudo: vi.fn(),
});

describe("PainelEncerrar com ação assíncrona", () => {
  function montar(acao: ReturnType<typeof pendente>) {
    const props = propsPainel({ encerrar: vi.fn(() => acao.promessa) });
    render(<PainelEncerrar titulo="Encerrar a abordagem" {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Sem interesse" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo" }), { target: { value: "preco" } });
    fireEvent.click(screen.getByRole("button", { name: "Encerrar abordagem" }));
    return props;
  }

  it("enquanto espera fica a guardar (aria-busy), não conclui e ignora um segundo clique", async () => {
    const p = pendente();
    const props = montar(p);
    const botao = screen.getByRole("button", { name: "A guardar…" });
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    expect(props.acoes.encerrar).toHaveBeenCalledTimes(1);
    expect(props.aoConcluir).not.toHaveBeenCalled();
    await terminar(p);
    expect(props.aoConcluir).toHaveBeenCalledExactlyOnceWith("Abordagem de Ana encerrada");
    expect(screen.getByRole("button", { name: "Encerrar abordagem" })).not.toHaveAttribute("aria-busy");
  });

  it("uma falha mostra o erro traduzido pelo código, em role=alert, e não fecha o painel", async () => {
    const p = pendente();
    const props = montar(p);
    await falhar(p, erroNeg("pessoasPagina.erroNeg.ng011"));
    expect(screen.getByRole("alert")).toHaveTextContent(NG011);
    expect(props.aoConcluir).not.toHaveBeenCalled();
    expect(props.aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Encerrar abordagem" })).not.toHaveAttribute("aria-busy");
  });

  it("um erro sem chave mostra a mensagem genérica, nunca o texto cru", async () => {
    const p = pendente();
    montar(p);
    await falhar(p, new Error("duplicate key value violates unique constraint"));
    expect(screen.getByRole("alert")).toHaveTextContent(GENERICA);
    expect(screen.queryByText(/duplicate key/)).toBeNull();
  });
});

describe("PainelNota com ação assíncrona", () => {
  function montar(acao: ReturnType<typeof pendente>) {
    const props = propsPainel({ juntarNota: vi.fn(() => acao.promessa) });
    render(<PainelNota titulo="Nota" {...props} />);
    fireEvent.change(screen.getByLabelText("Escreva a nota"), { target: { value: "Prefere de manhã" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    return props;
  }

  it("guarda com aria-busy e só conclui quando a ação termina", async () => {
    const p = pendente();
    const props = montar(p);
    expect(props.acoes.juntarNota).toHaveBeenCalledExactlyOnceWith("a", "Prefere de manhã");
    expect(screen.getByRole("button", { name: "A guardar…" })).toHaveAttribute("aria-busy", "true");
    expect(props.aoConcluir).not.toHaveBeenCalled();
    await terminar(p);
    expect(props.aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("uma falha mostra o erro e mantém o texto escrito", async () => {
    const p = pendente();
    const props = montar(p);
    await falhar(p, erroNeg("pessoasPagina.erroNeg.ng009"));
    expect(screen.getByRole("alert")).toHaveTextContent("Um dos valores não é válido.");
    expect(screen.getByLabelText("Escreva a nota")).toHaveValue("Prefere de manhã");
    expect(props.aoConcluir).not.toHaveBeenCalled();
  });
});

describe("PainelAdiar com ação assíncrona", () => {
  function montar(acao: ReturnType<typeof pendente>) {
    const props = propsPainel({ adiar: vi.fn(() => acao.promessa) });
    render(<PainelAdiar titulo="Adiar" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^Amanhã/ }));
    return props;
  }

  it("chama adiar(id, 1), fica a guardar e só conclui no fim", async () => {
    const p = pendente();
    const props = montar(p);
    expect(props.acoes.adiar).toHaveBeenCalledExactlyOnceWith("a", 1);
    expect(screen.getByRole("button", { name: /^Amanhã/ })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Em 3 dias|^3 dias|^Daqui/ }));
    expect(props.acoes.adiar).toHaveBeenCalledTimes(1);
    await terminar(p);
    expect(props.aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("uma falha mostra o erro e não conclui", async () => {
    const p = pendente();
    const props = montar(p);
    await falhar(p, erroNeg("pessoasPagina.erroNeg.permissao"));
    expect(screen.getByRole("alert")).toHaveTextContent("Não tem permissão para esta ação.");
    expect(props.aoConcluir).not.toHaveBeenCalled();
  });
});

describe("FormChamada com ação assíncrona", () => {
  function montar(acao: ReturnType<typeof pendente>, extra: Partial<Parameters<typeof FormChamada>[0]> = {}) {
    const props = { ...propsPainel({ registarChamada: vi.fn(() => acao.promessa) }) };
    render(<FormChamada id="c" pessoa={ANA} resumo={props.resumo} hoje={props.hoje} acoes={props.acoes} aoFechar={props.aoFechar} aoConcluir={props.aoConcluir} {...extra} />);
    fireEvent.click(screen.getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    return props;
  }

  it("o toast de sucesso e a conclusão só chegam depois de a ação terminar", async () => {
    const p = pendente();
    const props = montar(p);
    expect(screen.getByRole("button", { name: "A guardar…" })).toHaveAttribute("aria-busy", "true");
    expect(sucesso).not.toHaveBeenCalled();
    expect(props.aoConcluir).not.toHaveBeenCalled();
    await terminar(p);
    expect(sucesso).toHaveBeenCalledTimes(1);
    expect(props.aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("uma falha mostra o erro, sem toast de sucesso e sem fechar", async () => {
    const p = pendente();
    const props = montar(p);
    await falhar(p, erroNeg("pessoasPagina.erroNeg.ng011"));
    expect(screen.getByRole("alert")).toHaveTextContent(NG011);
    expect(sucesso).not.toHaveBeenCalled();
    expect(props.aoConcluir).not.toHaveBeenCalled();
  });

  it("o aviso de falha parcial (contacto gravado, encerramento não) vem do código da ação", async () => {
    const p = pendente();
    montar(p);
    await falhar(p, erroNeg("pessoasPagina.real.ficha.partialCall"));
    expect(screen.getByRole("alert")).toHaveTextContent(/contacto|chamada/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/encerr/i);
  });

  it("com visita escondida (semVisita) o passo «Marcar visita» não existe, nem para quem se interessou", () => {
    const props = propsPainel({ registarChamada: vi.fn() });
    const { unmount } = render(<FormChamada id="c" pessoa={ANA} resumo={props.resumo} hoje={props.hoje} acoes={props.acoes} aoFechar={props.aoFechar} aoConcluir={props.aoConcluir} />);
    fireEvent.click(screen.getByRole("radio", { name: /Atendeu · interessado/ }));
    expect(screen.getByRole("radio", { name: /Marcar visita/ })).toBeInTheDocument();
    unmount();
    const semVisita = { ...props.acoes, capacidades: { chamada: true, encerrar: true, adiar: false, nota: false, visita: false } } as AcoesFicha;
    render(<FormChamada id="c" pessoa={ANA} resumo={props.resumo} hoje={props.hoje} acoes={semVisita} aoFechar={props.aoFechar} aoConcluir={props.aoConcluir} />);
    fireEvent.click(screen.getByRole("radio", { name: /Atendeu · interessado/ }));
    expect(screen.queryByRole("radio", { name: /Marcar visita/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Ligar amanhã/ })).toBeChecked();
  });
});

describe("DialogoResultadoVisita com ação assíncrona", () => {
  const VISITA = visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10", hora: "10:00" });
  function montar(acao: ReturnType<typeof pendente>) {
    const props = { aoGuardar: vi.fn(() => acao.promessa), aoFechar: vi.fn(), aoAnunciar: vi.fn() };
    render(<DialogoResultadoVisita pessoa={ANA} visita={VISITA} comNegocioAberto={false} {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Interessado" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar o resultado" }));
    return props;
  }

  it("só fecha quando a ação termina; entretanto o botão está a guardar", async () => {
    const p = pendente();
    const props = montar(p);
    expect(screen.getByRole("button", { name: "A guardar…" })).toHaveAttribute("aria-busy", "true");
    expect(props.aoFechar).not.toHaveBeenCalled();
    await terminar(p);
    await waitFor(() => expect(props.aoFechar).toHaveBeenCalledTimes(1));
    expect(props.aoGuardar).toHaveBeenCalledExactlyOnceWith("rv-1", { resultado: "interessado" });
  });

  it("uma falha mostra o erro em role=alert dentro do diálogo e não fecha", async () => {
    const p = pendente();
    const props = montar(p);
    await falhar(p, erroNeg("pessoasPagina.erroNeg.ng002"));
    expect(screen.getByRole("alert")).toHaveTextContent("O estado atual não permite esta ação.");
    expect(props.aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
