import { describe, expect, it } from "vitest";
import { instanteLisboa as daTempoLisboa } from "./tempoLisboa";
import {
  DURACAO_OMISSAO_MIN, instanteLisboa, minutosDaDuracao, paraAlterarVisita, paraDetalhesVisita, paraGuardarVisita, type EntradaVisita,
} from "./visitaDb";

const ORG = "org-1";
const PESSOA = "pessoa-1";
const QUADRO = "quadro-1";
const RECURSO = "recurso-1";

const entrada = (sobre: Partial<EntradaVisita> = {}): EntradaVisita => ({
  boardId: QUADRO, data: "2026-10-24", hora: "10:00", duracao: "h1", recursos: [RECURSO], tipo: "levantamento",
  titulo: "Levantamento · Ana Lopes", nota: "", morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" },
  igualALead: false, quemVaiEstar: "", ...sobre,
});

const params = (e: EntradaVisita) => {
  const r = paraGuardarVisita(ORG, PESSOA, e);
  if (!r.ok) throw new Error(`esperava params, veio ${r.erro}`);
  return r.params;
};

describe("instanteLisboa (visitaDb)", () => {
  it("é o mesmo de tempoLisboa: Lisboa em hora de verão e de inverno", () => {
    expect(instanteLisboa).toBe(daTempoLisboa);
    expect(instanteLisboa("2026-10-24", "10:00")).toBe("2026-10-24T09:00:00.000Z");
    expect(instanteLisboa("2026-10-25", "10:00")).toBe("2026-10-25T10:00:00.000Z");
  });
});

describe("minutosDaDuracao", () => {
  it("traduz as quatro chaves; vazia vale a duração por omissão; desconhecida é null", () => {
    expect(minutosDaDuracao("m30")).toBe(30);
    expect(minutosDaDuracao("h1")).toBe(60);
    expect(minutosDaDuracao("h1m30")).toBe(90);
    expect(minutosDaDuracao("h2")).toBe(120);
    expect(minutosDaDuracao("")).toBe(DURACAO_OMISSAO_MIN);
    expect(DURACAO_OMISSAO_MIN).toBe(60);
    expect(minutosDaDuracao("h9")).toBeNull();
  });
});

describe("paraDetalhesVisita: nunca texto vazio (a base dá NG009)", () => {
  it("um objeto vazio, ou só com vazios, dá null", () => {
    expect(paraDetalhesVisita({})).toBeNull();
    expect(paraDetalhesVisita({ morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null, quemVaiEstar: "" })).toBeNull();
    expect(paraDetalhesVisita({ morada: null, igualALead: null, quemVaiEstar: "   " })).toBeNull();
  });

  it("código postal vazio ou inválido sai da morada; os outros campos ficam", () => {
    const a = paraDetalhesVisita({ morada: { rua: "Rua A", codigoPostal: "", localidade: "", andar: "" } });
    expect(a).toEqual({ morada: { rua: "Rua A" } });
    const b = paraDetalhesVisita({ morada: { rua: "Rua A", codigoPostal: "1000", localidade: "Lisboa", andar: "" } });
    expect(b).toEqual({ morada: { rua: "Rua A", localidade: "Lisboa" } });
    const c = paraDetalhesVisita({ morada: { rua: "", codigoPostal: "1000-001", localidade: "", andar: "" } });
    expect(c).toEqual({ morada: { codigo_postal: "1000-001" } });
  });

  it("«quem vai estar» só entra se for uma das quatro chaves; igualALead só se for booleano", () => {
    expect(paraDetalhesVisita({ quemVaiEstar: "casal" })).toEqual({ presentes: "casal" });
    expect(paraDetalhesVisita({ quemVaiEstar: "" })).toBeNull();
    expect(paraDetalhesVisita({ quemVaiEstar: "vizinho" })).toBeNull();
    expect(paraDetalhesVisita({ igualALead: false })).toEqual({ igual_a_lead: false });
    expect(paraDetalhesVisita({ igualALead: true, quemVaiEstar: "familia" })).toEqual({ igual_a_lead: true, presentes: "familia" });
  });

  it("apara os espaços e corta ao limite da base (rua 300, localidade 120, andar 60)", () => {
    const d = paraDetalhesVisita({ morada: { rua: `  ${"r".repeat(400)} `, codigoPostal: " 1000-001 ", localidade: "l".repeat(200), andar: "a".repeat(90) } });
    expect(d?.morada?.rua).toHaveLength(300);
    expect(d?.morada?.codigo_postal).toBe("1000-001");
    expect(d?.morada?.localidade).toHaveLength(120);
    expect(d?.morada?.andar).toHaveLength(60);
  });

  it("com mais de 2000 octetos (texto com acentos e emojis) larga a morada em vez de a enviar e falhar", () => {
    const d = paraDetalhesVisita({
      morada: { rua: "😀".repeat(300), codigoPostal: "1000-001", localidade: "😀".repeat(120), andar: "😀".repeat(60) }, igualALead: false, quemVaiEstar: "casal",
    });
    expect(d).toEqual({ igual_a_lead: false, presentes: "casal" });
  });

  it("caracteres especiais normais passam inteiros", () => {
    const d = paraDetalhesVisita({ morada: { rua: "Rua d'Água, nº 5 \"A\"", codigoPostal: "", localidade: "Évora", andar: "" } });
    expect(d).toEqual({ morada: { rua: "Rua d'Água, nº 5 \"A\"", localidade: "Évora" } });
  });
});

describe("paraGuardarVisita", () => {
  it("monta os parâmetros de neg_guardar_visita e mais nenhuns (sem inventar nomes)", () => {
    const p = params(entrada({ nota: " portão azul ", negocioId: "neg-1", quemVaiEstar: "casal" }));
    expect(p).toEqual({
      p_organization_id: ORG, p_entity_id: PESSOA, p_board_id: QUADRO,
      p_inicio: "2026-10-24T09:00:00.000Z", p_fim: "2026-10-24T10:00:00.000Z",
      p_titulo: "Levantamento · Ana Lopes", p_notas: "portão azul", p_local: "Rua A 1, 1000-001 Lisboa",
      p_lat: null, p_lng: null, p_recursos: [RECURSO], p_visit_kind: "levantamento", p_negocio_id: "neg-1",
      p_detalhes: { morada: { rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa" }, igual_a_lead: false, presentes: "casal" },
    });
  });

  it("o fim é o início mais a duração, também quando a hora de Lisboa muda a meio", () => {
    expect(params(entrada({ duracao: "m30" })).p_fim).toBe("2026-10-24T09:30:00.000Z");
    expect(params(entrada({ duracao: "h1m30" })).p_fim).toBe("2026-10-24T10:30:00.000Z");
    expect(params(entrada({ duracao: "h2" })).p_fim).toBe("2026-10-24T11:00:00.000Z");
    expect(params(entrada({ duracao: "" })).p_fim).toBe("2026-10-24T10:00:00.000Z");
    // 25/10 00:30 de Lisboa (verão, UTC+1) + 2 h cruza a mudança de hora: a soma é de instantes, não de relógio.
    const noite = params(entrada({ data: "2026-10-25", hora: "00:30", duracao: "h2" }));
    expect(noite.p_inicio).toBe("2026-10-24T23:30:00.000Z");
    expect(noite.p_fim).toBe("2026-10-25T01:30:00.000Z");
  });

  it("uma duração desconhecida preserva-se em duracaoMinutos", () => {
    expect(params(entrada({ duracao: "h9", duracaoMinutos: 45 })).p_fim).toBe("2026-10-24T09:45:00.000Z");
    const r = paraGuardarVisita(ORG, PESSOA, entrada({ duracao: "h9" }));
    expect(r).toEqual({ ok: false, erro: "duracaoInvalida" });
  });

  it("nunca envia p_recursos nulo ou vazio: sem recursos, ou com um vazio, recusa", () => {
    expect(paraGuardarVisita(ORG, PESSOA, entrada({ recursos: [] }))).toEqual({ ok: false, erro: "recursoEmFalta" });
    expect(paraGuardarVisita(ORG, PESSOA, entrada({ recursos: [""] }))).toEqual({ ok: false, erro: "recursoEmFalta" });
    expect(params(entrada({ recursos: ["a", "a", "b"] })).p_recursos).toEqual(["a", "b"]);
  });

  it("sem quadro, ou sem hora (obrigatória), ou com dia inexistente: recusa com o motivo", () => {
    expect(paraGuardarVisita(ORG, PESSOA, entrada({ boardId: null }))).toEqual({ ok: false, erro: "quadroEmFalta" });
    expect(paraGuardarVisita(ORG, PESSOA, entrada({ hora: "" }))).toEqual({ ok: false, erro: "horaInvalida" });
    expect(paraGuardarVisita(ORG, PESSOA, entrada({ data: "2026-02-30" }))).toEqual({ ok: false, erro: "horaInvalida" });
    expect(paraGuardarVisita(ORG, PESSOA, entrada({ data: "" }))).toEqual({ ok: false, erro: "horaInvalida" });
  });

  it("textos vazios viram null (nunca \"\"), e o título e o local cortam ao limite da base", () => {
    const p = params(entrada({ titulo: "   ", nota: "  ", tipo: "", morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null }));
    expect(p).toMatchObject({ p_titulo: null, p_notas: null, p_local: null, p_visit_kind: null, p_detalhes: null, p_negocio_id: null });
    const longo = params(entrada({ titulo: "t".repeat(300), morada: { rua: "r".repeat(400), codigoPostal: "", localidade: "l".repeat(200), andar: "" } }));
    expect(longo.p_titulo).toHaveLength(200);
    expect((longo.p_local as string).length).toBeLessThanOrEqual(500);
  });

  it("não escreve nada que seja contacto: nem nota de contacto nem coordenadas", () => {
    const p = params(entrada());
    expect(Object.keys(p)).not.toContain("p_nota");
    expect(p.p_lat).toBeNull();
    expect(p.p_lng).toBeNull();
  });
});

describe("paraAlterarVisita: reenvia todos os campos (um campo omitido apaga-se)", () => {
  it("leva a visita, o quadro, as horas e os campos que a base limpa se vierem a NULL", () => {
    const r = paraAlterarVisita("v-1", entrada({ nota: "n", quemVaiEstar: "casal" }));
    if (!r.ok) throw new Error(r.erro);
    expect(r.params).toEqual({
      p_visita_id: "v-1", p_board_id: QUADRO, p_inicio: "2026-10-24T09:00:00.000Z", p_fim: "2026-10-24T10:00:00.000Z",
      p_titulo: "Levantamento · Ana Lopes", p_notas: "n", p_local: "Rua A 1, 1000-001 Lisboa", p_recursos: [RECURSO],
      p_visit_kind: "levantamento",
      p_detalhes: { morada: { rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa" }, igual_a_lead: false, presentes: "casal" },
    });
    expect(Object.keys(r.params)).not.toContain("p_organization_id");
    expect(Object.keys(r.params)).not.toContain("p_entity_id");
  });

  it("a mesma lista de recursos vai como NULL (não revalida nem mexe no responsável); outra lista vai por inteiro", () => {
    const igual = paraAlterarVisita("v-1", entrada({ recursos: ["b", "a"] }), ["a", "b"]);
    expect(igual.ok && igual.params.p_recursos).toBeNull();
    const outra = paraAlterarVisita("v-1", entrada({ recursos: ["a", "c"] }), ["a", "b"]);
    expect(outra.ok && outra.params.p_recursos).toEqual(["a", "c"]);
    const semAtuais = paraAlterarVisita("v-1", entrada({ recursos: ["a"] }));
    expect(semAtuais.ok && semAtuais.params.p_recursos).toEqual(["a"]);
  });

  it("alterar sem recursos recusa; sem nada para limpar, notas e local vão a null", () => {
    expect(paraAlterarVisita("v-1", entrada({ recursos: [] }))).toEqual({ ok: false, erro: "recursoEmFalta" });
    const r = paraAlterarVisita("v-1", entrada({ nota: "", tipo: "", morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null }));
    expect(r.ok && r.params).toMatchObject({ p_notas: null, p_local: null, p_visit_kind: null, p_detalhes: null });
  });

  it("sem id de visita recusa", () => {
    expect(paraAlterarVisita("", entrada())).toEqual({ ok: false, erro: "visitaEmFalta" });
  });
});
