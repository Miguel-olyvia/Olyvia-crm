import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { seed, type Negocio } from "@/emylia/motor";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { NegocioEmylia } from "./useNegocioEmylia";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const m = vi.hoisted(() => ({ e: null as unknown, orgPedida: [] as (string | null)[], run: vi.fn() }));
vi.mock("./useNegocioEmylia", () => ({
  useNegocioEmylia: (org: string | null) => { m.orgPedida.push(org); return m.e; },
}));

import { useNegocioEmyliaDoGuia } from "./useNegocioEmyliaDoGuia";

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", utilizadorId: "u1", momentoGanho: null };
const embrulho = ({ children }: { children: ReactNode }) => <FontePessoasContext.Provider value={REAL}>{children}</FontePessoasContext.Provider>;
const negocio = { id: "n1", estadoReal: "aberto", contrato: null } as unknown as NegocioMes;
const dados = { pedidoCliente: "Trocar a banheira", email: "ana@x.pt", chamadas: 2, visitas: 1, levantamentos: 1 };

function deAbordagem(): Negocio {
  const d = structuredClone(seed().deals[0]);
  d.fase = 0; d.orc = null; d.perdido = false; d.f = {}; d.hist = [];
  d.visita.fechada = false; d.visita.med = { ...d.visita.med, pav: 0, par: 0, pts: 0, pcs: 0 }; d.visita.extra = {}; d.visita.off = []; d.visita.prod = [];
  return d;
}
function emylia(d: Negocio | undefined, sobre: Partial<NegocioEmylia> = {}): NegocioEmylia {
  const S = seed();
  return {
    leitura: { k: "pronto" }, gravacao: { k: "parado" }, avisos: [], d, docsCrm: false, reler: vi.fn(() => true), regravar: vi.fn(),
    ctx: d ? { S, A: {} as never, run: m.run, go: vi.fn(), q: "" } : null, ...sobre,
  };
}
type Opcoes = Parameters<typeof useNegocioEmyliaDoGuia>[1];
const usar = (opcoes: Partial<Opcoes> = {}, n: NegocioMes = negocio) =>
  renderHook((o: Partial<Opcoes>) => useNegocioEmyliaDoGuia(n, { faseDoItem: "levantamento", podeEditar: true, levantamentoGuardado: true, dados, ...o }), { wrapper: embrulho, initialProps: opcoes });

beforeEach(() => { m.run.mockImplementation((fn: () => void) => fn()); });
afterEach(() => { cleanup(); vi.clearAllMocks(); m.orgPedida = []; });

describe("useNegocioEmyliaDoGuia: a saída «Passar para o Negócio»", () => {
  it("com o levantamento guardado e sem documentos do CRM a ação aparece, sem razão, e lê a organização", () => {
    m.e = emylia(deAbordagem());
    const { result } = usar();
    expect(result.current.passar).toMatchObject({ visivel: true, razao: null, aFazer: false });
    expect(m.orgPedida.at(-1)).toBe("org-1");
  });

  it("fazer() passa o negócio à fase 3 (Negócio) pelo armazém, com os dados de partida do CRM, e a ficha passa a Negócio", () => {
    const d = deAbordagem();
    m.e = emylia(d);
    const { result, rerender } = usar();
    act(() => result.current.passar.fazer());
    expect(m.run).toHaveBeenCalledTimes(1);
    expect(d.fase).toBe(3);
    expect(d.visita.fechada).toBe(true);
    expect(d.orc).not.toBeNull();
    expect(d.f.pedido).toBe("Trocar a banheira");
    rerender();
    expect(result.current.faseEmylia).toBe("negocio");
    expect(result.current.passar.visivel).toBe(false);
  });

  it("o que falta responder no levantamento não bloqueia: a passagem não depende de nenhuma resposta", () => {
    const d = deAbordagem();
    d.f = {}; // nada respondido
    m.e = emylia(d);
    const { result } = usar();
    expect(result.current.passar.razao).toBeNull();
    act(() => result.current.passar.fazer());
    expect(d.fase).toBe(3);
  });

  it("sem pessoas.edit aparece desativada, com a razão, e não grava", () => {
    const d = deAbordagem();
    m.e = emylia(d);
    const { result } = usar({ podeEditar: false });
    expect(result.current.passar).toMatchObject({ visivel: true, razao: "semPermissao" });
    act(() => result.current.passar.fazer());
    expect(m.run).not.toHaveBeenCalled();
    expect(d.fase).toBe(0);
  });

  it("com documentos do CRM aparece desativada (docsCrm) e não grava", () => {
    const d = deAbordagem();
    m.e = emylia(d, { docsCrm: true });
    const { result } = usar();
    expect(result.current.passar).toMatchObject({ visivel: true, razao: "docsCrm" });
    act(() => result.current.passar.fazer());
    expect(m.run).not.toHaveBeenCalled();
  });

  it("enquanto a organização é lida, se a leitura falhou ou se não devolveu o negócio, diz-se a razão", () => {
    m.e = emylia(undefined, { leitura: { k: "a-ler" } });
    expect(usar().result.current.passar.razao).toBe("aLer");
    m.e = emylia(undefined, { leitura: { k: "erro", t: "sem rede" } });
    expect(usar().result.current.passar.razao).toBe("erro");
    m.e = emylia(undefined);
    expect(usar().result.current.passar.razao).toBe("semNegocio");
  });

  it("a leitura da organização NÃO bloqueia o assistente da Visita (só o Negócio em diante bloqueia)", () => {
    m.e = emylia(undefined, { leitura: { k: "a-ler" } });
    expect(usar().result.current.leituraBloqueia).toBe(false);
    m.e = emylia(undefined, { leitura: { k: "erro", t: "x" } });
    expect(usar().result.current.leituraBloqueia).toBe(false);
  });

  it("sem levantamento guardado, noutra fase do CRM, ou com o negócio perdido, não há saída", () => {
    m.e = emylia(deAbordagem());
    expect(usar({ levantamentoGuardado: false }).result.current.passar.visivel).toBe(false);
    expect(usar({ faseDoItem: "visita", levantamentoGuardado: false }).result.current.passar.visivel).toBe(false);
    expect(usar({}, { ...negocio, estadoReal: "perdido" } as unknown as NegocioMes).result.current.passar.visivel).toBe(false);
    expect(m.orgPedida.at(-1)).toBeNull(); // perdido: nem se lê
  });

  it("um negócio que já é da Emylia (fase 3 ou mais) já não tem a saída", () => {
    const d = deAbordagem(); d.fase = 3;
    m.e = emylia(d);
    const { result } = usar();
    expect(result.current.passar.visivel).toBe(false);
    expect(result.current.faseEmylia).toBe("negocio");
  });

  it("repetir depois de uma passagem que falhou: com o negócio ainda na abordagem volta a passar; já na fase 3 volta a gravar", () => {
    const d = deAbordagem();
    const e = emylia(d);
    m.e = e;
    const { result } = usar();
    act(() => result.current.repetirGravacao());
    expect(d.fase).toBe(3);
    expect(e.regravar).not.toHaveBeenCalled();
    act(() => result.current.repetirGravacao());
    expect(e.regravar).toHaveBeenCalledTimes(1);
  });

  describe("a fase avança NO MOMENTO em que se conclui, e nunca ao abrir a ficha", () => {
    it("abrir uma ficha com o levantamento já guardado NÃO grava nada (os casos antigos usam o botão)", () => {
      const d = deAbordagem();
      m.e = emylia(d);
      usar();
      expect(m.run).not.toHaveBeenCalled();
      expect(d.fase).toBe(0);
    });

    it("guardar o levantamento com a ficha aberta passa o negócio à fase 3 e mostra o Negócio (sem clicar noutra coisa)", () => {
      const d = deAbordagem(); d.fase = 2;
      m.e = emylia(d);
      const { result, rerender } = usar({ faseDoItem: "visita", levantamentoGuardado: false, dados: { ...dados, levantamentos: 0 } });
      expect(m.run).not.toHaveBeenCalled();
      rerender({ faseDoItem: "visita", levantamentoGuardado: true, dados: { ...dados, levantamentos: 1 } });
      expect(m.run).toHaveBeenCalledTimes(1);
      expect(d.fase).toBe(3);
      expect(d.f.pedido).toBe("Trocar a banheira");
      rerender({ faseDoItem: "visita", levantamentoGuardado: true, dados: { ...dados, levantamentos: 1 } });
      expect(result.current.faseEmylia).toBe("negocio");
    });

    it("registar a chamada grava negocios.fase = 1 e marcar a visita grava 2 (só avança, e só se a base está atrás)", () => {
      const d = deAbordagem();
      m.e = emylia(d);
      const base0 = { faseDoItem: "porContactar", levantamentoGuardado: false };
      const { rerender } = usar({ ...base0, dados: { ...dados, chamadas: 0, visitas: 0, levantamentos: 0 } });
      rerender({ ...base0, dados: { ...dados, chamadas: 1, visitas: 0, levantamentos: 0 } });
      expect(d.fase).toBe(1);
      rerender({ ...base0, dados: { ...dados, chamadas: 1, visitas: 1, levantamentos: 0 } });
      expect(d.fase).toBe(2);
      d.fase = 3; // já adiantado pela Emylia: um avanço da abordagem nunca o faz recuar
      rerender({ ...base0, dados: { ...dados, chamadas: 2, visitas: 2, levantamentos: 0 } });
      expect(d.fase).toBe(3);
    });

    it("sem permissão ou com documentos do CRM o avanço não grava", () => {
      const d = deAbordagem();
      m.e = emylia(d, { docsCrm: true });
      const { rerender } = usar({ faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 0, visitas: 0, levantamentos: 0 } });
      rerender({ faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 1, visitas: 0, levantamentos: 0 } });
      expect(d.fase).toBe(0);
      expect(m.run).not.toHaveBeenCalled();
      m.e = emylia(d);
      const outro = usar({ podeEditar: false, faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 0, visitas: 0, levantamentos: 0 } });
      outro.rerender({ podeEditar: false, faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 1, visitas: 0, levantamentos: 0 } });
      expect(d.fase).toBe(0);
    });

    it("se a organização ainda está a ser lida quando a fase se conclui, o avanço espera pela leitura", () => {
      const d = deAbordagem();
      m.e = emylia(d, { leitura: { k: "a-ler" } });
      const { rerender } = usar({ faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 0, visitas: 0, levantamentos: 0 } });
      rerender({ faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 1, visitas: 0, levantamentos: 0 } });
      expect(d.fase).toBe(0);
      m.e = emylia(d);
      rerender({ faseDoItem: "porContactar", levantamentoGuardado: false, dados: { ...dados, chamadas: 1, visitas: 0, levantamentos: 0 } });
      expect(d.fase).toBe(1);
    });
  });
});
