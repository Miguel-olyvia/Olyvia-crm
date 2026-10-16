import { describe, expect, it } from "vitest";
import type { EstadoAcoes } from "./acoesPessoa";
import { MORADA_VISITA_VAZIA } from "./moradaVisita";
import type { Pessoa, VisitaPessoa } from "./pessoasTipos";
import { novaLinha } from "@/components/negocio-metas/levantamento";
import { proximoPasso } from "./etapaPessoa";
import { resumoBase } from "./fabricaTestes";
import { alterarVisita, guardarLevantamento, marcarVisita, marcarVisitaFeita, MAX_NOTA_VISITA_FEITA, concluirVisita } from "./visitaPessoa";

const HOJE = "2026-10-13";
const MORADA = { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" };
const visita = (extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  data: "2026-10-12", hora: "10:30", comercial: "Ana Ribeiro", igualALead: true, moradaVisita: MORADA_VISITA_VAZIA, ...extra,
});
const pessoa = (extra: Partial<Pessoa> = {}): Pessoa => ({
  id: "a", nome: "Ana", contacto: { telefone: null, email: null }, comercial: "Ana Ribeiro", origem: "site", viaEntrada: "formulario", saude: 50,
  etapa: "visitaMarcada", ultimoContactoDias: 9, morada: MORADA, visita: visita(), proximoContacto: "2026-10-12", ...extra,
});
const estado = (pessoas: Pessoa[] = [pessoa()]): EstadoAcoes => ({ pessoas, atividade: [], contactadas: [] });
const rascunho = (n: number) => ({ linhas: Array.from({ length: n }, (_, i) => ({ ...novaLinha(`l${i + 1}`), divisao: "cozinha", trabalho: "pintura", medida: "12" })), observacoes: "", respostas: {} });

describe("marcarVisitaFeita", () => {
  it("marca a visita como feita, limpa o próximo contacto que era a visita e regista na atividade com a nota", () => {
    const novo = marcarVisitaFeita(estado(), "a", "  Tudo medido  ", HOJE);
    expect(novo.pessoas[0].visita).toMatchObject({ data: "2026-10-12", feita: true });
    expect(novo.pessoas[0]).toMatchObject({ proximoContacto: null, ultimoContactoDias: 0, etapa: "visitaMarcada" });
    expect(novo.atividade).toHaveLength(1);
    expect(novo.atividade[0]).toMatchObject({
      pessoaId: "a", chaveTitulo: "pessoasPagina.process.activity.visitMarkedDone", quando: HOJE, exemplo: false,
    });
    expect(novo.atividade[0].detalhe).toContain("Tudo medido");
    expect(novo.contactadas).toEqual(["a"]);
  });

  it("é imutável: o estado e a pessoa de partida não mudam", () => {
    const antes = estado();
    const copia = structuredClone(antes);
    const novo = marcarVisitaFeita(antes, "a", "", HOJE);
    expect(novo).not.toBe(antes);
    expect(antes).toEqual(copia);
    expect(antes.pessoas[0].visita?.feita).toBeUndefined();
  });

  it("mantém o próximo contacto se já era outro e aceita uma nota vazia", () => {
    const novo = marcarVisitaFeita(estado([pessoa({ proximoContacto: "2026-10-25" })]), "a", "", HOJE);
    expect(novo.pessoas[0].proximoContacto).toBe("2026-10-25");
    expect(novo.atividade[0].detalhe).not.toContain("undefined");
  });

  it("uma ficha antiga (etapa Com visita, sem visita guardada) também se marca: a visita sai do próximo contacto", () => {
    const antiga = estado([pessoa({ visita: undefined, proximoContacto: "2026-10-14" })]);
    const novo = marcarVisitaFeita(antiga, "a", "", HOJE);
    expect(novo.pessoas[0].visita).toMatchObject({ data: "2026-10-14", feita: true });
  });

  it("a nota aceita 200 caracteres e recusa 201", () => {
    expect(MAX_NOTA_VISITA_FEITA).toBe(200);
    const antes = estado();
    expect(marcarVisitaFeita(antes, "a", "x".repeat(200), HOJE)).not.toBe(antes);
    expect(marcarVisitaFeita(antes, "a", "x".repeat(201), HOJE)).toBe(antes);
  });

  it("sem visita, perdida, id desconhecido ou visita já feita, fica tudo como está", () => {
    const sem = estado([pessoa({ visita: undefined, etapa: "emContacto", proximoContacto: null })]);
    expect(marcarVisitaFeita(sem, "a", "", HOJE)).toBe(sem);
    const perdida = estado([pessoa({ perdida: { motivo: "preco", data: HOJE } })]);
    expect(marcarVisitaFeita(perdida, "a", "", HOJE)).toBe(perdida);
    const antes = estado();
    expect(marcarVisitaFeita(antes, "x", "", HOJE)).toBe(antes);
    const feita = estado([pessoa({ visita: visita({ feita: true }) })]);
    expect(marcarVisitaFeita(feita, "a", "", HOJE)).toBe(feita);
  });

  it("depois de marcada, a coluna 'Próximo passo' diz 'Fazer o levantamento'", () => {
    const antes = resumoBase(pessoa(), []);
    expect(proximoPasso(antes).id).toBe("fecharLevantamento");
    const depois = resumoBase(marcarVisitaFeita(estado(), "a", "", HOJE).pessoas[0], []);
    expect(proximoPasso(depois).id).toBe("fazerLevantamento");
  });

  it("a visita marcada pela chamada ou pelo diálogo também se marca feita", () => {
    const dados = { data: "2026-10-20", hora: "", nota: "", servico: "Cozinha" };
    const marcada = marcarVisita(estado([pessoa({ visita: undefined, etapa: "emContacto", proximoContacto: null })]), "a", dados, HOJE);
    expect(marcarVisitaFeita(marcada, "a", "", HOJE).pessoas[0].visita?.feita).toBe(true);
  });
});

describe("guardarLevantamento", () => {
  const feita = () => estado([pessoa({ visita: visita({ feita: true }) })]);

  it("guarda o levantamento na visita e regista-o na atividade", () => {
    const r = rascunho(2);
    const novo = guardarLevantamento(feita(), "a", r, HOJE);
    expect(novo.pessoas[0].visita?.levantamento).toEqual(r);
    expect(novo.pessoas[0].visita?.feita).toBe(true);
    expect(novo.atividade[0]).toMatchObject({ pessoaId: "a", chaveTitulo: "pessoasPagina.process.activity.surveySaved", detalhe: "", exemplo: false });
  });

  it("é imutável", () => {
    const antes = feita();
    const copia = structuredClone(antes);
    guardarLevantamento(antes, "a", rascunho(1), HOJE);
    expect(antes).toEqual(copia);
  });

  it("sem linhas, sem visita feita, perdida ou id desconhecido, fica como está", () => {
    const antes = feita();
    expect(guardarLevantamento(antes, "a", rascunho(0), HOJE)).toBe(antes);
    expect(guardarLevantamento(antes, "x", rascunho(1), HOJE)).toBe(antes);
    const porFazer = estado();
    expect(guardarLevantamento(porFazer, "a", rascunho(1), HOJE)).toBe(porFazer);
    const perdida = estado([pessoa({ visita: visita({ feita: true }), perdida: { motivo: "preco", data: HOJE } })]);
    expect(guardarLevantamento(perdida, "a", rascunho(1), HOJE)).toBe(perdida);
  });

  it("concluir a visita (negócio criado) leva consigo o levantamento guardado", () => {
    const concluida = concluirVisita(guardarLevantamento(feita(), "a", rascunho(1), HOJE), "a", HOJE);
    expect(concluida.pessoas[0].visita).toBeUndefined();
  });
});

describe("alterarVisita numa visita feita", () => {
  const destino = { igualALead: true, outra: MORADA_VISITA_VAZIA, notaAcesso: "" };
  const dados = { data: "2026-10-20", hora: "09:00", destino };

  it("não repõe o próximo contacto no dia de uma visita feita (a visita já aconteceu)", () => {
    const feita = marcarVisitaFeita(estado(), "a", "", HOJE);
    expect(feita.pessoas[0].proximoContacto).toBeNull();
    const novo = alterarVisita(feita, "a", dados, HOJE);
    expect(novo.pessoas[0].proximoContacto).toBeNull();
    expect(novo.pessoas[0].proximoHora).toBeUndefined();
    expect(novo.pessoas[0].visita?.feita).toBe(true);
  });

  it("numa visita por fazer, o próximo contacto continua a acompanhar o dia (comportamento de sempre)", () => {
    const novo = alterarVisita(estado(), "a", dados, HOJE);
    expect(novo.pessoas[0]).toMatchObject({ proximoContacto: "2026-10-20", proximoHora: "09:00" });
  });

  it("numa visita feita com outro próximo contacto (uma chamada agendada), esse mantém-se", () => {
    const feita = marcarVisitaFeita(estado([pessoa({ proximoContacto: "2026-10-25" })]), "a", "", HOJE);
    expect(alterarVisita(feita, "a", dados, HOJE).pessoas[0].proximoContacto).toBe("2026-10-25");
  });
});
