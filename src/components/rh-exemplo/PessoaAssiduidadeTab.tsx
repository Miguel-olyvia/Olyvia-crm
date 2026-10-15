/**
 * A assiduidade de uma pessoa, em abas sublinhadas: Picar (só a própria pessoa), Calendário, Horas extra, Banco de horas
 * (só para quem tem horário do tipo banco) e Justificações (só a própria pessoa). É o MESMO componente na ficha de RH e em
 * «O meu ponto»: sao a mesma coisa vista de dois sitios, e duas copias divergiriam ao segundo ajuste.
 *
 * PORQUE E QUE ESTE SEPARADOR CARREGA E OS OUTROS NAO
 * ---------------------------------------------------
 * Os separadores da ficha recebem tudo de `usePessoa`, que carrega a ficha inteira de uma vez. A assiduidade nao cabe la:
 * depende de uma JANELA DE DATAS que muda enquanto se navega, e trazer todas as picagens de sempre com a ficha seria
 * carregar milhares de linhas para mostrar trinta. Por isso este separador tem hook proprio, `useAssiduidadeDaPessoa`, e
 * recarrega quando o mes muda. O mes visivel, o dia aberto e o relatorio vivem aqui (e nao em cada aba) para nao se
 * perderem ao trocar de aba.
 *
 * A aba aberta: quem chama pode controla-la (`aba` + `aoMudarAba`, como «O meu ponto», que a guarda no endereco); sem isso
 * o componente guarda-a sozinho (na ficha).
 */
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useMemo, useState } from "react";
import { CartaoBancoHoras } from "@/components/rh-exemplo/fluxosC/CartaoBancoHoras";
import { HorasExtraDaPessoa } from "@/components/rh-exemplo/fluxosC/HorasExtraDaPessoa";
import { useEmBancoDeHoras } from "@/components/rh-exemplo/fluxosC/useEmBancoDeHoras";
import { Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useTranslation } from "@/hooks/useTranslation";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { JustificarFalhaDeMarcacao } from "@/components/rh-exemplo/fluxosB/alertas/JustificarFalhaDeMarcacao";
import { PainelDoDia } from "@/components/rh-exemplo/assiduidade/PainelDoDia";
import type { MesVisivel } from "@/components/rh-exemplo/calendarioPessoa/CalendarioPessoa";
import { PessoaRelatorioAssiduidadeMensal } from "@/components/rh-exemplo/PessoaRelatorioAssiduidadeMensal";
import { AbaCalendario } from "@/components/rh-exemplo/assiduidadeAbas/AbaCalendario";
import { AbaPicar } from "@/components/rh-exemplo/assiduidadeAbas/AbaPicar";
import { abaAberta, abasVisiveis } from "@/components/rh-exemplo/assiduidadeAbas/abas";
import { ListaAbasAssiduidade } from "@/components/rh-exemplo/assiduidadeAbas/ListaAbasAssiduidade";
import { useContadoresAssiduidade } from "@/components/rh-exemplo/assiduidadeAbas/useContadoresAssiduidade";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

interface PessoaAssiduidadeTabProps {
  pessoaId: string;
  pessoaNome: string;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
  /** Cabecalho do relatorio mensal. Omissos quando o chamador nao os tem a mao. */
  cargo?: string | null;
  dataAdmissao?: string | null;
  /** A aba aberta, quando quem chama a controla (por exemplo no endereco). Sem isto o componente guarda-a sozinho. */
  aba?: string | null;
  aoMudarAba?: (aba: string) => void;
}

/** O primeiro e o ultimo dia de um mes (1 a 12), em ISO, sem passar por UTC. */
function limitesDoMes(ano: number, mes: number): { de: string; ate: string } {
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return { de: `${ano}-${doisDigitos(mes)}-01`, ate: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDia)}` };
}

/** O mes visivel (que e tambem a janela de datas a carregar). */
function useMesVisivel() {
  const [mesVisivel, setMesVisivel] = useState<MesVisivel>(() => {
    const agora = agoraExemplo();
    return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
  });
  const janela = useMemo(() => limitesDoMes(mesVisivel.ano, mesVisivel.mes), [mesVisivel.ano, mesVisivel.mes]);
  return { mesVisivel, setMesVisivel, janela };
}

interface CorpoProps {
  pessoaId: string;
  pessoaNome: string;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
  assiduidade: ReturnType<typeof useAssiduidadeDaPessoa>;
  locais: ReturnType<typeof useLocaisTrabalho>["locais"];
  mes: ReturnType<typeof useMesVisivel>;
  aba: string | null;
  aoMudarAba?: (aba: string) => void;
  aoAbrirRegisto: (data: string) => void;
  aoAbrirRelatorio: () => void;
}

/** As abas e o conteudo de cada uma. A aba aberta e a pedida por quem chama, ou a que a pessoa escolheu aqui. */
function CorpoAbas(p: CorpoProps) {
  const [abaLocal, setAbaLocal] = useState<string | null>(null);
  const temBanco = useEmBancoDeHoras(p.pessoaId);
  const contadores = useContadoresAssiduidade(p.pessoaId);
  const visiveis = abasVisiveis({ souAPessoa: p.souAPessoa, podePicar: p.permissoes.picar, temBanco });
  const mudar = (nova: string) => {
    setAbaLocal(nova);
    p.aoMudarAba?.(nova);
  };
  return (
    <Tabs value={abaAberta(p.aba ?? abaLocal, visiveis)} onValueChange={mudar} className="space-y-4">
      <ListaAbasAssiduidade visiveis={visiveis} contadores={contadores} />
      <TabsContent value="picar" className="mt-0">
        <AbaPicar assiduidade={p.assiduidade} locais={p.locais} podePicar={p.permissoes.picar} />
      </TabsContent>
      <TabsContent value="calendario" className="mt-0">
        <AbaCalendario
          pessoaId={p.pessoaId} pessoaNome={p.pessoaNome} mes={p.mes.mesVisivel} aoMudarMes={p.mes.setMesVisivel}
          souAPessoa={p.souAPessoa} permissoes={p.permissoes} aoAbrirRegisto={p.aoAbrirRegisto} aoAbrirRelatorio={p.aoAbrirRelatorio}
        />
      </TabsContent>
      <TabsContent value="horas-extra" className="mt-0" data-testid="rhd-he-ficha">
        <HorasExtraDaPessoa pessoaId={p.pessoaId} />
      </TabsContent>
      <TabsContent value="banco-horas" className="mt-0">
        <AbaBanco pessoaId={p.pessoaId} podeAjustar={!p.souAPessoa && p.permissoes.gerir} />
      </TabsContent>
      <TabsContent value="justificacoes" className="mt-0">
        <JustificarFalhaDeMarcacao pessoaId={p.pessoaId} />
      </TabsContent>
    </Tabs>
  );
}

export function PessoaAssiduidadeTab({
  pessoaId, pessoaNome, souAPessoa, permissoes, cargo = null, dataAdmissao = null, aba = null, aoMudarAba,
}: PessoaAssiduidadeTabProps) {
  const mes = useMesVisivel();
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const assiduidade = useAssiduidadeDaPessoa(pessoaId, mes.janela);
  // So para mostrar o nome de cada picagem -- nunca um selector aqui -- por isso inclui os desactivados.
  const { locais } = useLocaisTrabalho({ apenasAtivos: false });
  const podeVer = permissoes.view || permissoes.equipaView || (souAPessoa && permissoes.viewOwn);

  if (!podeVer) return <SemAcessoCard />;
  if (assiduidade.loading) return <OlyviaLoader />;

  return (
    <div className="space-y-4">
      <CorpoAbas
        pessoaId={pessoaId} pessoaNome={pessoaNome} souAPessoa={souAPessoa} permissoes={permissoes} assiduidade={assiduidade}
        locais={locais} mes={mes} aba={aba} aoMudarAba={aoMudarAba} aoAbrirRegisto={setDiaAberto}
        aoAbrirRelatorio={() => setRelatorioAberto(true)}
      />
      {diaAberto && (
        <PainelDoDia
          aberto data={diaAberto} pessoaNome={pessoaNome} souAPessoa={souAPessoa} assiduidade={assiduidade} locais={locais}
          permissoes={permissoes} onFechar={() => setDiaAberto(null)}
        />
      )}
      <PessoaRelatorioAssiduidadeMensal
        aberto={relatorioAberto} onFechar={() => setRelatorioAberto(false)} pessoaId={pessoaId} pessoaNome={pessoaNome}
        cargo={cargo} dataAdmissao={dataAdmissao} permissoes={permissoes}
      />
    </div>
  );
}

/** O banco de horas da pessoa: so existe a aba (e portanto este conteudo) quando o horario em vigor e do tipo banco. */
function AbaBanco({ pessoaId, podeAjustar }: { pessoaId: string; podeAjustar: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-testid="rhd-banco-ficha">
      <p className="text-sm text-muted-foreground">{t("rhFluxosD.banco.sobreTipo")}</p>
      <CartaoBancoHoras pessoaId={pessoaId} podeAjustar={podeAjustar} />
    </div>
  );
}
