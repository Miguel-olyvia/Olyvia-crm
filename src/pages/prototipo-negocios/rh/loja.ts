// Repor os dados de teste de RH: o store em memória dos ecrãs de RH de exemplo (src/components/rh-exemplo/dados/loja.ts) volta ao início, com os
// stores à parte (admissões, gestão, custos) que se registam nele. Ficheiro à parte para o protótipo só o carregar quando é preciso.
import { repor } from "@/components/rh-exemplo/dados/loja";

export function esquecerRh(): void {
  repor();
}
