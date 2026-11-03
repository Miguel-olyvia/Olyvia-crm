// Os números das pastilhas das abas: horas extra por decidir e marcações por justificar dentro do prazo.
import { useHorasExtraListar } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";

export interface ContadoresAssiduidade {
  horasExtra: number;
  justificacoes: number;
}

/**
 * `justificacoesPorFazer` vem de `useJustificacoesDaPessoa` (os desvios da base), lido UMA vez pela aba para a pastilha e
 * para a lista não irem os dois à base. As horas extra pendentes vêm da base (só de quem pode ler as horas extra desta pessoa).
 */
export function useContadoresAssiduidade(pessoaId: string, justificacoesPorFazer: number): ContadoresAssiduidade {
  const { permissoes } = usePermissoesAssiduidade();
  const { total } = useHorasExtraListar({ pessoaId, estado: "pendente", enabled: permissoes.view || permissoes.viewOwn });
  return { horasExtra: total, justificacoes: justificacoesPorFazer };
}
