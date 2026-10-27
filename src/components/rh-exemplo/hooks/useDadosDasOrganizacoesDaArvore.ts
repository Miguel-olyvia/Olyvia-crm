/**
 * O NIF, a morada e a organizacao-mae de cada organizacao da arvore da organizacao activa, delegando ao hook real que
 * le de Supabase. Serve a pagina «Organizacao» (aba «Dados» do no e aninhamento das filiais).
 */
import { useDadosDasOrganizacoesDaArvore as useDadosDasOrganizacoesDaArvoreReal } from "@/hooks/useDadosDasOrganizacoesDaArvore";

export type { DadosDaOrganizacao } from "@/hooks/useDadosDasOrganizacoesDaArvore";

export function useDadosDasOrganizacoesDaArvore() {
  return useDadosDasOrganizacoesDaArvoreReal();
}
