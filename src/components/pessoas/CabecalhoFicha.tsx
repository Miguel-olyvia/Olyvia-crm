import { useTranslation } from "@/hooks/useTranslation";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AvatarPessoa } from "./AvatarPessoa";
import { textoLinhaCabecalho } from "./formatoPessoas";
import { BotoesNavegacao } from "./BotoesNavegacao";
import type { TeclaNavegacao, Vizinhas } from "./navegacaoFicha";
import type { ResumoPessoa } from "./pessoasTipos";
import { SeloEmpresa, SeloEncerrada, SeloPerdida } from "./SelosPessoa";

interface CabecalhoFichaProps {
  resumo: ResumoPessoa;
  vizinhas: Vizinhas;
  aoIr: (id: string, qual: TeclaNavegacao) => void;
}

/** O cabeçalho da ficha: avatar, nome, a linha "Lead · etapa · localidade", os selos "Empresa" e "Perdida" e a navegação. */
export function CabecalhoFicha({ resumo, vizinhas, aoIr }: CabecalhoFichaProps) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  return (
    <SheetHeader className="flex-row flex-wrap items-start gap-x-3 gap-y-2 space-y-0 p-6 pb-4 text-left">
      <AvatarPessoa nome={pessoa.nome} />
      <div className="min-w-40 flex-1 space-y-1.5">
        <SheetTitle tabIndex={-1} data-ficha-nome className="text-xl outline-none">{pessoa.nome}</SheetTitle>
        <SheetDescription className="text-[15px]">{textoLinhaCabecalho(t, resumo)}</SheetDescription>
        {(pessoa.empresa || pessoa.perdida || pessoa.encerrada) && (
          <div className="flex flex-wrap gap-1.5">
            {pessoa.empresa && <SeloEmpresa />}
            {pessoa.perdida && <SeloPerdida />}
            {pessoa.encerrada && <SeloEncerrada />}
          </div>
        )}
      </div>
      <BotoesNavegacao vizinhas={vizinhas} aoIr={aoIr} />
    </SheetHeader>
  );
}
