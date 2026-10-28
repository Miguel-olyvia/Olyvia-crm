// A escolha de templates e de minuta de um negócio da Emylia, gravada e lida SÓ por duas RPCs próprias (nada passa pelo armazém do Ben nem por
// neg_guardar_negocio):  neg_ler_templates_negocio(p_negocio_id)  e  neg_definir_templates_negocio(p_negocio_id, p_dados jsonb)
// (rascunho supabase/rascunhos/NOVO-20261231999800_negocio_templates.sql).
// Chaves lidas: template_orcamento_id, template_proposta_id, template_proposta_snapshot, minuta_id, minuta_respostas, contrato_corpo_html,
// orcamento_editavel, proposta_editavel, contrato_editavel, proposta_id, contrato_id.
// Chaves gravadas (só as que mudam; as ausentes ficam como estão na base): template_orcamento_id, template_proposta_id, minuta_id,
// minuta_respostas, contrato_corpo_html. O snapshot da proposta congela-o a base.
// Enquanto as RPCs não estiverem na base, o estado é «sem-base»: diz-se, não se grava a meio e nada rebenta.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TemplatesDoNegocio {
  template_orcamento_id: string | null;
  template_proposta_id: string | null;
  template_proposta_snapshot: unknown;
  minuta_id: string | null;
  minuta_respostas: Record<string, string>;
  contrato_corpo_html: string | null;
  orcamento_editavel: boolean;
  proposta_editavel: boolean;
  contrato_editavel: boolean;
  proposta_id: string | null;
  contrato_id: string | null;
}

/** As chaves que a base aceita gravar (parciais). */
export type AlteracaoDeTemplates = Partial<Pick<TemplatesDoNegocio,
  "template_orcamento_id" | "template_proposta_id" | "minuta_id" | "minuta_respostas" | "contrato_corpo_html">>;

export const SEM_TEMPLATES: TemplatesDoNegocio = {
  template_orcamento_id: null, template_proposta_id: null, template_proposta_snapshot: null, minuta_id: null, minuta_respostas: {},
  contrato_corpo_html: null, orcamento_editavel: false, proposta_editavel: false, contrato_editavel: false, proposta_id: null, contrato_id: null,
};

export type EstadoTemplatesNegocio = "a-ler" | "pronto" | "sem-base" | "erro";

interface ErroRpc { code?: string; message?: string }
/** A função ainda não existe na base (PostgREST PGRST202 ou Postgres 42883). */
export const faltaAFuncao = (e: ErroRpc | null | undefined): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Lê o resultado da RPC (um objeto, ou uma linha dentro de uma lista) para o formato do hook. */
export function lerTemplates(bruto: unknown): TemplatesDoNegocio {
  const r = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== "object") return SEM_TEMPLATES;
  const pv = r.minuta_respostas && typeof r.minuta_respostas === "object" && !Array.isArray(r.minuta_respostas) ? r.minuta_respostas as Record<string, unknown> : {};
  return {
    template_orcamento_id: texto(r.template_orcamento_id), template_proposta_id: texto(r.template_proposta_id),
    template_proposta_snapshot: r.template_proposta_snapshot ?? null, minuta_id: texto(r.minuta_id),
    minuta_respostas: Object.fromEntries(Object.entries(pv).map(([k, v]) => [k, String(v ?? "")])),
    contrato_corpo_html: texto(r.contrato_corpo_html),
    orcamento_editavel: r.orcamento_editavel === true, proposta_editavel: r.proposta_editavel === true, contrato_editavel: r.contrato_editavel === true,
    proposta_id: texto(r.proposta_id), contrato_id: texto(r.contrato_id),
  };
}

type Rpc = (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: ErroRpc | null }>;
const rpc: Rpc = (nome, args) => (supabase as unknown as { rpc: Rpc }).rpc(nome, args);

/** Lê o estado dos templates do negócio (também para o envio ao portal usar os mesmos ids de proposta e contrato). */
export const lerTemplatesDoNegocio = (negocioId: string) => rpc("neg_ler_templates_negocio", { p_negocio_id: negocioId });

export interface UseTemplatesDoNegocio {
  estado: EstadoTemplatesNegocio;
  dados: TemplatesDoNegocio;
  erro: string | null;
  aGuardar: boolean;
  erroAoGuardar: string | null;
  /** Grava SÓ as chaves da alteração; devolve `true` só se a base a aceitou. Nunca descarta em silêncio: se não grava, diz porquê. */
  guardar: (alteracao: AlteracaoDeTemplates) => Promise<boolean>;
  reler: () => void;
}

export function useTemplatesDoNegocio(negocioId: string | null): UseTemplatesDoNegocio {
  const [estado, setEstado] = useState<EstadoTemplatesNegocio>("a-ler");
  const [dados, setDados] = useState<TemplatesDoNegocio>(SEM_TEMPLATES);
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [erroAoGuardar, setErroAoGuardar] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!negocioId) { setEstado("a-ler"); return; }
    let vivo = true;
    setEstado("a-ler"); setErro(null);
    void Promise.resolve(lerTemplatesDoNegocio(negocioId)).then(({ data, error }) => {
      if (!vivo) return;
      if (error) {
        if (faltaAFuncao(error)) setEstado("sem-base");
        else { setErro(error.message ?? "Erro ao ler os templates do negócio."); setEstado("erro"); }
        return;
      }
      setDados(lerTemplates(data)); setEstado("pronto");
    }, (e: unknown) => { if (vivo) { setErro(e instanceof Error ? e.message : "Erro ao ler os templates do negócio."); setEstado("erro"); } });
    return () => { vivo = false; };
  }, [negocioId, tentativa]);

  const guardar = useCallback(async (alteracao: AlteracaoDeTemplates): Promise<boolean> => {
    if (!negocioId) { setErroAoGuardar("Este negócio ainda não está guardado: a escolha não ficou gravada."); return false; }
    if (estado !== "pronto") { setErroAoGuardar("A escolha ainda não pode ser gravada: espere que acabe de ler o negócio e tente outra vez."); return false; }
    setAGuardar(true); setErroAoGuardar(null);
    try {
      const { data, error } = await rpc("neg_definir_templates_negocio", { p_negocio_id: negocioId, p_dados: alteracao });
      if (error) {
        if (faltaAFuncao(error)) setEstado("sem-base");
        else setErroAoGuardar(error.message ?? "Não foi possível guardar a escolha.");
        return false;
      }
      setDados(lerTemplates(data)); // o que a base devolveu é o mesmo que a leitura
      return true;
    } catch (e) {
      setErroAoGuardar(e instanceof Error ? e.message : "Não foi possível guardar a escolha.");
      return false;
    } finally { setAGuardar(false); }
  }, [negocioId, estado]);

  return { estado, dados, erro, aGuardar, erroAoGuardar, guardar, reler: () => setTentativa((n) => n + 1) };
}
