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
import { contaRepartida, ehErroConta, MESES_POR_OMISSAO, normalizarConta, type ComoConta, type ContaItem } from "@/components/rh-exemplo/lib/comoConta";
import type { DefinicoesCusto } from "@/components/rh-exemplo/lib/custoMes";
import type { AtivoDoEquipamento, EquipamentoPessoa, EstadoDevolucao, NovoEquipamentoBase, TipoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";

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
export function falhaDeEscrita(erro: unknown, origem: string, chaveSemPermissao?: string): ResultadoCusto {
  const codigo = codigoDeErroCusto(erro);
  if (codigo === null) captureFlowError(erro, origem);
  const campo = codigo ? ERRO_DE_CAMPO[codigo] : undefined;
  if (campo) return recusaDeCampo(campo);
  // «Corrigir equipamento» pede ativos.edit: a recusa por permissao fala dos Ativos, nunca das retribuicoes.
  if (codigo === "insufficient_privilege" && chaveSemPermissao) return { ok: false, erro: null, mensagem: getLocalizedFallback(chaveSemPermissao) };
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

/**
 * O ativo de uma linha, como `rpc_hr_equipamentos_listar` o projeta (`ativo`): o comprado traz valor de compra, residual, data de
 * compra e vida; o alugado, renda e datas do contrato. Tudo opcional: um ativo a que falte o essencial e ignorado.
 */
export interface LinhaAtivoRh {
  codigo?: string | null;
  nome?: string | null;
  tipo?: string | null;
  forma_aquisicao?: string | null;
  valor_compra?: number | null;
  valor_residual?: number | null;
  data_compra?: string | null;
  vida_meses?: number | null;
  vida_origem?: string | null;
  renda_mensal?: number | null;
  inicio_aluguer?: string | null;
  fim_aluguer?: string | null;
  estado?: string | null;
  desativado_em?: string | null;
}

export interface LinhaEquipamento {
  id: string;
  pessoa_id: string;
  /** Numa linha com ativo a base projeta-os do ativo (compatibilidade) e a linha ja nao os guarda: aceitam-se nulos. */
  tipo: string | null;
  descricao: string | null;
  valor: number | null;
  entrega: string;
  conta_modo: string | null;
  conta_meses: number | null;
  conta_inicio: string | null;
  conta_fim: string | null;
  estado: string;
  devolucao: string | null;
  estado_devolucao: string | null;
  /** O ativo a que a linha pertence; `null` so na farda. Ausente nas respostas de antes da migration dos Ativos. */
  ativo_id?: string | null;
  ativo?: LinhaAtivoRh | null;
  /** O dia desde o qual a linha conta: a entrega, ou o dia seguinte se outra ocupacao do ativo foi devolvida nesse dia. */
  conta_desde?: string | null;
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

const numeroOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const textoOuNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const dataOuNull = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** O ativo da linha para o ecra; `null` (e a linha conta como sem ativo) se faltar o que a conta precisa, em vez de partir o ecra. */
export function ativoDaLinhaRh(l: LinhaAtivoRh | null | undefined): AtivoDoEquipamento | null {
  if (!l) return null;
  const identidade = {
    codigo: textoOuNull(l.codigo),
    nome: textoOuNull(l.nome) ?? "",
    tipo: textoOuNull(l.tipo),
    estado: l.estado === "desativado" ? ("desativado" as const) : ("ativo" as const),
    desativadoEm: dataOuNull(l.desativado_em),
  };
  if (l.forma_aquisicao === "alugado") {
    const renda = numeroOuNull(l.renda_mensal);
    const inicio = dataOuNull(l.inicio_aluguer);
    if (renda === null || inicio === null) return null;
    return { forma: "alugado", ...identidade, rendaMensal: renda, inicioAluguer: inicio, fimAluguer: dataOuNull(l.fim_aluguer) };
  }
  const compra = numeroOuNull(l.valor_compra);
  const data = dataOuNull(l.data_compra);
  if (compra === null || data === null) return null;
  return {
    forma: "comprado", ...identidade, valorCompra: compra, valorResidual: numeroOuNull(l.valor_residual) ?? 0, dataCompra: data,
    vidaMeses: numeroOuNull(l.vida_meses), vidaOrigem: textoOuNull(l.vida_origem),
  };
}

export function equipamentoDaLinha(l: LinhaEquipamento): EquipamentoPessoa {
  const ativo = ativoDaLinhaRh(l.ativo);
  const modo = (l.conta_modo ?? "repartido") as ComoConta;
  const meses = l.conta_meses ?? (modo === "repartido" ? MESES_POR_OMISSAO : 1);
  const valorDoAtivo = ativo ? (ativo.forma === "alugado" ? ativo.rendaMensal : ativo.valorCompra) : 0;
  return {
    id: l.id,
    pessoaId: l.pessoa_id,
    tipo: (l.tipo ?? ativo?.tipo ?? "outro") as TipoEquipamento,
    descricao: l.descricao ?? ativo?.nome ?? "",
    valor: numeroOuNull(l.valor) ?? valorDoAtivo,
    entrega: l.entrega,
    conta: { modo, meses, inicio: mesDaDataBase(l.conta_inicio), fim: mesDaDataBase(l.conta_fim) },
    estado: l.estado === "devolvido" ? "devolvido" : "atribuido",
    devolucao: l.devolucao,
    estadoDevolucao: (l.estado_devolucao as EstadoDevolucao | null) ?? null,
    // A lista da base ja nao diz quem criou (revisao de seguranca): o autor fica vazio, nunca inventado.
    autor: "",
    // Com ativo a conta vem dele (conta_* da linha e so compatibilidade); sem ele (a farda) fica como estava.
    ativoId: ativo ? (l.ativo_id ?? null) : null,
    ativo,
    contaDesde: l.conta_desde ?? l.entrega,
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

/**
 * Os argumentos de `rpc_hr_equipamento_atribuir` para cada forma. A farda (e a chamada antiga, sem `forma`) manda o que sempre mandou:
 * tipo, descricao, valor e o «como conta», sem nenhum parametro novo. Um ativo novo (comprado ou alugado) manda SEMPRE `p_vida_meses`
 * (nulo no alugado) e os nulos que lhe correspondem; um ativo que ja existe manda so `p_ativo_id` com os restantes NULOS explicitos
 * (a base recusa com HRA10 qualquer valor perdido nesse caminho).
 */
export function argumentosDeAtribuir(novo: NovoEquipamentoBase, organizationId: string): Record<string, unknown> {
  const base = {
    p_pessoa_id: novo.pessoaId,
    p_organization_id: organizationId,
    p_entrega: novo.entrega,
    // O mesmo id em duplo clique ou reenvio: a base devolve o registo que ja criou em vez de duplicar.
    p_id: novo.idPedido ?? crypto.randomUUID(),
  };
  if (novo.forma === "existente") {
    return {
      ...base, p_ativo_id: novo.ativoId,
      p_tipo: null, p_descricao: null, p_valor: null, p_conta_meses: null, p_conta_inicio: null, p_conta_fim: null,
      p_data_compra: null, p_vida_origem: null, p_vida_meses: null, p_cat_equipamento_id: null,
      p_forma_aquisicao: null, p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null,
    };
  }
  if (novo.forma === "comprado") {
    return {
      ...base, p_ativo_id: null, p_tipo: novo.tipo, p_descricao: novo.descricao.trim(), p_valor: novo.valor,
      p_forma_aquisicao: "comprado", p_data_compra: novo.dataCompra || null,
      p_vida_meses: novo.vidaMeses, p_vida_origem: novo.vidaOrigem, p_cat_equipamento_id: novo.catEquipamentoId ?? null,
      p_renda_mensal: null, p_inicio_aluguer: null, p_fim_aluguer: null,
    };
  }
  if (novo.forma === "alugado") {
    return {
      ...base, p_ativo_id: null, p_tipo: novo.tipo, p_descricao: novo.descricao.trim(), p_valor: novo.rendaMensal,
      p_forma_aquisicao: "alugado", p_data_compra: null, p_vida_meses: null, p_vida_origem: null, p_cat_equipamento_id: null,
      p_renda_mensal: novo.rendaMensal, p_inicio_aluguer: novo.inicioAluguer, p_fim_aluguer: novo.fimAluguer || null,
    };
  }
  return {
    p_pessoa_id: base.p_pessoa_id, p_organization_id: organizationId, p_tipo: novo.tipo, p_descricao: novo.descricao.trim(),
    p_valor: novo.valor, p_entrega: novo.entrega, ...argumentosDaConta(novo.conta ?? contaRepartida()), p_id: base.p_id,
  };
}

/** Os tetos da base para uma atribuicao (descricao, valor ou renda e data de entrega); um ativo que ja existe so tem a data. */
export function erroDeTetoNovo(novo: NovoEquipamentoBase): string | null {
  if (novo.forma === "existente") return dataDentroDoPermitido(novo.entrega) ? null : "semData";
  const valor = novo.forma === "alugado" ? novo.rendaMensal : novo.valor;
  const erro = erroDeTetoEquipamento({ descricao: novo.descricao, valor, entrega: novo.entrega });
  return erro === "valorZero" && novo.forma === "alugado" ? "rendaZero" : erro;
}

/** O que se corrige num equipamento que e um ativo (`rpc_hr_equipamento_corrigir`): so os campos nomeados em `campos` se escrevem. */
export interface CorrecaoEquipamento {
  campos: string[];
  nome?: string;
  valorCompra?: number;
  valorResidual?: number;
  dataCompra?: string;
  vidaMeses?: number;
  vidaOrigem?: string;
  rendaMensal?: number;
  inicioAluguer?: string;
  /** Com `fim_aluguer` em `campos`, `null` limpa o fim do contrato. */
  fimAluguer?: string | null;
  pessoaEquipamentoId?: string;
  entrega?: string;
  devolucao?: string | null;
}

const PARAMETRO_DO_CAMPO: Readonly<Record<string, { parametro: string; chave: keyof CorrecaoEquipamento }>> = {
  nome: { parametro: "p_nome", chave: "nome" },
  valor_compra: { parametro: "p_valor_compra", chave: "valorCompra" },
  valor_residual: { parametro: "p_valor_residual", chave: "valorResidual" },
  data_compra: { parametro: "p_data_compra", chave: "dataCompra" },
  vida_meses: { parametro: "p_vida_meses", chave: "vidaMeses" },
  vida_origem: { parametro: "p_vida_origem", chave: "vidaOrigem" },
  renda_mensal: { parametro: "p_renda_mensal", chave: "rendaMensal" },
  inicio_aluguer: { parametro: "p_inicio_aluguer", chave: "inicioAluguer" },
  fim_aluguer: { parametro: "p_fim_aluguer", chave: "fimAluguer" },
  entrega: { parametro: "p_entrega", chave: "entrega" },
  devolucao: { parametro: "p_devolucao", chave: "devolucao" },
};

/** Os argumentos de `rpc_hr_equipamento_corrigir`: `p_campos` e, so para esses campos, o valor (nulo explicito quando se limpa). */
export function argumentosDeCorrecao(organizationId: string, ativoId: string, c: CorrecaoEquipamento): Record<string, unknown> {
  const args: Record<string, unknown> = { p_ativo_id: ativoId, p_organization_id: organizationId, p_campos: c.campos };
  for (const campo of c.campos) {
    const alvo = PARAMETRO_DO_CAMPO[campo];
    if (alvo) args[alvo.parametro] = c[alvo.chave] ?? null;
  }
  if (c.campos.includes("entrega") || c.campos.includes("devolucao")) args.p_pessoa_equipamento_id = c.pessoaEquipamentoId ?? null;
  return args;
}
