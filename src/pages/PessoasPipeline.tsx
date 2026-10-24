import { PipelineReal } from "@/components/pessoas-lista/PipelineReal";

/**
 * /pipeline: o quadro das Pessoas (por contactar, contactado, visita e, depois, as colunas do negócio). A rota passa por
 * PessoasRota, que só deixa chegar aqui as organizações com o interruptor ligado e dá a fonte real; por isso não há modo exemplo.
 */
const PessoasPipeline = () => <PipelineReal />;

export default PessoasPipeline;
