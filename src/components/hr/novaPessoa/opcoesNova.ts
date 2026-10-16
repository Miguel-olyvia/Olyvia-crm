// As opções dos seletores do painel "Nova pessoa": os valores reais do domínio, com o texto das traduções do módulo de RH.
import type { OpcaoSelect } from "@/components/hr/form/Campos";

type Traduzir = (chave: string) => string;

/** `valores` com o rótulo `<prefixo>.<valor>`; um valor sem tradução (um número de tamanho, por exemplo) mostra-se tal como é. */
export function opcoes(t: Traduzir, prefixo: string, valores: readonly string[]): OpcaoSelect[] {
  return valores.map((valor) => {
    const chave = `${prefixo}.${valor}`;
    const texto = t(chave);
    return { value: valor, label: texto === chave ? valor : texto };
  });
}

export const SIM_NAO = ["sim", "nao"] as const;
