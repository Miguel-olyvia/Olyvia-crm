/**
 * Escolher um ficheiro para um anexo: um `<input type="file">` escondido e um
 * botao com TEXTO visivel que o aciona (como o cartao do convite).
 *
 * O nome acessivel do botao diz a accao e o alvo ("Anexar: Fotografia",
 * "Substituir: eu.png"): varios botoes iguais na mesma pagina nao diriam a que
 * linha pertencem. O `accept` e o do tipo (a fotografia so aceita imagem).
 */
import { useRef, type ChangeEvent } from "react";
import { Paperclip, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIMITES_ANEXOS, type TipoAnexoRh } from "@/lib/hr/anexosRh";
import { useTranslation } from "@/hooks/useTranslation";

interface SeletorFicheiroAnexoProps {
  tipo: TipoAnexoRh;
  accao: "anexar" | "substituir";
  /** O que a accao atinge, para o nome acessivel (o tipo por extenso ou o nome do ficheiro). */
  alvo: string;
  /** Distingue os seletores da mesma accao e tipo (ex.: os dois cartoes). */
  idAlvo: string;
  desactivado?: boolean;
  /** `id` de um texto que descreve o seletor (formatos e tamanho). */
  descritoPor?: string;
  onEscolher: (file: File) => void;
}

export function acceptDoTipo(tipo: TipoAnexoRh): string {
  const mimes = tipo === "fotografia" ? LIMITES_ANEXOS.mimesFotografia : LIMITES_ANEXOS.mimesAceites;
  return mimes.join(",");
}

export function SeletorFicheiroAnexo({
  tipo,
  accao,
  alvo,
  idAlvo,
  desactivado = false,
  descritoPor,
  onEscolher,
}: SeletorFicheiroAnexoProps) {
  const { t } = useTranslation();
  const entradaRef = useRef<HTMLInputElement>(null);

  const aoEscolher = (evento: ChangeEvent<HTMLInputElement>) => {
    const ficheiro = evento.target.files?.[0];
    // Limpa o seletor: escolher o mesmo ficheiro outra vez tem de voltar a disparar.
    evento.target.value = "";
    if (ficheiro) onEscolher(ficheiro);
  };

  const Icone = accao === "anexar" ? Paperclip : RefreshCw;

  return (
    <>
      <input
        ref={entradaRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        accept={acceptDoTipo(tipo)}
        data-testid={`ficheiro-${accao}-${idAlvo}`}
        aria-hidden="true"
        onChange={aoEscolher}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={desactivado}
        aria-label={`${t(`hr.anexos.${accao}`)}: ${alvo}`}
        aria-describedby={descritoPor}
        onClick={() => entradaRef.current?.click()}
      >
        <Icone className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t(`hr.anexos.${accao}`)}
      </Button>
    </>
  );
}
