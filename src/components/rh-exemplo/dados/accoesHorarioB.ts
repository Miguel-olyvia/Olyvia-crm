/**
 * Antes, as accoes do fluxo 4 (horario) sobre o store em memoria. Versoes, correccoes e excepcoes de um dia passaram
 * a gravar na base pelo hook da ficha (`savePlaneado` / `corrigirPlaneado`, ver `lib/horarioReal.ts`), por isso
 * aqui so resta o nome de quem esta a usar o ecra, de que as accoes de assiduidade e de justificacao ainda dependem.
 */
import { lerEstado } from "@/components/rh-exemplo/dados/loja";

/** O nome de quem esta a usar o ecra (na apresentacao, a pessoa de RH de exemplo). */
export function nomeDeQuemUsa(): string {
  const id = lerEstado().minhaPessoaId;
  return (id ? lerEstado().fichas[id]?.pessoa.nome_completo : null) ?? "RH";
}
