// O contrato real (o PDF assinado) na janela do contrato (27/11/2026). Ver contratoRealDados.ts.
// Fica por cima da minuta que a app gera: o que conta é o assinado. Sem PDF, deixa anexá-lo. Só numa organização real.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, ExternalLink, FileCheck2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { anexarContratoReal, lerContratoReal, pdfDoContrato, tamanhoLegivel, type ContratoReal as Contrato } from "./contratoRealDados";
import { modoReal, orgDoModoReal } from "./acessosPortal";

type Estado = { k: "a-ler" } | { k: "sem" } | { k: "com"; c: Contrato } | { k: "erro"; t: string };

/** O estado do contrato assinado do negócio. `null` fora de uma organização real (o protótipo não tem PDFs). */
export function useContratoReal(numero: number) {
  const org = modoReal() ? orgDoModoReal() : null;
  const [estado, setEstado] = useState<Estado>({ k: "a-ler" });
  const ler = useCallback(async () => {
    if (!org) return;
    try {
      const c = await lerContratoReal(org, numero);
      setEstado(c ? { k: "com", c } : { k: "sem" });
    } catch (e) {
      setEstado({ k: "erro", t: e instanceof Error ? e.message : String(e) });
    }
  }, [org, numero]);
  useEffect(() => { void ler(); }, [ler]);
  return org ? { org, estado, setEstado } : null;
}

export function ContratoRealBloco({ numero, cr }: { numero: number; cr: NonNullable<ReturnType<typeof useContratoReal>> }) {
  const { org, estado, setEstado } = cr;
  const [url, setUrl] = useState<string | null>(null);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const ficheiro = useRef<HTMLInputElement>(null);
  const caminho = estado.k === "com" ? estado.c.caminho : null;

  // o PDF lê-se pelo storage (com a sessão de quem vê) e mostra-se por um blob: (a CSP só deixa molduras blob:)
  useEffect(() => {
    if (!caminho) return;
    let vivo = true, criado: string | null = null;
    setUrl(null); setErroPdf(null);
    pdfDoContrato(caminho)
      .then((b) => { if (!vivo) return; criado = URL.createObjectURL(b); setUrl(criado); })
      .catch((e) => { if (vivo) setErroPdf(e instanceof Error ? e.message : "Não foi possível abrir o PDF."); });
    return () => { vivo = false; if (criado) URL.revokeObjectURL(criado); };
  }, [caminho]);

  const anexar = async (f: File) => {
    setAEnviar(true); setMsg(null);
    try {
      const c = await anexarContratoReal(org, numero, f);
      setEstado({ k: "com", c });
      setMsg({ t: `«${c.nome}» ficou guardado como o contrato assinado.` });
    } catch (e) {
      setMsg({ t: `Não foi possível anexar: ${e instanceof Error ? e.message : String(e)}`, erro: true });
    } finally {
      setAEnviar(false);
      if (ficheiro.current) ficheiro.current.value = "";
    }
  };

  const escolher = (
    <input ref={ficheiro} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Contrato assinado (PDF)" data-contrato-real-ficheiro=""
      disabled={aEnviar} onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexar(f); }} />
  );
  const aviso = msg && <p role={msg.erro ? "alert" : "status"} className={msg.erro ? "text-[15px] text-destructive" : "text-[15px] text-emerald-700"}>{msg.t}</p>;

  if (estado.k === "a-ler") {
    return <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />A procurar o contrato assinado…</p>;
  }
  if (estado.k === "erro") {
    return <p role="alert" className="text-[15px] text-destructive">Não foi possível ver se há contrato assinado: {estado.t}</p>;
  }
  if (estado.k === "sem") {
    return (
      <section aria-label="Contrato assinado" className="space-y-2 rounded-2xl border border-dashed border-border bg-card p-4">
        <p className="text-[15px] font-semibold">Ainda não há o contrato assinado em PDF</p>
        <p className="text-[15px] text-muted-foreground">Abaixo está a minuta que a app gerou. Anexe o contrato que o cliente assinou, para ficar aqui guardado. Só PDF, até 20 MB.</p>
        {escolher}
        <Button type="button" variant="outline" disabled={aEnviar} onClick={() => ficheiro.current?.click()}>
          {aEnviar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {aEnviar ? "A anexar…" : "Anexar o contrato assinado (PDF)"}
        </Button>
        {aviso}
      </section>
    );
  }
  const c = estado.c;
  return (
    <section aria-label="Contrato assinado" className="space-y-3 rounded-2xl border-2 border-emerald-600/40 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[17px] font-semibold"><FileCheck2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />Contrato assinado pelo cliente</p>
          <p className="mt-0.5 break-all text-[15px] text-muted-foreground">{c.nome}{c.tamanho ? ` · ${tamanhoLegivel(c.tamanho)}` : ""} · guardado a {c.quando}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" disabled={!url}>
            <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url}><ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir</a>
          </Button>
          <Button asChild disabled={!url}>
            <a href={url ?? undefined} download={c.nome} aria-disabled={!url}><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />Descarregar</a>
          </Button>
        </div>
      </div>
      {erroPdf ? <p role="alert" className="text-[15px] text-destructive">Não foi possível abrir o PDF: {erroPdf}</p>
        : url ? <iframe title={`Contrato assinado: ${c.nome}`} src={url} className="hidden h-[75vh] w-full rounded-xl border border-border bg-white sm:block" />
        : <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />A abrir o PDF…</p>}
      <div className="flex flex-wrap items-center gap-2">
        {escolher}
        <Button type="button" variant="ghost" size="sm" disabled={aEnviar} onClick={() => ficheiro.current?.click()}>
          {aEnviar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="mr-1.5 h-4 w-4" aria-hidden="true" />}Trocar o PDF
        </Button>
        {aviso}
      </div>
    </section>
  );
}

/**
 * 27/11: na janela do contrato, o assinado vem primeiro e a minuta da app fica abaixo, com o nome dela, para não se confundirem.
 * Fora de uma organização real fica tudo como estava.
 */
export function ContratoRealEMinuta({ numero, cartao, folha }: { numero: number; cartao: ReactNode; folha: ReactNode }) {
  const cr = useContratoReal(numero);
  if (!cr) return <>{cartao}{folha}</>;
  const temReal = cr.estado.k === "com";
  return (
    <>
      <ContratoRealBloco numero={numero} cr={cr} />
      {cartao}
      {temReal && (
        <div className="px-1">
          <p className="text-[15px] font-semibold">Minuta gerada pela app</p>
          <p className="text-[15px] text-muted-foreground">É o resumo que a Olyvia fez a partir da proposta aceite. Não é o documento que o cliente assinou: esse é o PDF acima.</p>
        </div>
      )}
      {folha}
    </>
  );
}

/**
 * 27/11: «Contrato de empreitada» em «Tudo do negócio» quando a app não gerou a minuta (a proposta aceite é o contrato): só o PDF
 * assinado, ou o campo para o anexar.
 */
export function ContratoRealSo({ numero }: { numero: number }) {
  const cr = useContratoReal(numero);
  if (!cr) return <p className="text-[15px] text-muted-foreground">O contrato assinado em PDF só existe numa organização real.</p>;
  return <ContratoRealBloco numero={numero} cr={cr} />;
}
