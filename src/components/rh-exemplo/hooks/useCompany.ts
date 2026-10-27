/**
 * A organizacao activa, delegando ao hook real do contexto de empresa.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 *
 * A interface original devolvia `activeCompany` sempre preenchida (nunca null).
 * Para manter a compatibilidade de tipos com os consumidores existentes, quando
 * nao ha empresa activa devolve-se um objecto vazio com `id = ""` -- os hooks
 * reais protegem-se contra isso com `if (!activeCompany?.id)`.
 */
import { useCompany as useCompanyReal } from "@/contexts/CompanyContext";

export interface EmpresaExemplo {
  id: string;
  name: string;
}

const SEM_EMPRESA: EmpresaExemplo = { id: "", name: "" };

export function useCompany(): {
  activeCompany: EmpresaExemplo;
  companies: EmpresaExemplo[];
  isLoading: boolean;
  /** Verdadeiro quando o contexto já carregou e NÃO há organização ativa (o `activeCompany` vazio não o diz). */
  semOrganizacao: boolean;
} {
  const real = useCompanyReal();
  const activeCompany: EmpresaExemplo = real.activeCompany
    ? { id: real.activeCompany.id, name: (real.activeCompany as any).name ?? "" }
    : SEM_EMPRESA;
  return {
    activeCompany,
    companies: (real as any).companies?.map((c: any) => ({ id: c.id, name: c.name ?? "" })) ?? [],
    isLoading: real.isLoading ?? false,
    semOrganizacao: !real.activeCompany,
  };
}
