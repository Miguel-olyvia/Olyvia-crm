/**
 * Fecho da obra (db/obras-fecho.sql): divisões, vistoria, remates, fotos
 * antes/depois, auto de receção e justificação de fecho sem auto.
 *
 * Ficheiros no bucket privado `operacoes`:
 *   <organização>/<obra>/fecho/…     assinatura e PDF do auto
 *   <organização>/<obra>/remates/…   fotos dos remates
 * Duas escritas, como nas fotos das tarefas: se o registo falhar, os
 * ficheiros saem do storage.
 */
import { supabase } from "./supabase";
import { ErroDeDados, ErroDeEscrita, nomeSorteado } from "./dados";
import { data as formatarData } from "./formatar";
import type { DadosAuto } from "../domain/pdfAuto";

const BUCKET = "operacoes";

export type TipoDivisao = "casa_banho" | "cozinha" | "geral";
export type ResultadoVistoria = "ok" | "nok" | "na";
export type EstadoRemate = "aberto" | "resolvido" | "verificado";
export type OrigemRemate = "vistoria" | "rececao" | "outro";
export type MomentoFoto = "antes" | "depois";

export const ROTULO_TIPO_DIVISAO: Record<TipoDivisao, string> = {
  casa_banho: "Casa de banho",
  cozinha: "Cozinha",
  geral: "Geral",
};

export const ROTULO_ESTADO_REMATE: Record<EstadoRemate, string> = {
  aberto: "Aberto",
  resolvido: "Resolvido",
  verificado: "Verificado",
};

export interface DivisaoFecho {
  id: string;
  nome: string;
  tipo: TipoDivisao;
  itens: string[];
}

export interface RespostaVistoria {
  divisao_id: string;
  item: string;
  resultado: ResultadoVistoria;
  nota: string | null;
  remate_id: string | null;
}

export interface Remate {
  id: string;
  divisao_id: string | null;
  descricao: string;
  foto_caminho: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  estado: EstadoRemate;
  origem: OrigemRemate;
  nota: string | null;
  criado_em: string;
  resolvido_em: string | null;
  verificado_em: string | null;
}

export interface FotoFecho {
  id: string;
  caminho: string;
  nome: string;
  tarefa: string;
  momento: MomentoFoto | null;
  divisao_id: string | null;
  carregado_em: string;
}

export interface FechoObra {
  obra: {
    id: string;
    codigo: string;
    titulo: string;
    estado: string;
    morada: string | null;
    cliente: string | null;
    supervisor_id: string | null;
    data_inicio_prevista: string | null;
    iniciada_em: string | null;
    concluida_em: string | null;
    inicio_planeado: string | null;
    fim_planeado: string | null;
    fim_original: string | null;
    n_tarefas: number;
    n_por_validar: number;
  };
  pode: { fechar: boolean; justificar: boolean; eu: string | null };
  divisoes: DivisaoFecho[];
  sugestoes: Array<{ nome: string; tipo: TipoDivisao }>;
  vistoria: RespostaVistoria[];
  remates: Remate[];
  fotos: FotoFecho[];
  fecho: {
    auto_assinante: string | null;
    auto_assinatura_caminho: string | null;
    auto_pdf_caminho: string | null;
    auto_observacoes: string | null;
    auto_assinado_em: string | null;
    justificacao: string | null;
    justificado_em: string | null;
    justificado_por: string | null;
  } | null;
}

/** null = o db/obras-fecho.sql ainda não foi aplicado nesta base. */
export async function lerFecho(obraId: string): Promise<FechoObra | null> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_fecho", { p_obra_id: obraId });
  if (error) {
    const txt = `${error.message} ${(error as { code?: string }).code ?? ""}`;
    if (/rpc_ops_obra_fecho|function .* does not exist|PGRST202|42883/i.test(txt)) return null;
    console.error("[Obras] ler o fecho:", error);
    throw new ErroDeDados("Não foi possível carregar o fecho da obra.");
  }
  return data as unknown as FechoObra;
}

async function rpc(nome: string, args: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new ErroDeEscrita(error.message || falha);
  return (data ?? {}) as Record<string, unknown>;
}

export const guardarDivisao = (obraId: string, nome: string, tipo: TipoDivisao) =>
  rpc("rpc_ops_obra_divisao_guardar", { p_obra_id: obraId, p_nome: nome, p_tipo: tipo }, "Não foi possível guardar a divisão.");

export const removerDivisao = (divisaoId: string) =>
  rpc("rpc_ops_obra_divisao_remover", { p_divisao_id: divisaoId }, "Não foi possível tirar a divisão.");

export const responderVistoria = (divisaoId: string, item: string, resultado: ResultadoVistoria, nota?: string | null) =>
  rpc(
    "rpc_ops_obra_vistoria_responder",
    { p_divisao_id: divisaoId, p_item: item, p_resultado: resultado, p_nota: nota ?? null },
    "Não foi possível gravar a resposta."
  );

export const configurarVistoria = (orgId: string, tipo: TipoDivisao, itens: string[]) =>
  rpc("rpc_ops_obra_vistoria_configurar", { p_org: orgId, p_tipo: tipo, p_itens: itens }, "Não foi possível guardar a lista.");

export const mudarEstadoRemate = (remateId: string, estado: EstadoRemate, nota?: string | null) =>
  rpc("rpc_ops_obra_remate_estado", { p_remate_id: remateId, p_estado: estado, p_nota: nota ?? null }, "Não foi possível mudar o remate.");

export const marcarFoto = (fotoId: string, momento: MomentoFoto | null, divisaoId: string | null) =>
  rpc("rpc_ops_obra_foto_marcar", { p_foto_id: fotoId, p_momento: momento, p_divisao_id: divisaoId }, "Não foi possível marcar a foto.");

export const justificarFecho = (obraId: string, texto: string) =>
  rpc("rpc_ops_obra_fecho_justificar", { p_obra_id: obraId, p_justificacao: texto }, "Não foi possível guardar a justificação.");

function extensao(f: File): string {
  return f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
}

async function subir(caminho: string, corpo: Blob, tipo: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, corpo, { contentType: tipo, upsert: false });
  if (error) {
    console.error("[Obras] falha a enviar ficheiro do fecho:", error);
    const m = error.message ?? "";
    throw new ErroDeEscrita(
      m.includes("exceeded") || m.includes("too large")
        ? "O ficheiro é grande demais. O limite é 25 MB."
        : m.includes("row-level security") || m.includes("Unauthorized")
          ? "Sem permissão para guardar ficheiros nesta obra."
          : m || "Não foi possível enviar o ficheiro."
    );
  }
}

export async function criarRemate(args: {
  organizationId: string;
  obraId: string;
  descricao: string;
  divisaoId: string | null;
  origem: OrigemRemate;
  responsavelId: string | null;
  foto: File | null;
}): Promise<void> {
  let caminho: string | null = null;
  if (args.foto) {
    caminho = `${args.organizationId}/${args.obraId}/remates/${nomeSorteado()}${extensao(args.foto)}`;
    await subir(caminho, args.foto, args.foto.type || "application/octet-stream");
  }
  try {
    await rpc(
      "rpc_ops_obra_remate_criar",
      {
        p_obra_id: args.obraId,
        p_descricao: args.descricao,
        p_divisao_id: args.divisaoId,
        p_origem: args.origem,
        p_responsavel_id: args.responsavelId,
        p_foto_caminho: caminho,
      },
      "Não foi possível criar o remate."
    );
  } catch (e) {
    if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
    throw e;
  }
}

/** Sobe a assinatura e o PDF, e regista o auto. */
export async function registarAuto(args: {
  organizationId: string;
  obraId: string;
  assinante: string;
  observacoes: string | null;
  assinatura: Blob;
  pdf: Uint8Array;
  resumo: Record<string, unknown>;
}): Promise<void> {
  const base = `${args.organizationId}/${args.obraId}/fecho/${nomeSorteado()}`;
  const cAss = `${base}-assinatura.jpg`;
  const cPdf = `${base}-auto-de-rececao.pdf`;
  await subir(cAss, args.assinatura, "image/jpeg");
  try {
    await subir(cPdf, new Blob([args.pdf as BlobPart], { type: "application/pdf" }), "application/pdf");
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([cAss]);
    throw e;
  }
  try {
    await rpc(
      "rpc_ops_obra_auto_registar",
      {
        p_obra_id: args.obraId,
        p_assinante: args.assinante,
        p_assinatura_caminho: cAss,
        p_pdf_caminho: cPdf,
        p_observacoes: args.observacoes,
        p_resumo: args.resumo,
      },
      "Não foi possível registar o auto."
    );
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([cAss, cPdf]);
    throw e;
  }
}

/** Link temporário (1 h) para descarregar o PDF do auto. */
export async function urlParaDescarregar(caminho: string, nome: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600, { download: nome });
  if (error) {
    console.error("[Obras] link do PDF:", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** O que vai no auto (sem o nome, a data e as observações): obra, datas, tarefas, remates por fechar. */
export function resumoDoAuto(f: FechoObra, empresa?: string | null): Omit<DadosAuto, "assinante" | "assinadoEm" | "observacoes"> {
  const o = f.obra;
  const nomeDivisao = new Map(f.divisoes.map((d) => [d.id, d.nome]));
  const pendentes = f.remates.filter((r) => r.estado !== "verificado");
  const linhasDatas: Array<[string, string]> = [];
  if (o.data_inicio_prevista) linhasDatas.push(["Início previsto", formatarData(o.data_inicio_prevista)]);
  if (o.iniciada_em) linhasDatas.push(["Início real", formatarData(o.iniciada_em)]);
  if (o.fim_original && o.fim_original !== o.fim_planeado)
    linhasDatas.push(["Fim previsto (original)", formatarData(o.fim_original)]);
  if (o.fim_planeado) linhasDatas.push(["Fim planeado", formatarData(o.fim_planeado)]);
  return {
    empresa: empresa ?? null,
    codigo: o.codigo,
    titulo: o.titulo,
    cliente: o.cliente,
    morada: o.morada,
    linhasDatas,
    tarefas: `${o.n_tarefas - o.n_por_validar} de ${o.n_tarefas} validadas`,
    remates: pendentes.map(
      (r) =>
        `${r.divisao_id ? `${nomeDivisao.get(r.divisao_id) ?? "Divisão"} — ` : ""}${r.descricao}` +
        ` (${ROTULO_ESTADO_REMATE[r.estado].toLowerCase()}${r.responsavel ? `, ${r.responsavel}` : ""})`
    ),
  };
}
