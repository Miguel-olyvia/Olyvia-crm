import { describe, expect, it } from "vitest";
import { camposDeAdmissaoIniciais } from "@/components/rh-exemplo/dados/gestaoExemplo";
import { abaDoCampo } from "./ids";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "./tiposNova";
import { idsObrigatorios, primeiroProblema, problemasDaNova, resumoDeProblemas, type OpcoesValidacao } from "./validacao";

const HOJE = "2026-10-14";
const CONFIG = camposDeAdmissaoIniciais();
const SEM_CONFIG: OpcoesValidacao = { comConvite: false, hoje: HOJE };
const COM_CONFIG: OpcoesValidacao = { comConvite: false, config: CONFIG, hoje: HOJE };

/** O mínimo que o RH tem de escrever: nome, cargo, tipo de contrato, subsídio e duodécimos. */
function minimo(): ValoresNovaPessoa {
  let v = valoresIniciais(HOJE);
  v = comPatch(v, "geral", { primeiro_nome: "Ana", apelido: "Sousa" });
  v = comPatch(v, "laborais", { cargo_id: "cargo-1" });
  return comPatch(v, "contrato", { tipo_contrato: "sem_termo", subsidio: "0", duodecimos_pct: "50" });
}

const ids = (v: ValoresNovaPessoa, o: OpcoesValidacao = SEM_CONFIG): string[] => problemasDaNova(v, o).map((p) => p.campoId);

describe("problemasDaNova: campos do RH e nome", () => {
  it("aceita o mínimo quando a configuração ainda não chegou", () => {
    expect(ids(minimo())).toEqual([]);
  });

  it("pede o nome, o cargo e os campos só do RH (tipo de contrato, subsídio e duodécimos)", () => {
    expect(ids(valoresIniciais(HOJE))).toEqual([
      "hr-novo-primeiro-nome", "hr-novo-apelido", "hr-novo-cargo", "hr-novo-tipo-contrato", "hr-novo-subsidio", "hr-novo-duodecimos",
    ]);
  });

  it("pede a data de admissão se for apagada, e recusa uma data que não existe", () => {
    expect(ids(comPatch(minimo(), "laborais", { data_admissao: "" }))).toEqual(["hr-novo-data-admissao"]);
    expect(ids(comPatch(minimo(), "laborais", { data_admissao: "2026-02-31" }))).toEqual(["hr-novo-data-admissao"]);
  });

  it("o subsídio 0 conta como resposta, e um subsídio negativo é erro", () => {
    expect(ids(minimo())).not.toContain("hr-novo-subsidio");
    expect(ids(comPatch(minimo(), "contrato", { subsidio: "-3" }))).toContain("hr-novo-subsidio");
  });

  it("num contrato a termo certo o fim é obrigatório e não pode ser antes do início", () => {
    const termo = comPatch(minimo(), "contrato", { tipo_contrato: "termo_certo", data_inicio: "2026-10-01" });
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
    expect(ids(comPatch(minimo(), "pessoais", { data_nascimento: "2030-01-01" }))).toEqual(
      expect.arrayContaining(["hr-novo-data-nascimento", "hr-novo-data-admissao"]),
    );
    expect(ids(comPatch(minimo(), "pessoais", { data_nascimento: "1990-05-17" }))).toEqual([]);
    expect(ids(comPatch(minimo(), "pessoais", { data_nascimento: "17/05/1990" }))).toEqual(["hr-novo-data-nascimento"]);
  });

  it("valida telefones, código postal e e-mails só quando preenchidos", () => {
    // O nome do contacto de emergência está preenchido: aqui só interessa o formato (a regra do contacto completo vem abaixo).
    let v = comPatch(minimo(), "pessoais", { telefone_pessoal: "123", morada_codigo_postal: "1000", emergencia_nome: "Rui", emergencia_telefone: "12" });
    v = comPatch(v, "geral", { email_trabalho: "x@", telefone_trabalho: "abc" });
    v = comPatch(v, "extra", { emergencia_email: "y@" });
    expect(new Set(ids(v))).toEqual(new Set([
      "hr-novo-telefone-pessoal", "hr-novo-morada-codigo-postal", "hr-novo-emergencia-telefone", "hr-novo-email-trabalho",
      "hr-novo-telefone-trabalho", "hr-novo-emergencia-email",
    ]));
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
    const v = comPatch(comPatch(valoresIniciais(HOJE), "pessoais", { telefone_pessoal: "1" }), "extra", { sindicato_quota: "500" });
    const problemas = problemasDaNova(v, SEM_CONFIG);
    const resumo = resumoDeProblemas(problemas);
    expect(resumo.total).toBe(problemas.length);
    expect(resumo.porAba).toMatchObject({ dados: 2, contacto: 1, contrato: 2, retribuicao: 2, outros: 1, acesso: 0 });
    expect(primeiroProblema(problemas)?.campoId).toBe("hr-novo-primeiro-nome");
    expect(abaDoCampo("hr-novo-iban-que-nao-existe")).toBe("dados");
  });
});

describe("idsObrigatorios", () => {
  it("o RH preenche: os fixos mais os da configuração; a enviar convite: só os fixos e o e-mail pessoal", () => {
    const agora = idsObrigatorios(minimo(), COM_CONFIG);
    expect(agora.has("hr-novo-cargo") && agora.has("hr-novo-data-admissao") && agora.has("hr-novo-subsidio")).toBe(true);
    expect(agora.has("hr-novo-nif") && agora.has("hr-novo-genero")).toBe(true);
    const convite = idsObrigatorios(minimo(), { ...COM_CONFIG, comConvite: true });
    expect(convite.has("hr-novo-genero")).toBe(false);
    expect(convite.has("hr-novo-email-pessoal")).toBe(true);
  });

  it("uma secção adiada para o convite deixa de ser obrigatória aqui", () => {
    const v = comPatch(minimo(), "extra", { noConvite: { morada: true } });
    expect(idsObrigatorios(v, COM_CONFIG).has("hr-novo-morada-linha1")).toBe(false);
  });
});
