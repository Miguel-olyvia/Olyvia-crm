import { ordenarPorRegisto } from "@/lib/idiomaDocumento/registo";
import { SegmentadoDeIdiomas } from "./SegmentadoDeIdiomas";

export interface SeletorVersaoDoDocumentoProps {
  /** Os idiomas do documento (qualquer ordem; saem pela do registo, português primeiro). */
  idiomas: readonly string[];
  /** O idioma que está a ser mostrado. */
  valor: string;
  /** Nome acessível do grupo, já traduzido por quem chama (o portal traduz com as suas palavras). */
  rotulo: string;
  onChange: (codigo: string) => void;
  className?: string;
}

/**
 * Seletor de versão de um documento com vários idiomas (portal do cliente): UMA versão de cada vez, sem a opção
 * «todas». Com menos de dois idiomas não mostra nada. Só usa `onChange` quando o idioma muda.
 */
export function SeletorVersaoDoDocumento({ idiomas, valor, rotulo, onChange, className }: SeletorVersaoDoDocumentoProps) {
  const lista = ordenarPorRegisto(idiomas);
  if (lista.length < 2) return null;
  return (
    <SegmentadoDeIdiomas
      opcoes={lista.map((codigo) => [codigo])}
      escolha={[valor]}
      rotulo={rotulo}
      className={className}
      onChange={(escolha) => onChange(escolha[0])}
    />
  );
}
