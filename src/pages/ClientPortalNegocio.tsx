// Portal do cliente (2/11/2026): o negócio inteiro, com o ecrã da V1 (src/emylia/PortalCliente.tsx), o mesmo da pré-visualização
// «Ver como o cliente» do CRM: o percurso, o passo de agora, o plano da obra fase a fase, o progresso, os trabalhos com as fotografias e
// as notas dos técnicos, o diário, os materiais, as faturas das prestações (pagas e por pagar), os documentos (proposta, contrato,
// adendas, nota de encomenda, faturas, auto e relatório), a receção da obra, o relatório final e a conversa com a equipa.
// · O negócio vem da vista do cliente (portal_neg_vista, 20270103800000), que o CRM grava já sem custos (real/vistaCliente.ts).
// · O estado da proposta e do contrato é o real (o que a RLS do portal já deixa ler), por cima da vista; a receção da obra também.
// · Aceitar e assinar abrem as páginas reais (código por SMS, client-portal-action). A conversa é a da base (ConversaDoNegocio).
// · O auto de receção assina-se aqui, com o código por SMS (sms-otp) e portal_neg_receber_obra. Assinado, aparece o relatório da obra.
// · Sem vista (o CRM ainda não abriu o negócio depois desta versão), abre a proposta ou o contrato, como antes.
import { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCompany } from "@/contexts/PortalCompanyContext";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { PortalOrgsErrorState } from "@/components/portal/PortalOrgsErrorState";
import { ConversaDoNegocio } from "@/components/portal/negocio/ConversaDoNegocio";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalCliente } from "@/emylia/PortalCliente";
import { acoes, seed, type Estado } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { definirModoReal } from "@/emylia/acessosPortal";
import { RESPONSAVEL_OBRA } from "@/emylia/obraOps";
import { aplicarRececao, comEstadoReal, lerVista, type RececaoCliente, type VistaCliente } from "@/emylia/real/vistaCliente";

const ATUALIZAR_CADA_MS = 30_000;

type Rpc = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

interface DocsReais { propostaId: string | null; propostaEstado: string | null; contratoId: string | null; contratoEstado: string | null }

async function lerDocs(negocioId: string): Promise<DocsReais> {
  const [p, c] = await Promise.all([
    supabase.from("proposals").select("id, status, created_at").eq("negocio_id", negocioId).order("created_at", { ascending: false }).limit(1),
    supabase.from("client_contracts").select("id, status, created_at").eq("negocio_id", negocioId).order("created_at", { ascending: false }).limit(1),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  const pr = (p.data ?? [])[0] as { id: string; status: string } | undefined;
  const ct = (c.data ?? [])[0] as { id: string; status: string } | undefined;
  return { propostaId: pr?.id ?? null, propostaEstado: pr?.status ?? null, contratoId: ct?.id ?? null, contratoEstado: ct?.status ?? null };
}

/** O Estado mínimo do motor para o ecrã do cliente: só este negócio e os serviços que ele usa (sem o exemplo). */
function estadoDoCliente(v: VistaCliente, rececao: RececaoCliente | null, docs: DocsReais | undefined): Estado {
  const S = seed();
  const d = comEstadoReal(v.d, docs?.propostaEstado, docs?.contratoEstado);
  aplicarRececao(d, rececao);
  S.deals = [d]; S.clientes = []; S.svc = v.svc as Estado["svc"]; S.deal = d.id; S.semExemplos = true;
  return S;
}

/** A assinatura do auto de receção: o código por SMS (sms-otp) e, verificado, portal_neg_receber_obra. */
function ReceberObraSms({ negocioId, auto, reservas, voltar, feito }: { negocioId: string; auto: string; reservas?: string; voltar: () => void; feito: () => void }) {
  const [fase, setFase] = useState<"inicio" | "a-enviar" | "codigo" | "a-verificar">("inicio");
  const [codigo, setCodigo] = useState("");
  const [tel, setTel] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const aEnviar = useRef(false);
  const ref = { reference_id: negocioId, reference_type: "negocio_auto", purpose: "auto_rececao" };

  const enviar = async () => {
    if (aEnviar.current) return;
    aEnviar.current = true; setErro(null); setFase("a-enviar");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", { body: { action: "send_otp", ...ref } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.message || "Não foi possível enviar o código.");
      setTel(data?.masked_phone ?? ""); setFase("codigo");
    } catch (e) { setErro((e as Error).message); setFase("inicio"); } finally { aEnviar.current = false; }
  };
  const assinar = async () => {
    if (codigo.length !== 6) return;
    setErro(null); setFase("a-verificar");
    try {
      const v = await supabase.functions.invoke("sms-otp", { body: { action: "verify_otp", ...ref, code: codigo } });
      if (v.error) throw new Error(v.error.message);
      if (v.data?.error) throw new Error(v.data.message || "Código inválido.");
      const r = await (supabase as unknown as Rpc).rpc("portal_neg_receber_obra", { p_negocio_id: negocioId, p_auto: auto, p_reservas: reservas ?? null });
      if (r.error) throw new Error(r.error.message);
      feito();
    } catch (e) { setErro((e as Error).message); setCodigo(""); setFase("codigo"); }
  };

  const botao = "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-50";
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-500">Receber a obra · auto {auto}</p>
      <h2 className="text-xl font-semibold">Assinar o auto de receção</h2>
      <p className="text-[15px] text-slate-600">
        {reservas ? `Fica escrita a sua observação: «${reservas}». ` : "Diz que está tudo bem. "}
        Para assinar, enviamos um código por SMS para o seu telemóvel.
      </p>
      {fase === "inicio" || fase === "a-enviar" ? (
        <button type="button" onClick={enviar} disabled={fase === "a-enviar"} className={`${botao} bg-slate-900 text-white hover:bg-slate-800`}>
          {fase === "a-enviar" ? "A enviar o código…" : "Enviar o código por SMS"}
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[15px] font-medium">Código que recebeu{tel ? ` em ${tel}` : ""}</span>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
              aria-invalid={!!erro} className="h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-xl tracking-[0.4em] tabular-nums outline-none focus:border-slate-900" />
          </label>
          <button type="button" onClick={assinar} disabled={codigo.length !== 6 || fase === "a-verificar"} className={`${botao} bg-slate-900 text-white hover:bg-slate-800`}>
            {fase === "a-verificar" ? "A assinar…" : "Assinar o auto"}
          </button>
          <button type="button" onClick={enviar} className="min-h-11 w-full text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline">Enviar outro código</button>
        </div>
      )}
      {erro && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[15px] text-red-900">{erro}</p>}
      <button type="button" onClick={voltar} className={`${botao} border border-slate-300 bg-white text-slate-800 hover:border-slate-500`}>Voltar ao auto</button>
    </div>
  );
}

const ClientPortalNegocio = () => {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeOrg, isLoading: orgsLoading, isError: orgsError } = usePortalCompany();
  const [aviso, setAviso] = useState<string | null>(null);

  const vista = useQuery({
    queryKey: ["portal-negocio-vista", id],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as Rpc).rpc("portal_neg_vista", { p_negocio_id: id });
      if (error) throw new Error(error.message);
      return lerVista(data);
    },
    enabled: !orgsLoading && Boolean(activeOrg) && Boolean(id),
    refetchInterval: ATUALIZAR_CADA_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const docs = useQuery({
    queryKey: ["portal-negocio-docs", id],
    queryFn: () => lerDocs(id),
    enabled: !orgsLoading && Boolean(activeOrg) && Boolean(id),
    refetchInterval: ATUALIZAR_CADA_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const v = vista.data ?? null;
  const ctx = useMemo<Ctx | null>(() => {
    if (!v) return null;
    // o nome e o NIF da empresa nos documentos, e o responsável de obra, são os da organização do negócio
    definirModoReal(activeOrg?.organizationId ?? null, v.empresa.nome || activeOrg?.name || "", { nome: v.empresa.nomeFiscal, nif: v.empresa.nif });
    if (v.responsavel.n) Object.assign(RESPONSAVEL_OBRA, v.responsavel);
    const S = estadoDoCliente(v, v.rececao, docs.data);
    // as ações do motor nunca correm aqui: o que tem caminho real (aceitar, assinar, receber a obra, escrever) vai pelas funções reais
    const A = new Proxy({}, { get: () => () => setAviso("Isto ainda não se faz por aqui. Escreva-nos na conversa e tratamos consigo.") }) as ReturnType<typeof acoes>;
    return { S, A, run: (fn) => { try { fn(); } catch { /* nada corre no motor */ } }, go: (fn) => () => fn(), q: "" };
  }, [v, docs.data, activeOrg?.organizationId, activeOrg?.name]);

  if (orgsLoading || vista.isLoading || docs.isLoading) {
    return <ClientPortalLayout><div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div></ClientPortalLayout>;
  }
  if (orgsError || (vista.isError && !vista.data) || (docs.isError && !docs.data)) {
    return <ClientPortalLayout><PortalOrgsErrorState /></ClientPortalLayout>;
  }
  const D = docs.data;
  // sem a vista do cliente: a proposta ou o contrato, como antes desta página
  if (!ctx || !v) {
    if (D?.contratoId && (D.propostaEstado === "accepted" || D.contratoEstado === "signed" || D.contratoEstado === "active")) return <Navigate to={`/client-portal/contracts/${D.contratoId}`} replace />;
    if (D?.propostaId) return <Navigate to={`/client-portal/proposals/${D.propostaId}`} replace />;
    return <Navigate to="/client-portal/negocios" replace />;
  }
  const d = ctx.S.deals[0];
  return (
    <PortalCliente
      ctx={ctx}
      d={d}
      fechar={() => navigate("/client-portal/negocios")}
      real={{
        abrirProposta: () => (D?.propostaId ? navigate(`/client-portal/proposals/${D.propostaId}`) : setAviso("A proposta ainda não está disponível. Tente daqui a pouco.")),
        abrirContrato: D?.contratoId ? () => navigate(`/client-portal/contracts/${D.contratoId}`) : null,
        conversa: <ConversaDoNegocio negocioId={id} />,
        receberObra: (reservas, voltar) => d.obra.auto ? (
          <ReceberObraSms negocioId={id} auto={d.obra.auto.n} reservas={reservas} voltar={voltar}
            feito={() => { voltar(); void qc.invalidateQueries({ queryKey: ["portal-negocio-vista", id] }); }} />
        ) : null,
        aviso,
      }}
    />
  );
};

export default ClientPortalNegocio;
