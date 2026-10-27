// A validação do painel "Nova pessoa": o que o assistente real já valida (nomes, NIF e NISS com dígito de controlo e basta um
// dos dois, IBAN, BIC, números do contrato, obrigatórios pela configuração da admissão) mais as regras de interface que o
// painel acrescenta (datas coerentes, telefones, código postal, campos só do RH). Vazio nunca é erro, salvo nos campos
// obrigatórios; malformado é sempre erro. Funções puras.
import type { ConfiguracaoCampo } from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import { problemasDoRascunho } from "@/components/rh-exemplo/lib/novaPessoa";
import { codigosObrigatoriosDoFormulario, type CodigosIndisponiveis } from "@/components/rh-exemplo/lib/novaPessoaAdmissao";
import { numeroDe } from "@/components/rh-exemplo/lib/numeros";
import { ABAS_NOVA, abaDoCampo, CAMPO_DO_CODIGO, ordemDoCampo, seccaoDoCampo, type AbaNova } from "./ids";
import { textoOuNull, type ValoresNovaPessoa } from "./tiposNova";

export interface ProblemaNova {
  campoId: string;
  mensagemKey: string;
}

export interface OpcoesValidacao {
  /** A criação leva o envio do convite: a pessoa preenche o resto. */
  comConvite: boolean;
  config?: readonly ConfiguracaoCampo[] | null;
  /** AAAA-MM-DD, para decidir o que é "no futuro". */
  hoje: string;
  /** Os códigos que quem cria não pode escrever (banco e fardamento sem a permissão): não se exigem. */
  indisponiveis?: CodigosIndisponiveis;
  /**
   * Quem cria pode ver os grupos de permissões (`roles.view`) e por isso escolher um. `false` não exige o grupo: o campo
   * nem está no ecrã, e um erro num campo que não se vê não se corrige. O acesso fica como pendência, a concluir na ficha.
   * Por omissão (`undefined`) o grupo exige-se.
   */
  papelDisponivel?: boolean;
}

const OBRIGATORIO = "hr.form.erroObrigatorio";
const DATA_INVALIDA = "rhNova.erro.dataInvalida";
const DATA_FUTURA = "rhNova.erro.dataFutura";
const TELEFONE = /^\+?\d{9,15}$/;
const CODIGO_POSTAL = /^\d{4}-\d{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Os campos que são sempre obrigatórios: os do RH (fixos) e o nome. */
export const OBRIGATORIOS_FIXOS: ReadonlySet<string> = new Set([
  "hr-novo-primeiro-nome", "hr-novo-apelido", "hr-novo-cargo", "hr-novo-data-admissao", "hr-novo-tipo-contrato",
  "hr-novo-subsidio", "hr-novo-duodecimos",
]);

/** Uma data ISO que existe de verdade (31 de fevereiro não passa). */
export function dataIsoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

const semSeparadores = (v: string): string => v.replace(/[\s.-]/g, "");

function acrescentar(lista: ProblemaNova[], campoId: string, mensagemKey: string): void {
  lista.push({ campoId, mensagemKey });
}

/** Uma data opcional: se escrita tem de existir e, se `semFuturo`, não pode ser depois de hoje. */
function problemaDeData(campoId: string, valor: string, hoje: string, semFuturo: boolean): ProblemaNova[] {
  if (textoOuNull(valor) === null) return [];
  if (!dataIsoValida(valor)) return [{ campoId, mensagemKey: DATA_INVALIDA }];
  return semFuturo && valor > hoje ? [{ campoId, mensagemKey: DATA_FUTURA }] : [];
}

function problemasDeTelefone(campoId: string, valor: string): ProblemaNova[] {
  if (textoOuNull(valor) === null || TELEFONE.test(semSeparadores(valor))) return [];
  return [{ campoId, mensagemKey: "rhNova.erro.telefone" }];
}

function problemasDeDatasPessoais(v: ValoresNovaPessoa, hoje: string): ProblemaNova[] {
  const p = v.pessoais;
  return [
    ...problemaDeData("hr-novo-data-nascimento", p.data_nascimento, hoje, true),
    ...problemaDeData("hr-novo-habilitacao-data", p.habilitacao_data_conclusao, hoje, true),
    ...problemaDeData("hr-novo-validade-documento", p.validade_documento, hoje, false),
    ...problemaDeData("hr-novo-carta-validade", p.carta_conducao_validade, hoje, false),
    ...problemaDeData("hr-novo-saude-validade", v.extra.saude_validade, hoje, false),
  ];
}

function problemasDeContactos(v: ValoresNovaPessoa): ProblemaNova[] {
  const e = v.extra;
  const lista = [
    ...problemasDeTelefone("hr-novo-telefone-pessoal", v.pessoais.telefone_pessoal),
    ...problemasDeTelefone("hr-novo-telefone-trabalho", v.geral.telefone_trabalho),
    ...problemasDeTelefone("hr-novo-emergencia-telefone", v.pessoais.emergencia_telefone),
    ...problemasDeTelefone("hr-novo-emergencia-telefone-alt", e.emergencia_telefone_alt),
  ];
  const cp = v.pessoais.morada_codigo_postal.trim();
  const portugal = v.pessoais.morada_pais.trim().toUpperCase() === "PT";
  if (cp !== "" && portugal && !CODIGO_POSTAL.test(cp)) acrescentar(lista, "hr-novo-morada-codigo-postal", "rhNova.erro.codigoPostal");
  if (e.emergencia_email.trim() !== "" && !EMAIL.test(e.emergencia_email.trim())) {
    acrescentar(lista, "hr-novo-emergencia-email", "hr.form.erroEmail");
  }
  return lista;
}

/** Percentagem 0 a 100 escrita à mão; vazio é válido. */
function problemaDePercentagem(campoId: string, valor: string): ProblemaNova[] {
  if (textoOuNull(valor) === null) return [];
  const n = numeroDe(valor);
  return n === null || n < 0 || n > 100 ? [{ campoId, mensagemKey: "hr.form.erroPercentagem" }] : [];
}

function problemasDeSaudeESindicato(v: ValoresNovaPessoa): ProblemaNova[] {
  return [
    ...problemaDePercentagem("hr-novo-saude-incapacidade", v.extra.saude_incapacidade),
    ...problemaDePercentagem("hr-novo-sindicato-quota", v.extra.sindicato_quota),
  ];
}

/** Os campos só do RH: data de admissão, tipo de contrato, subsídio e duodécimos. Nunca vão para o convite. */
function problemasDoRh(v: ValoresNovaPessoa, hoje: string): ProblemaNova[] {
  const lista: ProblemaNova[] = [];
  const admissao = v.laborais.data_admissao.trim();
  if (admissao === "") acrescentar(lista, "hr-novo-data-admissao", OBRIGATORIO);
  else lista.push(...problemaDeData("hr-novo-data-admissao", admissao, hoje, false));
  const nasc = v.pessoais.data_nascimento.trim();
  if (admissao !== "" && dataIsoValida(admissao) && dataIsoValida(nasc) && admissao < nasc) {
    acrescentar(lista, "hr-novo-data-admissao", "rhNova.erro.antesDoNascimento");
  }
  lista.push(...problemaDeData("hr-novo-data-antiguidade", v.laborais.data_antiguidade, hoje, false));
  lista.push(...problemaDeData("hr-novo-data-inicio", v.contrato.data_inicio, hoje, false));
  if (v.contrato.tipo_contrato === "") acrescentar(lista, "hr-novo-tipo-contrato", OBRIGATORIO);
  if (v.contrato.subsidio.trim() === "") acrescentar(lista, "hr-novo-subsidio", OBRIGATORIO);
  if (v.contrato.duodecimos_pct === "") acrescentar(lista, "hr-novo-duodecimos", OBRIGATORIO);
  if (v.contrato.tipo_contrato === "termo_certo" && v.contrato.data_fim.trim() === "") {
    acrescentar(lista, "hr-novo-data-fim", OBRIGATORIO);
  }
  return lista;
}

function problemasDoAcesso(v: ValoresNovaPessoa, papelDisponivel: boolean): ProblemaNova[] {
  if (!v.extra.criar_acesso) return [];
  const lista: ProblemaNova[] = [];
  if (papelDisponivel && v.acesso.role_id === "") acrescentar(lista, "hr-novo-papel", "hr.acesso.erroPapelObrigatorio");
  const email = v.extra.email_acesso.trim();
  if (email === "") acrescentar(lista, "hr-novo-email-acesso", OBRIGATORIO);
  else if (!EMAIL.test(email)) acrescentar(lista, "hr-novo-email-acesso", "hr.form.erroEmail");
  return lista;
}

const algum = (...valores: string[]): boolean => valores.some((valor) => valor.trim() !== "");

/**
 * Grupos que só se gravam inteiros: o que a base não grava não se perde em silêncio.
 *  - contacto de emergência: sem nome e telefone não há linha (o telefone alternativo, o e-mail e a relação iam fora);
 *  - titular, banco e agência da conta: só se gravam com o número (a RPC exige-o).
 */
function problemasDeGruposIncompletos(v: ValoresNovaPessoa): ProblemaNova[] {
  const p = v.pessoais;
  const e = v.extra;
  const lista: ProblemaNova[] = [];
  if (algum(p.emergencia_nome, p.emergencia_relacao, p.emergencia_telefone, e.emergencia_telefone_alt, e.emergencia_email)) {
    if (p.emergencia_nome.trim() === "") acrescentar(lista, "hr-novo-emergencia-nome", OBRIGATORIO);
    if (p.emergencia_telefone.trim() === "") acrescentar(lista, "hr-novo-emergencia-telefone", OBRIGATORIO);
  }
  if (algum(p.conta_titular, p.conta_banco, e.conta_agencia) && p.conta_numero.trim() === "") {
    acrescentar(lista, "hr-novo-conta-numero", OBRIGATORIO);
  }
  return lista;
}

/** Os problemas do assistente real, sem os "obrigatório" das secções que se pedem à pessoa no convite. */
function problemasDoAssistente(v: ValoresNovaPessoa, o: OpcoesValidacao): ProblemaNova[] {
  return problemasDoRascunho(v, { comConvite: o.comConvite, config: o.config ?? undefined, indisponiveis: o.indisponiveis })
    .map((p): ProblemaNova => ({ campoId: p.campoId, mensagemKey: p.mensagemKey }))
    .filter((p) => {
      const seccao = seccaoDoCampo(p.campoId);
      const adiado = !o.comConvite && seccao !== undefined && v.extra.noConvite[seccao] === true;
      return !(adiado && p.mensagemKey === OBRIGATORIO);
    });
}

/** Todos os problemas, sem repetir campo (fica o primeiro) e pela ordem do ecrã. */
export function problemasDaNova(v: ValoresNovaPessoa, o: OpcoesValidacao): ProblemaNova[] {
  const todos = [
    ...problemasDoAssistente(v, o),
    ...problemasDoRh(v, o.hoje),
    ...problemasDeDatasPessoais(v, o.hoje),
    ...problemasDeContactos(v),
    ...problemasDeSaudeESindicato(v),
    ...problemasDeGruposIncompletos(v),
    ...problemasDoAcesso(v, o.papelDisponivel !== false),
  ];
  const vistos = new Set<string>();
  return todos
    .filter((p) => (vistos.has(p.campoId) ? false : (vistos.add(p.campoId), true)))
    .sort((a, b) => ordemDoCampo(a.campoId) - ordemDoCampo(b.campoId));
}

export interface ResumoNova {
  total: number;
  porAba: Record<AbaNova, number>;
}

/** Quantos campos têm erro, no total e por aba (o contador e o aviso de cada aba). */
export function resumoDeProblemas(problemas: readonly ProblemaNova[]): ResumoNova {
  const porAba = Object.fromEntries(ABAS_NOVA.map((a) => [a, 0])) as Record<AbaNova, number>;
  for (const p of problemas) porAba[abaDoCampo(p.campoId)] += 1;
  return { total: problemas.length, porAba };
}

/** O primeiro campo com erro pela ordem do ecrã, ou `null`. */
export function primeiroProblema(problemas: readonly ProblemaNova[]): ProblemaNova | null {
  return problemas[0] ?? null;
}

/**
 * Os ids dos campos que se exigem agora para a pessoa: os fixos mais os que a configuração da admissão põe na posição
 * "no convite" (só quando o RH preenche; a enviar convite, a pessoa é que os preenche), menos as secções adiadas.
 */
export function idsObrigatorios(v: ValoresNovaPessoa, o: OpcoesValidacao): ReadonlySet<string> {
  const ids = new Set<string>(OBRIGATORIOS_FIXOS);
  for (const codigo of codigosObrigatoriosDoFormulario(o.comConvite, o.config, o.indisponiveis)) {
    const campo = CAMPO_DO_CODIGO[codigo];
    if (campo && v.extra.noConvite[campo.seccao] !== true) ids.add(campo.id);
  }
  if (o.comConvite) ids.add("hr-novo-email-pessoal");
  if (v.extra.criar_acesso) {
    if (o.papelDisponivel !== false) ids.add("hr-novo-papel");
    ids.add("hr-novo-email-acesso");
  }
  if (v.contrato.tipo_contrato === "termo_certo") ids.add("hr-novo-data-fim");
  return ids;
}
