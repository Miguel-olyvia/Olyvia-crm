/**
 * A limpeza dos ficheiros de anexos de justificacoes (accao `limpar`, chamada
 * por pg_cron), sem Deno nem rede.
 *
 * A base MARCA o que e para apagar (hr_justificacao_anexos_limpar: quarentenas
 * com mais de 3 h passam a recusado/upload_abandonado; devolve os objectos por
 * sair do Storage) e a Edge apaga-os pela API do Storage -- nunca com DELETE em
 * storage.objects. So depois diz a base quais linhas ficaram completas
 * (rpc_hr_justificacao_anexo_objecto_removido). O que falhar volta na volta
 * seguinte (a base ordena por tentativas).
 *
 * Por linha a base devolve:
 *   bucket + caminho     o objecto da propria linha (recusado/removido por remover)
 *   caminho_quarentena   a copia que ficou em hr-documentos-quarantine
 *   caminhos_finais      os tres finais possiveis em hr-justificacoes (linhas que
 *                        nunca chegaram a verificadas: apanha o objecto final que
 *                        uma confirmacao morta deixou orfao)
 *
 * ALARMES (a funcao SQL nao tem estado de limpeza como a dos convites; so se
 * levanta o que se mede aqui): remocoes que falharam, linhas com forma invalida
 * ou fora dos buckets destes anexos, e linhas que voltam pela 5.a vez ou mais
 * (`tentativas` >= 5). Um 200 com falhas ninguem o ve, por isso 500.
 *
 * Uma volta trata ate 200 linhas (o limite por omissao da base); o resto fica
 * para a seguinte.
 *
 * NUNCA devolve nem regista caminhos, nomes ou ids: so contagens e codigos.
 */

export const BUCKET_QUARENTENA = "hr-documentos-quarantine";
export const BUCKET_JUSTIFICACOES = "hr-justificacoes";
export const TAMANHO_DO_LOTE = 100;
export const LIMITE_DE_LINHAS = 200;
export const TENTATIVAS_DE_ALARME = 5;

export type CodigoDeAlarme = "remocoes_falhadas" | "linhas_invalidas" | "reincidentes";

export interface ClienteLimpeza {
  rpc(
    nome: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
  storage: {
    from(bucket: string): { remove(caminhos: string[]): PromiseLike<{ data: unknown; error: unknown }> };
  };
}

export interface ResultadoLimpeza {
  linhas: number;
  apagados: number;
  falhados: number;
  alarmes: CodigoDeAlarme[];
}

interface AlvoDeLimpeza {
  bucket: string;
  caminho: string;
}

const eTexto = (v: unknown): v is string => typeof v === "string" && v !== "";

type LinhaLida =
  | { tipo: "valida"; anexoId: string; alvos: AlvoDeLimpeza[]; tentativas: number }
  | { tipo: "fora_do_ambito"; anexoId: string }
  | { tipo: "invalida" };

function lerLinha(valor: unknown): LinhaLida {
  if (valor === null || typeof valor !== "object") return { tipo: "invalida" };
  const l = valor as Record<string, unknown>;
  if (!eTexto(l.anexo_id)) return { tipo: "invalida" };

  const alvos = new Map<string, AlvoDeLimpeza>();
  const acrescentar = (bucket: string, caminho: string) => alvos.set(`${bucket}\u0000${caminho}`, { bucket, caminho });

  if (l.bucket != null || l.caminho != null) {
    if (!eTexto(l.bucket) || !eTexto(l.caminho)) return { tipo: "invalida" };
    if (l.bucket !== BUCKET_QUARENTENA && l.bucket !== BUCKET_JUSTIFICACOES) {
      return { tipo: "fora_do_ambito", anexoId: l.anexo_id };
    }
    acrescentar(l.bucket, l.caminho);
  }
  if (l.caminho_quarentena != null) {
    if (!eTexto(l.caminho_quarentena)) return { tipo: "invalida" };
    acrescentar(BUCKET_QUARENTENA, l.caminho_quarentena);
  }
  if (l.caminhos_finais != null) {
    if (!Array.isArray(l.caminhos_finais) || !l.caminhos_finais.every(eTexto)) return { tipo: "invalida" };
    for (const caminho of l.caminhos_finais) acrescentar(BUCKET_JUSTIFICACOES, caminho);
  }
  // Uma linha que nao traz nada para remover nao devia ter sido devolvida.
  if (alvos.size === 0) return { tipo: "invalida" };

  const tentativas = typeof l.tentativas === "number" && Number.isFinite(l.tentativas) ? l.tentativas : 0;
  return { tipo: "valida", anexoId: l.anexo_id, alvos: [...alvos.values()], tentativas };
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** Remove os alvos por bucket, em lotes; devolve os ids em que alguma remocao falhou. */
async function removerAlvos(
  svc: ClienteLimpeza,
  idsPorAlvo: Map<string, Map<string, Set<string>>>,
  registarErro?: (erro: unknown) => void,
): Promise<Set<string>> {
  const falhados = new Set<string>();
  for (const [bucket, porCaminho] of idsPorAlvo) {
    for (const lote of emLotes([...porCaminho.entries()], TAMANHO_DO_LOTE)) {
      let falhou = false;
      try {
        const { error } = await svc.storage.from(bucket).remove(lote.map(([caminho]) => caminho));
        if (error) {
          registarErro?.(error);
          falhou = true;
        }
      } catch (e) {
        registarErro?.(e);
        falhou = true;
      }
      if (falhou) for (const [, ids] of lote) for (const id of ids) falhados.add(id);
    }
  }
  return falhados;
}

/**
 * Corre uma volta. Lanca se a base recusar a escolha das linhas (nada foi
 * apagado, e o chamador responde 500); falhas de remocao contam em `falhados`.
 */
export async function limparAnexosJustificacoes(
  svc: ClienteLimpeza,
  registarErro?: (erro: unknown) => void,
): Promise<ResultadoLimpeza> {
  const { data, error } = await svc.rpc("hr_justificacao_anexos_limpar", { p_limite: LIMITE_DE_LINHAS });
  if (error) throw error;

  const linhas = Array.isArray(data) ? data : [];
  const falhadosPorId = new Set<string>();
  const idsValidos = new Set<string>();
  const idsPorAlvo = new Map<string, Map<string, Set<string>>>();
  let invalidas = 0;
  let reincidentes = 0;

  for (const bruta of linhas) {
    const linha = lerLinha(bruta);
    if (linha.tipo === "invalida") {
      invalidas += 1;
      continue;
    }
    if (linha.tipo === "fora_do_ambito") {
      falhadosPorId.add(linha.anexoId);
      continue;
    }
    if (linha.tentativas >= TENTATIVAS_DE_ALARME) reincidentes += 1;
    idsValidos.add(linha.anexoId);
    for (const { bucket, caminho } of linha.alvos) {
      const porCaminho = idsPorAlvo.get(bucket) ?? new Map<string, Set<string>>();
      porCaminho.set(caminho, new Set([...(porCaminho.get(caminho) ?? []), linha.anexoId]));
      idsPorAlvo.set(bucket, porCaminho);
    }
  }
  if (invalidas > 0) registarErro?.(new Error(`hr-justificacao-anexo: ${invalidas} linha(s) de limpeza com forma invalida`));
  if (falhadosPorId.size > 0) {
    registarErro?.(new Error(`hr-justificacao-anexo: ${falhadosPorId.size} linha(s) de limpeza com bucket fora dos anexos`));
  }

  for (const id of await removerAlvos(svc, idsPorAlvo, registarErro)) falhadosPorId.add(id);

  // Uma linha so e marcada quando TUDO o que trazia foi removido.
  const completos = [...idsValidos].filter((id) => !falhadosPorId.has(id));
  let apagados = 0;
  for (const lote of emLotes(completos, TAMANHO_DO_LOTE)) {
    const { error: erroMarcar } = await svc.rpc("rpc_hr_justificacao_anexo_objecto_removido", { p_ids: lote });
    if (erroMarcar) {
      // Os objectos ja nao existem; ficam por marcar e a proxima volta repete a
      // remocao (apagar o que ja nao existe nao e erro no Storage).
      registarErro?.(erroMarcar);
      for (const id of lote) falhadosPorId.add(id);
    } else {
      apagados += lote.length;
    }
  }

  const alarmes: CodigoDeAlarme[] = [];
  if (falhadosPorId.size > 0) alarmes.push("remocoes_falhadas");
  if (invalidas > 0) alarmes.push("linhas_invalidas");
  if (reincidentes > 0) alarmes.push("reincidentes");

  return { linhas: linhas.length, apagados, falhados: falhadosPorId.size + invalidas, alarmes };
}

/** A resposta HTTP de uma volta: 200 limpo, 500 com os codigos dos alarmes (nunca caminhos). */
export function respostaDaVolta(r: ResultadoLimpeza): { status: number; body: Record<string, unknown> } {
  const limpo = r.alarmes.length === 0;
  return {
    status: limpo ? 200 : 500,
    body: { ok: limpo, linhas: r.linhas, apagados: r.apagados, falhados: r.falhados, alarmes: r.alarmes },
  };
}

/** O texto do alarme para o Sentry: so codigos e contagens. */
export function mensagemDeAlarme(r: ResultadoLimpeza): string {
  return `hr-justificacao-anexo (limpar): alarme [${r.alarmes.join(",")}] linhas=${r.linhas} apagados=${r.apagados} falhados=${r.falhados}`;
}
