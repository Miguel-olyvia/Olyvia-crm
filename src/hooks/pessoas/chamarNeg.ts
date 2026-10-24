import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chaveDoErro, codigoDoErro } from "./errosNeg";

export type NomeNeg =
  | "neg_registar_contacto"
  | "neg_guardar_visita"
  | "neg_alterar_visita"
  | "neg_cancelar_visita"
  | "neg_guardar_levantamento"
  | "neg_criar_negocio"
  | "neg_mudar_fecho"
  | "neg_guardar_config_negocios"
  | "neg_guardar_cadeia"
  | "neg_guardar_recusa_orcamento"
  | "neg_ligar_registo"
  | "neg_desligar_registo"
  | "neg_perder_negocio"
  | "neg_anular_perda"
  | "neg_ganhar_negocio"
  | "neg_reavaliar_negocio"
  | "neg_reabrir_ganho"
  | "neg_dispensar_alerta"
  | "neg_encerrar_abordagem"
  | "neg_reabrir_abordagem"
  | "neg_resultado_visita"
  | "neg_resumo_pessoas"
  | "neg_resumo_quadro"
  | "neg_ficha_pessoa"
  | "neg_registar_nota"
  | "neg_adiar_contacto"
  | "neg_guardar_identidade_pessoa"
  | "neg_procurar_duplicados"
  | "neg_substituir_contacto"
  | "neg_atribuir_pessoa"
  | "neg_guardar_regras_qualificacao"
  | "neg_guardar_questionario"
  | "neg_questionario_levantamento";

/** Erro de uma função neg_*: o código (se for conhecido), a chave a traduzir e a causa. */
export class ErroNeg extends Error {
  readonly codigo: string | null;
  readonly chave: string;
  // Não se usa a opção `cause` do Error: a lib do projeto é ES2020.
  readonly causa: unknown;
  /** Uma segunda mensagem a mostrar a seguir à principal (numa falha parcial: o aviso de parcial e, depois, a do código que falhou). */
  readonly chaveExtra?: string;

  constructor(causa: unknown, codigo: string | null, chave: string, chaveExtra?: string) {
    super(causa instanceof Error ? causa.message : (codigo ?? "erro-neg"));
    this.name = "ErroNeg";
    this.codigo = codigo;
    this.chave = chave;
    this.causa = causa;
    this.chaveExtra = chaveExtra;
  }
}

/** Chama uma função neg_* (fora dos tipos gerados). Lança ErroNeg se falhar. */
export async function chamarNeg<T>(nome: NomeNeg, params: Record<string, unknown>): Promise<T> {
  let erro: unknown = null;
  let dados: unknown = null;
  try {
    // `as any` sai quando os tipos do Supabase forem regenerados.
    const resposta = await (supabase as any).rpc(nome, params);
    erro = resposta.error ?? null;
    dados = resposta.data ?? null;
  } catch (excecao) {
    erro = excecao;
  }
  if (erro) {
    const codigo = codigoDoErro(erro);
    // Os códigos NG e 42501 são esperados e a UI mostra a mensagem; o resto é avaria.
    if (!codigo) captureFlowError(erro, "pessoas-neg");
    throw new ErroNeg(erro, codigo, chaveDoErro(erro));
  }
  return dados as T;
}
