/**
 * A limpeza dos ficheiros de convites de admissao, sem Deno nem rede (o cliente
 * entra por um tipo estrutural minimo, para se testar no vitest).
 *
 * O QUE FAZ
 * ---------
 * A base MARCA o que e para apagar (hr_convite_anexos_limpar: convites que
 * expiraram ou foram revogados ha mais de 7 dias, uploads abandonados, e a copia
 * da quarentena de ficheiros ja ligados ou promovidos) e devolve, por linha, TUDO
 * o que ha para tirar do Storage:
 *
 *   bucket + caminho     o objecto da propria linha (so se apagada e por remover)
 *   caminho_quarentena   a copia que ficou em hr-documentos-quarantine
 *   caminhos_finais      os tres caminhos finais possiveis em hr-documentos, para
 *                        linhas apagadas que nunca foram ligadas (apanha o objecto
 *                        final que um desfazer falhado deixou orfao)
 *
 * Um ficheiro so se apaga pela API do Storage -- nunca com DELETE em
 * storage.objects --, por isso esta funcao remove tudo isso (apagar o que nao
 * existe e inofensivo) e so depois diz a base quais linhas ficaram completas
 * (hr_convite_anexos_objecto_removido). O que falhar fica por marcar e volta na
 * volta seguinte; a base ordena por tentativas, para linhas teimosas nao
 * bloquearem as novas.
 *
 * NO FIM DA VOLTA le hr_convite_anexos_limpeza_estado() e levanta ALARMES: uma
 * remocao que falhou, linhas que nao se conseguem ler, apagadas ha mais de 2 dias
 * ainda por remover, promocoes pendentes. Sem alarme, uma limpeza que falha
 * responde 200 todos os dias e um documento de identificacao fica no Storage.
 *
 * NUNCA devolve nem regista caminhos, nomes ou tokens: so contagens e codigos.
 */

export const BUCKET_QUARENTENA = "hr-documentos-quarantine";
export const BUCKET_FINAL = "hr-documentos";
export const BUCKETS_DE_ANEXOS = [BUCKET_QUARENTENA, BUCKET_FINAL] as const;
export const TAMANHO_DO_LOTE = 100;
/** Os mesmos valores por omissao da funcao SQL, ditos aqui para ficarem a vista. */
export const DIAS_DE_TOLERANCIA = 7;
export const LIMITE_DE_LINHAS = 200;

/** Um objecto a tirar do Storage. */
export interface AlvoDeLimpeza {
  bucket: string;
  caminho: string;
}

export interface LinhaALimpar {
  anexo_id: string;
  bucket: string | null;
  caminho: string | null;
  caminho_quarentena: string | null;
  caminhos_finais: string[] | null;
  tentativas: number;
}

export interface EstadoLimpeza {
  por_remover: number;
  por_remover_antigos: number;
  quarentena_por_remover: number;
  promocoes_pendentes: number;
  max_tentativas: number;
  job_agendado: boolean;
}

export type CodigoDeAlarme =
  | "remocoes_falhadas"
  | "linhas_invalidas"
  | "estado_ilegivel"
  | "por_remover_antigos"
  | "promocoes_pendentes";

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
  apagados: number;
  falhados: number;
  /** `null` se a base nao deixou ler o estado (e isso ja e um alarme). */
  estado: EstadoLimpeza | null;
  alarmes: CodigoDeAlarme[];
}

const eTextoNaoVazio = (v: unknown): v is string => typeof v === "string" && v !== "";
const eBucketDeAnexos = (v: string): boolean => (BUCKETS_DE_ANEXOS as readonly string[]).includes(v);

type LinhaLida =
  | { tipo: "valida"; anexoId: string; alvos: AlvoDeLimpeza[] }
  /** Aponta para um bucket que nao e dos anexos: nunca se toca, mas conta e alarma. */
  | { tipo: "fora_do_ambito"; anexoId: string }
  | { tipo: "invalida" };

/** Le uma linha da base; nunca lanca, venha o que vier. */
function lerLinha(valor: unknown): LinhaLida {
  if (valor === null || typeof valor !== "object") return { tipo: "invalida" };
  const l = valor as Record<string, unknown>;
  if (!eTextoNaoVazio(l.anexo_id)) return { tipo: "invalida" };

  const alvos = new Map<string, AlvoDeLimpeza>();
  const acrescentar = (bucket: string, caminho: string) => {
    alvos.set(`${bucket}\u0000${caminho}`, { bucket, caminho });
  };

  // O objecto da propria linha: o bucket e o caminho vem sempre juntos.
  const temObjecto = l.bucket != null || l.caminho != null;
  if (temObjecto) {
    if (!eTextoNaoVazio(l.bucket) || !eTextoNaoVazio(l.caminho)) return { tipo: "invalida" };
    if (!eBucketDeAnexos(l.bucket)) return { tipo: "fora_do_ambito", anexoId: l.anexo_id };
    acrescentar(l.bucket, l.caminho);
  }

  if (l.caminho_quarentena != null) {
    if (!eTextoNaoVazio(l.caminho_quarentena)) return { tipo: "invalida" };
    acrescentar(BUCKET_QUARENTENA, l.caminho_quarentena);
  }

  if (l.caminhos_finais != null) {
    if (!Array.isArray(l.caminhos_finais) || !l.caminhos_finais.every(eTextoNaoVazio)) return { tipo: "invalida" };
    for (const caminho of l.caminhos_finais) acrescentar(BUCKET_FINAL, caminho);
  }

  // Uma linha que nao traz nada para remover nao devia ter sido devolvida.
  if (alvos.size === 0) return { tipo: "invalida" };
  return { tipo: "valida", anexoId: l.anexo_id, alvos: [...alvos.values()] };
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

const eNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function lerEstado(data: unknown): EstadoLimpeza | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const e = data as Record<string, unknown>;
  if (
    !eNumero(e.por_remover) ||
    !eNumero(e.por_remover_antigos) ||
    !eNumero(e.quarentena_por_remover) ||
    !eNumero(e.promocoes_pendentes) ||
    !eNumero(e.max_tentativas) ||
    typeof e.job_agendado !== "boolean"
  ) {
    return null;
  }
  return {
    por_remover: e.por_remover,
    por_remover_antigos: e.por_remover_antigos,
    quarentena_por_remover: e.quarentena_por_remover,
    promocoes_pendentes: e.promocoes_pendentes,
    max_tentativas: e.max_tentativas,
    job_agendado: e.job_agendado,
  };
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
 * apagado, e o chamador responde 500); falhas de remocao contam em `falhados` e
 * levantam alarme.
 */
export async function limparAnexosExpirados(
  svc: ClienteLimpeza,
  registarErro?: (erro: unknown) => void,
): Promise<ResultadoLimpeza> {
  const { data, error } = await svc.rpc("hr_convite_anexos_limpar", {
    p_dias_tolerancia: DIAS_DE_TOLERANCIA,
    p_limite: LIMITE_DE_LINHAS,
  });
  if (error) throw error;

  const falhadosPorId = new Set<string>();
  let invalidas = 0;
  const idsPorAlvo = new Map<string, Map<string, Set<string>>>();
  const idsValidos = new Set<string>();

  for (const bruta of Array.isArray(data) ? data : []) {
    const linha = lerLinha(bruta);
    if (linha.tipo === "invalida") {
      invalidas += 1;
      continue;
    }
    if (linha.tipo === "fora_do_ambito") {
      falhadosPorId.add(linha.anexoId);
      continue;
    }
    idsValidos.add(linha.anexoId);
    for (const { bucket, caminho } of linha.alvos) {
      const porCaminho = idsPorAlvo.get(bucket) ?? new Map<string, Set<string>>();
      porCaminho.set(caminho, new Set([...(porCaminho.get(caminho) ?? []), linha.anexoId]));
      idsPorAlvo.set(bucket, porCaminho);
    }
  }
  if (invalidas > 0) registarErro?.(new Error(`convite-admissao-limpeza: ${invalidas} linha(s) com forma invalida`));
  if (falhadosPorId.size > 0) {
    registarErro?.(new Error(`convite-admissao-limpeza: ${falhadosPorId.size} linha(s) com bucket fora dos anexos`));
  }

  for (const id of await removerAlvos(svc, idsPorAlvo, registarErro)) falhadosPorId.add(id);

  // Uma linha so e marcada quando TUDO o que trazia foi removido.
  const completos = [...idsValidos].filter((id) => !falhadosPorId.has(id));
  let apagados = 0;
  for (const lote of emLotes(completos, TAMANHO_DO_LOTE)) {
    const { error: erroMarcar } = await svc.rpc("hr_convite_anexos_objecto_removido", { p_ids: lote });
    if (erroMarcar) {
      // Os objectos ja nao existem; ficam por marcar e a proxima volta repete
      // a remocao (apagar o que ja nao existe nao e erro no Storage).
      registarErro?.(erroMarcar);
      for (const id of lote) falhadosPorId.add(id);
    } else {
      apagados += lote.length;
    }
  }

  const falhados = falhadosPorId.size + invalidas;

  let estado: EstadoLimpeza | null = null;
  try {
    const { data: dadosEstado, error: erroEstado } = await svc.rpc("hr_convite_anexos_limpeza_estado", {});
    if (erroEstado) registarErro?.(erroEstado);
    else estado = lerEstado(dadosEstado);
  } catch (e) {
    registarErro?.(e);
  }

  const alarmes: CodigoDeAlarme[] = [];
  if (falhadosPorId.size > 0) alarmes.push("remocoes_falhadas");
  if (invalidas > 0) alarmes.push("linhas_invalidas");
  if (estado === null) alarmes.push("estado_ilegivel");
  else {
    if (estado.por_remover_antigos > 0) alarmes.push("por_remover_antigos");
    if (estado.promocoes_pendentes > 0) alarmes.push("promocoes_pendentes");
  }

  return { apagados, falhados, estado, alarmes };
}

/** A resposta HTTP de uma volta: 200 limpo, 500 com os codigos dos alarmes (nunca caminhos). */
export function respostaDaVolta(r: ResultadoLimpeza): { status: number; body: Record<string, unknown> } {
  const limpo = r.alarmes.length === 0;
  return {
    status: limpo ? 200 : 500,
    body: { ok: limpo, apagados: r.apagados, falhados: r.falhados, alarmes: r.alarmes, estado: r.estado },
  };
}

/** O texto do alarme para o Sentry: so codigos e contagens. */
export function mensagemDeAlarme(r: ResultadoLimpeza): string {
  const antigos = r.estado?.por_remover_antigos ?? 0;
  const promocoes = r.estado?.promocoes_pendentes ?? 0;
  return `convite-admissao-limpeza: alarme [${r.alarmes.join(",")}] falhados=${r.falhados} antigos=${antigos} promocoes_pendentes=${promocoes}`;
}
