// As fotografias de uma etapa da visita (13/10/2026): o exterior, o interior e a área de intervenção têm
// cada um as suas. Para fechar a visita basta haver fotografias no total (ou marcar que o cliente não quis).
// 9/11 (Rúben): «Tirar fotografia» abre a câmara do telemóvel e a fotografia fica guardada no negócio (com a base ligada, em
// negocio_visita_fotos; no protótipo, no estado). Também se pode escolher da galeria. Cada fotografia vê-se em grande e apaga-se.
import { useEffect, useRef, useState, type RefObject } from "react";
import { Camera, Check, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fotosPor, type EtapaFotos, type Negocio } from "./motor";
import { aValidar } from "./CamposFase";
import { orgDoModoReal } from "./acessosPortal";
import { fotoParaEnvio } from "./real/conversaReal";
import { imagemDaFoto, useFotosVisita } from "./real/visitaFotosReal";
import type { Ctx } from "./pecas";

const TITULO: Record<EtapaFotos, string> = { exterior: "Fotografias do exterior", interior: "Fotografias do interior", area: "Fotografias da área de intervenção" };
const DICA: Record<EtapaFotos, string> = {
  exterior: "Fachada, entrada, acesso e estacionamento",
  interior: "Caminho até à área, portas e elevador",
  area: "A área toda, as paredes e o que se vai demolir",
};

/** Uma fotografia mostrada: a imagem (ou como se lê, com a base ligada) e como se apaga. */
interface Mostrada { chave: string; src?: string; carregar?: () => Promise<string>; apagar: () => void }

export function FotosEtapa({ ctx, d, etapa, simples }: { ctx: Ctx; d: Negocio; etapa: EtapaFotos; simples?: boolean }) {
  const { A, run } = ctx;
  const org = orgDoModoReal();
  const real = useFotosVisita(org, d.id);
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null);
  const [aLer, setALer] = useState(0);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const v = d.visita, n = fotosPor(v)[etapa], recusou = d.f.diag_cliente_recusou_fotos === "Sim", semFotos = !(v.fotos > 0) && !recusou;

  const mostradas: Mostrada[] = org
    ? real.fotos.filter((f) => f.etapa === etapa).map((f) => ({ chave: f.id, carregar: () => imagemDaFoto(org, f.id),
        apagar: () => void real.apagar(f.id).then((ok) => { if (ok) run(() => A.tirarFoto(d.id, etapa)); }) }))
    : (v.fotosImg?.[etapa] ?? []).map((src, k) => ({ chave: `${k}:${src.length}`, src, apagar: () => run(() => A.tirarFoto(d.id, etapa, k)) }));
  // fotografias contadas antes de 9/11 (sem imagem): ficam como marcas, para o número bater certo
  const soContadas = Math.max(0, n - mostradas.length);
  const aGuardar = aLer + (org ? real.aEnviar : 0);
  const erro = erroLocal ?? (org ? real.erro : null);

  const juntar = async (lista: File[]) => {
    if (!lista.length) return;
    setErroLocal(null);
    for (const f of lista) {
      if (org) {
        if (await real.juntar(etapa, f)) run(() => A.foto(d.id, etapa));
      } else {
        setALer((x) => x + 1);
        try {
          // no protótipo a imagem fica no estado: pequena (640 px)
          const p = await fotoParaEnvio(f, 640);
          run(() => A.foto(d.id, etapa, `data:${p.mime};base64,${p.b64}`));
        } catch (e) {
          setErroLocal(e instanceof Error ? e.message : "Não foi possível ler a fotografia.");
        } finally { setALer((x) => x - 1); }
      }
    }
  };
  const entrada = (ref: RefObject<HTMLInputElement>, comCamara: boolean, rotulo: string) => (
    <input ref={ref} type="file" accept="image/*" {...(comCamara ? { capture: "environment" as const } : {})} multiple className="sr-only" tabIndex={-1} aria-label={rotulo}
      onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; void juntar(l); }} />
  );

  return (
    <section aria-label={TITULO[etapa]} className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={simples ? "text-base font-semibold" : "text-sm font-semibold"}>{TITULO[etapa]}</h3>
        {/* 27/10: a dica do que fotografar só enquanto não há fotografias */}
        <span className="text-sm text-muted-foreground" aria-live="polite">{n > 0 ? `${n} ${n === 1 ? "fotografia" : "fotografias"}` : DICA[etapa]}</span>
      </div>

      {(mostradas.length > 0 || soContadas > 0 || aGuardar > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label={`${TITULO[etapa]} tiradas`}>
          {mostradas.map((m, k) => (
            <li key={m.chave} className="relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
              <button type="button" onClick={() => setAberta(k)} aria-label={`Ver a fotografia ${k + 1} em grande`}
                className="block h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-24 sm:w-24">
                <Imagem m={m} alt={`Fotografia ${k + 1}`} className="h-full w-full object-cover" />
              </button>
              {!v.fechada && (
                <button type="button" aria-label={`Apagar a fotografia ${k + 1}`} onClick={m.apagar}
                  className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border border-border bg-card shadow-sm hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.min(soContadas, 6) }).map((_, i) => (
            <li key={`c${i}`} className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-border text-muted-foreground sm:h-24 sm:w-24" title="Fotografia contada, sem imagem guardada">
              <Camera className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Fotografia contada, sem imagem guardada</span>
            </li>
          ))}
          {aGuardar > 0 && (
            <li className="grid h-20 w-20 place-items-center rounded-lg border border-border bg-muted/60 text-muted-foreground sm:h-24 sm:w-24">
              <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /><span className="sr-only">A guardar a fotografia</span>
            </li>
          )}
        </ul>
      )}

      {entrada(camara, true, `Tirar fotografia: ${TITULO[etapa].toLowerCase()}`)}
      {entrada(galeria, false, `Escolher da galeria: ${TITULO[etapa].toLowerCase()}`)}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={v.fechada} onClick={() => camara.current?.click()}>
          <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />{n > 0 ? "Tirar outra" : "Tirar fotografia"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={v.fechada} onClick={() => galeria.current?.click()}>
          <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" />Da galeria
        </Button>
      </div>
      {erro && <p role="alert" className="text-[15px] font-medium text-destructive">{erro}</p>}

      {etapa === "area" && (
        <>
          {aValidar(d, "fotos") && semFotos && <p className="text-[15px] font-medium text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">Tire pelo menos uma fotografia (em qualquer etapa), ou marque que o cliente não quis.</p>}
          {/* 27/10: uma só marca (o "Sim / Não" de uma pergunta negativa confundia): marcada, conta como as fotografias feitas */}
          <button type="button" aria-pressed={recusou} disabled={v.fechada} onClick={() => run(() => A.campo(d.id, "diag_cliente_recusou_fotos", recusou ? "" : "Sim"))}
            className={cn("flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-[15px] transition-colors disabled:opacity-60",
              recusou ? "border-primary bg-primary/5 font-medium" : "border-input hover:border-foreground/40")}>
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", recusou ? "border-primary bg-primary text-primary-foreground" : "border-input")} aria-hidden="true">{recusou && <Check className="h-3.5 w-3.5" />}</span>
            O cliente não quis fotografias
          </button>
        </>
      )}

      <Dialog open={aberta != null && !!mostradas[aberta]} onOpenChange={(o) => { if (!o) setAberta(null); }}>
        <DialogContent className="max-w-3xl p-3 sm:p-4">
          <DialogTitle className="text-base">{TITULO[etapa]}{aberta != null && mostradas.length > 1 ? ` · ${aberta + 1} de ${mostradas.length}` : ""}</DialogTitle>
          <DialogDescription className="sr-only">A fotografia em tamanho grande.</DialogDescription>
          {aberta != null && mostradas[aberta] && <Imagem m={mostradas[aberta]} alt={`Fotografia ${aberta + 1}`} className="max-h-[75vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** A imagem de uma fotografia: já em memória (protótipo) ou lida da base quando aparece. */
function Imagem({ m, alt, className }: { m: Mostrada; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | undefined>(m.src);
  const [falhou, setFalhou] = useState(false);
  const { chave, src: dada, carregar } = m;
  useEffect(() => {
    if (dada) { setSrc(dada); return; }
    if (!carregar) return;
    let vivo = true;
    carregar().then((s) => { if (vivo) setSrc(s); }, () => { if (vivo) setFalhou(true); });
    return () => { vivo = false; };
    // carregar é uma função nova a cada desenho; a chave diz quando a fotografia mudou
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, dada]);
  if (src) return <img src={src} alt={alt} className={className} />;
  return (
    <span className="grid h-full min-h-20 w-full place-items-center text-muted-foreground">
      {falhou ? <Camera className="h-5 w-5" aria-hidden="true" /> : <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />}
      <span className="sr-only">{falhou ? "Não foi possível mostrar a fotografia" : "A carregar a fotografia"}</span>
    </span>
  );
}
