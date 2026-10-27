/**
 * O painel lateral (metade do ecrã) de um nó, com abas sublinhadas: «Pessoas» (vínculo legal no nó), «Trabalham aqui»
 * (nos centros) e «Dados». O botão «Ligar pessoa» também está aqui.
 */
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABA, LISTA_ABAS } from "@/components/ficha-comum/estilosAbas";
import { ChipTipo } from "@/components/rh-exemplo/organizacao/Chips";
import { DadosNo } from "@/components/rh-exemplo/organizacao/DadosNo";
import { ListaPessoasNo } from "@/components/rh-exemplo/organizacao/ListaPessoasNo";
import { ligacoesDoCentro, ligacoesDoVinculo } from "@/components/rh-exemplo/organizacao/arvore";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoOrganizacao, EstruturaOrg, NoOrg, PessoaOrg } from "@/components/rh-exemplo/organizacao/tipos";

interface PainelNoProps {
  est: EstruturaOrg;
  estado: EstadoOrganizacao;
  pessoas: ReadonlyMap<string, PessoaOrg>;
  no: NoOrg | null;
  aoFechar: () => void;
  aoLigar: () => void;
  aoAlterar: (pessoaId: string) => void;
  aoDesligar: (pessoaId: string) => void;
  /** `hr.pessoas.colocacao.edit`: sem ela não há Ligar, Alterar nem Desligar. Omitido: aparecem. */
  podeAlterar?: boolean;
}

export function PainelNo({ est, estado, pessoas, no, aoFechar, aoLigar, aoAlterar, aoDesligar, podeAlterar = true }: PainelNoProps) {
  const { t } = useTranslation();
  const ehCentro = no?.tipo === "centro";
  const n = no ? (no.locais ?? no.legais) : 0;
  const comuns = { est, pessoas, aoAlterar, aoDesligar, podeAlterar };
  return (
    <Sheet open={no !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:w-1/2 sm:max-w-none">
        {no && (
          <>
            <SheetHeader className="pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{no.nome}</SheetTitle>
                <ChipTipo tipo={no.tipo} />
              </div>
              <SheetDescription>{t("rhOrg.painel.desc", { tipo: t(`rhOrg.tipo.${no.tipo}`), n })}</SheetDescription>
              {podeAlterar && (
                <div>
                  <Button type="button" size="sm" className="min-h-11 gap-1.5" onClick={aoLigar}>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {t("rhOrg.ligarPessoa")}
                  </Button>
                </div>
              )}
            </SheetHeader>
            <Tabs key={no.id} defaultValue={ehCentro ? "trabalham" : "pessoas"} className="mt-4">
              <TabsList className={LISTA_ABAS}>
                {!ehCentro && <TabsTrigger value="pessoas" className={ABA}>{t("rhOrg.aba.pessoas")}</TabsTrigger>}
                {ehCentro && <TabsTrigger value="trabalham" className={ABA}>{t("rhOrg.aba.trabalham")}</TabsTrigger>}
                <TabsTrigger value="dados" className={ABA}>{t("rhOrg.aba.dados")}</TabsTrigger>
              </TabsList>
              {!ehCentro && (
                <TabsContent value="pessoas">
                  <ListaPessoasNo {...comuns} modo="legal" vazio={t("rhOrg.nenhumaPessoa")} ligacoes={ligacoesDoVinculo(est, no.id, estado.ligacoes)} />
                </TabsContent>
              )}
              {ehCentro && (
                <TabsContent value="trabalham">
                  <ListaPessoasNo {...comuns} modo="local" vazio={t("rhOrg.ninguemAqui")} ligacoes={ligacoesDoCentro(no.id, estado.ligacoes)} />
                </TabsContent>
              )}
              <TabsContent value="dados"><DadosNo est={est} no={no} /></TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
