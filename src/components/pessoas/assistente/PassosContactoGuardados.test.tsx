// Os passos da fase Contacto mostram o que a base já guardou: quem fez cada chamada e a próxima ação, a morada da obra pré-preenchida («Por preencher»
// nos campos vazios, só para ler) e a duração de 30 min em «Preparar a visita».
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorpoChamada, CorpoMorada, CorpoPreparar } from "./PassosContacto";
import type { ContactoPessoa } from "@/components/negocio-metas/registosTipos";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const CONTACTO = (sobre: Partial<ContactoPessoa> = {}): ContactoPessoa => ({
  id: "c1", pessoaId: "p", data: "2026-10-12", hora: "10:30", resultado: "atendeuInteressado", nota: "", negocioId: null, ...sobre,
});

describe("CorpoChamada: a lista de chamadas", () => {
  const form = { telefone: "927 118 300", email: "ana@exemplo.pt", contacto: "" as const, hora: "" as const, lingua: "pt" };
  const props = { chamadas: 2, form, aoMudar: vi.fn(), podeEditar: true, erroCampo: null, aoRegistar: vi.fn(), podeRegistar: false };

  it("diz quem fez a chamada e a próxima ação combinada", () => {
    render(<CorpoChamada {...props} historico={[CONTACTO({ criadoPor: "Rita Gomes", proximaAcao: { data: "2026-10-15", hora: "15:30" } })]} />);
    const linha = screen.getByRole("listitem");
    expect(linha).toHaveTextContent("por Rita Gomes");
    expect(linha).toHaveTextContent(/próxima ação .*15:30/);
  });

  it("a próxima ação sem hora mostra só o dia", () => {
    render(<CorpoChamada {...props} historico={[CONTACTO({ proximaAcao: { data: "2026-10-15" } })]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent(/próxima ação/);
    expect(screen.getByRole("listitem")).not.toHaveTextContent("undefined");
  });

  it("uma chamada sem autor nem próxima ação não mostra nenhum dos dois", () => {
    render(<CorpoChamada {...props} historico={[CONTACTO({ nota: "Voltar a ligar" })]} />);
    const linha = screen.getByRole("listitem");
    expect(linha).not.toHaveTextContent("por ");
    expect(linha).not.toHaveTextContent("próxima ação");
    expect(linha).toHaveTextContent("Voltar a ligar");
  });
});

describe("CorpoMorada: só para ler", () => {
  const vazia = { rua: "", codigoPostal: "", localidade: "", andar: "" };
  const props = { morada: vazia, origem: null, aoMudar: vi.fn(), aoPreencherDe: vi.fn(), moradaEntidade: null, erroCodigoPostal: false };

  it("os campos vazios dizem «Por preencher»", () => {
    render(<CorpoMorada {...props} somenteLeitura />);
    for (const rotulo of ["Rua e número", "Código postal", "Localidade"]) expect(screen.getByLabelText(rotulo)).toHaveAttribute("placeholder", "Por preencher");
    expect(screen.getAllByPlaceholderText("Por preencher")).toHaveLength(4);
  });

  it("um campo preenchido mostra o valor, e a morada pré-preenchida abre com os quatro campos", () => {
    render(<CorpoMorada {...props} somenteLeitura morada={{ rua: "Rua da Obra 5", codigoPostal: "4000-010", localidade: "Porto", andar: "" }} />);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua da Obra 5");
    expect(screen.getByLabelText("Localidade")).toHaveValue("Porto");
    const andar = screen.getAllByPlaceholderText("Por preencher").find((c) => (c as HTMLInputElement).value === "");
    expect(andar).toBeDefined();
  });

  it("a editar, os campos vazios não dizem «Por preencher»", () => {
    render(<CorpoMorada {...props} />);
    expect(screen.queryByPlaceholderText("Por preencher")).not.toBeInTheDocument();
  });
});

describe("CorpoPreparar: 30 min", () => {
  it("«30 min» está entre as durações e escolhe-se", () => {
    const aoMudar = vi.fn();
    render(<CorpoPreparar valor={{ duracao: "m30", quem: "", nota: "" }} aoMudar={aoMudar} />);
    const trinta = screen.getByRole("button", { name: "30 min" });
    expect(trinta).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(trinta);
    expect(aoMudar).toHaveBeenCalledWith({ duracao: "" });
  });
});
