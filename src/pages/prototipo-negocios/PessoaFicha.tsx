// A ficha de uma pessoa, dentro do painel lateral: o cabeçalho (três faixas) e os separadores Resumo, Negócios, Entradas, Atividade
// e, nos clientes, Contratos e documentos. O cabeçalho e os separadores ficam fixos; o conteúdo do separador rola.
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { proximoNegocio, type PessoaApp } from "./pessoasDocs";
import { perfilDe, type ItemAtividade, type Perfil } from "./perfilDocs";
import { FichaCabecalho } from "./FichaCabecalho";
import { FichaResumo } from "./FichaResumo";
import { SepAtividade, SepDocumentos, SepEntradas } from "./FichaListas";
import { SepNegocios } from "./SepNegocios";
import { fazer, type Ctx } from "./pecas";

export type SepFicha = "resumo" | "negocios" | "entradas" | "atividade" | "contratos";
const SEP_BASE: { id: SepFicha; nome: string }[] = [
  { id: "resumo", nome: "Resumo" }, { id: "negocios", nome: "Negócios" }, { id: "entradas", nome: "Entradas" }, { id: "atividade", nome: "Atividade" },
];
/** Os clientes têm cinco separadores (mais os contratos e documentos); as leads, quatro. */
export const separadoresDe = (papel: PessoaApp["papel"]): { id: SepFicha; nome: string }[] =>
  papel === "cliente" ? [...SEP_BASE, { id: "contratos", nome: "Contratos e documentos" }] : SEP_BASE;

/** Peças opcionais da V2 funcional. Sem elas (a V2), a ficha fica como sempre. */
export interface FichaExtras {
  /** O perfil com os registos do dia a dia aplicados (o cabeçalho e o Resumo usam-no; a Atividade usa o original mais `registados`). */
  ajustarPerfil?: (f: Perfil) => Perfil;
  /** As linhas registadas agora, no topo da Atividade. */
  registados?: ItemAtividade[];
  /** A barra de ações no lugar de Ligar, WhatsApp e Email. */
  acoes?: (f: Perfil) => ReactNode;
  /** O bloco Contacto do Resumo. */
  contacto?: (f: Perfil) => ReactNode;
}

export interface FichaProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PessoaApp;
  /** Fecha o painel (depois de marcar a lead como perdida). */
  fechar: () => void;
  sep: SepFicha;
  aoMudarSep: (s: SepFicha) => void;
  /** As setas Anterior e Seguinte, a posição e Fechar: ficam na primeira faixa do cabeçalho. */
  topo: ReactNode;
  extras?: FichaExtras;
}

export function PessoaFicha({ S, A, go, p, fechar, sep, aoMudarSep, topo, extras }: FichaProps) {
  const original = perfilDe(p, S), f = extras?.ajustarPerfil ? extras.ajustarPerfil(original) : original, d = p.principal, nx = proximoNegocio(d, S);
  const separadores = separadoresDe(p.papel), ativo = separadores.some((s) => s.id === sep) ? sep : "resumo";
  // Os negócios de exemplo não existem no Estado e não abrem nada (as listas mostram-nos como texto). O botão de uma pessoa de exemplo leva ao separador Negócios,
  // onde já vem escolhido o mais avançado; nas pessoas da seed continua a correr a ação do motor ou a abrir o negócio.
  const abrir = (id: number) => go(() => A.abrir(id));
  const aoProximo = p.exemplo ? () => aoMudarSep("negocios") : go(() => (nx.act ? fazer(A, nx.act, d.id, nx.arg) : A.abrir(d.id)));
  return (
    <Tabs value={ativo} onValueChange={(v) => aoMudarSep(v as SepFicha)} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="max-h-[60dvh] shrink-0 overflow-y-auto border-b border-border px-4 pb-3 pt-4 sm:px-6">
        <FichaCabecalho p={p} f={f} nx={nx} topo={topo} aoProximo={aoProximo} acoes={extras?.acoes?.(f)} />
        <TabsList className="mt-3 h-auto w-full flex-wrap justify-start gap-1 p-1" aria-label={p.papel === "cliente" ? "Ficha do cliente" : "Ficha da lead"}>
          {separadores.map(({ id, nome }) => (
            <TabsTrigger key={id} value={id} className="min-h-11 cursor-pointer px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background">{nome}</TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6">
        <TabsContent value="resumo" className="mt-0"><FichaResumo S={S} A={A} go={go} p={p} f={f} voltar={fechar} contacto={extras?.contacto?.(f)} /></TabsContent>
        <TabsContent value="negocios" className="mt-0"><SepNegocios S={S} p={p} abrir={abrir} /></TabsContent>
        <TabsContent value="entradas" className="mt-0"><SepEntradas S={S} p={p} /></TabsContent>
        <TabsContent value="atividade" className="mt-0"><SepAtividade S={S} p={p} f={original} registados={extras?.registados} /></TabsContent>
        {p.papel === "cliente" && <TabsContent value="contratos" className="mt-0"><SepDocumentos S={S} p={p} abrir={abrir} /></TabsContent>}
      </div>
    </Tabs>
  );
}
