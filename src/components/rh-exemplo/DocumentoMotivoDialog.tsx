/**
 * O motivo de anular, ocultar e repor um documento de RH, num AlertDialog reutilizavel.
 *
 * - O botao de confirmar fica desactivado ate o motivo ter 3 caracteres uteis, e a razao esta escrita (nao so no estado do botao).
 * - O erro que a base devolve (ja traduzido por quem chama) fica no ecra, anunciado, com o campo marcado como invalido.
 * - Ao fechar, o foco vai para o elemento que `devolverFoco` indicar (o menu «Mais acoes»): o item do menu que abriu o dialogo
 *   deixa de existir, e sem isto o foco caia no corpo da pagina.
 * - A regra do motivo e a de `hr_documento_motivo` (src/lib/hr/documentoMotivo.ts); a base e que decide.
 */
import { useEffect, useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import {
  MOTIVO_DOCUMENTO_MAXIMO,
  MOTIVO_DOCUMENTO_MINIMO,
  motivoParaEnvio,
  razaoMotivoInvalido,
  type RazaoMotivoInvalido,
} from "@/lib/hr/documentoMotivo";

interface DocumentoMotivoDialogProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** So na anulacao: avisa que o colaborador pode consultar o motivo. */
  apoioColaborador?: boolean;
  /** Devolve a mensagem de erro JA traduzida (o dialogo fica aberto) ou `null` (fecha). */
  onConfirmar: (motivo: string) => Promise<string | null>;
  onFechar: () => void;
  /** O elemento que recebe o foco quando o dialogo fecha. */
  devolverFoco?: () => HTMLElement | null;
}

const CHAVE_RAZAO: Record<RazaoMotivoInvalido, string> = {
  curto: "hr.documentos.motivo.razaoCurto",
  longo: "hr.documentos.motivo.razaoLongo",
  caracteres: "hr.documentos.motivo.razaoCaracteres",
};

export function DocumentoMotivoDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  apoioColaborador = false,
  onConfirmar,
  onFechar,
  devolverFoco,
}: DocumentoMotivoDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEspera, setAEspera] = useState(false);
  const aEsperaRef = useRef(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setErro(null);
    setAEspera(false);
    aEsperaRef.current = false;
  }, [aberto]);

  const razao = razaoMotivoInvalido(motivo);
  const tamanho = Array.from(motivoParaEnvio(motivo)).length;
  const idApoio = `${id}-apoio`;
  const idContador = `${id}-contador`;
  const idRazao = `${id}-razao`;
  const idErro = `${id}-erro`;
  const descritoPor = [idApoio, idContador, razao ? idRazao : null, erro ? idErro : null].filter(Boolean).join(" ");

  const confirmar = async (evento: React.MouseEvent) => {
    // O AlertDialogAction fecha sozinho; quem decide se fecha e a resposta da base.
    evento.preventDefault();
    if (razao || aEsperaRef.current) return;
    aEsperaRef.current = true;
    setAEspera(true);
    try {
      const resultado = await onConfirmar(motivoParaEnvio(motivo));
      setErro(resultado);
      if (resultado === null) onFechar();
      // O botao de confirmar esteve desactivado durante a gravacao e o foco cairia no corpo: com erro, volta ao campo.
      else campoRef.current?.focus();
    } finally {
      aEsperaRef.current = false;
      setAEspera(false);
    }
  };

  return (
    <AlertDialog open={aberto} onOpenChange={(estado) => !estado && !aEspera && onFechar()}>
      <AlertDialogContent
        onCloseAutoFocus={(evento) => {
          const alvo = devolverFoco?.();
          if (alvo) {
            evento.preventDefault();
            alvo.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor={`${id}-texto`}>{t("hr.documentos.motivo.rotulo")}</Label>
          <Textarea
            id={`${id}-texto`}
            ref={campoRef}
            rows={4}
            value={motivo}
            aria-invalid={erro !== null || undefined}
            aria-describedby={descritoPor}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErro(null);
            }}
          />
          <p id={idApoio} className="text-sm text-muted-foreground">
            {t(apoioColaborador ? "hr.documentos.motivo.apoioAnular" : "hr.documentos.motivo.apoio")}
          </p>
          <p id={idContador} className="text-xs text-muted-foreground">
            {t("hr.documentos.motivo.contador", { n: tamanho, max: MOTIVO_DOCUMENTO_MAXIMO })}
          </p>
          {razao && (
            <p id={idRazao} className="text-sm text-muted-foreground">
              {t(CHAVE_RAZAO[razao], { min: MOTIVO_DOCUMENTO_MINIMO, max: MOTIVO_DOCUMENTO_MAXIMO })}
            </p>
          )}
          {erro && (
            <p id={idErro} role="alert" className="text-sm font-medium text-destructive">
              {erro}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={aEspera}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction className="min-h-11" disabled={razao !== null || aEspera} onClick={confirmar}>
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
