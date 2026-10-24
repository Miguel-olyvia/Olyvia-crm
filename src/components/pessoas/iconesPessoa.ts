// Os ícones das etapas do percurso e dos resultados do último contacto. O ícone nunca está sozinho: leva sempre o texto.
import {
  Ban, FileSignature, Phone, PhoneForwarded, PhoneIncoming, PhoneMissed, PhoneOff, Ruler, Target, ThumbsDown, UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { EtapaPessoa, ResultadoOuNenhum } from "./pessoasTipos";

/** Lead, Contacto, Visita, Negócio e Cliente. */
export const ICONE_ETAPA: Record<EtapaPessoa, LucideIcon> = {
  nova: Target, emContacto: Phone, visitaMarcada: Ruler, qualificada: FileSignature, cliente: UserCheck,
};

/** A cor do círculo de cada etapa (as dos passos do percurso); sempre com o ícone e o texto ao lado. */
export const COR_ETAPA: Record<EtapaPessoa, string> = {
  nova: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  emContacto: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  visitaMarcada: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  qualificada: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  cliente: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

/** A cor do círculo de uma pessoa perdida. */
export const COR_PERDIDA = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";

export const ICONE_RESULTADO: Record<ResultadoOuNenhum, LucideIcon> = {
  atendeuInteressado: PhoneIncoming, atendeuMaisTarde: PhoneForwarded, naoAtendeu: PhoneMissed, semInteresse: ThumbsDown,
  numeroErrado: Ban, semContacto: PhoneOff,
};
