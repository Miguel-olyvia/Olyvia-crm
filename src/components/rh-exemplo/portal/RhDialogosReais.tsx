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
import {
  HR_DOCUMENTO_ACCEPT, TIPOS_COM_ASSINATURA, TIPOS_SEM_ASSINATURA,
  type DocumentoPartilhavel, type ResultadoPortalRh,
} from "@/components/rh-exemplo/hooks/portalDocumentosReal";
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

type ModoEnvio = "existente" | "novo";

export interface NovoDocumentoParaEnviar {
  titulo: string;
  tipo: string;
  ficheiro: File;
  exigeAssinatura: boolean;
  conviteId: string | null;
}

interface RhEnviarDocumentoDialogRealProps {
  aberto: boolean;
  /** Os documentos da ficha que ainda não estão no portal. */
  documentos: DocumentoPartilhavel[];
  conviteId: string | null;
  enviar: (documentoId: string, conviteId: string | null, exigeAssinatura: boolean) => Promise<ResultadoPortalRh>;
  /** Cria o documento com o ficheiro, anexa-o à ficha e envia-o. Sem isto, o modo «ficheiro novo» não aparece. */
  anexarEEnviar?: (d: NovoDocumentoParaEnviar) => Promise<ResultadoPortalRh>;
  /** Anexar exige `hr.pessoas.documentos.edit` (e criar/enviar `.emitir`, que o cartão já exige para mostrar o botão). */
  podeAnexar?: boolean;
  aoFechar: () => void;
}

interface FormularioNovoProps {
  titulo: string; tipo: string; assinatura: boolean; ficheiro: File | null;
  erroTitulo: string | null; erroFicheiro: string | null; bloqueado: boolean;
  aTitulo: (v: string) => void; aTipo: (v: string) => void; aAssinatura: (v: boolean) => void; aFicheiro: (f: File | null) => void;
}

function FormularioNovoDocumento(p: FormularioNovoProps) {
  const { t } = useTranslation();
  const tipos = p.assinatura ? TIPOS_COM_ASSINATURA : TIPOS_SEM_ASSINATURA;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="rh-portal-novo-titulo">{t("rhPortalReal.enviar.novo.titulo")}</Label>
        <Input
          id="rh-portal-novo-titulo" className="h-11" maxLength={200} value={p.titulo} disabled={p.bloqueado}
          aria-invalid={p.erroTitulo ? true : undefined} aria-describedby={p.erroTitulo ? "rh-portal-novo-titulo-erro" : undefined}
          onChange={(e) => p.aTitulo(e.target.value)}
        />
        {p.erroTitulo && <p id="rh-portal-novo-titulo-erro" role="alert" className="text-sm text-destructive">{p.erroTitulo}</p>}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={p.assinatura} disabled={p.bloqueado} onChange={(e) => p.aAssinatura(e.target.checked)} />
        {t("rhPortal.rh.enviar.precisaAssinatura")}
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="rh-portal-novo-tipo">{t("rhPortalReal.enviar.novo.tipo")}</Label>
        <NativeSelect
          id="rh-portal-novo-tipo" className="h-11" value={p.tipo} disabled={p.bloqueado} onValueChange={p.aTipo}
          options={tipos.map((v) => ({ value: v, label: t(`rhPortalReal.enviar.tipo.${v}`) }))}
        />
        {!p.assinatura && <p className="text-xs text-muted-foreground">{t("rhPortalReal.enviar.novo.tipoSemAssinatura")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rh-portal-novo-ficheiro">{t("rhPortalReal.enviar.novo.ficheiro")}</Label>
        <input
          id="rh-portal-novo-ficheiro" type="file" accept={HR_DOCUMENTO_ACCEPT} disabled={p.bloqueado}
          aria-invalid={p.erroFicheiro ? true : undefined} aria-describedby={p.erroFicheiro ? "rh-portal-novo-ficheiro-erro" : undefined}
          className={cn("block min-h-11 w-full rounded-md border px-3 py-2 text-sm", FOCO)}
          onChange={(e) => p.aFicheiro(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">{t("rhPortalReal.enviar.novo.ficheiroAjuda")}</p>
        {p.erroFicheiro && <p id="rh-portal-novo-ficheiro-erro" role="alert" className="text-sm text-destructive">{p.erroFicheiro}</p>}
      </div>
      <p className="text-sm text-muted-foreground">{t("rhPortalReal.enviar.novo.ficaNaFicha")}</p>
    </div>
  );
}

export function RhEnviarDocumentoDialogReal({ aberto, documentos, conviteId, enviar, anexarEEnviar, podeAnexar = false, aoFechar }: RhEnviarDocumentoDialogRealProps) {
  const { t } = useTranslation();
  const modoNovoDisponivel = anexarEEnviar !== undefined && podeAnexar;
  const [modo, setModo] = useState<ModoEnvio>("existente");
  const [escolha, setEscolha] = useState("");
  const [assinatura, setAssinatura] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("declaracao");
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [erroTitulo, setErroTitulo] = useState<string | null>(null);
  const [erroFicheiro, setErroFicheiro] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aExecutar, setAExecutar] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const primeiro = documentos[0];
    setModo(documentos.length === 0 && modoNovoDisponivel ? "novo" : "existente");
    setEscolha(primeiro?.id ?? "");
    setAssinatura(primeiro?.estado === "a_aguardar_assinatura");
    setTitulo("");
    setTipo("declaracao");
    setFicheiro(null);
    setErroTitulo(null);
    setErroFicheiro(null);
    setErro(null);
    // Só ao abrir: a lista não muda enquanto o diálogo está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);
  const trocarModo = (m: ModoEnvio) => {
    setModo(m);
    setErro(null);
    setErroTitulo(null);
    setErroFicheiro(null);
    // O modo «existente» parte do estado do documento escolhido; o «novo» parte de «sem assinatura».
    setAssinatura(m === "existente" ? documentos.find((d) => d.id === escolha)?.estado === "a_aguardar_assinatura" : false);
    setTipo("declaracao");
  };
  const escolher = (id: string) => {
    setEscolha(id);
    setAssinatura(documentos.find((d) => d.id === id)?.estado === "a_aguardar_assinatura");
    setErro(null);
  };
  const mudarAssinaturaNovo = (v: boolean) => {
    setAssinatura(v);
    // Sem assinatura a base só entrega declaração ou recibo.
    if (!v && !TIPOS_SEM_ASSINATURA.includes(tipo)) setTipo("declaracao");
    setErro(null);
  };
  const confirmarNovo = async () => {
    if (!anexarEEnviar) return;
    const faltaTitulo = titulo.trim() === "";
    const faltaFicheiro = ficheiro === null;
    setErroTitulo(faltaTitulo ? t("rhPortalReal.enviar.erroTitulo") : null);
    setErroFicheiro(faltaFicheiro ? t("rhPortalReal.enviar.novo.semFicheiro") : null);
    if (faltaTitulo || ficheiro === null) return;
    setAExecutar(true);
    const r = await anexarEEnviar({ titulo, tipo, ficheiro, exigeAssinatura: assinatura, conviteId });
    setAExecutar(false);
    if (r.ok) return aoFechar();
    setErro(r.erro);
  };
  const confirmar = async () => {
    if (aExecutar) return;
    setErro(null);
    if (modo === "novo") return confirmarNovo();
    if (escolha === "") return setErro(t("rhPortalReal.enviar.semEscolha"));
    setAExecutar(true);
    const r = await enviar(escolha, conviteId, assinatura);
    setAExecutar(false);
    if (r.ok) return aoFechar();
    setErro(r.erro);
  };
  const semNada = documentos.length === 0 && !modoNovoDisponivel;
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a && !aExecutar) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.enviar.titulo")}</DialogTitle>
          <DialogDescription>{t(modo === "novo" ? "rhPortalReal.enviar.novo.sub" : "rhPortalReal.enviar.sub")}</DialogDescription>
        </DialogHeader>
        {anexarEEnviar !== undefined && (
          <div className="space-y-2">
            <div role="group" aria-label={t("rhPortalReal.enviar.modo")} className="flex gap-2">
              <Button type="button" variant={modo === "existente" ? "default" : "outline"} aria-pressed={modo === "existente"} className={cn(BOTAO, "flex-1")} onClick={() => trocarModo("existente")}>
                {t("rhPortalReal.enviar.modoExistente")}
              </Button>
              <Button type="button" variant={modo === "novo" ? "default" : "outline"} aria-pressed={modo === "novo"} disabled={!podeAnexar} className={cn(BOTAO, "flex-1")} onClick={() => trocarModo("novo")}>
                {t("rhPortalReal.enviar.modoNovo")}
              </Button>
            </div>
            {!podeAnexar && <p role="status" className="text-xs text-muted-foreground">{t("rhPortalReal.enviar.semPermissaoAnexar")}</p>}
          </div>
        )}
        {modo === "novo" ? (
          <FormularioNovoDocumento
            titulo={titulo} tipo={tipo} assinatura={assinatura} ficheiro={ficheiro} bloqueado={aExecutar}
            erroTitulo={erroTitulo} erroFicheiro={erroFicheiro}
            aTitulo={(v) => { setTitulo(v); setErroTitulo(null); }} aTipo={setTipo} aAssinatura={mudarAssinaturaNovo}
            aFicheiro={(f) => { setFicheiro(f); setErroFicheiro(null); }}
          />
        ) : documentos.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t(modoNovoDisponivel ? "rhPortalReal.enviar.semDocumentosAnexar" : "rhPortalReal.enviar.semDocumentos")}
          </p>
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
          </div>
        )}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        {aExecutar && modo === "novo" && <p role="status" className="text-sm text-muted-foreground">{t("rhPortalReal.enviar.novo.aEnviar")}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={BOTAO} disabled={aExecutar} onClick={aoFechar}>{t("rhPortalReal.cancelar")}</Button>
          <Button type="button" className={BOTAO} disabled={aExecutar || semNada || (modo === "existente" && documentos.length === 0)} onClick={() => void confirmar()}>
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
