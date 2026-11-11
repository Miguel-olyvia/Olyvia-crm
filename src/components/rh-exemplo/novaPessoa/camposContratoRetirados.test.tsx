/**
 * Decisao 4 (RH), lado da admissao («Nova pessoa»): «Maximo de horas semanais», «Tempo de trabalho %» e «Formacao» nao se
 * pedem, nao se validam e nao seguem no payload. As colunas ficam na base (um INSERT sem elas deixa-as a NULL, que ambas aceitam).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }) }));

import { problemasDoRascunho, rascunhoInicial } from "@/components/rh-exemplo/lib/novaPessoa";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "./tiposNova";
import { paraNovaPessoa } from "./paraStore";
import { ProvedorNova, type ContextoNova } from "./contextoNova";
import { ContratoHoras } from "./ContratoHoras";
import { CAMPOS_POR_ABA } from "./ids";

const COLUNAS_RETIRADAS = ["tempo_trabalho_pct", "horas_semanais_maximas", "formacao_inicio", "formacao_fim"] as const;
const OPCOES = { comConvite: false, config: null, cargoNome: "Vendedor/a", podeLigarConta: true, podeSaude: true, podeSindicalizacao: true };

function preenchido(): ValoresNovaPessoa {
  let v = valoresIniciais("2026-10-14");
  v = comPatch(v, "geral", { primeiro_nome: "Teresa", apelido: "Nogueira" });
  v = comPatch(v, "laborais", { cargo_id: "cargo-1", data_admissao: "2026-10-01" });
  return comPatch(v, "contrato", {
    tipo_contrato: "sem_termo", data_inicio: "2026-10-01", tipo_trabalho: "presencial", horas_trabalho: "40", horas_frequencia: "semanal",
  });
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

describe("nova pessoa (rh-exemplo): os campos retirados do contrato", () => {
  it("o rascunho de partida ja nao os tem", () => {
    const contrato = valoresIniciais("2026-10-14").contrato;
    expect(contrato).not.toHaveProperty("tempo_trabalho_pct");
    expect(contrato).not.toHaveProperty("horas_semanais_maximas");
  });

  it("a secao das horas ja nao os mostra", () => {
    const valor = {
      valores: valoresIniciais("2026-10-14"), alterar: () => {}, erro: () => null, obrigatorio: () => false, config: null, colegas: [],
      conta: new Proxy({}, { get: () => () => null }), anexos: {}, aCriar: false, podeSaude: true, podeSindicalizacao: true,
    } as unknown as ContextoNova;
    render(<ProvedorNova valor={valor}><ContratoHoras /></ProvedorNova>);
    expect(document.getElementById("hr-novo-tempo-trabalho-pct")).toBeNull();
    expect(document.getElementById("hr-novo-horas-semanais-maximas")).toBeNull();
    expect(document.getElementById("hr-novo-horas-trabalho")).not.toBeNull();
  });

  it("os ids deles ja nao pertencem a nenhuma aba do formulario", () => {
    const todos = Object.values(CAMPOS_POR_ABA).flat();
    expect(todos).not.toContain("hr-novo-tempo-trabalho-pct");
    expect(todos).not.toContain("hr-novo-horas-semanais-maximas");
  });

  it("nao se valida o que ja nao se pede: um maximo antigo abaixo do contratado nao da erro", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.contrato.horas_trabalho = "40";
    rascunho.contrato.horas_frequencia = "semanal";
    Object.assign(rascunho.contrato, { horas_semanais_maximas: "20", tempo_trabalho_pct: "250" });
    const mensagens = problemasDoRascunho(rascunho).map((p) => p.mensagemKey);
    expect(mensagens).not.toContain("hr.form.erroMaximoSemanal");
    expect(mensagens).not.toContain("hr.form.erroPercentagem");
  });

  it("o vinculo que segue para gravar nao leva nenhuma das quatro colunas", () => {
    const { payload } = paraNovaPessoa(preenchido(), OPCOES);
    expect(payload.vinculo).toMatchObject({ tipo_contrato: "sem_termo", data_inicio: "2026-10-01", tipo_trabalho: "presencial" });
    for (const coluna of COLUNAS_RETIRADAS) expect(payload.vinculo).not.toHaveProperty(coluna);
  });
});
