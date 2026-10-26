// A barra de leitura da Receção (protótipo BarraLeituraRec.tsx): um só campo, acima dos separadores, para o que se lê
// ou escreve — nº da PO (inteiro ou os últimos dígitos), nº da guia, EAN/SKU/código aprendido ou o fornecedor. Enter
// (ou "Ir") resolve com resolveReceivingCode: uma PO abre o painel "Dar entrada"; uma guia fica escolhida (1 PO abre,
// várias filtram); um artigo encontra as POs que o têm; um fornecedor filtra; nada diz "Não encontrei «X»" e oferece
// "Ler artigo a artigo". Mensagens numa região aria-live sempre montada. A câmara é o leitor que já existe
// (CameraScanner, carregado só quando se abre), aqui em modo "fecha à primeira leitura".
import { Suspense, forwardRef, useImperativeHandle, useRef, useState, type ComponentType } from "react";
import { Camera, ScanLine } from "lucide-react";
import type { CameraScannerProps } from "@/components/scanner/CameraScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { noteLabel } from "./deliveryNotes";
import type { FiltrosRec, ReceivablePo } from "./porReceber";
import type { ReadResult } from "./resolveReceivingCode";

export interface ReceivingReadBarProps {
  pos: readonly ReceivablePo[];
  resolve: (text: string) => Promise<ReadResult>;
  /** Abre o painel "Dar entrada" da PO (com a linha do artigo destacada e/ou a guia escolhida). */
  onOpenPo: (id: string, opts: { productId?: string; noteId?: string }) => void;
  /** Filtra "Por receber" (e mostra-o). `noteId` = guia lida (fica escolhida ao abrir uma das POs). */
  onFilter: (f: Partial<FiltrosRec>, noteId?: string) => void;
  /** Abre o leitor artigo a artigo. */
  onArticleMode: () => void;
  camera?: ComponentType<CameraScannerProps>;
  disabled?: boolean;
}

/** Para o ecrã entregar à barra uma leitura da pistola feita fora do campo. */
export interface ReceivingReadBarHandle {
  read: (code: string) => void;
}

interface Msg {
  t: string;
  erro: boolean;
  artigo?: boolean;
}

export const ReceivingReadBar = forwardRef<ReceivingReadBarHandle, ReceivingReadBarProps>(function ReceivingReadBar(
  { pos, resolve, onOpenPo, onFilter, onArticleMode, camera: CameraComp, disabled },
  ref,
) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMounted, setCameraMounted] = useState(false);
  const seq = useRef(0);
  const num = (id: string) => pos.find((p) => p.id === id)?.orderNumber ?? "Encomenda";

  const ler = async (raw: string) => {
    const txt = raw.trim();
    if (!txt) return;
    const my = ++seq.current;
    setBusy(true);
    let r: ReadResult;
    try {
      r = await resolve(txt);
    } catch {
      r = { t: "nada", aviso: "Sem ligação ao servidor — tente de novo." };
    }
    if (my !== seq.current) return;
    setBusy(false);
    if (r.t === "po") {
      const po = pos.find((p) => p.id === r.po);
      const prod = r.productId ? po?.lines.find((l) => l.productId === r.productId)?.name : undefined;
      onOpenPo(r.po, { productId: r.productId, noteId: r.noteId });
      setMsg({ t: `${num(r.po)} aberta${prod ? ` · ${prod}` : ""}.`, erro: false });
    } else if (r.t === "guia") {
      onFilter({ ids: r.pos, lido: txt, sup: "" }, r.noteId);
      setMsg(
        r.pos.length
          ? { t: `Guia ${noteLabel(r.noteNumber)} escolhida: ${r.pos.length} encomendas de ${r.supplierName} por receber.`, erro: false }
          : { t: `Guia ${noteLabel(r.noteNumber)} escolhida: ${r.supplierName} não tem encomendas por receber.`, erro: true },
      );
    } else if (r.t === "pos") {
      onFilter({ ids: r.pos, lido: txt });
      setMsg({ t: `${r.pos.length} encomendas acabam em ${txt}: escolha uma.`, erro: false });
    } else if (r.t === "artigos") {
      onFilter({ ids: r.pos, lido: txt });
      setMsg({ t: `${r.pos.length} encomendas com ${r.names.join(" ou ")}: escolha uma.`, erro: false });
    } else if (r.t === "forn") {
      onFilter({ sup: r.supplierId, ids: [], lido: "" });
      setMsg({ t: `Encomendas de ${r.supplierName}.`, erro: false });
    } else {
      setMsg({ t: r.aviso ?? `Não encontrei «${txt}».`, erro: true, artigo: true });
    }
  };

  useImperativeHandle(ref, () => ({ read: (code: string) => void ler(code) }));

  const enviar = () => {
    const v = value;
    setValue("");
    void ler(v);
  };

  return (
    <div role="search" aria-label="Ler na Receção" className="space-y-1.5">
      <label htmlFor="rec-ler" className="text-sm font-medium">
        Ler ou escrever: nº PO, guia, fornecedor, EAN/SKU
      </label>
      <div className="flex items-stretch gap-2">
        <Input
          id="rec-ler"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              enviar();
            }
          }}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={200}
          placeholder="Ex.: 0146, GR 2026/311, 5601234000028 ou nome do fornecedor"
          className="h-11 min-w-0 flex-1"
        />
        {CameraComp ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-11 shrink-0 p-0"
            aria-label="Câmara"
            disabled={disabled}
            onClick={() => {
              setCameraMounted(true);
              setCameraOpen(true);
            }}
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="button" className="h-11 shrink-0 px-5" disabled={disabled || busy || !value.trim()} onClick={enviar}>
          Ir
        </Button>
      </div>
      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {busy ? <span className="text-muted-foreground">A procurar…</span> : null}
        {!busy && msg ? <span className={cn(msg.erro ? "text-destructive" : "text-muted-foreground")}>{msg.t}</span> : null}
        {!busy && msg?.artigo ? (
          <>
            {" "}
            <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={onArticleMode}>
              <ScanLine className="mr-1 h-4 w-4" aria-hidden="true" />
              Ler artigo a artigo
            </Button>
          </>
        ) : null}
      </div>
      {CameraComp && cameraMounted ? (
        <Suspense fallback={null}>
          <CameraComp
            open={cameraOpen}
            onOpenChange={setCameraOpen}
            continuous={false}
            onScan={(code) => {
              setCameraOpen(false);
              void ler(code);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
