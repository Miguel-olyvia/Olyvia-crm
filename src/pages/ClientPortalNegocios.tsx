import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { PortalOrgsErrorState } from "@/components/portal/PortalOrgsErrorState";
import { PASSOS_PORTAL, passoDoNegocio, type PassoPortal } from "@/components/portal/negocio/PassosDoNegocio";
import { CHAVE_NAO_LIDAS_PORTAL } from "@/components/portal/negocio/ConversaDoNegocio";
import { usePortalCompany, type PortalOrg } from "@/contexts/PortalCompanyContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { usePortalT } from "@/portal-i18n";
import { useNumerosDosNegocios } from "@/components/portal/obra/useNumerosDosNegocios";
import { numeroDaProposta } from "@/lib/numeroDocumento";

interface NegocioDoCliente {
  negocioId: string;
  propostaId: string;
  contratoId: string | null;
  titulo: string;
  numero: string | null;
  /** proposals.created_at: o ano do número mostrado («PR <ano>/<n.º do negócio>»). */
  criadaEm: string | null;
  valor: number | null;
  passo: PassoPortal;
}

const ATUALIZAR_CADA_MS = 20_000;
const COLUNAS ="id, title, proposal_number, value, status, negocio_id, created_at";

/** Os negócios do cliente na empresa ativa: uma linha por negócio, com a proposta mais recente e o contrato dela. Só lê o que a RLS já deixa ao cliente. */
async function lerNegocios(org: PortalOrg): Promise<NegocioDoCliente[]> {
  const [porEntidade, direta] = await Promise.all([
    org.entityId
      ? supabase.from("proposals").select(COLUNAS).eq("organization_id", org.organizationId).eq("entity_id", org.entityId).not("negocio_id", "is", null)
      : Promise.resolve({ data: [] as any[], error: null }),
    org.proposalId
      ? supabase.from("proposals").select(COLUNAS).eq("id", org.proposalId).not("negocio_id", "is", null)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (porEntidade.error) throw porEntidade.error;
  if (direta.error) throw direta.error;
  const propostas = Array.from(new Map([...(porEntidade.data ?? []), ...(direta.data ?? [])].map((p: any) => [p.id, p])).values())
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (propostas.length === 0) return [];

  const ids = Array.from(new Set(propostas.map((p: any) => p.negocio_id as string)));
  const { data: contratos, error } = await supabase.from("client_contracts").select("id, status, negocio_id").in("negocio_id", ids);
  if (error) throw error;

  const vistos = new Set<string>();
  const lista: NegocioDoCliente[] = [];
  for (const p of propostas as any[]) {
    if (vistos.has(p.negocio_id)) continue;
    vistos.add(p.negocio_id);
    const contrato = (contratos ?? []).find((c: any) => c.negocio_id === p.negocio_id);
    lista.push({
      negocioId: p.negocio_id, propostaId: p.id, contratoId: contrato?.id ?? null, titulo: p.title, numero: p.proposal_number ?? null, criadaEm: p.created_at ?? null,
      valor: p.value ?? null, passo: passoDoNegocio(p.status, contrato?.status),
    });
  }
  return lista;
}

/** Para onde leva o «Abrir»: quando o que falta é decidir (rever a proposta, assinar o contrato) vai direto ao documento; nos restantes casos
 *  (e quando o contrato ainda não existe) abre a página do negócio (o percurso, a obra, a conversa). */
function destinoDoNegocio(n: NegocioDoCliente): string {
  if (n.passo === 1) return `/client-portal/proposals/${n.propostaId}`;
  if (n.passo === 3 && n.contratoId) return `/client-portal/contracts/${n.contratoId}`;
  return `/client-portal/negocios/${n.negocioId}`;
}

const ClientPortalNegocios = () => {
  const navigate = useNavigate();
  const { t, tn } = usePortalT();
  const { activeOrg, isLoading: orgsLoading, isError: orgsError, hasMultiple } = usePortalCompany();
  // Acompanha as mudanças: lê ao abrir, de 20 em 20 segundos e ao voltar ao separador (o contrato nasce quando o cliente aceita; a proposta nova chega do CRM).
  const consulta = useQuery({
    queryKey: ["portal-negocios", activeOrg?.organizationId ?? null, activeOrg?.entityId ?? null, activeOrg?.proposalId ?? null],
    queryFn: () => lerNegocios(activeOrg as PortalOrg),
    enabled: !orgsLoading && Boolean(activeOrg),
    refetchInterval: ATUALIZAR_CADA_MS,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const negocios = consulta.data ?? [];
  // 23/11: o número como a Emylia o mostra (PR <ano>/<n.º do negócio>), pela vista do cliente; sem ela, o guardado
  const numeros = useNumerosDosNegocios(negocios.map((n) => n.negocioId));
  const numeroDe = (n: NegocioDoCliente): string | null => {
    const x = numeros.get(n.negocioId);
    return numeroDaProposta({ numeroNegocio: x?.numero ?? null, versao: x?.versao ?? null, criadoEm: n.criadaEm, guardado: n.numero }) || null;
  };
  // As mensagens da equipa por ler, por negócio (o mesmo ritmo da lista): um selo «N novas» em cada negócio.
  const naoLidas = useQuery({
    queryKey: [CHAVE_NAO_LIDAS_PORTAL, activeOrg?.organizationId ?? null],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await (supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> }).rpc("portal_neg_mensagens_nao_lidas");
      if (error) throw new Error(error.message);
      return (data && typeof data === "object" ? data : {}) as Record<string, number>;
    },
    enabled: !orgsLoading && Boolean(activeOrg),
    refetchInterval: ATUALIZAR_CADA_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const loading = orgsLoading || (Boolean(activeOrg) && consulta.isLoading);
  const falhou = consulta.isError && !consulta.data;

  const abrir = (n: NegocioDoCliente) => navigate(destinoDoNegocio(n));

  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">{t("pc.negocios.lista.titulo")}</h2>
        {loading ? (
          <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : orgsError || falhou ? (
          <PortalOrgsErrorState />
        ) : negocios.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Briefcase className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-muted-foreground">{t("pc.negocios.lista.vazio")}</p>
              {hasMultiple && <p className="mt-1.5 text-xs text-muted-foreground">{t("pc.negocios.lista.vazioOutros")}</p>}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {negocios.map((n) => (
              <li key={n.negocioId}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{n.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {[numeroDe(n), n.valor != null ? formatCurrency(n.valor) : null].filter(Boolean).join(" • ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {(naoLidas.data?.[n.negocioId] ?? 0) > 0 && (
                          <Badge className="text-xs">{tn("pc.negocios.lista.novas.um", "pc.negocios.lista.novas.varios", naoLidas.data?.[n.negocioId] ?? 0)}</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{t(PASSOS_PORTAL[n.passo - 1].nome)}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => abrir(n)} aria-label={t("pc.negocios.lista.abrirNegocio", { titulo: n.titulo })}>
                          {t("pc.negocios.lista.abrir")} <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5" role="img" aria-label={t("pc.negocios.lista.passoAria", { passo: n.passo, total: PASSOS_PORTAL.length, nome: t(PASSOS_PORTAL[n.passo - 1].nome) })}>
                      {PASSOS_PORTAL.map((p) => <div key={p.id} className={`h-1.5 rounded-full ${p.id <= n.passo ? "bg-primary" : "bg-muted"}`} />)}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalNegocios;
