import { describe, expect, it } from "vitest";
import {
  mensagemFalta,
  podeAprovarPlano,
  rotuloEncomendaCliente,
  rotuloFornecedor,
  rotuloPlano,
  validacoesFeitas,
  type Arranque,
} from "../arranque";

const base = (p: Partial<Arranque> = {}): Arranque => ({
  obra_id: "o1",
  estado_obra: "planeada",
  arrancou: false,
  frente_a_instalada: false,
  encomenda_cliente: {
    estado: "por_instalar",
    ok: true,
    id: null,
    contrato_id: "c1",
    validada_por: null,
    validada_por_nome: null,
    validada_em: null,
  },
  fornecedor: { estado: "por_instalar", ok: true, notas: null },
  plano: {
    estado: "por_aprovar",
    ok: false,
    motivo: null,
    aprovado_por: null,
    aprovado_por_nome: null,
    aprovado_em: null,
    tarefas: 4,
    sem_datas: 0,
    sem_pessoas: 0,
    material_antes: [],
    avisos: [],
  },
  pode_arrancar: false,
  falta: ["aprovar o plano da obra"],
  ...p,
});

describe("checklist de arranque", () => {
  it("rótulos e tons dos estados", () => {
    expect(rotuloEncomendaCliente("validada")).toEqual({ texto: "validada", tom: "ok" });
    expect(rotuloEncomendaCliente("rascunho").tom).toBe("pendente");
    expect(rotuloEncomendaCliente("por_instalar").tom).toBe("neutro");
    expect(rotuloFornecedor("nao_necessaria")).toEqual({ texto: "não necessária", tom: "ok" });
    expect(rotuloFornecedor("por_validar").texto).toMatch(/Encomenda Cliente/);
    expect(rotuloPlano("aprovado").tom).toBe("ok");
    // Um estado novo da base não rebenta o ecrã.
    expect(rotuloFornecedor("outro_estado")).toEqual({ texto: "outro estado", tom: "neutro" });
  });

  it("conta as validações que já não impedem o arranque", () => {
    expect(validacoesFeitas(base())).toBe(2);
    expect(validacoesFeitas(base({ plano: { ...base().plano, ok: true, estado: "aprovado" } }))).toBe(3);
  });

  it("diz o que falta, ou nada quando pode arrancar", () => {
    expect(mensagemFalta(base())).toBe("Falta: aprovar o plano da obra.");
    expect(mensagemFalta(base({ falta: ["validar a Encomenda Cliente", "aprovar o plano da obra"] }))).toBe(
      "Falta: validar a Encomenda Cliente; aprovar o plano da obra."
    );
    expect(mensagemFalta(base({ falta: [] }))).toMatch(/checklist/);
    expect(mensagemFalta(base({ pode_arrancar: true }))).toBeNull();
    expect(mensagemFalta(null)).toBeNull();
  });

  it("o plano só se aprova antes de arrancar e com tarefas", () => {
    expect(podeAprovarPlano(base())).toBe(true);
    expect(podeAprovarPlano(base({ estado_obra: "suspensa" }))).toBe(true);
    expect(podeAprovarPlano(base({ arrancou: true, estado_obra: "em_curso" }))).toBe(false);
    expect(podeAprovarPlano(base({ plano: { ...base().plano, tarefas: 0 } }))).toBe(false);
  });
});
