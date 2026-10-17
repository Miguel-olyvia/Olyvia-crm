// A aba "Resumo" da ficha, em secções por esta ordem: as visitas de cada pedido que as tem (uma secção por pedido), próximo passo e
// prazo, avisos, contacto, origem e sobre a pessoa.
// A marca "exemplo" vai por secção.
import { ContactoFicha } from "./ContactoFicha";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import { SeccaoOrigem } from "./SeccaoOrigem";
import { SeccaoAvisos, SeccaoPasso, SeccaoSobre } from "./SeccoesResumo";
import { SeccaoPedidoVisita } from "./SeccaoVisita";

interface ResumoFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
  alterarVisita: AcoesFicha["alterarVisita"];
}

export function ResumoFicha(p: ResumoFichaProps) {
  const { resumo } = p;
  const extras = useExtrasProcesso();
  // Uma perdida não tem visitas à vista; os outros mostram uma secção por pedido com visitas (as canceladas não contam).
  const comVisitas = resumo.pessoa.perdida ? [] : resumo.pedidos.filter((d) => d.visitas.some((v) => v.estado !== "cancelada"));
  const itens = itensDaPessoa(resumo, p.hoje, extras);
  return (
    <div className="space-y-4 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-4">
      {comVisitas.map((pedido) => (
        <SeccaoPedidoVisita
          key={pedido.id} pessoa={resumo.pessoa} pedido={pedido} pedidos={resumo.pedidos} item={itens.find((i) => i.pedidoId === pedido.id)} hoje={p.hoje}
          alterarVisita={p.alterarVisita}
        />
      ))}
      <SeccaoPasso resumo={resumo} hoje={p.hoje} comVisita={comVisitas.length > 0} />
      <SeccaoAvisos
        resumo={resumo} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={p.pendentes}
        aoVerSubmissoes={p.aoVerSubmissoes}
      />
      <ContactoFicha pessoa={resumo.pessoa} />
      <SeccaoOrigem pessoa={resumo.pessoa} />
      <SeccaoSobre resumo={resumo} hoje={p.hoje} />
    </div>
  );
}
