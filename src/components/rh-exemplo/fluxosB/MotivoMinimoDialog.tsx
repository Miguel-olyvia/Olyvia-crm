/**
 * Um motivo escrito (minimo 3 caracteres) antes de uma accao que o documento de fluxos exige justificar:
 * recusar, corrigir, marcar falta, corrigir o passado. Opcionalmente exige tambem uma autorizacao
 * explicita (caixa a marcar). Mostra o erro de dentro (chave de traducao) sem fechar.
 */
import { useEffect, useRef, useState } from "react";
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
import { MOTIVO_MINIMO_CARACTERES, motivoValido } from "@/components/rh-exemplo/lib/horarioTipos";

interface MotivoMinimoDialogProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** Se vier, a caixa tem de estar marcada para confirmar (ex.: «Autorizo corrigir o passado»). */
  rotuloAutorizacao?: string;
  /** Devolve a chave do erro (o dialogo fica aberto) ou `null` (fecha); pode ser uma promessa, e ate responder o botao fica ocupado. */
  onConfirmar: (motivo: string) => string | null | Promise<string | null>;
  onFechar: () => void;
  idPrefixo?: string;
}

export function MotivoMinimoDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloAutorizacao,
  onConfirmar,
  onFechar,
  idPrefixo = "rhb-motivo",
}: MotivoMinimoDialogProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [autorizado, setAutorizado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aEspera, setAEspera] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setAutorizado(false);
    setErro(null);
    requestAnimationFrame(() => areaRef.current?.focus());
  }, [aberto]);

  const podeConfirmar = motivoValido(motivo) && (!rotuloAutorizacao || autorizado) && !aEspera;
  const idMotivo = `${idPrefixo}-texto`;

  const concluir = (resultado: string | null) => {
    setErro(resultado);
    if (resultado === null) onFechar();
  };

  const confirmar = (evento: React.MouseEvent) => {
    evento.preventDefault();
    const resultado = onConfirmar(motivo.trim());
    // Resposta imediata (a maioria dos usos): fecha ou mostra o erro no mesmo instante, como sempre.
    if (resultado === null || typeof resultado === "string") return concluir(resultado);
    setAEspera(true);
    void resultado.then(concluir, () => setErro("friendlyError.unexpected")).finally(() => setAEspera(false));
  };

  return (
    <AlertDialog open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={idMotivo}>
              {t("rhExemplo.fluxosB.motivoObrigatorio", { minimo: String(MOTIVO_MINIMO_CARACTERES) })}
            </Label>
            <Textarea id={idMotivo} ref={areaRef} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {rotuloAutorizacao && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                checked={autorizado}
                onChange={(e) => setAutorizado(e.target.checked)}
              />
              {rotuloAutorizacao}
            </label>
          )}
          {erro && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t(erro)}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" disabled={!podeConfirmar} onClick={confirmar}>
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
