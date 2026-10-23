// A aba «Registos» do painel «Novo negócio»: a secção «Ligar registos» (caixas de seleção dos contactos e visitas por ligar da pessoa) e a
// escolha do levantamento (usar um que já existe, fazer um novo, ou dispensar). Nada se copia.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MORADA_VAZIA } from "./moradaObra";
import { AbaLigarRegistos } from "./AbaLigarRegistos";
import type { LigarRegistos } from "./ligarNegocio";
import type { RegistosDaPessoa } from "./registosTipos";

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

const contacto = (id: string, data: string) => ({ id, pessoaId: "p1", data, resultado: "atendeuInteressado" as const, nota: "", negocioId: null });
const visita = (id: string, data: string, estado: "porFazer" | "feita" = "feita", hora = "10:00") => ({
  id, pessoaId: "p1", negocioId: null, data, hora, feitoPor: "Ana", estado, tipo: "levantamento" as const, quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: true, nota: "",
});
const levantamento = (id: string, data: string) => ({
  id, pessoaId: "p1", visitaId: null, data, feitoPor: "Bruno", rascunho: { linhas: [], observacoes: "", respostas: {} }, negocioId: null,
});
const REGISTOS: RegistosDaPessoa = {
  contactos: [contacto("rc-1", "2026-10-09")],
  visitas: [visita("rv-1", "2026-10-10"), visita("rv-2", "2026-10-20", "porFazer", "")],
  levantamentos: [levantamento("rl-1", "2026-10-11"), levantamento("rl-2", "2026-10-12")],
};
const TODOS: LigarRegistos = {
  registos: [{ tipo: "contacto", id: "rc-1" }, { tipo: "visita", id: "rv-1" }, { tipo: "visita", id: "rv-2" }],
  levantamento: { tipo: "existente", id: "rl-2" },
};

function Controlado({ inicial = TODOS, registos = REGISTOS, pessoaEscolhida = true, aoMudar }: { inicial?: LigarRegistos; registos?: RegistosDaPessoa; pessoaEscolhida?: boolean; aoMudar?: (v: LigarRegistos) => void }) {
  const [valor, setValor] = useState(inicial);
  return <AbaLigarRegistos id="x" pessoaEscolhida={pessoaEscolhida} porLigar={registos} valor={valor} aoMudar={(v) => { setValor(v); aoMudar?.(v); }} />;
}

describe("AbaLigarRegistos", () => {
  it("sem pessoa escolhida diz para a escolher primeiro e não mostra registos", () => {
    render(<Controlado pessoaEscolhida={false} />);
    expect(screen.getByText(/Escolhe primeiro a pessoa/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("«Ligar registos» explica que nada se copia e lista as chamadas e as visitas da pessoa, uma caixa por registo", () => {
    render(<Controlado />);
    expect(screen.getByRole("heading", { name: "Ligar registos" })).toBeInTheDocument();
    expect(screen.getByText(/Nada se copia/)).toBeInTheDocument();
    const caixas = screen.getAllByRole("checkbox");
    expect(caixas).toHaveLength(3);
    expect(screen.getByRole("checkbox", { name: /Chamada de 09\/10\/2026/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Visita de 10\/10\/2026/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Visita de 20\/10\/2026/ })).toBeChecked();
    expect(new Set(caixas.map((c) => c.getAttribute("id"))).size).toBe(3);
  });

  it("desmarcar um registo tira-o da ligação; marcá-lo volta a pô-lo, sem repetir", () => {
    const aoMudar = vi.fn();
    render(<Controlado aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Visita de 10\/10\/2026/ }));
    expect(aoMudar).toHaveBeenLastCalledWith({ ...TODOS, registos: [{ tipo: "contacto", id: "rc-1" }, { tipo: "visita", id: "rv-2" }] });
    expect(screen.getByRole("checkbox", { name: /Visita de 10\/10\/2026/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Visita de 10\/10\/2026/ }));
    const ultimo = aoMudar.mock.calls[aoMudar.mock.calls.length - 1][0] as LigarRegistos;
    expect(ultimo.registos).toHaveLength(3);
  });

  it("o estado de cada visita diz-se em texto", () => {
    render(<Controlado />);
    expect(screen.getByRole("checkbox", { name: /Visita de 10\/10\/2026.*Feita/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Visita de 20\/10\/2026.*Por fazer/ })).toBeInTheDocument();
  });

  it("sem registos por ligar di-lo, e o levantamento continua a poder ser feito ou dispensado", () => {
    render(<Controlado registos={{ contactos: [], visitas: [], levantamentos: [] }} inicial={{ registos: [], levantamento: { tipo: "novo" } }} />);
    expect(screen.getByText("Esta pessoa não tem registos por ligar.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Fazer um novo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Dispensar/ })).toBeInTheDocument();
  });
});

describe("AbaLigarRegistos: o levantamento", () => {
  it("é opcional e tem três escolhas: usar um existente, fazer um novo, dispensar", () => {
    render(<Controlado />);
    const grupo = screen.getByRole("radiogroup", { name: "O que fazer ao levantamento" });
    expect(within(grupo).getByRole("radio", { name: /Usar um que já existe/ })).toBeChecked();
    expect(within(grupo).getByRole("radio", { name: /Fazer um novo/ })).not.toBeChecked();
    expect(within(grupo).getByRole("radio", { name: /Dispensar/ })).not.toBeChecked();
    expect(screen.getByText("O levantamento é opcional.")).toBeInTheDocument();
  });

  it("com o existente escolhido, escolhe-se qual dos levantamentos por ligar", () => {
    const aoMudar = vi.fn();
    render(<Controlado aoMudar={aoMudar} />);
    const lista = screen.getByRole("radiogroup", { name: "Levantamentos por ligar" });
    expect(within(lista).getAllByRole("radio")).toHaveLength(2);
    expect(within(lista).getByRole("radio", { name: /12\/10\/2026/ })).toBeChecked();
    fireEvent.click(within(lista).getByRole("radio", { name: /11\/10\/2026/ }));
    expect(aoMudar).toHaveBeenLastCalledWith({ ...TODOS, levantamento: { tipo: "existente", id: "rl-1" } });
  });

  it("fazer um novo diz que o negócio fica em Levantamento; dispensar diz que segue para Orçamento", () => {
    render(<Controlado />);
    fireEvent.click(screen.getByRole("radio", { name: /Fazer um novo/ }));
    expect(screen.getByText(/fica em Levantamento/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Levantamentos por ligar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Dispensar/ }));
    expect(screen.getByText(/segue para Orçamento/)).toBeInTheDocument();
  });

  it("sem levantamento por ligar, «Usar um que já existe» fica desativado e di-lo", () => {
    render(<Controlado registos={{ ...REGISTOS, levantamentos: [] }} inicial={{ ...TODOS, levantamento: { tipo: "novo" } }} />);
    const existente = screen.getByRole("radio", { name: /Usar um que já existe/ });
    expect(existente).toBeDisabled();
    expect(screen.getByText("Não há nenhum levantamento por ligar.")).toBeInTheDocument();
  });

  it("voltar a «Usar um que já existe» propõe o mais recente", () => {
    const aoMudar = vi.fn();
    render(<Controlado inicial={{ ...TODOS, levantamento: { tipo: "dispensar" } }} aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole("radio", { name: /Usar um que já existe/ }));
    expect(aoMudar).toHaveBeenLastCalledWith({ ...TODOS, levantamento: { tipo: "existente", id: "rl-2" } });
  });
});
