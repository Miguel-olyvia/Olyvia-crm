// A ficha de uma pessoa, dentro do painel lateral: o cabeçalho (três faixas) e os separadores Resumo, Negócios, Entradas, Atividade
// e, nos clientes, Contratos e documentos. O cabeçalho e os separadores ficam fixos; o conteúdo do separador rola.
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { proximoDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { perfilDe } from "./perfilDocs";
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

export interface FichaProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PessoaApp;
  /** Fecha o painel (depois de marcar a lead como perdida). */
  fechar: () => void;
  sep: SepFicha;
  aoMudarSep: (s: SepFicha) => void;
  /** As setas Anterior e Seguinte, a posição e Fechar: ficam na primeira faixa do cabeçalho. */
  topo: ReactNode;
}

export function PessoaFicha({ S, A, go, p, fechar, sep, aoMudarSep, topo }: FichaProps) {
  const f = perfilDe(p, S), d = p.principal, nx = proximoDe(p, S);
  const separadores = separadoresDe(p.papel), ativo = separadores.some((s) => s.id === sep) ? sep : "resumo";
  const abrir = (id: number) => go(() => A.abrir(id));
  return (
    <Tabs value={ativo} onValueChange={(v) => aoMudarSep(v as SepFicha)} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="max-h-[60dvh] shrink-0 overflow-y-auto border-b border-border px-4 pb-3 pt-4 sm:px-6">
        <FichaCabecalho p={p} f={f} nx={nx} topo={topo} aoProximo={go(() => (nx.act ? fazer(A, nx.act, d.id) : A.abrir(d.id)))} />
        <TabsList className="mt-3 h-auto w-full flex-wrap justify-start gap-1 p-1" aria-label={p.papel === "cliente" ? "Ficha do cliente" : "Ficha da lead"}>
          {separadores.map(({ id, nome }) => (
            <TabsTrigger key={id} value={id} className="min-h-11 cursor-pointer px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background">{nome}</TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6">
        <TabsContent value="resumo" className="mt-0"><FichaResumo S={S} A={A} go={go} p={p} f={f} voltar={fechar} /></TabsContent>
        <TabsContent value="negocios" className="mt-0"><SepNegocios S={S} p={p} abrir={abrir} /></TabsContent>
        <TabsContent value="entradas" className="mt-0"><SepEntradas S={S} p={p} /></TabsContent>
        <TabsContent value="atividade" className="mt-0"><SepAtividade S={S} p={p} f={f} /></TabsContent>
        {p.papel === "cliente" && <TabsContent value="contratos" className="mt-0"><SepDocumentos S={S} p={p} abrir={abrir} /></TabsContent>}
      </div>
    </Tabs>
  );
}
