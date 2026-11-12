import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  g: { negocio: 5 as number | null, modo: "visita" as "visita" | "chamada", estado: "interrompida", falas: [] as unknown[] },
  terminar: vi.fn(), descartar: vi.fn(),
}));
vi.mock("./gravador", () => ({
  useGravacao: () => m.g, gravacaoAtual: () => m.g,
  terminarGravacao: (...a: unknown[]) => m.terminar(...a), descartarGravacao: (...a: unknown[]) => m.descartar(...a),
}));
vi.mock("./ChamadaDireto", () => ({ textoDaTranscricao: (f: { texto: string }[]) => f.map((x) => x.texto).join("\n") }));

import { gravacaoPassou, useFecharGravacao } from "./fecharGravacao";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

const fala = (texto: string) => ({ inicio: 0, fim: 1, texto, falante: "cliente", confianca_falante: 1 });
function Ecra({ ctx, d }: { ctx: Ctx; d: Negocio }) { useFecharGravacao(ctx, d); return null; }

describe("a gravação acaba quando a fase dela fecha", () => {
  beforeEach(() => { m.terminar.mockReset(); m.descartar.mockReset(); });

  it("visita fechada: guarda a transcrição no negócio e apaga a gravação", async () => {
    m.g = { negocio: 5, modo: "visita", estado: "interrompida", falas: [fala("Quero tirar o bidé."), fala("E a sanita preta.")] };
    const campo = vi.fn();
    const ctx = { run: (fn: () => void) => fn(), A: { campo } } as unknown as Ctx;
    render(<Ecra ctx={ctx} d={{ id: 5, fase: 3, f: {} } as unknown as Negocio} />);
    await waitFor(() => expect(m.descartar).toHaveBeenCalled());
    expect(campo).toHaveBeenCalledWith(5, "transcricao_visita", "Quero tirar o bidé.\nE a sanita preta.");
    expect(m.terminar).not.toHaveBeenCalled();
  });

  it("ainda a ouvir: para primeiro; na própria fase não mexe", async () => {
    m.g = { negocio: 5, modo: "visita", estado: "a_ouvir", falas: [] };
    m.terminar.mockResolvedValue([fala("Fim.")]);
    const ctx = { run: (fn: () => void) => fn(), A: { campo: vi.fn() } } as unknown as Ctx;
    const { rerender } = render(<Ecra ctx={ctx} d={{ id: 5, fase: 2, f: {} } as unknown as Negocio} />);
    expect(m.terminar).not.toHaveBeenCalled();
    rerender(<Ecra ctx={ctx} d={{ id: 5, fase: 3, f: {} } as unknown as Negocio} />);
    await waitFor(() => expect(m.descartar).toHaveBeenCalled());
    expect(m.terminar).toHaveBeenCalled();
  });

  it("as fases: a visita passa depois da fase 2, a chamada depois do Contacto", () => {
    expect(gravacaoPassou("visita", 2)).toBe(false);
    expect(gravacaoPassou("visita", 3)).toBe(true);
    expect(gravacaoPassou("chamada", 1)).toBe(false);
    expect(gravacaoPassou("chamada", 2)).toBe(true);
  });
});
