// As abas «Pedidos do RH» e «Os meus pedidos» do portal REAL, com o desenho das do exemplo, ligadas à Edge `convite-admissao`:
//  - «Pedidos do RH»: o que o RH pede (cartão de cidadão, IBAN, fotografia...) com prazo e estado. «Enviar» escolhe ficheiros REAIS
//    (PDF, PNG ou JPEG, no máximo 4 por pedido); cada um sobe para a quarentena e a Edge lê-lhe a assinatura antes de o ligar
//    (`doc_pedido_url`, `doc_pedido_confirmar`); depois fecha-se o pedido (`doc_pedido_enviar`). Os já ligados podem tirar-se.
//  - «Os meus pedidos»: a pessoa pede um documento ao RH (painel lateral) e cancela o que ainda não foi tratado.
// Estados: erro traduzido (nunca o código), vazio, a enviar. Nada de caminhos nem de ficheiros fica em estado além do envio.
import { useId, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ClipboardList, FilePlus2, Inbox, Paperclip, Send, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { chaveDeErroAdmissao } from "@/components/rh-exemplo/lib/errosAdmissao";
import { validarFicheiroLocal, type TipoAnexoConvite } from "@/components/rh-exemplo/lib/conviteAnexos";
import {
  MAX_FICHEIROS_PEDIDO, TIPOS_PEDIDO_PESSOA, type EstadoPedidoPessoa, type EstadoPedidoRh, type TipoPedidoPessoa, type Urgencia,
} from "@/components/rh-exemplo/lib/portalDocumentos";
import { mensagemErroPortal } from "@/components/rh-exemplo/hooks/portalAdmissaoReal";
import {
  pedidoRhAtrasadoReal, pedidoRhPedeAcaoReal, type EnvioPortal, type PedidoPessoaPortal, type PedidoRhPortal,
} from "@/components/rh-exemplo/hooks/portalDocumentosPublicoReal";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { DocumentosPortalHook } from "./PortalDocumentosReal";
import { SeloPedidoPessoa, SeloPedidoRh } from "./aspeto";
import { diaMesDoDia } from "./textosPortal";

const hojeIso = (): string => new Date().toISOString().slice(0, 10);
type Traduzir = ReturnType<typeof useTranslation>["t"];

const tituloRh = (t: Traduzir, p: PedidoRhPortal): string => (p.tipo === "outro" && p.titulo !== "" ? p.titulo : t(`rhPortal.tipoRh.${p.tipo}`));
const tituloPessoa = (t: Traduzir, p: PedidoPessoaPortal): string =>
  p.tipo === "outro" && p.titulo !== "" ? p.titulo : t(`rhPortal.tipoPessoa.${p.tipo}`);

/** Escolhe ficheiros REAIS (os `File` ficam aqui so ate ao envio). Valida como o convite: formato e tamanho. */
function EscolherFicheiros({ ficheiros, max, tipo, aoMudar }: { ficheiros: File[]; max: number; tipo: TipoAnexoConvite; aoMudar: (f: File[]) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [erro, setErro] = useState<string | null>(null);
  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const novos = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of novos) {
      const recusa = validarFicheiroLocal(tipo, f);
      if (recusa) return setErro(t(chaveDeErroAdmissao(recusa)?.chave ?? "rhPortal.erro.ficheiro_invalido"));
    }
    if (ficheiros.length + novos.length > max) return setErro(t("rhPortal.erro.max_ficheiros", { n: max }));
    setErro(null);
    aoMudar([...ficheiros, ...novos]);
  };
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={cn(buttonVariants({ variant: "outline" }), "min-h-11 cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-ring", FOCO)}
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        {t("rhPortal.ficheiros.escolher")}
        <input id={id} type="file" multiple={max > 1} accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={escolher} />
      </label>
      {ficheiros.length > 0 && (
        <ul className="space-y-1" aria-label={t("rhPortal.ficheiros.lista")}>
          {ficheiros.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm">
              <span className="min-w-0 truncate">{f.name}</span>
              <button
                type="button" className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted", FOCO)}
                aria-label={t("rhPortal.ficheiros.remover", { nome: f.name })} onClick={() => aoMudar(ficheiros.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}

function FormularioEnvio({ pedido, docs, aoEnviar }: { pedido: PedidoRhPortal; docs: DocumentosPortalHook; aoEnviar: () => void }) {
  const { t } = useTranslation();
  const [novos, setNovos] = useState<File[]>([]);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tipo: TipoAnexoConvite = pedido.tipo === "outro" ? "cartao_cidadao" : (pedido.tipo as TipoAnexoConvite);
  const ligados = pedido.ficheiros.length;

  const tirar = async (anexoId: string) => {
    setErro(null);
    const r = await docs.removerFicheiro(anexoId);
    if (!r.ok) setErro(mensagemErroPortal(t, r.codigo));
  };
  const enviar = async () => {
    if (aEnviar) return;
    if (ligados + novos.length === 0) return setErro(mensagemErroPortal(t, "sem_ficheiro"));
    setAEnviar(true);
    setErro(null);
    let restantes = novos;
    for (const f of novos) {
      const r = await docs.enviarFicheiro(pedido.id, f);
      if (!r.ok) {
        setNovos(restantes);
        setAEnviar(false);
        await docs.recarregar();
        return setErro(mensagemErroPortal(t, r.codigo));
      }
      restantes = restantes.filter((x) => x !== f);
    }
    setNovos([]);
    const fim = await docs.enviarPedido(pedido.id);
    setAEnviar(false);
    if (!fim.ok) {
      await docs.recarregar();
      return setErro(mensagemErroPortal(t, fim.codigo));
    }
    aoEnviar();
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      {ligados > 0 && (
        <ul className="space-y-1" aria-label={t("rhPortalReal.pedidos.jaEnviados")}>
          {pedido.ficheiros.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm">
              <span className="min-w-0 truncate">{f.nome}</span>
              <button
                type="button" disabled={aEnviar} className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted", FOCO)}
                aria-label={t("rhPortal.ficheiros.remover", { nome: f.nome })} onClick={() => void tirar(f.id)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <EscolherFicheiros ficheiros={novos} max={MAX_FICHEIROS_PEDIDO - ligados} tipo={tipo} aoMudar={(f) => { setNovos(f); setErro(null); }} />
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <Button type="button" className={cn("min-h-11", FOCO)} disabled={aEnviar} onClick={() => void enviar()}>
        {aEnviar ? t("rhPortalReal.pedidos.aEnviar") : t("rhPortal.pedidosRh.enviarFicheiros")}
      </Button>
    </div>
  );
}

function ItemPorTratar({ pedido, docs }: { pedido: PedidoRhPortal; docs: DocumentosPortalHook }) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const atrasado = pedidoRhAtrasadoReal(pedido, hojeIso());
  const titulo = tituloRh(t, pedido);
  return (
    <li data-testid={`pedido-rh-${pedido.id}`} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-medium">{titulo}</h3>
          {pedido.prazo !== "" && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {t("rhPortal.pedidosRh.prazo", { data: diaMesDoDia(pedido.prazo) })}
              {atrasado && <span className="font-medium text-destructive"> · {t("rhPortal.pedidosRh.atrasado")}</span>}
            </p>
          )}
        </div>
        <SeloPedidoRh estado={pedido.estado as EstadoPedidoRh} t={t} />
      </div>
      {pedido.nota && <p className="text-sm text-muted-foreground">{pedido.nota}</p>}
      {pedido.estado === "recusado" && pedido.motivoRecusa && (
        <p role="status" className="rounded-md border-l-4 border-destructive bg-destructive/5 px-3 py-1.5 text-sm">
          {t("rhPortal.pedidosRh.recusadoMotivo", { motivo: pedido.motivoRecusa })}
        </p>
      )}
      <Button
        type="button" variant={aberto ? "outline" : "default"} className={cn("min-h-11 gap-2", FOCO)} aria-expanded={aberto}
        aria-label={t("rhPortal.pedidosRh.enviarAria", { titulo })} onClick={() => setAberto(!aberto)}
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {pedido.estado === "recusado" ? t("rhPortal.pedidosRh.enviarDeNovo") : t("rhPortal.pedidosRh.enviar")}
      </Button>
      {aberto && <FormularioEnvio pedido={pedido} docs={docs} aoEnviar={() => setAberto(false)} />}
    </li>
  );
}

function Historico({ enviados }: { enviados: PedidoRhPortal[] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="portal-enviados-titulo" className="space-y-2">
      <h3 id="portal-enviados-titulo" className="text-base font-semibold">{t("rhPortal.pedidosRh.enviadosPorMim")}</h3>
      <ul className="space-y-2">
        {enviados.map((p) => (
          <li key={p.id} data-testid={`enviado-${p.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-card p-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">{tituloRh(t, p)}</p>
              <p className="text-xs text-muted-foreground">{p.ficheiros.map((f) => f.nome).join(", ")}</p>
            </div>
            <SeloPedidoRh estado={p.estado as EstadoPedidoRh} t={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PortalPedidosRhReal({ pedidos, docs }: { pedidos: PedidoRhPortal[]; docs: DocumentosPortalHook }) {
  const { t } = useTranslation();
  const porTratar = pedidos.filter(pedidoRhPedeAcaoReal);
  const enviados = pedidos.filter((p) => !pedidoRhPedeAcaoReal(p));
  return (
    <div className="space-y-6">
      {porTratar.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("rhPortal.pedidosRh.nada")}</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label={t("rhPortal.pedidosRh.lista")}>
          {porTratar.map((p) => <ItemPorTratar key={p.id} pedido={p} docs={docs} />)}
        </ul>
      )}
      {enviados.length > 0 && <Historico enviados={enviados} />}
    </div>
  );
}

const URGENCIAS: readonly Urgencia[] = ["normal", "urgente"];

function PedirDocumentoSheetReal({ aberto, docs, aoFechar }: { aberto: boolean; docs: DocumentosPortalHook; aoFechar: () => void }) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<TipoPedidoPessoa>("declaracao_vinculo");
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("normal");
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  // Ao abrir recomeca-se (o painel fica montado).
  const [abertoAntes, setAbertoAntes] = useState(false);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setTipo("declaracao_vinculo");
      setTitulo("");
      setNota("");
      setUrgencia("normal");
      setErro(null);
    }
  }

  const enviar = async () => {
    if (aEnviar) return;
    if (tipo === "outro" && titulo.trim() === "") return setErro(t("rhPortal.erro.titulo_obrigatorio"));
    setAEnviar(true);
    const r = await docs.pedirAoRh({ tipo, titulo, nota, urgencia });
    setAEnviar(false);
    if (r.ok) return aoFechar();
    setErro(mensagemErroPortal(t, r.codigo));
  };

  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("rhPortal.pedir.titulo")}</SheetTitle>
          <SheetDescription>{t("rhPortal.pedir.sub")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="portal-pedir-tipo">{t("rhPortal.pedir.tipo")}</Label>
            <NativeSelect
              id="portal-pedir-tipo" className="h-11" value={tipo} onValueChange={(v) => { setTipo(v as TipoPedidoPessoa); setErro(null); }}
              options={TIPOS_PEDIDO_PESSOA.map((v) => ({ value: v, label: t(`rhPortal.tipoPessoa.${v}`) }))}
            />
          </div>
          {tipo === "outro" && (
            <div className="space-y-1.5">
              <Label htmlFor="portal-pedir-titulo">{t("rhPortal.pedir.qualDocumento")}</Label>
              <Input id="portal-pedir-titulo" className="h-11" value={titulo} onChange={(e) => { setTitulo(e.target.value); setErro(null); }} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="portal-pedir-nota">{t("rhPortal.pedir.nota")}</Label>
            <Textarea id="portal-pedir-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t("rhPortal.pedir.urgencia")}</legend>
            {URGENCIAS.map((u) => (
              <label key={u} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="portal-pedir-urgencia" className="h-5 w-5" checked={urgencia === u} onChange={() => setUrgencia(u)} />
                {t(`rhPortal.urgencia.${u}`)}
              </label>
            ))}
          </fieldset>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <SheetFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhPortal.cancelar")}</Button>
          <Button type="button" className="min-h-11" disabled={aEnviar} onClick={() => void enviar()}>{t("rhPortal.pedir.enviar")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ItemPedido({ pedido, envio, docs }: { pedido: PedidoPessoaPortal; envio: EnvioPortal | undefined; docs: DocumentosPortalHook }) {
  const { t } = useTranslation();
  const [erro, setErro] = useState<string | null>(null);
  const titulo = tituloPessoa(t, pedido);
  const cancelar = async () => {
    setErro(null);
    const r = await docs.cancelarMeuPedido(pedido.id);
    if (!r.ok) setErro(mensagemErroPortal(t, r.codigo));
  };
  return (
    <li data-testid={`meu-pedido-${pedido.id}`} className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-medium">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{t(`rhPortal.urgencia.${pedido.urgencia}`)}</p>
        </div>
        <SeloPedidoPessoa estado={pedido.estado as EstadoPedidoPessoa} t={t} />
      </div>
      {pedido.nota && <p className="text-sm text-muted-foreground">{pedido.nota}</p>}
      {pedido.estado === "recusado" && pedido.motivoRecusa && (
        <p role="status" className="rounded-md border-l-4 border-destructive bg-destructive/5 px-3 py-1.5 text-sm">
          {t("rhPortal.meus.recusadoMotivo", { motivo: pedido.motivoRecusa })}
        </p>
      )}
      {pedido.estado === "disponivel" && envio && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("rhPortal.meus.disponivelEm", { nome: envio.titulo })}</span>
          <Link to={{ search: "?sec=documentos&aba=recebidos" }} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11", FOCO)}>
            {t("rhPortal.meus.verEmRecebidos")}
          </Link>
        </p>
      )}
      {pedido.estado === "pedido" && (
        <Button type="button" variant="outline" size="sm" className={cn("min-h-11", FOCO)} aria-label={t("rhPortalReal.pedidos.cancelarAria", { titulo })} onClick={() => void cancelar()}>
          {t("rhPortalReal.pedidos.cancelar")}
        </Button>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </li>
  );
}

export function PortalMeusPedidosReal({ pedidos, envios, docs }: { pedidos: PedidoPessoaPortal[]; envios: EnvioPortal[]; docs: DocumentosPortalHook }) {
  const { t } = useTranslation();
  const [painel, setPainel] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("rhPortal.meus.sub")}</p>
        <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setPainel(true)}>
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />{t("rhPortal.meus.pedir")}
        </Button>
      </div>
      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("rhPortal.meus.vazio")}</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label={t("rhPortal.meus.lista")}>
          {pedidos.map((p) => <ItemPedido key={p.id} pedido={p} envio={envios.find((e) => e.id === p.envioId)} docs={docs} />)}
        </ul>
      )}
      <PedirDocumentoSheetReal aberto={painel} docs={docs} aoFechar={() => setPainel(false)} />
    </div>
  );
}
