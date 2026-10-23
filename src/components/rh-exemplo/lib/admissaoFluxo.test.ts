// A máquina de estados da admissão: transições válidas e inválidas, a expiração aos 7 dias, o login que se renova, as credenciais
// só com o contrato assinado, a rejeição que revoga o login, a devolução que renova o prazo e o histórico de cada passo.
import { describe, expect, it } from "vitest";
import {
  DIAS_LOGIN, acaoDaLinha, acoesPossiveis, aplicar, camposEditaveis, criarAdmissao, estaExpirada, estadoVisivel, guardarRascunho,
  passoDaFaixa, prazoDoLogin, vistaPublica, type Admissao, type EntradaAdmissao, type ResultadoAdmissao,
} from "@/components/rh-exemplo/lib/admissaoFluxo";

const T0 = new Date("2026-10-14T10:00:00Z");
const MS_DIA = 24 * 60 * 60 * 1000;
const depois = (dias: number, horas = 0): Date => new Date(T0.getTime() + dias * MS_DIA + horas * 3600 * 1000);

let tokens = 0;
const ctx = (agora: Date = T0, quem = "Sofia Rebelo") => ({ agora, quem, novoToken: () => `novo-${++tokens}` });

const nova = (): Admissao => criarAdmissao({ pessoaId: "p-x", roleId: "papel-colaborador", email: "x@exemplo.pt", token: "tok-1" }, { agora: T0, quem: "Sofia Rebelo" });

function passo(adm: Admissao, acao: Parameters<typeof aplicar>[1], entrada: EntradaAdmissao = {}, agora: Date = T0, quem?: string): Admissao {
  const r = aplicar(adm, acao, entrada, ctx(agora, quem));
  if (!r.ok) throw new Error(`${acao}: ${r.erro}`);
  return r.admissao;
}
const erroDe = (r: ResultadoAdmissao) => (r.ok ? null : r.erro);

const submetida = (): Admissao => passo(passo(nova(), "abrir", {}, depois(0, 1), "Ana"), "submeter", { dados: { nif: "123456789" } }, depois(0, 2), "Ana");
const comContrato = (): Admissao => passo(passo(submetida(), "aprovar"), "gerarContrato", { modeloId: "mod-contrato", documentoId: "d1", titulo: "Contrato", linhas: ["a"] });
const assinada = (): Admissao => passo(comContrato(), "assinarContrato", { nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: true }, depois(1), "Ana Silva");

describe("admissão: o caminho completo", () => {
  it("percorre os estados do convite ao acesso ativo", () => {
    let adm = nova();
    expect(adm.estado).toBe("convite_enviado");
    adm = passo(adm, "abrir");
    expect(adm.estado).toBe("a_preencher");
    adm = passo(adm, "submeter");
    expect(adm.estado).toBe("submetida");
    adm = passo(adm, "aprovar");
    expect(adm.estado).toBe("aprovada");
    adm = passo(adm, "gerarContrato", { modeloId: "m", documentoId: "d", titulo: "C", linhas: [] });
    expect(adm.estado).toBe("contrato_por_assinar");
    adm = passo(adm, "assinarContrato", { nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: true });
    expect(adm.estado).toBe("contrato_assinado");
    adm = passo(adm, "enviarCredenciais", { email: "ana@empresa.pt", roleId: "papel-chefia" });
    expect(adm.estado).toBe("acesso_enviado");
    adm = passo(adm, "ativarAcesso");
    expect(adm.estado).toBe("acesso_ativo");
    expect(adm.login.revogadoEm).not.toBeNull();
  });

  it("não altera a admissão de partida e acrescenta um evento por passo, com quem, quando e motivo", () => {
    const antes = nova();
    const congelada = JSON.stringify(antes);
    const depoisDe = passo(antes, "abrir", {}, depois(0, 3), "Ana");
    expect(JSON.stringify(antes)).toBe(congelada);
    expect(depoisDe.historico).toHaveLength(2);
    expect(depoisDe.historico[1]).toMatchObject({ acao: "abrir", para: "a_preencher", por: "Ana", motivo: null });
    expect(depoisDe.historico[1].em).toBe(depois(0, 3).toISOString());
    const rejeitada = passo(submetida(), "rejeitar", { motivo: "  Documentos falsos " });
    expect(rejeitada.historico.at(-1)).toMatchObject({ acao: "rejeitar", para: "rejeitada", por: "Sofia Rebelo", motivo: "Documentos falsos" });
  });
});

describe("admissão: transições inválidas", () => {
  it.each([
    ["aprovar", nova],
    ["gerarContrato", submetida],
    ["assinarContrato", submetida],
    ["devolver", nova],
    ["submeter", submetida],
    ["ativarAcesso", assinada],
  ] as const)("%s não se pode fazer neste estado", (acao, base) => {
    expect(erroDe(aplicar(base(), acao, { comentarios: { nif: "x" }, nome: "A", nomeEsperado: "A", aceite: true, modeloId: "m" }, ctx()))).toBe("transicao_invalida");
  });

  it("uma admissão rejeitada ou com acesso ativo já não aceita nada", () => {
    const rejeitada = passo(submetida(), "rejeitar", { motivo: "não serve" });
    for (const acao of ["aprovar", "devolver", "reenviarLink", "renovarLogin", "submeter"] as const) {
      expect(aplicar(rejeitada, acao, { comentarios: { a: "b" } }, ctx()).ok, acao).toBe(false);
    }
    const ativa = passo(passo(assinada(), "enviarCredenciais", { email: "a@b.pt", roleId: "r" }), "ativarAcesso");
    expect(acoesPossiveis(ativa, T0)).toEqual([]);
    expect(erroDe(aplicar(ativa, "enviarCredenciais", { email: "a@b.pt", roleId: "r" }, ctx()))).toBe("transicao_invalida");
  });
});

describe("admissão: o login temporário de 7 dias", () => {
  it("serve até aos 7 dias e expira a partir daí, só enquanto a pessoa ainda precisa dele", () => {
    const adm = passo(nova(), "abrir");
    expect(DIAS_LOGIN).toBe(7);
    expect(estaExpirada(adm, depois(6, 23))).toBe(false);
    expect(estaExpirada(adm, depois(7))).toBe(true);
    expect(estadoVisivel(adm, depois(8))).toBe("expirado");
    expect(estadoVisivel(adm, depois(3))).toBe("a_preencher");
    // Submetida, aprovada e assinada esperam pelo RH: não expiram.
    expect(estaExpirada(submetida(), depois(30))).toBe(false);
    expect(estaExpirada(assinada(), depois(30))).toBe(false);
    // O contrato por assinar precisa do login: expira.
    expect(estaExpirada(comContrato(), depois(30))).toBe(true);
  });

  it("diz o prazo que resta: em dias, em horas quando falta menos de um dia, ou expirado", () => {
    const adm = nova();
    expect(prazoDoLogin(adm, T0)).toEqual({ tipo: "dias", n: 7 });
    expect(prazoDoLogin(adm, depois(4, 1))).toEqual({ tipo: "dias", n: 3 });
    expect(prazoDoLogin(adm, depois(6, 19))).toEqual({ tipo: "horas", n: 5 });
    expect(prazoDoLogin(adm, depois(9))).toEqual({ tipo: "expirado" });
    expect(prazoDoLogin(submetida(), T0).tipo).toBe("dias");
  });

  it("com o login expirado a pessoa já não faz nada", () => {
    const adm = passo(nova(), "abrir");
    const fora = depois(8);
    expect(erroDe(aplicar(adm, "submeter", {}, ctx(fora)))).toBe("expirado");
    expect(erroDe(aplicar(comContrato(), "assinarContrato", { nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: true }, ctx(fora)))).toBe("expirado");
    expect(guardarRascunho(adm, { nif: "1" }, fora)).toBe(adm);
  });

  it("renovar gera um login novo por 7 dias e invalida o anterior; só se renova o que expirou", () => {
    const adm = passo(nova(), "abrir");
    expect(erroDe(aplicar(adm, "renovarLogin", {}, ctx(depois(2))))).toBe("nao_expirado");
    const fora = depois(9);
    const renovada = passo(adm, "renovarLogin", {}, fora);
    expect(renovada.login.token).not.toBe("tok-1");
    expect(renovada.login.anteriores).toEqual(["tok-1"]);
    expect(renovada.login.expiraEm).toBe(depois(16).toISOString());
    expect(estaExpirada(renovada, fora)).toBe(false);
    expect(renovada.estado).toBe("a_preencher");
    // O link antigo já não serve; o novo serve.
    expect(vistaPublica(renovada, false, fora)).toBe("revogada");
    expect(vistaPublica(renovada, true, fora)).toBe("preencher");
  });

  it("reenviar o link (ainda dentro do prazo) também invalida o anterior, e só há um link ativo", () => {
    const um = passo(nova(), "reenviarLink");
    const dois = passo(um, "reenviarLink", {}, depois(1));
    expect(dois.login.anteriores).toEqual(["tok-1", um.login.token]);
    expect(new Set([dois.login.token, ...dois.login.anteriores]).size).toBe(3);
    expect(erroDe(aplicar(nova(), "reenviarLink", {}, ctx(depois(8))))).toBe("expirado");
  });

  it("guardar rascunho só vale enquanto a ficha é da pessoa (não depois de submetida)", () => {
    const adm = passo(nova(), "abrir");
    const guardado = guardarRascunho(adm, { nif: "123" }, depois(1));
    expect(guardado.rascunho).toEqual({ nif: "123" });
    expect(guardado.rascunhoEm).toBe(depois(1).toISOString());
    expect(guardarRascunho(submetida(), { nif: "999" }, T0)).toEqual(submetida());
  });
});

describe("admissão: aprovar, devolver e rejeitar", () => {
  it("devolver exige comentários, mantém o mesmo login e renova o prazo a 7 dias", () => {
    const adm = submetida();
    expect(erroDe(aplicar(adm, "devolver", { comentarios: {} }, ctx(depois(2))))).toBe("sem_comentarios");
    expect(erroDe(aplicar(adm, "devolver", { comentarios: { nif: "   " } }, ctx(depois(2))))).toBe("sem_comentarios");
    const devolvida = passo(adm, "devolver", { comentarios: { nif: " NIF errado ", iban: "" } }, depois(5));
    expect(devolvida.estado).toBe("devolvida");
    expect(devolvida.comentarios).toEqual({ nif: "NIF errado" });
    expect(devolvida.login.token).toBe(adm.login.token);
    expect(devolvida.login.expiraEm).toBe(depois(12).toISOString());
    expect(devolvida.submetidaEm).toBeNull();
    expect(camposEditaveis(devolvida)).toEqual(["nif"]);
    expect(vistaPublica(devolvida, true, depois(6))).toBe("preencher");
  });

  it("depois de devolvida volta a «a preencher» e pode submeter outra vez", () => {
    const devolvida = passo(submetida(), "devolver", { comentarios: { nif: "x" } });
    const retomada = passo(devolvida, "retomar");
    expect(retomada.estado).toBe("a_preencher");
    expect(retomada.comentarios).toEqual({ nif: "x" });
    const outra = passo(retomada, "submeter", { dados: { nif: "987654321" } });
    expect(outra.estado).toBe("submetida");
    expect(outra.dadosSubmetidos.nif).toBe("987654321");
    expect(outra.comentarios).toEqual({});
  });

  it("rejeitar pede um motivo de pelo menos 3 caracteres, encerra e revoga o login", () => {
    expect(erroDe(aplicar(submetida(), "rejeitar", { motivo: "ab" }, ctx()))).toBe("motivo_curto");
    expect(erroDe(aplicar(submetida(), "rejeitar", { motivo: "  a " }, ctx()))).toBe("motivo_curto");
    expect(erroDe(aplicar(submetida(), "rejeitar", {}, ctx()))).toBe("motivo_curto");
    const r = passo(submetida(), "rejeitar", { motivo: "Sem vaga" });
    expect(r.estado).toBe("rejeitada");
    expect(r.motivoRejeicao).toBe("Sem vaga");
    expect(r.login.revogadoEm).not.toBeNull();
    expect(vistaPublica(r, true, T0)).toBe("revogada");
    expect(estadoVisivel(r, depois(30))).toBe("rejeitada");
  });
});

describe("admissão: contrato e assinatura", () => {
  it("gerar o contrato exige um modelo e renova o prazo", () => {
    const aprovada = passo(submetida(), "aprovar", {}, depois(5));
    expect(erroDe(aplicar(aprovada, "gerarContrato", {}, ctx(depois(5))))).toBe("modelo_obrigatorio");
    const gerada = passo(aprovada, "gerarContrato", { modeloId: "m", documentoId: "d1", titulo: "C", linhas: ["l"] }, depois(5));
    expect(gerada.contrato).toMatchObject({ modeloId: "m", documentoId: "d1", titulo: "C", linhas: ["l"], assinadoEm: null, recusa: null });
    expect(gerada.login.expiraEm).toBe(depois(12).toISOString());
    expect(vistaPublica(gerada, true, depois(6))).toBe("contrato");
  });

  it("assinar confirma o nome completo e exige aceitar; o contrato assinado fica imutável", () => {
    const adm = comContrato();
    expect(erroDe(aplicar(adm, "assinarContrato", { nome: "Ana", nomeEsperado: "Ana Silva", aceite: true }, ctx()))).toBe("nome_nao_confere");
    expect(erroDe(aplicar(adm, "assinarContrato", { nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: false }, ctx()))).toBe("aceite_obrigatorio");
    expect(erroDe(aplicar(adm, "assinarContrato", { nome: "  ana   SILVA ", nomeEsperado: "Ana Silva", aceite: true }, ctx())) ).toBeNull();
    const feita = assinada();
    expect(feita.contrato?.assinadoEm).not.toBeNull();
    expect(feita.contrato?.assinaturaNome).toBe("Ana Silva");
    for (const acao of ["assinarContrato", "recusarContrato", "anularContrato", "reenviarContrato", "gerarContrato"] as const) {
      expect(erroDe(aplicar(feita, acao, { motivo: "xxx", nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: true, modeloId: "m" }, ctx())), acao).toBe("transicao_invalida");
    }
    expect(vistaPublica(feita, true, depois(30))).toBe("assinado");
  });

  it("recusar assinar pede motivo, fica onde está e o RH reenvia (link novo) ou anula", () => {
    expect(erroDe(aplicar(comContrato(), "recusarContrato", { motivo: "x" }, ctx()))).toBe("motivo_curto");
    const recusada = passo(comContrato(), "recusarContrato", { motivo: "Salário errado" }, depois(1), "Ana");
    expect(recusada.estado).toBe("contrato_por_assinar");
    expect(recusada.contrato?.recusa?.motivo).toBe("Salário errado");
    expect(recusada.historico.at(-1)).toMatchObject({ acao: "recusarContrato", por: "Ana", motivo: "Salário errado" });
    const reenviada = passo(recusada, "reenviarContrato");
    expect(reenviada.contrato?.recusa).toBeNull();
    expect(reenviada.login.token).not.toBe(recusada.login.token);
    const anulada = passo(recusada, "anularContrato", { motivo: "Vamos corrigir o salário" });
    expect(anulada.estado).toBe("aprovada");
    expect(anulada.contrato).toBeNull();
    expect(erroDe(aplicar(recusada, "anularContrato", {}, ctx()))).toBe("motivo_curto");
  });
});

describe("admissão: credenciais só com o contrato assinado", () => {
  it("sem contrato assinado não se enviam, em nenhum estado anterior", () => {
    for (const adm of [nova(), submetida(), passo(submetida(), "aprovar"), comContrato()]) {
      expect(erroDe(aplicar(adm, "enviarCredenciais", { email: "a@b.pt", roleId: "r" }, ctx())), adm.estado).toBe("contrato_nao_assinado");
    }
  });

  it("com o contrato assinado pedem e-mail válido e role; o role confirmado fica na admissão", () => {
    expect(erroDe(aplicar(assinada(), "enviarCredenciais", { email: "sem-arroba", roleId: "r" }, ctx()))).toBe("email_invalido");
    expect(erroDe(aplicar(assinada(), "enviarCredenciais", { email: "a@b.pt", roleId: "" }, ctx()))).toBe("role_obrigatorio");
    const enviada = passo(assinada(), "enviarCredenciais", { email: " ana@empresa.pt ", roleId: "papel-chefia" });
    expect(enviada.roleId).toBe("papel-chefia");
    expect(enviada.credenciais).toMatchObject({ email: "ana@empresa.pt", roleId: "papel-chefia", ativoEm: null });
    const ativa = passo(enviada, "ativarAcesso", {}, depois(2), "Ana");
    expect(ativa.credenciais?.ativoEm).toBe(depois(2).toISOString());
    expect(vistaPublica(ativa, true, depois(3))).toBe("encerrada");
  });
});

describe("admissão: o que se oferece em cada estado", () => {
  it("as ações possíveis e a ação da linha seguem o estado", () => {
    expect(acoesPossiveis(submetida(), T0)).toEqual(["aprovar", "devolver", "rejeitar"]);
    expect(acoesPossiveis(passo(submetida(), "aprovar"), T0)).toEqual(["gerarContrato"]);
    expect(acoesPossiveis(comContrato(), T0)).toEqual(["reenviarContrato", "anularContrato"]);
    expect(acoesPossiveis(assinada(), T0)).toEqual(["enviarCredenciais"]);
    expect(acoesPossiveis(nova(), depois(8))).toEqual(["renovarLogin"]);
    expect(acoesPossiveis(comContrato(), depois(9))).toEqual(["renovarLogin", "anularContrato"]);
    expect(acaoDaLinha(submetida(), T0)).toBe("rever");
    expect(acaoDaLinha(assinada(), T0)).toBe("enviarCredenciais");
    expect(acaoDaLinha(nova(), depois(8))).toBe("renovarLogin");
    expect(acaoDaLinha(nova(), T0)).toBe("reenviarLink");
    expect(acaoDaLinha(comContrato(), T0)).toBe("reenviarContrato");
  });

  it("a faixa de progresso e a página pública seguem o estado", () => {
    expect(passoDaFaixa("convite_enviado")).toBe(0);
    expect(passoDaFaixa("devolvida")).toBe(1);
    expect(passoDaFaixa("submetida")).toBe(2);
    expect(passoDaFaixa("contrato_por_assinar")).toBe(3);
    expect(passoDaFaixa("contrato_assinado")).toBe(4);
    expect(passoDaFaixa("acesso_ativo")).toBe(5);
    expect(vistaPublica(null, false, T0)).toBe("invalida");
    expect(vistaPublica(submetida(), true, T0)).toBe("submetida");
    expect(vistaPublica(nova(), true, depois(8))).toBe("expirada");
    expect(vistaPublica(nova(), true, T0)).toBe("preencher");
  });
});
