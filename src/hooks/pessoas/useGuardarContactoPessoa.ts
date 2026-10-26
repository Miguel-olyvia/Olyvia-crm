import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContactoPreferido, HoraPreferida } from "@/components/pessoas/pessoasTipos";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

/** Os valores que neg_guardar_contacto_pessoa aceita. */
export const CONTACTOS_PREFERIDOS: readonly ContactoPreferido[] = ["telefone", "email", "whatsapp", "sms"];
export const HORAS_PREFERIDAS: readonly HoraPreferida[] = ["manha", "tarde", "fim_do_dia"];
/** As línguas que a base aceita ao gravar. */
export const LINGUAS_GRAVAVEIS: readonly string[] = ["pt", "en", "fr"];

/**
 * O que se mexe nas preferências de contacto. `undefined` = não mexe; `""` (contacto e hora) = limpa. A língua é obrigatória na base:
 * não se limpa, e só se manda quando muda (ver `linguaParaEnviar`).
 */
export interface DadosContacto {
  contacto?: ContactoPreferido | "";
  hora?: HoraPreferida | "";
  lingua?: string;
}

/** O que a função devolve; uma resposta que não se reconhece dá tudo a null e `mudou: false`. */
export interface ResultadoContacto {
  contacto: string | null;
  hora: string | null;
  lingua: string | null;
  mudou: boolean;
}

export interface GuardarContacto {
  guardar: (dados: DadosContacto) => Promise<ResultadoContacto>;
}

/**
 * As línguas do seletor: pt, en e fr, mais o valor atual da pessoa se estiver fora da lista (por exemplo es), para o seletor o poder mostrar
 * em vez de parecer vazio ou mudar a língua sem querer.
 */
export function opcoesDeLingua(atual: string | null | undefined): string[] {
  const a = atual?.trim();
  return a && !LINGUAS_GRAVAVEIS.includes(a) ? [...LINGUAS_GRAVAVEIS, a] : [...LINGUAS_GRAVAVEIS];
}

/** O `p_locale` a enviar: a escolhida se mudou (e não é vazia), senão `null` (a base não mexe; uma língua fora da lista nunca é reenviada). */
export function linguaParaEnviar(atual: string | null | undefined, escolhida: string | null | undefined): string | null {
  const nova = escolhida?.trim();
  if (!nova) return null;
  return nova === (atual?.trim() ?? "") ? null : nova;
}

const SEM_RESULTADO: ResultadoContacto = { contacto: null, hora: null, lingua: null, mudou: false };
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

function lerResultado(dados: unknown): ResultadoContacto {
  if (typeof dados !== "object" || dados === null) return SEM_RESULTADO;
  const d = dados as Record<string, unknown>;
  return { contacto: texto(d.preferred_contact), hora: texto(d.preferred_time), lingua: texto(d.locale), mudou: d.mudou === true };
}

/**
 * Guarda o contacto preferido, a hora preferida e a língua da pessoa com `neg_guardar_contacto_pessoa`. Lança `ErroNeg` se falhar (NG009
 * valor inválido, NG003 pessoa indisponível, permissão). Sem nada para mudar não chama a base. Depois de um sucesso refaz a ficha e as listas.
 */
export function useGuardarContactoPessoa(pessoaId: string): GuardarContacto {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const guardar = useCallback(async (dados: DadosContacto): Promise<ResultadoContacto> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
    const lingua = dados.lingua?.trim() || null;
    if (dados.contacto === undefined && dados.hora === undefined && lingua === null) return SEM_RESULTADO;
    const resposta = await chamarNeg<unknown>("neg_guardar_contacto_pessoa", {
      p_organization_id: organizationId,
      p_entity_id: pessoaId,
      p_preferred_contact: dados.contacto ?? null,
      p_preferred_time: dados.hora ?? null,
      p_locale: lingua,
    });
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A base já gravou: a ficha refaz-se na próxima leitura.
    }
    return lerResultado(resposta);
  }, [organizationId, pessoaId, client]);
  return { guardar };
}
