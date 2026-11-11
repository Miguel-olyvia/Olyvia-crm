import { describe, expect, it } from "vitest";
import { camposDeAdmissaoIniciais } from "@/components/rh-exemplo/dados/gestaoExemplo";
import { abaDoCampo } from "./ids";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "./tiposNova";
import { idsObrigatorios, OBRIGATORIOS_FIXOS, primeiroProblema, problemasDaNova, resumoDeProblemas, type OpcoesValidacao } from "./validacao";

const HOJE = "2026-10-14";
const CONFIG = camposDeAdmissaoIniciais();
const SEM_CONFIG: OpcoesValidacao = { comConvite: false, hoje: HOJE };
const COM_CONFIG: OpcoesValidacao = { comConvite: false, config: CONFIG, hoje: HOJE };

/** O mínimo que o RH tem de escrever: só o nome. Cargo, contrato e retribuição são opcionais na admissão. */
function minimo(): ValoresNovaPessoa {
  let v = valoresIniciais();
  v = comPatch(v, "geral", { primeiro_nome: "Ana", apelido: "Sousa" });
  return comPatch(v, "pessoais", { telefone_pessoal: "+351912345678" });
}

/** O mínimo mais um contrato completo (tipo e início) e o cargo: aí os duodécimos também se exigem. */
function comContratoECargo(): ValoresNovaPessoa {
  const v = comPatch(minimo(), "laborais", { cargo_id: "cargo-1" });
  return comPatch(v, "contrato", { tipo_contrato: "sem_termo", data_inicio: "2026-10-01", duodecimos_pct: "50" });
}

/** O mínimo mais um contrato completo, sem cargo: não há retribuição a definir. */
function comContratoSemCargo(): ValoresNovaPessoa {
  return comPatch(minimo(), "contrato", { tipo_contrato: "sem_termo", data_inicio: "2026-10-01" });
}

const ids = (v: ValoresNovaPessoa, o: OpcoesValidacao = SEM_CONFIG): string[] => problemasDaNova(v, o).map((p) => p.campoId);

describe("problemasDaNova: só o nome é obrigatório na admissão", () => {
  it("aceita o mínimo (nome) quando a configuração ainda não chegou: sem cargo, sem contrato, sem duodécimos", () => {
    expect(ids(minimo())).toEqual([]);
  });

  it("o formulário vazio pede só o nome: cargo, tipo de contrato, data de início e duodécimos já não se exigem", () => {
    expect(ids(valoresIniciais())).toEqual(["hr-novo-primeiro-nome", "hr-novo-apelido"]);
  });

  it("os obrigatórios fixos são só os nomes", () => {
    expect([...OBRIGATORIOS_FIXOS].sort()).toEqual(["hr-novo-apelido", "hr-novo-primeiro-nome"]);
  });

  it("sem contrato, uma data de início por preencher não é erro, mas uma data que não existe é", () => {
    expect(ids(minimo())).not.toContain("hr-novo-data-inicio");
    expect(ids(comContratoECargo())).toEqual([]);
    expect(ids(comPatch(comContratoECargo(), "contrato", { data_inicio: "2026-02-31" }))).toEqual(["hr-novo-data-inicio"]);
  });

  it("já não há um campo «data de admissão» à parte", () => {
    expect(ids(comPatch(comContratoECargo(), "contrato", { data_inicio: "" }))).not.toContain("hr-novo-data-admissao");
    expect(idsObrigatorios(minimo(), SEM_CONFIG).has("hr-novo-data-admissao")).toBe(false);
  });

  it("o subsídio já não é campo do formulário", () => {
    expect(ids(valoresIniciais())).not.toContain("hr-novo-subsidio");
    expect(ids(comContratoECargo())).not.toContain("hr-novo-subsidio");
  });
});

describe("problemasDaNova: o contrato é opcional, mas a meio não", () => {
  it("com um campo do contrato preenchido, o tipo de contrato e a data de início passam a obrigatórios JUNTOS", () => {
    const soHoras = comPatch(minimo(), "contrato", { horas_trabalho: "40" });
    expect(ids(soHoras)).toEqual(["hr-novo-tipo-contrato", "hr-novo-data-inicio"]);
    const soTipo = comPatch(minimo(), "contrato", { tipo_contrato: "sem_termo" });
    expect(ids(soTipo)).toEqual(["hr-novo-data-inicio"]);
    const soData = comPatch(minimo(), "contrato", { data_inicio: "2026-10-01" });
    expect(ids(soData)).toEqual(["hr-novo-tipo-contrato"]);
  });

  it("os erros dizem «obrigatório» no campo certo", () => {
    const soAntiguidade = comPatch(minimo(), "contrato", { data_antiguidade: "2020-01-01" });
    expect(problemasDaNova(soAntiguidade, SEM_CONFIG)).toEqual([
      { campoId: "hr-novo-tipo-contrato", mensagemKey: "hr.form.erroObrigatorio" },
      { campoId: "hr-novo-data-inicio", mensagemKey: "hr.form.erroObrigatorio" },
    ]);
  });

  it("um campo do contrato nos extras (categoria, renovável, isenção) também conta", () => {
    expect(ids(comPatch(minimo(), "extra", { renovavel: "sim" }))).toEqual(["hr-novo-tipo-contrato", "hr-novo-data-inicio"]);
  });

  it("os valores por omissão do regime não obrigam a contrato", () => {
    expect(ids(minimo())).toEqual([]);
  });

  it("com contrato e sem cargo, os duodécimos não se exigem (não há retribuição a definir)", () => {
    expect(ids(comContratoSemCargo())).toEqual([]);
  });

  it("com cargo mas sem contrato, os duodécimos também não se exigem", () => {
    expect(ids(comPatch(minimo(), "laborais", { cargo_id: "cargo-1" }))).toEqual([]);
  });

  it("com cargo e contrato, os duodécimos são obrigatórios", () => {
    const semDuodecimos = comPatch(comContratoECargo(), "contrato", { duodecimos_pct: "" });
    expect(ids(semDuodecimos)).toEqual(["hr-novo-duodecimos"]);
  });

  it("a antiguidade do contrato não pode ser posterior à contratação, e tem de ser uma data que existe", () => {
    expect(ids(comPatch(comContratoECargo(), "contrato", { data_antiguidade: "2020-01-01" }))).toEqual([]);
    expect(ids(comPatch(comContratoECargo(), "contrato", { data_antiguidade: "2026-10-01" }))).toEqual([]);
    const depois = problemasDaNova(comPatch(comContratoECargo(), "contrato", { data_inicio: "2026-10-01", data_antiguidade: "2026-10-02" }), SEM_CONFIG);
    expect(depois).toEqual([{ campoId: "hr-novo-data-antiguidade", mensagemKey: "rhNova.erro.antiguidadeDepoisContratacao" }]);
    expect(ids(comPatch(comContratoECargo(), "contrato", { data_antiguidade: "2026-02-31" }))).toEqual(["hr-novo-data-antiguidade"]);
  });

  it("num contrato a termo certo o fim é obrigatório e não pode ser antes do início", () => {
    const termo = comPatch(comContratoECargo(), "contrato", { tipo_contrato: "termo_certo", data_inicio: "2026-10-01" });
    expect(ids(termo)).toEqual(["hr-novo-data-fim"]);
    expect(ids(comPatch(termo, "contrato", { data_fim: "2026-09-01" }))).toEqual(["hr-novo-data-fim"]);
    expect(ids(comPatch(termo, "contrato", { data_fim: "2027-04-01" }))).toEqual([]);
  });
});

describe("problemasDaNova: NIF, NISS e conta bancária", () => {
  it("NIF e NISS: com a configuração por omissão pede um dos dois, e basta um", () => {
    expect(ids(minimo(), COM_CONFIG)).toEqual(expect.arrayContaining(["hr-novo-nif", "hr-novo-niss"]));
    const soNif = comPatch(minimo(), "pessoais", { nif: "123456789" });
    expect(ids(soNif, COM_CONFIG)).not.toContain("hr-novo-nif");
    expect(ids(soNif, COM_CONFIG)).not.toContain("hr-novo-niss");
    const soNiss = comPatch(minimo(), "pessoais", { niss: "12345678902" });
    expect(ids(soNiss, COM_CONFIG)).not.toContain("hr-novo-niss");
    expect(ids(soNiss, COM_CONFIG)).not.toContain("hr-novo-nif");
  });

  it("recusa NIF e NISS com o formato ou o dígito de controlo errados, e aceita os certos com espaços", () => {
    const errado = comPatch(minimo(), "pessoais", { nif: "123456780", niss: "12345678900" });
    expect(ids(errado)).toEqual(["hr-novo-nif", "hr-novo-niss"]);
    expect(ids(comPatch(minimo(), "pessoais", { nif: "123", niss: "1234" }))).toEqual(["hr-novo-nif", "hr-novo-niss"]);
    expect(ids(comPatch(minimo(), "pessoais", { nif: "123 456 789", niss: "12345678902" }))).toEqual([]);
  });

  it("valida o IBAN (mod 97) e o BIC só quando preenchidos", () => {
    expect(ids(comPatch(minimo(), "pessoais", { conta_numero: "PT50 0002 0123 1234 5678 9015 4" }))).toEqual([]);
    expect(ids(comPatch(minimo(), "pessoais", { conta_numero: "PT50 0002 0123 1234 5678 9015 5" }))).toEqual(["hr-novo-conta-numero"]);
    expect(ids(comPatch(minimo(), "pessoais", { conta_bic: "XX" }))).toEqual(["hr-novo-conta-bic"]);
  });
});

describe("problemasDaNova: configuração da admissão e convite", () => {
  it("com a configuração por omissão e sem convite, o RH tem de preencher os campos da posição «no convite»", () => {
    const erros = ids(minimo(), COM_CONFIG);
    expect(erros).toEqual(expect.arrayContaining([
      "hr-novo-data-nascimento", "hr-novo-genero", "hr-novo-morada-linha1", "hr-novo-conta-numero", "hr-novo-tamanho-cima",
    ]));
  });

  it("um campo posto na posição «na ficha» deixa de bloquear", () => {
    const config = CONFIG.map((c) => (c.codigo === "genero" ? { ...c, posicao: "ficha" as const } : c));
    expect(ids(minimo(), { ...COM_CONFIG, config })).not.toContain("hr-novo-genero");
  });

  it("«Criar e enviar convite» só exige o e-mail pessoal (a pessoa preenche o resto)", () => {
    const convite: OpcoesValidacao = { ...COM_CONFIG, comConvite: true };
    expect(ids(minimo(), convite)).toEqual(["hr-novo-email-pessoal"]);
    expect(ids(comPatch(minimo(), "pessoais", { email_pessoal: "ana@x.pt" }), convite)).toEqual([]);
    expect(ids(comPatch(minimo(), "pessoais", { email_pessoal: "ana@" }), convite)).toEqual(["hr-novo-email-pessoal"]);
  });

  it("«Pedir à pessoa no convite» numa secção tira-lhe os obrigatórios, mas não os erros de formato", () => {
    const adiada = comPatch(minimo(), "extra", { noConvite: { identificacao: true, documentos: true } });
    const erros = ids(adiada, COM_CONFIG);
    expect(erros).not.toContain("hr-novo-genero");
    expect(erros).not.toContain("hr-novo-nif");
    expect(erros).toContain("hr-novo-morada-linha1");
    expect(ids(comPatch(adiada, "pessoais", { nif: "123456780" }), COM_CONFIG)).toContain("hr-novo-nif");
  });
});

describe("problemasDaNova: datas, contactos e acesso", () => {
  it("datas coerentes: nascimento no futuro, ou depois da admissão, é erro", () => {
    expect(ids(comPatch(comContratoECargo(), "pessoais", { data_nascimento: "2030-01-01" }))).toEqual(
      expect.arrayContaining(["hr-novo-data-nascimento", "hr-novo-data-inicio"]),
    );
    // Sem contrato não há contratação com que comparar: só o nascimento no futuro é erro.
    expect(ids(comPatch(minimo(), "pessoais", { data_nascimento: "2030-01-01" }))).toEqual(["hr-novo-data-nascimento"]);
    expect(ids(comPatch(minimo(), "pessoais", { data_nascimento: "1990-05-17" }))).toEqual([]);
    expect(ids(comPatch(minimo(), "pessoais", { data_nascimento: "17/05/1990" }))).toEqual(["hr-novo-data-nascimento"]);
  });

  it("valida telefones, código postal e e-mails só quando preenchidos", () => {
    // O nome do contacto de emergência está preenchido: aqui só interessa o formato (a regra do contacto completo vem abaixo).
    let v = comPatch(minimo(), "pessoais", { telefone_pessoal: "123", morada_codigo_postal: "1000", emergencia_nome: "Rui", emergencia_telefone: "12" });
    v = comPatch(v, "geral", { email_trabalho: "x@", telefone_trabalho: "abc" });
    v = comPatch(v, "extra", { emergencia_email: "y@" });
    // O e-mail e o telefone de trabalho já não se pedem aqui: mesmo malformados não dão erro num campo invisível.
    expect(new Set(ids(v))).toEqual(new Set([
      "hr-novo-telefone-pessoal", "hr-novo-morada-codigo-postal", "hr-novo-emergencia-telefone", "hr-novo-emergencia-email",
    ]));
    const semTelefone = comPatch(minimo(), "pessoais", { telefone_pessoal: "" });
    expect(ids(semTelefone)).toEqual([]);
    const bem = comPatch(minimo(), "pessoais", { telefone_pessoal: "912 345 678", morada_codigo_postal: "1000-001" });
    expect(ids(bem)).toEqual([]);
  });

  it("o contacto de emergência é tudo ou nada: com qualquer dado pede o nome e o telefone; sem nada, não pede nada", () => {
    expect(ids(minimo())).toEqual([]);
    const soTelefone = comPatch(minimo(), "pessoais", { emergencia_telefone: "912 345 678" });
    expect(ids(soTelefone)).toEqual(["hr-novo-emergencia-nome"]);
    const soNome = comPatch(minimo(), "pessoais", { emergencia_nome: "Rui" });
    expect(ids(soNome)).toEqual(["hr-novo-emergencia-telefone"]);
    const soEmail = comPatch(minimo(), "extra", { emergencia_email: "rui@x.pt" });
    expect(new Set(ids(soEmail))).toEqual(new Set(["hr-novo-emergencia-nome", "hr-novo-emergencia-telefone"]));
    const completo = comPatch(minimo(), "pessoais", { emergencia_nome: "Rui", emergencia_telefone: "912 345 678" });
    expect(ids(completo)).toEqual([]);
  });

  it("com acesso à plataforma pede o grupo e um e-mail válido; sem acesso, não", () => {
    expect(ids(minimo())).toEqual([]);
    const acesso = comPatch(minimo(), "extra", { criar_acesso: true });
    expect(ids(acesso)).toEqual(["hr-novo-papel", "hr-novo-email-acesso"]);
    const quase = comPatch(comPatch(acesso, "acesso", { role_id: "papel-1" }), "extra", { email_acesso: "a@" });
    expect(problemasDaNova(quase, SEM_CONFIG)).toEqual([{ campoId: "hr-novo-email-acesso", mensagemKey: "hr.form.erroEmail" }]);
  });

  it("saúde e sindicato: percentagens entre 0 e 100", () => {
    expect(ids(comPatch(minimo(), "extra", { saude_incapacidade: "150", sindicato_quota: "-1" }))).toEqual([
      "hr-novo-saude-incapacidade", "hr-novo-sindicato-quota",
    ]);
    expect(ids(comPatch(minimo(), "extra", { saude_incapacidade: "60", sindicato_quota: "1,5" }))).toEqual([]);
  });
});

describe("resumo e foco", () => {
  it("conta os erros por aba e dá o primeiro pela ordem do ecrã (a aba mais à esquerda)", () => {
    const v = comPatch(comPatch(valoresIniciais(), "pessoais", { telefone_pessoal: "1" }), "extra", { sindicato_quota: "500" });
    const problemas = problemasDaNova(v, SEM_CONFIG);
    const resumo = resumoDeProblemas(problemas);
    expect(resumo.total).toBe(problemas.length);
    expect(resumo.porAba).toMatchObject({ dados: 2, contacto: 1, contrato: 0, retribuicao: 0, outros: 1, acesso: 0 });
    expect(primeiroProblema(problemas)?.campoId).toBe("hr-novo-primeiro-nome");
    expect(abaDoCampo("hr-novo-iban-que-nao-existe")).toBe("dados");
  });
});

describe("idsObrigatorios", () => {
  it("o RH preenche: os nomes mais os da configuração; a enviar convite: só os nomes e o e-mail pessoal", () => {
    const agora = idsObrigatorios(minimo(), COM_CONFIG);
    expect(agora.has("hr-novo-primeiro-nome") && agora.has("hr-novo-apelido")).toBe(true);
    expect(agora.has("hr-novo-nif") && agora.has("hr-novo-genero")).toBe(true);
    const convite = idsObrigatorios(minimo(), { ...COM_CONFIG, comConvite: true });
    expect(convite.has("hr-novo-genero")).toBe(false);
    expect(convite.has("hr-novo-email-pessoal")).toBe(true);
  });

  it("cargo, tipo de contrato, data de início e duodécimos não são obrigatórios num formulário sem contrato", () => {
    const agora = idsObrigatorios(comPatch(minimo(), "laborais", { cargo_id: "cargo-1" }), COM_CONFIG);
    for (const id of ["hr-novo-cargo", "hr-novo-tipo-contrato", "hr-novo-data-inicio", "hr-novo-duodecimos"]) expect(agora.has(id), id).toBe(false);
  });

  it("com um campo do contrato, o tipo e a data de início passam a obrigatórios; os duodécimos só com cargo", () => {
    const semCargo = idsObrigatorios(comPatch(minimo(), "contrato", { horas_trabalho: "40" }), SEM_CONFIG);
    expect(semCargo.has("hr-novo-tipo-contrato") && semCargo.has("hr-novo-data-inicio")).toBe(true);
    expect(semCargo.has("hr-novo-duodecimos")).toBe(false);
    expect(semCargo.has("hr-novo-cargo")).toBe(false);
    const comCargo = idsObrigatorios(comContratoECargo(), SEM_CONFIG);
    expect(comCargo.has("hr-novo-duodecimos")).toBe(true);
    expect(comCargo.has("hr-novo-cargo")).toBe(false);
  });

  it("uma secção adiada para o convite deixa de ser obrigatória aqui", () => {
    const v = comPatch(minimo(), "extra", { noConvite: { morada: true } });
    expect(idsObrigatorios(v, COM_CONFIG).has("hr-novo-morada-linha1")).toBe(false);
  });
});
