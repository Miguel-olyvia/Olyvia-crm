/**
 * «Enviar contrato» (lado do RH): escolhe o modelo de contrato («Contrato de trabalho»), quantos dias o portal fica aberto para
 * documentos (1 a 30, 14 por omissao) e envia. A base emite o contrato a partir do modelo, partilha-o no portal e reabre o portal
 * so para documentos; a pessoa recebe um e-mail e assina com um codigo por SMS. Depois do envio o dialogo fica aberto a dizer o
 * que aconteceu: se a pessoa NAO tem telemovel valido na ficha (nao recebe o codigo SMS) e se o e-mail de aviso nao saiu.
 *
 * Abre quando `aberto`; fecha com `aoFechar`. `aoEnviado` corre uma vez, quando o contrato ficou enviado, para o ecra recarregar.
 * Acessibilidade: titulo e descricao do dialogo, rotulos nos campos, alvos de 44 px, erros e avisos em `role="alert"`/`status`.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useDecisoesAdmissao, type ResultadoEnvioContrato } from "@/hooks/hr/useDecisoesAdmissao";
import { useModelosDocumentosRH } from "@/hooks/useModelosDocumentosRH";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const DIAS_OMISSAO = 14;
const DIAS_MIN = 1;
const DIAS_MAX = 30;
const NOME_DO_MODELO = "contrato de trabalho";

interface EnviarContratoDialogProps {
  aberto: boolean;
  conviteId: string | null;
  /** O nome da pessoa, para o titulo. */
  nome: string;
  aoFechar: () => void;
  aoEnviado?: () => void;
}

export function EnviarContratoDialog({ aberto, conviteId, nome, aoFechar, aoEnviado }: EnviarContratoDialogProps) {
  const { t } = useTranslation();
  const { modelos, isLoading, error: erroModelos } = useModelosDocumentosRH();
  const { enviarContrato, aExecutar } = useDecisoesAdmissao();
  const contratos = modelos.filter((m) => m.tipo === "contrato" && m.activo !== false);
  const [modeloId, setModeloId] = useState("");
  const [dias, setDias] = useState(String(DIAS_OMISSAO));
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEnvioContrato | null>(null);

  // Ao abrir recomeca-se; o modelo por omissao e o «Contrato de trabalho» (ou o primeiro de contrato).
  useEffect(() => {
    if (!aberto) return;
    setDias(String(DIAS_OMISSAO));
    setErro(null);
    setResultado(null);
    setModeloId("");
  }, [aberto]);
  useEffect(() => {
    if (!aberto || modeloId !== "" || contratos.length === 0) return;
    const preferido = contratos.find((m) => m.nome.trim().toLowerCase() === NOME_DO_MODELO) ?? contratos[0];
    setModeloId(preferido.id);
  }, [aberto, modeloId, contratos]);

  const enviar = async () => {
    const n = Number(dias);
    if (!conviteId || modeloId === "") return setErro(t("rhPortalReal.contrato.erroModelo"));
    if (!Number.isInteger(n) || n < DIAS_MIN || n > DIAS_MAX) return setErro(t("rhPortalReal.contrato.erroDias", { min: DIAS_MIN, max: DIAS_MAX }));
    setErro(null);
    const r = await enviarContrato(conviteId, modeloId, n);
    if (!r.ok) return setErro(r.erro);
    setResultado(r);
    aoEnviado?.();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortalReal.contrato.titulo", { nome })}</DialogTitle>
          <DialogDescription>{t("rhPortalReal.contrato.sub")}</DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3" data-testid="enviar-contrato-resultado">
            <p role="status" className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              {t("rhPortalReal.contrato.enviado")}
            </p>
            {resultado.semTelemovel && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/70 bg-amber-500/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t("rhPortalReal.contrato.semTelemovel")}
              </p>
            )}
            {resultado.avisoNaoSaiu && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/70 bg-amber-500/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t("rhPortalReal.contrato.avisoNaoSaiu")}
              </p>
            )}
            <DialogFooter>
              <Button type="button" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t("rhPortalReal.fechar")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {isLoading && <p role="status" className="text-sm text-muted-foreground">{t("rhPortalReal.contrato.carregando")}</p>}
              {erroModelos && <p role="alert" className="text-sm text-destructive">{t("rhPortalReal.contrato.erroModelos")}</p>}
              {!isLoading && !erroModelos && contratos.length === 0 && (
                <p role="alert" className="text-sm text-destructive">{t("rhPortalReal.contrato.semModelos")}</p>
              )}
              {contratos.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="enviar-contrato-modelo">{t("rhPortalReal.contrato.modelo")}</Label>
                  <NativeSelect
                    id="enviar-contrato-modelo" className="h-11" value={modeloId}
                    onValueChange={(v) => { setModeloId(v); setErro(null); }}
                    options={contratos.map((m) => ({ value: m.id, label: m.nome }))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="enviar-contrato-dias">{t("rhPortalReal.contrato.dias")}</Label>
                <Input
                  id="enviar-contrato-dias" type="number" inputMode="numeric" min={DIAS_MIN} max={DIAS_MAX} className="h-11"
                  value={dias} onChange={(e) => { setDias(e.target.value); setErro(null); }}
                  aria-describedby="enviar-contrato-dias-ajuda"
                />
                <p id="enviar-contrato-dias-ajuda" className="text-xs text-muted-foreground">{t("rhPortalReal.contrato.diasAjuda")}</p>
              </div>
              {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t("rhPortalReal.cancelar")}</Button>
              <Button type="button" className={cn("min-h-11", FOCO)} disabled={aExecutar || contratos.length === 0} onClick={() => void enviar()}>
                {aExecutar ? t("rhPortalReal.contrato.aEnviar") : t("rhPortalReal.contrato.enviar")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
