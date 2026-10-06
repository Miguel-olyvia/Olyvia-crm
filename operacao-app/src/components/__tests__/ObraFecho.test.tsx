import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ObraFecho from "../ObraFecho";
import type { FechoObra } from "../../lib/obrasFecho";

const base = (): FechoObra => ({
  obra: {
    id: "o1", codigo: "OB-1", titulo: "Remodelação cozinha", estado: "em_curso", morada: "Rua A", cliente: "Maria",
    supervisor_id: "sup", data_inicio_prevista: "2026-10-01", iniciada_em: "2026-10-01T08:00:00Z", concluida_em: null,
    inicio_planeado: "2026-10-01", fim_planeado: "2026-10-20", fim_original: "2026-10-18", n_tarefas: 3, n_por_validar: 0,
  },
  pode: { fechar: true, justificar: true, eu: "sup" },
  divisoes: [{ id: "d1", nome: "Cozinha", tipo: "cozinha", itens: ["Exaustor a funcionar", "Gavetas a funcionar"] }],
  sugestoes: [],
  vistoria: [{ divisao_id: "d1", item: "Gavetas a funcionar", resultado: "ok", nota: null, remate_id: null }],
  remates: [
    {
      id: "r1", divisao_id: "d1", descricao: "Risco no tampo", foto_caminho: null, responsavel_id: null, responsavel: null,
      estado: "aberto", origem: "rececao", nota: null, criado_em: "2026-10-20T10:00:00Z", resolvido_em: null, verificado_em: null,
    },
  ],
  fotos: [],
  fecho: null,
});

const m = vi.hoisted(() => ({
  atual: null as unknown,
  responderVistoria: vi.fn(async (..._a: unknown[]) => ({})),
  mudarEstadoObra: vi.fn(async (..._a: unknown[]) => ({})),
}));
const responderVistoria = m.responderVistoria;
const mudarEstadoObra = m.mudarEstadoObra;

vi.mock("../../lib/supabase", () => ({ supabase: {} }));

vi.mock("../../lib/obrasFecho", async (orig) => ({
  ...(await orig<typeof import("../../lib/obrasFecho")>()),
  lerFecho: vi.fn(async () => m.atual),
  responderVistoria: m.responderVistoria,
}));
vi.mock("../../lib/dados", async (orig) => ({
  ...(await orig<typeof import("../../lib/dados")>()),
  urlsDosAnexos: vi.fn(async () => new Map()),
}));
vi.mock("../../lib/obras", () => ({ mudarEstadoObra: m.mudarEstadoObra }));

const montar = (funcao = "supervisor") =>
  render(<ObraFecho obraId="o1" orgId="org" funcao={funcao} equipa={[]} aoMudar={() => {}} />);

describe("ObraFecho", () => {
  beforeEach(() => {
    m.atual = base();
    responderVistoria.mockClear();
    mudarEstadoObra.mockClear();
  });

  it("diz o que falta para fechar: remates e o auto", async () => {
    montar();
    expect(await screen.findByText("Falta o auto de receção assinado pelo cliente")).toBeInTheDocument();
    expect(screen.getByText("1 remate(s) por fechar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto de receção" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir obra" })).not.toBeInTheDocument();
  });

  it("vistoria num toque: 'não está bem' grava nok", async () => {
    montar();
    expect(await screen.findByText("1/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exaustor a funcionar: não está bem" }));
    await waitFor(() => expect(responderVistoria).toHaveBeenCalledWith("d1", "Exaustor a funcionar", "nok"));
  });

  it("com o auto assinado e tudo validado, o gestor conclui ali", async () => {
    m.atual = {
      ...base(),
      fecho: {
        auto_assinante: "Maria", auto_assinatura_caminho: "x", auto_pdf_caminho: "org/o1/fecho/a.pdf", auto_observacoes: null,
        auto_assinado_em: "2026-10-20T17:00:00Z", justificacao: null, justificado_em: null, justificado_por: null,
      },
    };
    montar("gestor");
    expect(await screen.findByText(/Auto assinado por Maria/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarregar PDF" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concluir obra" }));
    await waitFor(() => expect(mudarEstadoObra).toHaveBeenCalledWith("o1", "concluida", null));
  });

  it("sem o SQL instalado, explica em vez de rebentar", async () => {
    m.atual = null;
    montar();
    expect(await screen.findByText(/ainda não está instalado/)).toBeInTheDocument();
  });

  it("sem divisões, sugere as do título num toque", async () => {
    m.atual = { ...base(), divisoes: [], vistoria: [], sugestoes: [{ nome: "Cozinha", tipo: "cozinha" }] };
    montar();
    expect(await screen.findByText("Ainda não há divisões nesta obra.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cozinha/ })).toBeInTheDocument();
  });
});
