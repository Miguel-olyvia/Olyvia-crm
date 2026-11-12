// 12/11: «Simular função» em /negocios (NegociosEmylia.tsx), para demonstrar os fluxos com vários pontos de vista: o ecrã responde, SÓ NO
// ECRÃ, como se quem entrou tivesse apenas as permissões de uma função (perfil) da organização, ex. «Assistente comercial» ou «Comercial».
// Não toca na base além de LER (anew_roles e anew_role_permissions, que qualquer membro lê): os dados que a página lê e o que grava seguem
// as permissões reais, e o servidor recusa o que a conta real não deixa. Os códigos simulados são os da função cortados aos que o ecrã
// consulta (CODIGOS_DO_ECRA).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mensagemDeErro } from "@/components/utilizadores-perfis/rolesReais";
import { CODIGOS_NEGOCIOS } from "@/emylia/permissoesReais";

export interface Funcao { id: string; code: string; name: string }
export interface Simulacao { id: string; nome: string; codigos: ReadonlySet<string> }

const LIMITE_LINHAS = 5000;
/** Os códigos que o ecrã consulta fora de CODIGOS_NEGOCIOS: pessoas.config (o «Mudar» do impacto dos campos) e as rotas das ligações
 *  (PERM_PAGINA: a Receção e as encomendas a fornecedor). */
const CODIGOS_EXTRA: readonly string[] = ["pessoas.config", "receiving.view", "purchase_orders.view"];
/** Tudo o que NegociosEmylia pergunta, por fn_cat_pode (CODIGOS_NEGOCIOS) ou pelo perfil (usePermissions). */
export const CODIGOS_DO_ECRA: ReadonlySet<string> = new Set([...CODIGOS_NEGOCIOS, ...CODIGOS_EXTRA]);

/** Os códigos de uma função que o ecrã consulta. Vazio (e nunca nulo): uma função sem permissões simula-se como sem nenhuma. */
export const codigosSimulados = (codigosDaFuncao: readonly string[]): ReadonlySet<string> =>
  new Set(codigosDaFuncao.filter((c) => CODIGOS_DO_ECRA.has(c)));

/** As funções da organização (sem as eliminadas). Uma falha sobe como erro: nunca uma lista vazia no lugar dela. */
export async function lerFuncoes(org: string): Promise<Funcao[]> {
  const { data, error } = await supabase.from("anew_roles").select("id, code, name").eq("organization_id", org).is("deleted_at", null).order("name");
  if (error) throw new Error(mensagemDeErro(error));
  return ((data ?? []) as Funcao[]).map((f) => ({ id: f.id, code: f.code, name: f.name }));
}

/** Os códigos de permissão de uma função. Uma falha sobe como erro. */
export async function lerCodigosDaFuncao(roleId: string): Promise<string[]> {
  const { data, error } = await supabase.from("anew_role_permissions").select("permission_code").eq("role_id", roleId).limit(LIMITE_LINHAS);
  if (error) throw new Error(mensagemDeErro(error));
  return ((data ?? []) as { permission_code: string }[]).map((p) => p.permission_code);
}

export interface SimularFuncao {
  /** As funções da organização; null enquanto se leem ou se a leitura falhou (ver `erro`). */
  funcoes: Funcao[] | null;
  /** A simulação ativa; null: a minha (real). */
  simulacao: Simulacao | null;
  /** A ler os códigos da função escolhida. */
  aLer: boolean;
  /** O erro curto da lista ou da função escolhida; null: nenhum. */
  erro: string | null;
  escolher: (id: string) => Promise<void>;
  voltar: () => void;
}

/** O estado da simulação nesta organização. Muda a organização: repõe e volta a ler a lista. Ao desmontar, o estado vai com a página. */
export function useSimularFuncao(org: string | null): SimularFuncao {
  const [funcoes, setFuncoes] = useState<Funcao[] | null>(null);
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [aLer, setALer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // cada escolha e cada volta invalidam a anterior: uma leitura lenta que chega depois não volta a simular
  const pedido = useRef(0);
  useEffect(() => {
    pedido.current += 1;
    setSimulacao(null); setFuncoes(null); setErro(null); setALer(false);
    if (!org) return;
    let vivo = true;
    lerFuncoes(org)
      .then((f) => { if (vivo) setFuncoes(f); })
      .catch((e: unknown) => { if (vivo) setErro(`Não foi possível ler as funções: ${mensagemDeErro(e)}`); });
    return () => { vivo = false; pedido.current += 1; };
  }, [org]);

  const voltar = useCallback(() => { pedido.current += 1; setSimulacao(null); setALer(false); setErro(null); }, []);
  const escolher = useCallback(async (id: string) => {
    const f = funcoes?.find((x) => x.id === id);
    if (!f) { voltar(); return; }
    const meu = ++pedido.current;
    setALer(true); setErro(null);
    try {
      const codigos = codigosSimulados(await lerCodigosDaFuncao(f.id));
      if (meu !== pedido.current) return;
      setSimulacao({ id: f.id, nome: f.name, codigos });
    } catch (e) {
      if (meu === pedido.current) setErro(`Não foi possível ler as permissões da função ${f.name}: ${mensagemDeErro(e)}`);
    } finally {
      if (meu === pedido.current) setALer(false);
    }
  }, [funcoes, voltar]);
  return { funcoes, simulacao, aLer, erro, escolher, voltar };
}
