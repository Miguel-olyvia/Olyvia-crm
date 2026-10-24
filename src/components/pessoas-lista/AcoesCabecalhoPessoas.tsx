import { PermissionGate } from "@/components/PermissionGate";
import { NovaLeadReal } from "@/components/pessoas-leads/NovaLeadReal";
import { BotaoWorkflowPessoas } from "@/components/pessoas-workflow/BotaoWorkflowPessoas";
import type { AoAbrirPessoa } from "./LinhaListaReal";

interface AcoesCabecalhoPessoasProps {
  aoAbrirPessoa: AoAbrirPessoa;
  aoAnunciar: (texto: string) => void;
}

/**
 * As ações do cabeçalho das páginas reais (Lista e Pipeline): «Nova lead» só a quem pode criar leads e «Workflow» só a quem pode
 * configurá-lo (`pessoas.config`, não a de Leads).
 */
export function AcoesCabecalhoPessoas({ aoAbrirPessoa, aoAnunciar }: AcoesCabecalhoPessoasProps) {
  return (
    <>
      <PermissionGate permission="leads.create">
        <NovaLeadReal aoAbrirPessoa={aoAbrirPessoa} aoAnunciar={aoAnunciar} />
      </PermissionGate>
      <PermissionGate permission="pessoas.config">
        <BotaoWorkflowPessoas />
      </PermissionGate>
    </>
  );
}
