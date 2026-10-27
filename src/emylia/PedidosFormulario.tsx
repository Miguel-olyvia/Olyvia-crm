// 23/10/2026 (migração, fase 4): os pedidos que chegam pelos formulários (Miguel) entram na app.
// Os formulários criam a ficha e o negócio nas tabelas próprias; a app (o V1) ainda lê o JSON. Este bloco das Pessoas lista os
// pedidos abertos que a app ainda não tem (app_pedidos_formulario) e «Trazer para a Olyvia» cria a lead (motor: importarPedido) e
// liga-a ao negócio do formulário (app_ligar_pedido, migração 0016): a projeção passa a atualizar esse negócio, sem duplicados.
// Só aparece com conta real (a base); a lista volta a ler-se a cada minuto.
import { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { orgDoModoReal } from "./acessosPortal";
import type { Ctx } from "./pecas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PedidoFormulario {
  negocio: string; numero: number; titulo: string; criado_em: string; origem: string | null;
  nome: string; telefone: string | null; email: string | null; linha: string; morada: string | null; formulario?: string | null;
}

export function PedidosFormulario({ A, run }: Pick<Ctx, "A" | "run">) {
  const org = orgDoModoReal();
  const [L, setL] = useState<PedidoFormulario[]>([]);
  const [aTrazer, setATrazer] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const ler = useCallback(async () => {
    if (!org) return;
    const { data, error } = await db.rpc("app_pedidos_formulario", { p_org: org });
    if (!error && Array.isArray(data)) setL(data as PedidoFormulario[]);
  }, [org]);
  useEffect(() => { void ler(); const t = window.setInterval(() => { void ler(); }, 60_000); return () => window.clearInterval(t); }, [ler]);
  if (!org || !L.length) return null;

  const trazer = async (p: PedidoFormulario) => {
    setATrazer(p.negocio); setErro("");
    let id = 0;
    run(() => { id = A.importarPedido({ nome: p.nome, tel: p.telefone ?? "", email: p.email ?? "", linha: p.linha, morada: p.morada ?? "", formulario: p.formulario ?? p.origem ?? "" }); });
    const { error } = await db.rpc("app_ligar_pedido", { p_org: org, p_negocio: p.negocio, p_v1: id });
    if (error) setErro(`O pedido de ${p.nome} entrou na app, mas não ficou ligado ao do formulário: ${error.message}`);
    setATrazer(null);
    await ler();
  };
  const data = (s: string) => { try { return new Date(s).toLocaleDateString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  return (
    <section aria-label="Pedidos dos formulários" className="mx-4 mb-4 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 motion-safe:animate-in motion-safe:fade-in-0 sm:mx-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
        {L.length === 1 ? "1 pedido novo dos formulários" : `${L.length} pedidos novos dos formulários`}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Chegaram pelo site e ainda não estão na Olyvia. Ao trazer, fica uma lead aqui, ligada ao pedido.</p>
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
        {L.slice(0, 8).map((p) => (
          <li key={p.negocio} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[15px]">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{p.nome}</span>
              <span className="block text-sm text-muted-foreground">{[p.titulo, p.formulario ?? p.origem, p.telefone ?? p.email, p.morada, data(p.criado_em)].filter(Boolean).join(" · ")}</span>
            </span>
            <Button className="min-h-10 shrink-0" disabled={!!aTrazer} onClick={() => { void trazer(p); }}>
              {aTrazer === p.negocio ? <Loader2 className={cn("mr-1.5 h-4 w-4 animate-spin")} aria-hidden="true" /> : null}Trazer para a Olyvia
            </Button>
          </li>
        ))}
      </ul>
      {L.length > 8 && <p className="mt-2 text-sm text-muted-foreground">E mais {L.length - 8}.</p>}
      {erro && <p role="alert" className="mt-2 text-sm text-destructive">{erro}</p>}
    </section>
  );
}
