/**
 * «Corrigir equipamento» e «Corrigir datas» (só com `ativos.edit`): do formulário (tudo texto) para o pedido a
 * `rpc_hr_equipamento_corrigir`. Só vão os campos que MUDARAM (`p_campos`): a base só escreve esses. Puro, com a validação local.
 */
import type { CorrecaoEquipamento } from "@/lib/hr/custoBase";
import type { AtivoDoEquipamento, EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";

export type ErroCorrecao =
  | "nada" | "nome" | "valorCompra" | "residual" | "dataCompra" | "vida" | "renda" | "inicio" | "fimAntesInicio"
  | "entrega" | "devolucao" | "devolucaoAntesEntrega";

export interface FormularioCorrecao {
  nome: string;
  valorCompra: string;
  valorResidual: string;
  dataCompra: string;
  vidaMeses: string;
  rendaMensal: string;
  inicioAluguer: string;
  fimAluguer: string;
}

export interface ResultadoDaCorrecao {
  correcao: CorrecaoEquipamento | null;
  erro: ErroCorrecao | null;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const numero = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s.trim().replace(",", ".")));
const texto = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

/** Os campos do formulário com o que o ativo tem hoje. */
export function formularioDaCorrecao(a: AtivoDoEquipamento): FormularioCorrecao {
  return a.forma === "comprado"
    ? { nome: a.nome, valorCompra: texto(a.valorCompra), valorResidual: texto(a.valorResidual), dataCompra: a.dataCompra, vidaMeses: texto(a.vidaMeses), rendaMensal: "", inicioAluguer: "", fimAluguer: "" }
    : { nome: a.nome, valorCompra: "", valorResidual: "", dataCompra: "", vidaMeses: "", rendaMensal: texto(a.rendaMensal), inicioAluguer: a.inicioAluguer, fimAluguer: a.fimAluguer ?? "" };
}

function corrigirComprado(a: Extract<AtivoDoEquipamento, { forma: "comprado" }>, f: FormularioCorrecao): ResultadoDaCorrecao {
  const nome = f.nome.trim();
  const compra = numero(f.valorCompra);
  const residual = numero(f.valorResidual === "" ? "0" : f.valorResidual);
  const vida = numero(f.vidaMeses);
  if (nome === "" || nome.length > 120) return { correcao: null, erro: "nome" };
  if (!Number.isFinite(compra) || compra <= 0) return { correcao: null, erro: "valorCompra" };
  if (!Number.isFinite(residual) || residual < 0 || residual > compra) return { correcao: null, erro: "residual" };
  if (!DATA.test(f.dataCompra)) return { correcao: null, erro: "dataCompra" };
  if (!Number.isInteger(vida) || vida < 1 || vida > 600) return { correcao: null, erro: "vida" };
  const c: CorrecaoEquipamento = { campos: [] };
  if (nome !== a.nome) { c.campos.push("nome"); c.nome = nome; }
  if (compra !== a.valorCompra) { c.campos.push("valor_compra"); c.valorCompra = compra; }
  if (residual !== a.valorResidual) { c.campos.push("valor_residual"); c.valorResidual = residual; }
  if (f.dataCompra !== a.dataCompra) { c.campos.push("data_compra"); c.dataCompra = f.dataCompra; }
  // Mudar a vida passa a ser uma escolha à mão: a origem deixa de ser a do pagamento ou do catálogo.
  if (vida !== a.vidaMeses) { c.campos.push("vida_meses", "vida_origem"); c.vidaMeses = vida; c.vidaOrigem = "manual"; }
  return c.campos.length === 0 ? { correcao: null, erro: "nada" } : { correcao: c, erro: null };
}

function corrigirAlugado(a: Extract<AtivoDoEquipamento, { forma: "alugado" }>, f: FormularioCorrecao): ResultadoDaCorrecao {
  const nome = f.nome.trim();
  const renda = numero(f.rendaMensal);
  const fim = f.fimAluguer.trim() === "" ? null : f.fimAluguer;
  if (nome === "" || nome.length > 120) return { correcao: null, erro: "nome" };
  if (!Number.isFinite(renda) || renda <= 0) return { correcao: null, erro: "renda" };
  if (!DATA.test(f.inicioAluguer)) return { correcao: null, erro: "inicio" };
  if (fim !== null && (!DATA.test(fim) || fim < f.inicioAluguer)) return { correcao: null, erro: "fimAntesInicio" };
  const c: CorrecaoEquipamento = { campos: [] };
  if (nome !== a.nome) { c.campos.push("nome"); c.nome = nome; }
  if (renda !== a.rendaMensal) { c.campos.push("renda_mensal"); c.rendaMensal = renda; }
  if (f.inicioAluguer !== a.inicioAluguer) { c.campos.push("inicio_aluguer"); c.inicioAluguer = f.inicioAluguer; }
  if (fim !== a.fimAluguer) { c.campos.push("fim_aluguer"); c.fimAluguer = fim; }
  return c.campos.length === 0 ? { correcao: null, erro: "nada" } : { correcao: c, erro: null };
}

/** O pedido de «Corrigir equipamento»: valor, vida, renda e datas do contrato do ativo (não as datas da entrega). */
export function correcaoDoFormulario(a: AtivoDoEquipamento, f: FormularioCorrecao): ResultadoDaCorrecao {
  return a.forma === "comprado" ? corrigirComprado(a, f) : corrigirAlugado(a, f);
}

/** O pedido de «Corrigir datas»: a entrega e, numa linha já devolvida, a devolução, desta ocupação. */
export function correcaoDeDatas(e: EquipamentoPessoa, entrega: string, devolucao: string): ResultadoDaCorrecao {
  const devolvida = e.estado === "devolvido";
  if (!DATA.test(entrega)) return { correcao: null, erro: "entrega" };
  if (devolvida && !DATA.test(devolucao)) return { correcao: null, erro: "devolucao" };
  if (devolvida && devolucao < entrega) return { correcao: null, erro: "devolucaoAntesEntrega" };
  const c: CorrecaoEquipamento = { campos: [], pessoaEquipamentoId: e.id };
  if (entrega !== e.entrega) { c.campos.push("entrega"); c.entrega = entrega; }
  if (devolvida && devolucao !== e.devolucao) { c.campos.push("devolucao"); c.devolucao = devolucao; }
  return c.campos.length === 0 ? { correcao: null, erro: "nada" } : { correcao: c, erro: null };
}
