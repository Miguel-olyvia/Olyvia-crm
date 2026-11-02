// Os diálogos REAIS do lado do RH no «Portal do colaborador» da ficha (variantes ligadas à base dos do exemplo, que ficam intactos):
//  - `MotivoDialogReal`: pede um motivo (mínimo 3 caracteres) e corre uma ação assíncrona; o erro volta traduzido, nunca em bruto;
//  - `RhEnviarDocumentoDialogReal`: partilha no portal um documento que JÁ existe na ficha (emitido de um modelo ou com o PDF
//    anexado, no separador Documentos) e diz se precisa de assinatura. O contrato envia-se pelo botão «Enviar contrato»;
//  - `RhPedirDocumentoDialogReal`: o RH pede um documento à pessoa (tipo, prazo, nota);
//  - `RhResponderPedidoDialogReal`: responde a um pedido da pessoa com um documento que já existe na ficha.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import type { DocumentoPartilhavel, ResultadoPortalRh } from "@/components/rh-exemplo/hooks/portalDocumentosReal";
import { TIPOS_PEDIDO_RH, type TipoPedidoRh } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const MIN_MOTIVO = 3;
const DIAS_PRAZO = 7;
const BOTAO = cn("min-h-11", FOCO);

const prazoPorOmissao = (): string => new Date(Date.now() + DIAS_PRAZO * 86_400_000).toISOString().slice(0, 10);

/** Os rótulos de um documento da ficha no seletor: «Título (estado)». */
function etiquetaDoDocumento(t: ReturnType<typeof useTranslation>["t"], d: DocumentoPartilhavel): string {
  return `${d.titulo} (${t(`rhPortalReal.docEstado.${d.estado}`)})`;
}

/* ------------------------------------------------------------------ motivo */

interface MotivoDialogRealProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  confirmar: string;
  aoConfirmar: (motivo: string) => Promise<ResultadoPortalRh>;
  aoFechar: () => void;
}

export function MotivoDialogReal({ aberto, titulo, descricao, confirmar, aoConfirmar, aoFechar }: MotivoDialogRealProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aExecutar, setAExecutar] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setErro(null);
  }, [aberto]);
  const enviar = async () => {
    if (aExecutar) return;
    if (motivo.trim().length < MIN_MOTIVO) return setErro(t("rhAdm.erro.motivoCurto", { n: MIN_MOTIVO }));
    setAExecutar(true);
    const r = await aoConfirmar(motivo);
    setAExecutar(false);
    if (r.ok) return aoFechar();
    setErro(r.erro);
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rh-portal-motivo">{t("rhPortalReal.motivo")}</Label>
          <Textarea id="rh-portal-motivo" value={motivo} maxLength={2000} aria-invalid={erro ? true : undefined} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} />
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={BOTAO} onClick={aoFechar}>{t("rhPortalReal.cancelar")}</Button>
          <Button type="button" className={BOTAO} disabled={aExecutar} onClick={() => void enviar()}>{confirmar}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ enviar documento */

interface RhEnviarDocumentoDialogRealProps {
  aberto: boolean;
  /** Os documentos da ficha que ainda não estão no portal. */
  documentos: DocumentoPartilhavel[];
  conviteId: string | null;
  enviar: (documentoId: string, conviteId: string | null, exigeAssinatura: boolean) => Promise<ResultadoPortalRh>;
  aoFechar: () => void;
}

export function RhEnviarDocumentoDialogReal({ aberto, documentos, conviteId, enviar, aoFechar }: RhEnviarDocumentoDialogRealProps) {
  const { t } = useTranslation();
  const [escolha, setEscolha] = useState("");
  const [assinatura, setAssinatura] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aExecutar, setAExecutar] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const primeiro = documentos[0];
    setEscolha(primeiro?.id ?? "");
    setAssinatura(primeiro?.estado === "a_aguardar_assinatura");
    setErro(null);
    // Só ao abrir: a lista não muda enquanto o diálogo está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);
  const escolher = (id: string) => {
    setEscolha(id);
    setAssinatura(documentos.find((d) => d.id === id)?.estado === "a_aguardar_assinatura");
    setErro(null);
  };
  const confirmar = async () => {
    if (aExecutar) return;
    if (escolha === "") return setErro(t("rhPortalReal.enviar.semEscolha"));
    setAExecutar(true);
    const r = await enviar(escolha, conviteId, assinatura);
    setAExecutar(false);
    if (r.ok) return aoFechar();
    setErro(r.erro);
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.enviar.titulo")}</DialogTitle>
          <DialogDescription>{t("rhPortalReal.enviar.sub")}</DialogDescription>
        </DialogHeader>
        {documentos.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">{t("rhPortalReal.enviar.semDocumentos")}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rh-portal-enviar-doc">{t("rhPortal.rh.enviar.documento")}</Label>
              <NativeSelect
                id="rh-portal-enviar-doc" className="h-11" value={escolha} onValueChange={escolher}
                options={documentos.map((d) => ({ value: d.id, label: etiquetaDoDocumento(t, d) }))}
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={assinatura} onChange={(e) => setAssinatura(e.target.checked)} />
              {t("rhPortal.rh.enviar.precisaAssinatura")}
            </label>
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={BOTAO} onClick={aoFechar}>{t("rhPortalReal.cancelar")}</Button>
          <Button type="button" className={BOTAO} disabled={aExecutar || documentos.length === 0} onClick={() => void confirmar()}>
            {t("rhPortal.rh.enviar.confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ pedir documento */

interface RhPedirDocumentoDialogRealProps {
  aberto: boolean;
  pedir: (d: { tipo: string; titulo: string; nota: string; prazo: string; conviteId: string | null }) => Promise<ResultadoPortalRh>;
  conviteId: string | null;
  aoFechar: () => void;
}

export function RhPedirDocumentoDialogReal({ aberto, pedir, conviteId, aoFechar }: RhPedirDocumentoDialogRealProps) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<TipoPedidoRh>("cartao_cidadao");
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState(prazoPorOmissao());
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aExecutar, setAExecutar] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setTipo("cartao_cidadao");
    setTitulo("");
    setPrazo(prazoPorOmissao());
    setNota("");
    setErro(null);
  }, [aberto]);
  const confirmar = async () => {
    if (aExecutar) return;
    if (tipo === "outro" && titulo.trim() === "") return setErro(t("rhPortal.erro.titulo_obrigatorio"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return setErro(t("rhPortal.erro.prazo_invalido"));
    setAExecutar(true);
    const r = await pedir({ tipo, titulo, nota, prazo, conviteId });
    setAExecutar(false);
    if (r.ok) return aoFechar();
    setErro(r.erro);
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.pedir.titulo")}</DialogTitle>
          <DialogDescription>{t("rhPortal.rh.pedir.sub")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-pedir-tipo">{t("rhPortal.pedir.tipo")}</Label>
            <NativeSelect
              id="rh-portal-pedir-tipo" className="h-11" value={tipo} onValueChange={(v) => { setTipo(v as TipoPedidoRh); setErro(null); }}
              options={TIPOS_PEDIDO_RH.map((v) => ({ value: v, label: t(`rhPortal.tipoRh.${v}`) }))}
            />
          </div>
          {tipo === "outro" && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-portal-pedir-titulo">{t("rhPortal.pedir.qualDocumento")}</Label>
              <Input id="rh-portal-pedir-titulo" className="h-11" maxLength={200} value={titulo} onChange={(e) => { setTitulo(e.target.value); setErro(null); }} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-pedir-prazo">{t("rhPortal.rh.pedir.prazo")}</Label>
            <Input id="rh-portal-pedir-prazo" type="date" className="h-11" value={prazo} onChange={(e) => { setPrazo(e.target.value); setErro(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-pedir-nota">{t("rhPortal.pedir.nota")}</Label>
            <Textarea id="rh-portal-pedir-nota" value={nota} maxLength={2000} onChange={(e) => setNota(e.target.value)} />
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={BOTAO} onClick={aoFechar}>{t("rhPortalReal.cancelar")}</Button>
          <Button type="button" className={BOTAO} disabled={aExecutar} onClick={() => void confirmar()}>{t("rhPortal.rh.pedir.confirmar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ responder a um pedido da pessoa */

interface RhResponderPedidoDialogRealProps {
  aberto: boolean;
  titulo: string;
  /** Os documentos da ficha com que se pode responder (declaração emitida, PDF anexado...). */
  documentos: DocumentoPartilhavel[];
  responder: (documentoId: string) => Promise<ResultadoPortalRh>;
  aoFechar: () => void;
}

export function RhResponderPedidoDialogReal({ aberto, titulo, documentos, responder, aoFechar }: RhResponderPedidoDialogRealProps) {
  const { t } = useTranslation();
  const [escolha, setEscolha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aExecutar, setAExecutar] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setEscolha(documentos[0]?.id ?? "");
    setErro(null);
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);
  const confirmar = async () => {
    if (aExecutar) return;
    if (escolha === "") return setErro(t("rhPortalReal.enviar.semEscolha"));
    setAExecutar(true);
    const r = await responder(escolha);
    setAExecutar(false);
    if (r.ok) return aoFechar();
    setErro(r.erro);
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.responder.titulo", { titulo })}</DialogTitle>
          <DialogDescription>{t("rhPortalReal.responder.sub")}</DialogDescription>
        </DialogHeader>
        {documentos.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">{t("rhPortalReal.responder.semDocumentos")}</p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-responder-doc">{t("rhPortal.rh.enviar.documento")}</Label>
            <NativeSelect
              id="rh-portal-responder-doc" className="h-11" value={escolha} onValueChange={(v) => { setEscolha(v); setErro(null); }}
              options={documentos.map((d) => ({ value: d.id, label: etiquetaDoDocumento(t, d) }))}
            />
          </div>
        )}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={BOTAO} onClick={aoFechar}>{t("rhPortalReal.cancelar")}</Button>
          <Button type="button" className={BOTAO} disabled={aExecutar || documentos.length === 0} onClick={() => void confirmar()}>
            {t("rhPortal.rh.responder.confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
