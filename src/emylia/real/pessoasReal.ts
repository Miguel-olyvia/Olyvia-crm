// «Novo negócio» para uma pessoa que já existe (30/10/2026): a pesquisa de pessoas da organização (a mesma da página Pessoas, neg_resumo_pessoas: nome,
// email ou telefone, mínimo 2 letras) e o contacto principal da pessoa escolhida, que fica no negócio novo. Só leitura.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chamarNeg } from "@/hooks/pessoas/chamarNeg";

export interface PessoaPesquisada { entityId: string; nome: string }

export const MIN_PESQUISA_PESSOA = 2;
const LIMITE = 8;

/** As primeiras pessoas da organização que casam com o texto (por nome); vazio com menos de 2 letras. Uma falha lança. */
export async function pesquisarPessoas(org: string, texto: string): Promise<PessoaPesquisada[]> {
  const pesquisa = texto.trim();
  if (pesquisa.length < MIN_PESQUISA_PESSOA) return [];
  const linhas = await chamarNeg<{ entity_id: string; nome: string | null }[] | null>("neg_resumo_pessoas", {
    p_organization_id: org, p_papel: null, p_etapa: null, p_pesquisa: pesquisa, p_ordem: "nome", p_depois_de_chave: null, p_depois_de_id: null,
    p_limite: LIMITE, p_atribuido_a: null, p_formulario_id: null, p_ultimo_resultado: null, p_voltou: null, p_atrasada: null,
  });
  return (linhas ?? []).map((l) => ({ entityId: l.entity_id, nome: l.nome?.trim() || "Sem nome" }));
}

const ESPERA_MS = 300;

/** A pesquisa enquanto se escreve: espera 300 ms depois da última letra e deita fora o que chega fora de ordem. Sem `org` ou com menos de 2 letras não pede nada. */
export function usePesquisaPessoas(org: string | null, texto: string) {
  const [pessoas, setPessoas] = useState<PessoaPesquisada[]>([]);
  const [aPesquisar, setAPesquisar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const limpo = texto.trim();
    if (!org || limpo.length < MIN_PESQUISA_PESSOA) { setPessoas([]); setAPesquisar(false); setErro(null); return; }
    let cancelado = false;
    setAPesquisar(true);
    const id = window.setTimeout(() => {
      pesquisarPessoas(org, limpo)
        .then((p) => { if (!cancelado) { setPessoas(p); setErro(null); } })
        .catch((e: unknown) => { if (!cancelado) { setPessoas([]); setErro(e instanceof Error ? e.message : "Não foi possível pesquisar."); } })
        .finally(() => { if (!cancelado) setAPesquisar(false); });
    }, ESPERA_MS);
    return () => { cancelado = true; window.clearTimeout(id); };
  }, [org, texto]);
  return { pessoas, aPesquisar, erro };
}

type Consulta ={ select: (c: string) => Consulta; eq: (c: string, v: unknown) => Consulta; limit: (n: number) => Consulta } & PromiseLike<{ data: unknown; error: { message: string } | null }>;
const tabela = (nome: string): Consulta => (supabase as unknown as { from: (n: string) => Consulta }).from(nome);

/** O telefone principal (ou, sem ele, o email principal) da pessoa, como o negócio o guarda em `tel`; vazio se não tem nenhum. */
export async function contactoDaPessoa(entityId: string): Promise<string> {
  const [tel, mail] = await Promise.all([
    tabela("anew_entity_phones").select("phone_number").eq("entity_id", entityId).eq("is_primary", true).limit(1),
    tabela("anew_entity_emails").select("email").eq("entity_id", entityId).eq("is_primary", true).limit(1),
  ]);
  if (tel.error) throw new Error(tel.error.message);
  if (mail.error) throw new Error(mail.error.message);
  const telefone = ((tel.data as { phone_number?: string | null }[] | null) ?? [])[0]?.phone_number?.trim();
  if (telefone) return telefone;
  return ((mail.data as { email?: string | null }[] | null) ?? [])[0]?.email?.trim() ?? "";
}
