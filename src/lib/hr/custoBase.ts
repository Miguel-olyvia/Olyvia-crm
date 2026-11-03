/**
 * O custo do RH entre a base e o ecra: as formas das linhas das RPCs, a conversao para os tipos do ecra e o resultado de uma
 * escrita. Sem React e sem cliente da base.
 *
 * Meses: o ecra usa `AAAA-MM`; a base guarda DATE no dia 1 (a RPC aceita qualquer dia e poe-no no dia 1). Aqui converte-se
 * nos dois sentidos. `conta_meses` vem NULL em `umaVez` e `todosMeses` (o ecra usa 1).
 */
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import { chaveDoErroCusto, codigoDeErroCusto, ERRO_DE_CAMPO } from "@/lib/hr/errosCusto";
import { ehErroConta, MESES_POR_OMISSAO, normalizarConta, type ComoConta, type ContaItem } from "@/components/rh-exemplo/lib/comoConta";
import type { DefinicoesCusto } from "@/components/rh-exemplo/lib/custoMes";
import type { EquipamentoPessoa, EstadoDevolucao, TipoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";

/** O resultado de uma escrita: `erro` e o nome do erro que o formulario mostra junto do campo; `mensagem` e o texto traduzido do resto. */
export interface ResultadoCusto {
  ok: boolean;
  /** O nome do erro de um campo (`semDescricao`, `antesDaEntrega`, `mesesInvalidos`...), ou `null`. */
  erro: string | null;
  /** O texto traduzido quando a recusa nao e de um campo (permissao, limite, estado), ou `null`. */
  mensagem: string | null;
}

export const SUCESSO_CUSTO: ResultadoCusto = { ok: true, erro: null, mensagem: null };

/** Uma recusa pela validacao local (o mesmo nome de erro que a base daria). */
export const recusaDeCampo = (erro: string): ResultadoCusto => ({ ok: false, erro, mensagem: null });

/** Uma recusa com texto proprio (por exemplo uma taxa fora de 0..100, que nao tem campo). */
export const recusaComTexto = (codigo: string): ResultadoCusto => ({ ok: false, erro: null, mensagem: getLocalizedFallback(chaveDoErroCusto(codigo)) });

/** Uma data fora do intervalo que a base aceita (2000 ate hoje + 10 anos): texto proprio, nunca «indica a data». */
export const recusaDeDataFora = (): ResultadoCusto => ({ ok: false, erro: null, mensagem: getLocalizedFallback("hr.custo.erro.dataInvalida") });

/**
 * A recusa da base (HRA67 `data_invalida`) chega como `semData`; como a data ja passou a validacao local de formato, quer dizer
 * «fora do intervalo»: passa a texto proprio. `soContas`: o formulario so sabe mostrar erros da conta junto do campo; qualquer outro
 * nome de erro vira texto, em vez de a chave de traducao aparecer em bruto.
 */
export function daBaseComTextoDeData(r: ResultadoCusto, soContas = false): ResultadoCusto {
  if (r.ok || r.erro === null) return r;
  if (r.erro === "semData") return recusaDeDataFora();
  if (soContas && !ehErroConta(r.erro)) return { ok: false, erro: null, mensagem: getLocalizedFallback(chaveDoErroCusto(null)) };
  return r;
}

/** O texto traduzido de um erro de uma RPC; defeitos (rede, sem codigo legivel) vao para o registo, recusas de negocio nao. */
export function textoDoErro(erro: unknown, origem: string): string {
  const codigo = codigoDeErroCusto(erro);
  if (codigo === null) captureFlowError(erro, origem);
  return getLocalizedFallback(chaveDoErroCusto(codigo));
}

/** O resultado de uma escrita que a base recusou ou que falhou. */
export function falhaDeEscrita(erro: unknown, origem: string): ResultadoCusto {
  const codigo = codigoDeErroCusto(erro);
  if (codigo === null) captureFlowError(erro, origem);
  const campo = codigo ? ERRO_DE_CAMPO[codigo] : undefined;
  if (campo) return recusaDeCampo(campo);
  return { ok: false, erro: null, mensagem: getLocalizedFallback(chaveDoErroCusto(codigo)) };
}

/* ------------------------------------------------------------------ as linhas da base */
export interface LinhaDefinicoes {
  taxa_empresa: number;
  seguro: number;
  valor_km: number;
  ajuda_dia: number;
  omissao?: boolean;
}

export interface LinhaExcecao {
  pessoa_id: string;
  taxa_empresa: number | null;
}

export interface LinhaEquipamento {
  id: string;
  pessoa_id: string;
  tipo: string;
  descricao: string;
  valor: number;
  entrega: string;
  conta_modo: string | null;
  conta_meses: number | null;
  conta_inicio: string | null;
  conta_fim: string | null;
  estado: string;
  devolucao: string | null;
  estado_devolucao: string | null;
}

/* ------------------------------------------------------------------ os tetos da base (repetidos no ecra) */
export const DESCRICAO_MAXIMA = 200;
export const VALOR_MAXIMO = 9_999_999_999.99;
const DATA_MINIMA = "2000-01-01";
const ANOS_A_FRENTE = 10;

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/** A data de hoje (AAAA-MM-DD) pelo relogio real e pelos componentes LOCAIS (nunca `toISOString`, que e UTC). */
export function hojeLocal(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

/** O limite superior das datas: hoje + 10 anos (AAAA-MM-DD), pelo mesmo relogio de `hojeLocal`. */
export function dataMaxima(hoje: Date = new Date()): string {
  const ano = hoje.getFullYear() + ANOS_A_FRENTE;
  // 29 de Fevereiro num ano que nao e bissexto passa a 28.
  const ultimoDia = new Date(ano, hoje.getMonth() + 1, 0).getDate();
  return `${ano}-${doisDigitos(hoje.getMonth() + 1)}-${doisDigitos(Math.min(hoje.getDate(), ultimoDia))}`;
}

/** Uma data `AAAA-MM-DD` dentro do que a base aceita (2000-01-01 a hoje + 10 anos). */
export const dataDentroDoPermitido = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= DATA_MINIMA && d <= dataMaxima();

/** Descricao de 1 a 200 caracteres, sem caracteres de controlo (tab, quebra de linha). */
// eslint-disable-next-line no-control-regex
export const descricaoDentroDoPermitido = (s: string): boolean => s.trim().length >= 1 && s.trim().length <= DESCRICAO_MAXIMA && !/[\u0000-\u001f\u007f]/.test(s);

/** Os tetos que a base recusa e que a validacao local de `lib/equipamentos.ts` nao cobre; devolve o nome do erro do ecra. */
export function erroDeTetoEquipamento(e: { descricao: string; valor: number; entrega: string }): string | null {
  if (!descricaoDentroDoPermitido(e.descricao)) return "semDescricao";
  if (!(e.valor > 0 && e.valor <= VALOR_MAXIMO)) return "valorZero";
  return dataDentroDoPermitido(e.entrega) ? null : "semData";
}

export const definicoesDaLinha = (l: LinhaDefinicoes): DefinicoesCusto => ({
  taxaEmpresa: Number(l.taxa_empresa),
  seguro: Number(l.seguro),
  valorPorKm: Number(l.valor_km),
  ajudaPorDia: Number(l.ajuda_dia),
});

/** `excecoes` como o ecra as le: pessoa -> taxa (so as pessoas com excecao; as outras nao aparecem). */
export function excecoesDasLinhas(linhas: readonly LinhaExcecao[]): Record<string, number | null> {
  const mapa: Record<string, number | null> = {};
  for (const l of linhas) mapa[l.pessoa_id] = l.taxa_empresa === null ? null : Number(l.taxa_empresa);
  return mapa;
}

/** A data `AAAA-MM-DD` da base como `AAAA-MM`. */
const mesDaDataBase = (d: string | null): string | null => (d ? d.slice(0, 7) : null);

/** O `AAAA-MM` do ecra como a data (dia 1) que a RPC recebe. */
const dataDoMes = (mes: string | null): string | null => (mes ? `${mes}-01` : null);

export function equipamentoDaLinha(l: LinhaEquipamento): EquipamentoPessoa {
  const modo = (l.conta_modo ?? "repartido") as ComoConta;
  const meses = l.conta_meses ?? (modo === "repartido" ? MESES_POR_OMISSAO : 1);
  return {
    id: l.id,
    pessoaId: l.pessoa_id,
    tipo: l.tipo as TipoEquipamento,
    descricao: l.descricao,
    valor: Number(l.valor),
    entrega: l.entrega,
    conta: { modo, meses, inicio: mesDaDataBase(l.conta_inicio), fim: mesDaDataBase(l.conta_fim) },
    estado: l.estado === "devolvido" ? "devolvido" : "atribuido",
    devolucao: l.devolucao,
    estadoDevolucao: (l.estado_devolucao as EstadoDevolucao | null) ?? null,
    // A lista da base ja nao diz quem criou (revisao de seguranca): o autor fica vazio, nunca inventado.
    autor: "",
  };
}

/** Os argumentos «como conta» das RPCs de equipamento. So vai o que o modo usa. */
export function argumentosDaConta(conta: ContaItem): { p_conta_modo: string; p_conta_meses: number | null; p_conta_inicio: string | null; p_conta_fim: string | null } {
  const c = normalizarConta(conta);
  return {
    p_conta_modo: c.modo,
    p_conta_meses: c.modo === "repartido" ? c.meses : null,
    p_conta_inicio: c.modo === "todosMeses" ? dataDoMes(c.inicio) : null,
    p_conta_fim: c.modo === "todosMeses" ? dataDoMes(c.fim) : null,
  };
}
