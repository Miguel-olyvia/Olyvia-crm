// A moldura própria do Portal do colaborador, fora do layout do CRM e sem login (acesso temporário): cabeçalho com a
// organização, «Portal do colaborador», o nome da pessoa, o selo do prazo e «Sair»; à esquerda a navegação (em ecrã estreito
// passa a barra em baixo) e à direita o conteúdo da secção. Só desenho: o estado vem de fora.
import type { ReactNode } from "react";
import { AlertTriangle, Clock3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataEHora } from "@/components/rh-exemplo/admissao/auxiliares";
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { prazoDoLogin, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { prazoEmAviso } from "@/components/rh-exemplo/lib/portalEstado";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { restaDoAcesso } from "./textosPortal";

export function PortalSelo({ admissao }: { admissao: Admissao }) {
  const { t } = useTranslation();
  const agora = agoraExemplo();
  const termina = dataEHora(admissao.login.expiraEm);
  const prazo = prazoDoLogin(admissao, agora);
  const aviso = prazoEmAviso(admissao, agora);
  const resta = restaDoAcesso(t, prazo);
  const Icone = aviso ? AlertTriangle : Clock3;
  return (
    <p
      data-testid="portal-selo" data-aviso={aviso ? "sim" : "nao"}
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 rounded-full border px-3 py-1 text-xs",
        aviso ? "border-amber-500/70 bg-amber-500/10 font-medium text-amber-900 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t("rhPortal.selo.texto", { data: termina.data, hora: termina.hora, resta })}</span>
      {aviso && <span>· {t("rhPortal.selo.aviso")}</span>}
    </p>
  );
}

function Cabecalho({ nome, selo, aoSair }: { nome: string | null; selo?: ReactNode; aoSair?: () => void }) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{activeCompany.name}</p>
          <p className="text-xs text-muted-foreground">{t("rhPortal.titulo")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nome && (
            <p className="text-sm font-medium">
              <span className="sr-only">{t("rhPortal.pessoa")}: </span>
              {nome}
            </p>
          )}
          {selo}
          {aoSair && (
            <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={aoSair}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t("rhPortal.sair")}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

interface PortalMolduraProps {
  nome: string | null;
  admissao: Admissao;
  navegacao: ReactNode;
  aoSair: () => void;
  children: ReactNode;
}

export function PortalMoldura({ nome, admissao, navegacao, aoSair, children }: PortalMolduraProps) {
  return (
    <div className="min-h-screen bg-muted/30 text-foreground" data-testid="portal-colaborador">
      <Cabecalho nome={nome} selo={<PortalSelo admissao={admissao} />} aoSair={aoSair} />
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row md:items-start">
        {navegacao}
        <main id="portal-conteudo" className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>
    </div>
  );
}

/** A moldura sem navegação nem sessão: para o acesso terminado, o link inválido e a saída. */
export function PortalMolduraSimples({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 text-foreground" data-testid="portal-colaborador-simples">
      <Cabecalho nome={null} />
      <main className="mx-auto flex max-w-xl justify-center px-4 py-10">{children}</main>
    </div>
  );
}
