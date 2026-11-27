/**
 * A faixa «X pessoas saem nos próximos 30 dias com Y itens por devolver → ver» do lado do RH (Contratos a terminar e ficha da pessoa).
 * O «Ver» é uma ligação ao separador «Saídas» dos Ativos, só para quem tem `ativos.view`; sem esse acesso fica só o texto. Na ficha de uma
 * pessoa só se pede com o acesso completo ao RH (sem ele a base responde 42501).
 */
import { FaixaPorDevolver } from "@/components/ativos/FaixaPorDevolver";
import { usePermissoesPorDevolver } from "@/components/rh-exemplo/fimContrato/acessoPorDevolver";

const SAIDAS_NOS_ATIVOS = "/ativos?aba=saidas";

interface Props {
  organizationId: string | null;
  /** Só a pessoa da ficha. */
  pessoaId?: string | null;
  enabled?: boolean;
}

export function FaixaPorDevolverRh({ organizationId, pessoaId = null, enabled = true }: Props) {
  const { acessoCompleto, ligacaoAtivos } = usePermissoesPorDevolver();
  return (
    <FaixaPorDevolver
      organizationId={organizationId} pessoaId={pessoaId} enabled={enabled && (pessoaId === null || acessoCompleto)}
      hrefVer={ligacaoAtivos ? SAIDAS_NOS_ATIVOS : undefined}
    />
  );
}
