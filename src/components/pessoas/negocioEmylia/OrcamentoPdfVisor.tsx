// O PDF do orçamento ao vivo: gera-o com o QuotePDFDocument do CRM (o mesmo dos Orçamentos) e mostra-o num visualizador embutido, com
// «Descarregar PDF» e «Imprimir». Carregado de forma preguiçosa por OrcamentoPdf.tsx: o react-pdf só pesa quando este passo se abre.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { FOCO } from "@/components/negocio-metas/estilos";
import { cn } from "@/lib/utils";
import type { DadosParaPdf } from "./orcamentoParaPdf";

interface OrgParaPdf { name: string; logo_url: string | null; metadata: Record<string, unknown> | null }
type Consulta = { select: (c: string) => Consulta; eq: (c: string, v: string) => Consulta; maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> };

const ESPERA_MS = 400;
const LIMITE_LOGO_MS = 5000;
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/** A imagem como data URL (o react-pdf não depende assim de CORS nem de uma segunda ida à rede). Se falhar, o PDF sai sem logótipo. */
async function imagemEmBase64(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https:\/\//i.test(url)) return url?.startsWith("data:") ? url : null;
  const controlo = new AbortController();
  const t = window.setTimeout(() => controlo.abort(), LIMITE_LOGO_MS);
  try {
    const r = await fetch(url, { signal: controlo.signal });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((ok) => { const l = new FileReader(); l.onloadend = () => ok(typeof l.result === "string" ? l.result : null); l.onerror = () => ok(null); l.readAsDataURL(blob); });
  } catch { return null; } finally { window.clearTimeout(t); }
}

/** A empresa como o CRM a lê para este PDF (buildQuoteRenderContext): nome, logótipo e metadata (NIF, email, telefone, morada). */
function useOrganizacao(orgId: string | null) {
  return useQuery({
    queryKey: ["orcamento-pdf-organizacao", orgId], enabled: orgId !== null, staleTime: 60_000,
    queryFn: async (): Promise<OrgParaPdf | null> => {
      const q = (supabase as unknown as { from: (n: string) => Consulta }).from("anew_organizations").select("id, name, logo_url, metadata").eq("id", orgId ?? "");
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(error.message);
      return (data as OrgParaPdf | null) ?? null;
    },
  });
}

interface Props { dados: DadosParaPdf; tpl: TemplateDeAspeto | null; orgId: string | null; aoFalhar: (mensagem: string) => void }

export default function OrcamentoPdfVisor({ dados, tpl, orgId, aoFalhar }: Props) {
  const org = useOrganizacao(orgId);
  const [url, setUrl] = useState<string | null>(null);
  const [aGerar, setAGerar] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const moldura = useRef<HTMLIFrameElement>(null);
  const falhar = useRef(aoFalhar);
  falhar.current = aoFalhar;
  const chave = JSON.stringify([dados, tpl, org.data ?? null]);
  const ficheiro = `Orcamento_${dados.quote.quote_number.replace(/[^\w-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;

  useEffect(() => {
    if (orgId !== null && org.isLoading) return;
    let cancelado = false;
    setAGerar(true);
    const espera = window.setTimeout(() => {
      void (async () => {
        try {
          const [{ pdf }, { QuotePDFDocument }, React] = await Promise.all([import("@react-pdf/renderer"), import("@/components/QuotePDFDocument"), import("react")]);
          const meta = org.data?.metadata ?? {};
          const [logoOrg, logoTpl] = await Promise.all([imagemEmBase64(org.data?.logo_url), imagemEmBase64(tpl?.logo_url)]);
          if (cancelado) return;
          const empresa = { name: org.data?.name ?? "", vat: texto(meta.vat), email: texto(meta.email), phone: texto(meta.phone), address: texto(meta.address), logo_url: logoOrg, brand_color: texto(meta.brand_color) || null, company_addresses: [] };
          const modelo = tpl ? { ...tpl, logo_url: logoTpl } : null;
          const elemento = React.createElement(QuotePDFDocument as never, {
            quote: dados.quote, company: empresa, client: dados.client, lines: dados.lines, fees: [], user: undefined,
            descontoPercent: dados.descontoPercent, proposalTemplate: modelo, renderContext: null, strictVariables: false,
          });
          const blob = await (pdf as unknown as (e: unknown) => { toBlob: () => Promise<Blob> })(elemento).toBlob();
          if (cancelado) return;
          const novo = URL.createObjectURL(blob);
          setUrl((antes) => { if (antes) URL.revokeObjectURL(antes); return novo; });
          setAviso(null);
        } catch (e) {
          if (!cancelado) falhar.current(e instanceof Error ? e.message : "erro desconhecido");
        } finally {
          if (!cancelado) setAGerar(false);
        }
      })();
    }, ESPERA_MS);
    return () => { cancelado = true; window.clearTimeout(espera); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chave` resume dados, template e organização
  }, [chave, orgId, org.isLoading]);

  useEffect(() => () => { setUrl((antes) => { if (antes) URL.revokeObjectURL(antes); return null; }); }, []);

  const imprimir = () => {
    const janela = moldura.current?.contentWindow;
    try { if (!janela) throw new Error("sem janela"); janela.focus(); janela.print(); setAviso(null); }
    catch { if (url) window.open(url, "_blank", "noopener"); setAviso("O navegador não deixou imprimir daqui: o PDF abriu noutro separador, imprima-o a partir de lá."); }
  };
  const botao = cn("inline-flex min-h-11 items-center justify-center rounded-lg border border-input px-4 text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-50", FOCO);

  return (
    <div className="space-y-3">
      {org.error instanceof Error && <p role="alert" className="text-[15px] text-destructive">Não foi possível ler os dados da empresa para o rodapé: {org.error.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <a href={url ?? undefined} download={ficheiro} aria-disabled={!url} aria-label="Descarregar PDF do orçamento" onClick={(ev) => { if (!url) ev.preventDefault(); }} className={cn(botao, !url && "pointer-events-none opacity-50")}>Descarregar PDF</a>
        <button type="button" onClick={imprimir} disabled={!url} aria-label="Imprimir o PDF do orçamento" className={botao}>Imprimir</button>
        {aGerar && <p role="status" className="text-sm text-muted-foreground">A gerar o PDF…</p>}
      </div>
      {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}
      {url ? (
        <iframe ref={moldura} src={url} title="PDF do orçamento" className="h-[70vh] min-h-[28rem] w-full rounded-xl border border-border bg-white" />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">{aGerar ? "A preparar o documento…" : "Sem PDF para mostrar."}</div>
      )}
    </div>
  );
}
