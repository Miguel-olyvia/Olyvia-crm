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

export const ICONE_RESULTADO: Record<ResultadoOuNenhum, LucideIcon> = {
  atendeuInteressado: PhoneIncoming, atendeuMaisTarde: PhoneForwarded, naoAtendeu: PhoneMissed, semInteresse: ThumbsDown,
  numeroErrado: Ban, semContacto: PhoneOff,
};
