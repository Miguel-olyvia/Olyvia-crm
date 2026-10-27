/**
 * O que o formulario do portal manda a Edge: o rascunho (gravacao automatica) e o payload da
 * submissao. Pecas puras, sem rede nem armazenamento.
 *
 * REGRAS
 *  - NISS, numero da conta (IBAN) e a declaracao de veracidade nunca vao dentro do rascunho: o NISS e o
 *    IBAN seguem a parte (cofre) e a declaracao nunca se grava. A Edge e a base recusam-nos tambem.
 *  - Em processo `devolvida` so mudam os campos que o RH devolveu. A base compara o rascunho inteiro com
 *    o que la esta, por isso o rascunho que segue e o do servidor com as chaves editaveis alteradas por cima.
 *  - A submissao leva o payload do contrato (`construirPayloadConvite`); em `devolvida`, so as chaves
 *    editaveis.
 */
import { construirPayloadConvite, type RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";
import { formularioEditavel, rascunhoParaFormulario, type PortalLer } from "@/lib/hr/portalAdmissao";

const FORA_DO_RASCUNHO: ReadonlySet<string> = new Set(["niss", "iban", "conta_numero", "aceite"]);

/** As chaves do contrato de submissao que no ecra tem outro nome. */
const CAMPO_DO_ECRA_POR_CHAVE_DO_PAYLOAD: Readonly<Record<string, keyof RascunhoConvite>> = {
  morada_linha1: "linha1",
  morada_linha2: "linha2",
  morada_codigo_postal: "codigo_postal",
  morada_localidade: "localidade",
  morada_distrito: "distrito",
  morada_pais: "pais",
  conta_swift: "conta_bic",
  iban: "conta_numero",
};

/** O rascunho do ecra, sem NISS, sem numero da conta e sem a declaracao: o que pode viajar no rascunho. */
export function rascunhoParaGravar(rascunho: RascunhoConvite): Record<string, unknown> {
  return Object.fromEntries(Object.entries(rascunho).filter(([chave]) => !FORA_DO_RASCUNHO.has(chave)));
}

/**
 * O rascunho a enviar. Fora de `devolvida` e o rascunho todo; em `devolvida` e o que o servidor tem, com as
 * chaves editaveis que a pessoa alterou (em relacao ao que leu) por cima.
 */
export function rascunhoAEnviar(dados: PortalLer, atual: RascunhoConvite, lido: RascunhoConvite): Record<string, unknown> {
  const completo = rascunhoParaGravar(atual);
  if (dados.estado !== "devolvida") return completo;
  const doLido = rascunhoParaGravar(lido);
  const doServidor = Object.fromEntries(Object.entries(dados.rascunho ?? {}).filter(([chave]) => !FORA_DO_RASCUNHO.has(chave)));
  const alterados = Object.fromEntries(
    Object.entries(completo).filter(
      ([chave, valor]) => valor !== doLido[chave] && formularioEditavel(dados, chave as keyof RascunhoConvite),
    ),
  );
  return { ...doServidor, ...alterados };
}

/** O rascunho que a `ler` devolveu, na forma do ecra (para comparar com o que a pessoa tem agora). */
export function rascunhoLido(dados: PortalLer): RascunhoConvite {
  return rascunhoParaFormulario(dados.rascunho);
}

/** Dois rascunhos de gravacao com o mesmo conteudo (a ordem das chaves nao conta). */
export function rascunhosIguais(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const chavesA = Object.keys(a);
  return chavesA.length === Object.keys(b).length && chavesA.every((chave) => a[chave] === b[chave]);
}

/**
 * O payload da submissao. Em `devolvida` so as chaves editaveis; nos outros estados todas as do contrato.
 * O NISS e o IBAN vao no payload (o hook decide se seguem); vazios ficam `null`.
 */
export function payloadDaSubmissao(dados: PortalLer, rascunho: RascunhoConvite): Record<string, unknown> {
  const payload: Record<string, unknown> = construirPayloadConvite(rascunho);
  if (dados.estado !== "devolvida") return payload;
  return Object.fromEntries(
    Object.entries(payload).filter(([chave]) => {
      const campo = CAMPO_DO_ECRA_POR_CHAVE_DO_PAYLOAD[chave] ?? (chave as keyof RascunhoConvite);
      return formularioEditavel(dados, campo);
    }),
  );
}
