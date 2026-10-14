// A forma do formulário "Nova pessoa" (painel lateral de exemplo), a sua validação por campo e os números por aba.
// Funções puras, sem React nem acesso a dados. O assistente real de cinco passos exige só nome e apelido; este painel
// exige também cargo e centro (a ficha de exemplo precisa deles) e, com acesso, o grupo e o e-mail. Vazio é válido nos
// restantes campos, malformado nunca.
import type { ExtrasNovaPessoa } from "@/components/rh-exemplo/dados/fichaNovaPessoa";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import { nifValido, nissValido } from "@/components/rh-exemplo/lib/identificadoresPt";
import type { Genero, TipoContrato } from "@/components/rh-exemplo/tipos";

export type AbaNova = "dados" | "contrato" | "acesso";
export const ABAS_NOVA: readonly AbaNova[] = ["dados", "contrato", "acesso"];

export interface ValoresNovaPessoa {
  nome: string;
  apelido: string;
  dataNascimento: string;
  genero: Genero | "";
  nif: string;
  niss: string;
  emailPessoal: string;
  telefonePessoal: string;
  moradaLinha1: string;
  moradaCodigoPostal: string;
  moradaLocalidade: string;
  moradaDistrito: string;
  localId: string;
  cargoId: string;
  chefiaId: string;
  tipoContrato: TipoContrato;
  dataInicio: string;
  dataFim: string;
  horas: string;
  retribuicao: string;
  criarAcesso: boolean;
  papelId: string;
  emailAcesso: string;
}

export type CampoNova = Exclude<keyof ValoresNovaPessoa, "genero" | "tipoContrato" | "chefiaId" | "criarAcesso">;
export type CodigoErroNova = "obrigatorio" | "invalido" | "futuro" | "antesDoInicio" | "intervalo";
export type ErrosNova = Partial<Record<CampoNova, CodigoErroNova>>;

/** A ordem do ecrã: o primeiro erro desta lista é o que recebe o foco ao tentar criar. */
export const ORDEM_CAMPOS: readonly CampoNova[] = [
  "nome", "apelido", "dataNascimento", "nif", "niss", "emailPessoal", "telefonePessoal", "moradaCodigoPostal",
  "localId", "cargoId", "dataInicio", "dataFim", "horas", "retribuicao", "papelId", "emailAcesso",
];

const ABA_DO_CAMPO: Record<CampoNova, AbaNova> = {
  nome: "dados", apelido: "dados", dataNascimento: "dados", nif: "dados", niss: "dados", emailPessoal: "dados",
  telefonePessoal: "dados", moradaLinha1: "dados", moradaCodigoPostal: "dados", moradaLocalidade: "dados",
  moradaDistrito: "dados", localId: "contrato", cargoId: "contrato", dataInicio: "contrato", dataFim: "contrato",
  horas: "contrato", retribuicao: "contrato", papelId: "acesso", emailAcesso: "acesso",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODIGO_POSTAL = /^\d{4}-\d{3}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORAS_MAXIMAS = 60;
const RETRIBUICAO_MAXIMA = 1_000_000;

export function valoresIniciais(hoje: string): ValoresNovaPessoa {
  return {
    nome: "", apelido: "", dataNascimento: "", genero: "", nif: "", niss: "", emailPessoal: "", telefonePessoal: "",
    moradaLinha1: "", moradaCodigoPostal: "", moradaLocalidade: "", moradaDistrito: "", localId: "", cargoId: "",
    chefiaId: "", tipoContrato: "sem_termo", dataInicio: hoje, dataFim: "", horas: "40", retribuicao: "",
    criarAcesso: false, papelId: "", emailAcesso: "",
  };
}

/** Uma data ISO que existe de verdade (31 de fevereiro não passa). */
export function dataIsoValida(valor: string): boolean {
  if (!DATA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

const vazio = (v: string): boolean => v.trim() === "";
const semSeparadores = (v: string): string => v.replace(/[\s.-]/g, "");

function numeroEm(valor: string, minimo: number, maximo: number): boolean {
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) && n >= minimo && n <= maximo;
}

function errosDosDados(v: ValoresNovaPessoa, hoje: string): ErrosNova {
  const e: ErrosNova = {};
  if (vazio(v.nome)) e.nome = "obrigatorio";
  if (vazio(v.apelido)) e.apelido = "obrigatorio";
  if (!vazio(v.dataNascimento)) {
    if (!dataIsoValida(v.dataNascimento)) e.dataNascimento = "invalido";
    else if (v.dataNascimento > hoje) e.dataNascimento = "futuro";
  }
  if (!vazio(v.nif) && !nifValido(v.nif)) e.nif = "invalido";
  if (!vazio(v.niss) && !nissValido(v.niss)) e.niss = "invalido";
  if (!vazio(v.emailPessoal) && !EMAIL.test(v.emailPessoal.trim())) e.emailPessoal = "invalido";
  if (!vazio(v.telefonePessoal) && !/^\+?\d{9,15}$/.test(semSeparadores(v.telefonePessoal))) e.telefonePessoal = "invalido";
  if (!vazio(v.moradaCodigoPostal) && !CODIGO_POSTAL.test(v.moradaCodigoPostal.trim())) e.moradaCodigoPostal = "invalido";
  return e;
}

function errosDoContrato(v: ValoresNovaPessoa): ErrosNova {
  const e: ErrosNova = {};
  if (v.localId === "") e.localId = "obrigatorio";
  if (v.cargoId === "") e.cargoId = "obrigatorio";
  if (vazio(v.dataInicio)) e.dataInicio = "obrigatorio";
  else if (!dataIsoValida(v.dataInicio)) e.dataInicio = "invalido";
  if (v.tipoContrato !== "sem_termo") {
    if (vazio(v.dataFim)) e.dataFim = "obrigatorio";
    else if (!dataIsoValida(v.dataFim)) e.dataFim = "invalido";
    else if (!e.dataInicio && v.dataFim < v.dataInicio) e.dataFim = "antesDoInicio";
  }
  if (!vazio(v.horas) && !numeroEm(v.horas, 1, HORAS_MAXIMAS)) e.horas = "intervalo";
  if (!vazio(v.retribuicao) && !numeroEm(v.retribuicao, 0, RETRIBUICAO_MAXIMA)) e.retribuicao = "intervalo";
  return e;
}

function errosDoAcesso(v: ValoresNovaPessoa): ErrosNova {
  if (!v.criarAcesso) return {};
  const e: ErrosNova = {};
  if (v.papelId === "") e.papelId = "obrigatorio";
  if (vazio(v.emailAcesso)) e.emailAcesso = "obrigatorio";
  else if (!EMAIL.test(v.emailAcesso.trim())) e.emailAcesso = "invalido";
  return e;
}

/** Os erros por campo; um campo sem erro não aparece. `hoje` (AAAA-MM-DD) decide o que é "no futuro". */
export function validarNovaPessoa(v: ValoresNovaPessoa, hoje: string): ErrosNova {
  return { ...errosDosDados(v, hoje), ...errosDoContrato(v), ...errosDoAcesso(v) };
}

export function abaDoCampo(campo: CampoNova): AbaNova {
  return ABA_DO_CAMPO[campo];
}

/** O primeiro campo com erro pela ordem do ecrã, ou `null`. */
export function primeiroErro(erros: ErrosNova): CampoNova | null {
  return ORDEM_CAMPOS.find((campo) => erros[campo] !== undefined) ?? null;
}

export interface ResumoNova {
  total: number;
  porAba: Record<AbaNova, number>;
}

/** Quantos campos têm erro, no total e por aba (o contador e o aviso de cada aba). */
export function resumoDeErros(erros: ErrosNova): ResumoNova {
  const porAba: Record<AbaNova, number> = { dados: 0, contrato: 0, acesso: 0 };
  for (const campo of Object.keys(erros) as CampoNova[]) porAba[ABA_DO_CAMPO[campo]] += 1;
  return { total: porAba.dados + porAba.contrato + porAba.acesso, porAba };
}

const texto = (v: string): string | null => (vazio(v) ? null : v.trim());
const numero = (v: string): number | null => (vazio(v) ? null : Number(v.replace(",", ".")));

export function extrasDoFormulario(v: ValoresNovaPessoa): ExtrasNovaPessoa {
  return {
    dataNascimento: texto(v.dataNascimento),
    genero: v.genero === "" ? null : v.genero,
    nif: texto(semSeparadores(v.nif)),
    niss: texto(semSeparadores(v.niss)),
    emailPessoal: texto(v.emailPessoal),
    telefonePessoal: texto(semSeparadores(v.telefonePessoal)),
    emailTrabalho: v.criarAcesso ? texto(v.emailAcesso) : null,
    moradaLinha1: texto(v.moradaLinha1),
    moradaCodigoPostal: texto(v.moradaCodigoPostal),
    moradaLocalidade: texto(v.moradaLocalidade),
    moradaDistrito: texto(v.moradaDistrito),
    horasSemana: numero(v.horas),
    salarioBase: numero(v.retribuicao),
    criarAcesso: v.criarAcesso,
  };
}

/** O que `criarPessoa` recebe. Só se chama com os valores já validados. */
export function paraNovaPessoa(v: ValoresNovaPessoa): NovaPessoaExemplo {
  const comTermo = v.tipoContrato !== "sem_termo";
  return {
    primeiro_nome: v.nome.trim(),
    apelido: v.apelido.trim(),
    cargoId: v.cargoId,
    localId: v.localId,
    tipoContrato: v.tipoContrato,
    dataInicio: v.dataInicio,
    dataFim: comTermo ? v.dataFim : null,
    reportaAId: v.chefiaId === "" ? null : v.chefiaId,
    extras: extrasDoFormulario(v),
  };
}
