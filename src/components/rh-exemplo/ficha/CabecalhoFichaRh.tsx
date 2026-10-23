// O cabeçalho da ficha de RH, no padrão da ficha de Pessoas: avatar (fotografia ou iniciais), nome, a linha "Filial · Cargo",
// os estados (acesso e contrato, sempre em texto), a navegação "n de N" e Fechar, e por baixo as ações.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { iniciaisDoNome } from "@/components/rh-exemplo/lib/anexosAdmissao";
import type { EstadoContratoDerivado } from "@/components/rh-exemplo/lib/estadoContrato";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { BotoesNavegacao } from "./BotoesNavegacao";
import type { TeclaNavegacao, Vizinhas } from "./navegacao";

interface CabecalhoFichaRhProps {
  pessoa: Pessoa;
  /** "Filial · Cargo", já montado. */
  subtitulo: string;
  fotografiaUrl: string | null | undefined;
  temConta: boolean;
  /** `null` quando quem olha não pode ver vínculos (não se inventa "Sem contrato"). */
  estadoContrato: EstadoContratoDerivado | null;
  vizinhas: Vizinhas;
  aoIr: (id: string, qual: TeclaNavegacao) => void;
}

export function CabecalhoFichaRh({ pessoa, subtitulo, fotografiaUrl, temConta, estadoContrato, vizinhas, aoIr }: CabecalhoFichaRhProps) {
  const { t } = useTranslation();
  return (
    <SheetHeader className="flex-row flex-wrap items-start gap-x-3 gap-y-2 space-y-0 p-6 pb-3 text-left">
      <Avatar className="h-12 w-12">
        {/* Decorativa: o nome está no título logo a seguir. */}
        {fotografiaUrl && <AvatarImage src={fotografiaUrl} alt="" />}
        <AvatarFallback aria-hidden="true">{iniciaisDoNome(pessoa.nome_completo)}</AvatarFallback>
      </Avatar>
      <div className="min-w-40 flex-1 space-y-1.5">
        <SheetTitle asChild className="text-xl">
          <h1 tabIndex={-1} data-titulo-ficha className="outline-none">{pessoa.nome_completo}</h1>
        </SheetTitle>
        <SheetDescription className="text-[15px]">{subtitulo}</SheetDescription>
        <div className="flex flex-wrap items-center gap-1.5">
          <SeloExemplo />
          <Badge variant={temConta ? "default" : "outline"} className="font-normal">
            {t(temConta ? "hr.estadoAcesso.ativo" : "hr.estadoAcesso.semConta")}
          </Badge>
          {estadoContrato && (
            <Badge variant={estadoContrato === "em_curso" ? "secondary" : "outline"} className="font-normal">
              {t(`hr.estadoContrato.${estadoContrato}`)}
            </Badge>
          )}
          {pessoa.estado_registo === "arquivado" && (
            <Badge variant="outline" className="font-normal">{t("hr.estadoRegisto.arquivado")}</Badge>
          )}
        </div>
      </div>
      <BotoesNavegacao vizinhas={vizinhas} aoIr={aoIr} />
    </SheetHeader>
  );
}
