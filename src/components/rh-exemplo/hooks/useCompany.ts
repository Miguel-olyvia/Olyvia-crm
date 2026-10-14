/**
 * A "organização activa" da apresentação: uma só, fixa, com um nome de exemplo.
 * Mesmo desenho de `useCompany` do módulo real (só os campos que os ecrãs de RH lêem).
 */
import { ORGANIZACAO_EXEMPLO_ID, ORGANIZACAO_EXEMPLO_NOME } from "@/components/rh-exemplo/dados/constantes";

export interface EmpresaExemplo {
  id: string;
  name: string;
}

const EMPRESA: EmpresaExemplo = { id: ORGANIZACAO_EXEMPLO_ID, name: ORGANIZACAO_EXEMPLO_NOME };
const EMPRESAS: EmpresaExemplo[] = [EMPRESA];

export function useCompany(): {
  activeCompany: EmpresaExemplo;
  companies: EmpresaExemplo[];
  isLoading: boolean;
} {
  return { activeCompany: EMPRESA, companies: EMPRESAS, isLoading: false };
}
