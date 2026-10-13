// Área de custos (/custos): parâmetros, perfis, equipamentos, estrutura,
// margens por linha de serviço e aprovações da Direção.
// SQL: supabase/migrations/20261214110000_area_custos.sql. Contas: src/lib/custos.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAprovacoes } from "@/hooks/custos/useCustos";
import { SeccaoParametros } from "@/components/custos/SeccaoParametros";
import { SeccaoPerfis } from "@/components/custos/SeccaoPerfis";
import { SeccaoEquipamentos } from "@/components/custos/SeccaoEquipamentos";
import { SeccaoEstrutura } from "@/components/custos/SeccaoEstrutura";
import { SeccaoMargens } from "@/components/custos/SeccaoMargens";
import { SeccaoAprovacoes } from "@/components/custos/SeccaoAprovacoes";

const ANCORAS = [
  { id: "parametros", nome: "Parâmetros" },
  { id: "perfis", nome: "Perfis" },
  { id: "equipamentos", nome: "Equipamentos" },
  { id: "estrutura", nome: "Estrutura" },
  { id: "margens", nome: "Margens por linha" },
  { id: "aprovacoes", nome: "Aprovações" },
];

export default function Custos() {
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const org = activeCompany?.id;
  const podeEditar = hasPermission("costs.edit");
  const podeAprovar = hasPermission("margins.approve");
  const podeVerSalario = hasPermission("costs.salaries.view");
  const pendentes = useAprovacoes(org, "pendente");
  const nPendentes = pendentes.data?.length ?? 0;

  // Quem chega pelo sino (/custos#aprovacoes) vai direto à secção, depois de carregar.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || !org) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 300);
    return () => window.clearTimeout(t);
  }, [hash, org, pendentes.isSuccess]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Custos</h1>
        <p className="text-muted-foreground">
          Quanto custa cada hora e cada serviço, e a margem mínima de cada linha.
          {activeCompany && <> · {activeCompany.name}</>}
        </p>
      </div>

      <nav aria-label="Secções" className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-background/95 py-2 backdrop-blur">
        {ANCORAS.map((a) => (
          <a key={a.id} href={`#${a.id}`}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            {a.nome}
            {a.id === "aprovacoes" && nPendentes > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white tabular-nums">{nPendentes}</span>
            )}
          </a>
        ))}
      </nav>

      {!org ? (
        <p className="text-muted-foreground">Escolha uma empresa para ver os custos.</p>
      ) : (
        <div className="space-y-6">
          <SeccaoParametros org={org} podeEditar={podeEditar} podeAprovar={podeAprovar} />
          <SeccaoPerfis org={org} podeEditar={podeEditar} podeVerSalario={podeVerSalario} />
          <SeccaoEquipamentos org={org} podeEditar={podeEditar} />
          <SeccaoEstrutura org={org} podeEditar={podeEditar} />
          <SeccaoMargens org={org} podeAprovar={podeAprovar} />
          <SeccaoAprovacoes org={org} podeAprovar={podeAprovar} />
        </div>
      )}
    </div>
  );
}
