// A aba «Registos» do painel «Novo negócio», com o store dos registos: os registos por ligar são os da pessoa escolhida, vêm marcados, mudam
// com a pessoa, e o que se escolhe (as caixas e o levantamento) vai nos dados ao criar. Nada se copia: só ids.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { MORADA_VAZIA } from "./moradaObra";
import type { PessoaOpcao } from "./novoNegocio";
import { registarContacto, registarLevantamento, registarVisita, repor as reporRegistos } from "./registosPessoa";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); reporRegistos(); });

const PESSOAS: PessoaOpcao[] = [{ id: "p-marta", nome: "Marta Silveira" }, { id: "p-rui", nome: "Rui Figueiredo" }];
const rascunho = { linhas: [], observacoes: "", respostas: {} };
const visita = (pessoaId: string, data: string) => ({
  pessoaId, data, hora: "", feitoPor: "Ana", estado: "feita" as const, tipo: "levantamento" as const, quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: true, nota: "",
});

/** A Marta tem uma chamada, uma visita e um levantamento por ligar; o Rui não tem nada. */
function semear() {
  registarContacto({ pessoaId: "p-marta", data: "2026-10-09", resultado: "atendeuInteressado", nota: "" });
  const v = registarVisita(visita("p-marta", "2026-10-10"));
  registarLevantamento({ pessoaId: "p-marta", visitaId: v.id, data: "2026-10-11", feitoPor: "Ana", rascunho });
}

const abrir = (pessoaInicialId?: string) => {
  const aoCriar = vi.fn();
  render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} pessoaInicialId={pessoaInicialId} />);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  return { aoCriar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
};
const irParaRegistos = (d: HTMLElement) => fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Registos/ }));
const escolherPessoa = async (d: HTMLElement, nome: string) => {
  fireEvent.keyDown(within(d).getByRole("combobox", { name: /^Pessoa/ }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: nome }));
};
const criar = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: "Criar negócio" }));

describe("NovoNegocioDialogo: a morada da obra vem da visita marcada", () => {
  const comMorada = (pessoaId: string, rua: string, igualALead: boolean) =>
    registarVisita({ ...visita(pessoaId, "2026-10-10"), igualALead, morada: { rua, codigoPostal: "1000-001", localidade: "Lisboa", andar: "" } });
  const irParaQualificacao = (d: HTMLElement) => fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Qualificação/ }));

  it("com a visita marcada, a morada da obra abre preenchida a partir dela, e diz de onde veio", () => {
    comMorada("p-marta", "Rua da Visita 7", true);
    const { dialogo } = abrir("p-marta");
    irParaQualificacao(dialogo);
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Rua da Visita 7");
    expect(within(dialogo).getByText(/Preenchida a partir da visita · igual à morada da lead/)).toBeInTheDocument();
  });

  it("desmarcar a visita deixa a morada vazia (enquanto ninguém a escreveu); voltar a marcá-la traz-a de volta", () => {
    comMorada("p-marta", "Rua da Visita 7", false);
    const { dialogo } = abrir("p-marta");
    irParaRegistos(dialogo);
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Visita de 10\/10\/2026/ }));
    irParaQualificacao(dialogo);
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("");
    irParaRegistos(dialogo);
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Visita de 10\/10\/2026/ }));
    irParaQualificacao(dialogo);
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Rua da Visita 7");
    expect(within(dialogo).getByText(/Preenchida a partir da visita · outra morada/)).toBeInTheDocument();
  });

  it("uma morada escrita à mão manda: marcar ou desmarcar visitas já não a muda, e deixa de dizer que veio da visita", () => {
    comMorada("p-marta", "Rua da Visita 7", true);
    const { dialogo } = abrir("p-marta");
    irParaQualificacao(dialogo);
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua Escrita 1" } });
    expect(within(dialogo).queryByText(/Preenchida a partir da visita/)).not.toBeInTheDocument();
    irParaRegistos(dialogo);
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Visita de 10\/10\/2026/ }));
    irParaQualificacao(dialogo);
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Rua Escrita 1");
  });

  it("ao criar, a morada da obra vai nos dados (a da visita, se ninguém a mudou)", () => {
    comMorada("p-marta", "Rua da Visita 7", true);
    const { aoCriar, dialogo } = abrir("p-marta");
    criar(dialogo);
    expect(aoCriar.mock.calls[0][0].moradaObra).toMatchObject({ rua: "Rua da Visita 7", localidade: "Lisboa" });
  });
});

describe("NovoNegocioDialogo: Ligar registos", () => {
  it("sem pessoa escolhida a aba diz para a escolher primeiro", () => {
    semear();
    const { dialogo } = abrir();
    irParaRegistos(dialogo);
    expect(within(dialogo).getByText(/Escolhe primeiro a pessoa/)).toBeInTheDocument();
    expect(within(dialogo).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("com a pessoa escolhida mostra os registos dela, marcados, e conta-os na aba", async () => {
    semear();
    const { dialogo } = abrir();
    await escolherPessoa(dialogo, "Marta Silveira");
    expect(within(dialogo).getByRole("tab", { name: /^Registos.*2 a ligar/ })).toBeInTheDocument();
    irParaRegistos(dialogo);
    expect(within(dialogo).getByRole("checkbox", { name: /Chamada de 09\/10\/2026/ })).toBeChecked();
    expect(within(dialogo).getByRole("checkbox", { name: /Visita de 10\/10\/2026/ })).toBeChecked();
    expect(within(dialogo).getByRole("radio", { name: /Usar um que já existe/ })).toBeChecked();
  });

  it("a pessoa que vem da ficha já abre com os registos dela", () => {
    semear();
    const { dialogo } = abrir("p-marta");
    irParaRegistos(dialogo);
    expect(within(dialogo).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("mudar de pessoa traz os registos da nova (a escolha da anterior não vale)", async () => {
    semear();
    const { dialogo } = abrir();
    await escolherPessoa(dialogo, "Marta Silveira");
    irParaRegistos(dialogo);
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Chamada de 09\/10\/2026/ }));
    fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Geral/ }));
    await escolherPessoa(dialogo, "Rui Figueiredo");
    irParaRegistos(dialogo);
    expect(within(dialogo).getByText("Esta pessoa não tem registos por ligar.")).toBeInTheDocument();
    expect(within(dialogo).getByRole("radio", { name: /Fazer um novo/ })).toBeChecked();
    fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Geral/ }));
    await escolherPessoa(dialogo, "Marta Silveira");
    irParaRegistos(dialogo);
    expect(within(dialogo).getByRole("checkbox", { name: /Chamada de 09\/10\/2026/ })).toBeChecked();
  });

  it("criar leva só os ids marcados e o levantamento escolhido: nada se copia", async () => {
    semear();
    const { aoCriar, dialogo } = abrir();
    await escolherPessoa(dialogo, "Marta Silveira");
    irParaRegistos(dialogo);
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: /Chamada de 09\/10\/2026/ }));
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledTimes(1);
    const dados = aoCriar.mock.calls[0][0];
    expect(dados.ligar).toEqual({ registos: [{ tipo: "visita", id: "rv-1" }], levantamento: { tipo: "existente", id: "rl-1" } });
    for (const campo of ["levantamento", "visitas", "visita"]) expect(dados, campo).not.toHaveProperty(campo);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("dispensar o levantamento, ou fazer um novo, vai nos dados", async () => {
    semear();
    const { aoCriar, dialogo } = abrir("p-marta");
    irParaRegistos(dialogo);
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Dispensar/ }));
    criar(dialogo);
    expect(aoCriar.mock.calls[0][0].ligar.levantamento).toEqual({ tipo: "dispensar" });
  });

  it("sem registos por ligar o negócio cria-se na mesma (só a pessoa é obrigatória), com o levantamento por fazer", async () => {
    const { aoCriar, dialogo } = abrir("p-rui");
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledTimes(1);
    expect(aoCriar.mock.calls[0][0].ligar).toEqual({ registos: [], levantamento: { tipo: "novo" } });
  });

  it("um registo já ligado a outro negócio não aparece para ligar", async () => {
    semear();
    const { ligarRegisto } = await import("./registosPessoa");
    ligarRegisto({ tipo: "contacto", id: "rc-1" }, "n-outro");
    const { dialogo } = abrir("p-marta");
    irParaRegistos(dialogo);
    expect(within(dialogo).queryByRole("checkbox", { name: /Chamada/ })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("checkbox", { name: /Visita de 10\/10\/2026/ })).toBeInTheDocument();
  });
});
