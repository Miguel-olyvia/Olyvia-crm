// 9/11 (Rúben: «ligar ao Estúdio o catálogo de serviços, com os materiais, os consumíveis e os técnicos»). O Estado que o Estúdio usa
// para os serviços verdadeiros e o plano da obra: o que os Negócios deixaram (estadoVivo.ts) ou, aberto sozinho com sessão, o Catálogo
// da organização lido aqui. A agenda do RH (as férias) lê-se sempre: os Negócios limpam-na ao sair. Sem sessão (o protótipo), null: o
// Estúdio continua com o catálogo de teste.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { seed, type Estado } from "@/emylia/motor";
import { definirEstadoVivo, useEstadoVivo } from "@/emylia/estadoVivo";
import { carregarCatalogo } from "@/emylia/real/carregarCatalogo";
import { aplicarAgenda, carregarAgendaReal } from "@/emylia/real/agendaReal";

export interface CatalogoDoEstudio { S: Estado | null; aLer: boolean; erro: string | null }

export function useCatalogoDoEstudio(): CatalogoDoEstudio {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const vivo = useEstadoVivo();
  const S = vivo && vivo.org === org ? vivo.S : null;
  const [aLer, setALer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let ativo = true;
    (async () => {
      setALer(true); setErro(null);
      try {
        if (!S) {
          const novo = seed(); novo.deals = []; novo.clientes = []; novo.deal = null;
          await carregarCatalogo(supabase, org, novo);
          if (!ativo) return;
          definirEstadoVivo(novo, org);
        }
        const ag = await carregarAgendaReal(supabase, org);
        if (ativo && ag.erro) setErro(`As férias do RH não carregaram: ${ag.erro}`);
      } catch (e) {
        if (ativo) setErro((e as Error).message || "O Catálogo não carregou.");
      } finally {
        if (ativo) setALer(false);
      }
    })();
    return () => { ativo = false; aplicarAgenda([]); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por organização (o S vivo só se lê ao entrar)
  }, [org]);

  return { S, aLer, erro };
}
