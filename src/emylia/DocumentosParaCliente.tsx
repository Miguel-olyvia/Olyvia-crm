// Documentos para o cliente (2/11/2026, reunião): "Os documentos é para se quiseres enviar alguma coisa ao cliente, o PDF de alguma
// coisa. Na UI temos de arranjar onde meter isso, para tu poderes escolher e enviar."
//
// No negócio, a equipa escolhe um ficheiro e ele aparece no portal do cliente, em Documentos. É o mesmo caminho dos anexos dos
// contratos (ContractsDocumentsView): o ficheiro vai para a quarentena, a validate-upload passa-o para «documents», e a linha em
// `documents` fica ligada ao contrato do negócio (ou à proposta, antes do contrato) com visible_to_client = true. A página Documentos
// do portal já lê estes anexos (ClientPortalDocuments). Só numa organização real e depois de a proposta seguir para o portal.
// 06/11/2026 (aprovado): enviar e tirar do portal pede portal.manage OU negocios.proposta.enviar, a regra de enviar a proposta ao portal
// (usePodeEnviarPropostaPortal); o servidor exige o mesmo no gatilho trg_documents_portal_exige_permissao.
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, FileText, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getUploadErrorMessage, parseValidateUploadResponse, resolveValidateUploadErrorMessage } from "@/lib/uploadErrors";
import { generateSecureFileName } from "@/utils/secureFileUpload";
import { SEM_PERMISSAO_DOCUMENTO_PORTAL, usePodeEnviarPropostaPortal } from "@/hooks/usePodeEnviarPropostaPortal";
import { modoReal, orgDoModoReal } from "./acessosPortal";
import type { Negocio } from "./motor";

const MAX_MB = 20;

interface Alvo { tipo: "contract" | "proposal"; id: string }
interface DocLinha { id: string; nome: string; quando: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAny = supabase as any;

/** O contrato do negócio (ou a proposta, antes do contrato): é a eles que os anexos do portal se ligam. */
async function alvoDoNegocio(org: string, numero: number): Promise<Alvo | null> {
  const n = await sbAny.from("negocios").select("id").eq("organization_id", org).eq("numero", numero).is("deleted_at", null).maybeSingle();
  const negocio = n.data?.id as string | undefined;
  if (!negocio) return null;
  const c = await sbAny.from("client_contracts").select("id").eq("negocio_id", negocio).order("created_at", { ascending: false }).limit(1);
  if (c.data?.[0]?.id) return { tipo: "contract", id: c.data[0].id };
  const p = await sbAny.from("proposals").select("id").eq("negocio_id", negocio).order("created_at", { ascending: false }).limit(1);
  if (p.data?.[0]?.id) return { tipo: "proposal", id: p.data[0].id };
  return null;
}

export function DocumentosParaCliente({ d }: { d: Negocio }) {
  const org = orgDoModoReal();
  const [aberto, setAberto] = useState(false);
  const [alvo, setAlvo] = useState<Alvo | null | undefined>(undefined);
  const [docs, setDocs] = useState<DocLinha[]>([]);
  const [aEnviar, setAEnviar] = useState(false);
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const ficheiro = useRef<HTMLInputElement>(null);

  const ler = useCallback(async () => {
    if (!org) return;
    const a = await alvoDoNegocio(org, d.id);
    setAlvo(a);
    if (!a) { setDocs([]); return; }
    const r = await sbAny.from("documents").select("id, file_name, created_at").eq("entity_type", a.tipo).eq("entity_id", a.id)
      .eq("visible_to_client", true).order("created_at", { ascending: false });
    setDocs(((r.data ?? []) as { id: string; file_name: string; created_at: string }[]).map((x) => ({ id: x.id, nome: x.file_name, quando: new Date(x.created_at).toLocaleDateString("pt-PT") })));
  }, [org, d.id]);

  useEffect(() => { if (aberto) void ler(); }, [aberto, ler]);

  const visivel = modoReal() && !!org && !!d.orc?.enviada;
  const permissao = usePodeEnviarPropostaPortal(visivel);
  const pode = permissao.pode;
  const motivo = pode || permissao.aLer ? undefined : SEM_PERMISSAO_DOCUMENTO_PORTAL;

  if (!visivel) return null;

  const enviar = async (f: File) => {
    if (!alvo || !pode) return;
    if (f.size > MAX_MB * 1024 * 1024) { setMsg({ t: `O ficheiro passa de ${MAX_MB} MB.`, erro: true }); return; }
    setAEnviar(true); setMsg(null);
    const caminho = `${org}/${alvo.tipo}/${alvo.id}/${generateSecureFileName(f)}`;
    try {
      const { data: u } = await supabase.auth.getUser();
      const quem = u.user ? (await sbAny.from("anew_users").select("id").eq("auth_user_id", u.user.id).maybeSingle()).data?.id ?? null : null;
      const up = await supabase.storage.from("documents-quarantine").upload(caminho, f);
      if (up.error) throw up.error;
      const v = await supabase.functions.invoke("validate-upload", { body: { quarantineBucket: "documents-quarantine", finalBucket: "documents", path: caminho } });
      const vr = parseValidateUploadResponse(v.data);
      if (v.error || !vr.ok) throw new Error(await resolveValidateUploadErrorMessage(vr, v.error));
      const ins = await sbAny.from("documents").insert({
        organization_id: org, entity_type: alvo.tipo, entity_id: alvo.id, file_name: f.name, file_url: caminho,
        file_type: f.type || f.name.split(".").pop(), file_size: f.size, document_type: "other",
        notes: `Enviado ao cliente no negócio ${d.id}`, uploaded_by: quem, visible_to_client: true,
      });
      if (ins.error) { await supabase.storage.from("documents").remove([caminho]); throw ins.error; }
      setMsg({ t: `«${f.name}» está no portal do cliente, em Documentos.` });
      d.hist.push({ t: `Documento enviado ao cliente no portal: ${f.name}`, q: new Date().toLocaleDateString("pt-PT"), k: "a" });
      await ler();
    } catch (e) {
      setMsg({ t: `Não foi possível enviar: ${getUploadErrorMessage(e)}`, erro: true });
    } finally {
      setAEnviar(false);
      if (ficheiro.current) ficheiro.current.value = "";
    }
  };

  const tirar = async (x: DocLinha) => {
    if (!pode) return;
    const r = await sbAny.from("documents").update({ visible_to_client: false }).eq("id", x.id);
    if (r.error) { setMsg({ t: `Não foi possível tirar do portal: ${r.error.message}`, erro: true }); return; }
    setMsg({ t: `«${x.nome}» saiu do portal do cliente.` });
    await ler();
  };

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
        <FileUp className="h-4 w-4" aria-hidden="true" />Enviar um documento ao cliente
      </button>
    );
  }
  return (
    <section aria-labelledby={`docs-cli-${d.id}`} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`docs-cli-${d.id}`} className="text-[17px] font-semibold">Documentos para o cliente</h3>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Fechar</Button>
      </div>
      <p className="mt-1 text-[15px] text-muted-foreground">O ficheiro aparece no portal do cliente, em Documentos. Até {MAX_MB} MB.</p>
      {alvo === undefined ? <p className="mt-3 flex items-center gap-2 text-[15px]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />A carregar…</p>
        : alvo === null ? <p className="mt-3 text-[15px]">Este negócio ainda não tem a proposta gravada na base. Grave-o e tente de novo.</p>
        : (
          <>
            {docs.length > 0 && (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {docs.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{x.nome}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{x.quando}</span>
                    <Button type="button" variant="ghost" size="sm" disabled={!pode} title={motivo} onClick={() => void tirar(x)} aria-label={`Tirar ${x.nome} do portal`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input ref={ficheiro} type="file" className="sr-only" id={`docs-cli-f-${d.id}`} disabled={aEnviar || !pode}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
              <Button type="button" disabled={aEnviar || !pode} title={motivo} onClick={() => ficheiro.current?.click()}>
                {aEnviar ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />A enviar…</> : <><FileUp className="mr-1.5 h-4 w-4" aria-hidden="true" />Escolher o ficheiro e enviar</>}
              </Button>
            </div>
            {motivo && <p className="mt-2 text-[15px] text-muted-foreground">{motivo}</p>}
          </>
        )}
      {msg && <p role={msg.erro ? "alert" : "status"} className={"mt-3 text-[15px] " + (msg.erro ? "text-destructive" : "text-success")}>{msg.t}</p>}
    </section>
  );
}
