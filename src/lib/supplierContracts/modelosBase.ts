// Modelos base do Contrato de Fornecedor, criados pela UI (botão "Criar modelos
// base" no editor de modelos, via rpc_supplier_contract_template_save) — não há
// seed na BD. Só usam as variáveis de fn_sc_variaveis (o servidor recusa
// outras) e nenhum conteúdo ativo.
import type { SupplierContractKind } from "./tipos";

export interface BaseSupplierTemplate {
  name: string;
  kind: SupplierContractKind;
  description: string;
  body_html: string;
}

const PARTES = `<p><strong>Primeira contratante:</strong> {{empresa_nome}}, adiante designada por «Empresa».</p>
<p><strong>Segunda contratante:</strong> {{fornecedor_nome}}, NIF {{fornecedor_nif}}, com sede em {{fornecedor_morada}}, {{fornecedor_codigo_postal}} {{fornecedor_localidade}}, e-mail {{fornecedor_email}}, adiante designada por «Fornecedor».</p>`;

const VIGENCIA = `<h3>Vigência</h3>
<p>Estas condições vigoram de {{validade_inicio}} a {{validade_fim}} e aplicam-se a todas as encomendas emitidas pela Empresa ao Fornecedor nesse período. Qualquer alteração faz-se por nova versão deste contrato, assinada pelas duas partes.</p>`;

const ASSINATURA = `<h3>Aceitação</h3>
<p>O Fornecedor aceita estas condições ao assinar este documento no portal do fornecedor, com confirmação por código SMS; a Empresa contra-assina pelo mesmo meio. O documento assinado fica registado com a respetiva impressão digital (SHA-256).</p>
<p>Contrato {{numero_contrato}}, versão {{versao}}, enviado em {{data_envio}}.</p>`;

export const BASE_SUPPLIER_TEMPLATES: readonly BaseSupplierTemplate[] = [
  {
    name: "Fornecimento de material",
    kind: "material",
    description: "Condições comerciais gerais para fornecedores de material (modelo base).",
    body_html: `<h2>{{titulo}}</h2>
${PARTES}
<h3>Objeto</h3>
<p>O presente contrato define as condições comerciais aplicáveis ao fornecimento de material pelo Fornecedor à Empresa, mediante encomendas emitidas pela Empresa.</p>
<h3>Condições comerciais</h3>
{{tabela_condicoes}}
<h3>Pagamento</h3>
<p>As faturas são pagas a {{prazo_pagamento_dias}} dias da data da encomenda, por {{forma_pagamento}}.</p>
<h3>Entregas</h3>
<p>O Fornecedor entrega o material no prazo de {{prazo_entrega_dias}} dias após a confirmação da encomenda, no local indicado na encomenda. Portes: {{portes}}.</p>
<h3>Devoluções</h3>
<p>Devoluções aceites: {{devolucoes}}. Prazo: {{devolucoes_dias}} dias. {{devolucoes_condicoes}}</p>
<h3>Observações</h3>
<p>{{observacoes}}</p>
${VIGENCIA}
${ASSINATURA}`,
  },
  {
    name: "Subempreitada/Serviços",
    kind: "servico",
    description: "Condições comerciais para subempreiteiros e prestadores de serviços (modelo base).",
    body_html: `<h2>{{titulo}}</h2>
${PARTES}
<h3>Objeto</h3>
<p>O presente contrato define as condições comerciais aplicáveis aos serviços e trabalhos de subempreitada prestados pelo Fornecedor à Empresa, mediante encomendas emitidas pela Empresa para cada obra ou serviço.</p>
<h3>Condições comerciais</h3>
{{tabela_condicoes}}
<h3>Execução</h3>
<p>O Fornecedor inicia os trabalhos no prazo de {{prazo_entrega_dias}} dias após a confirmação da encomenda e executa-os de acordo com as boas regras da arte, a legislação aplicável e as indicações da Empresa em obra. Deslocações: {{portes}}.</p>
<h3>Pagamento</h3>
<p>Os serviços faturados são pagos a {{prazo_pagamento_dias}} dias da data da encomenda, por {{forma_pagamento}}, após confirmação da execução pela Empresa.</p>
<h3>Correções</h3>
<p>Correções de trabalhos não conformes aceites: {{devolucoes}}. Prazo: {{devolucoes_dias}} dias. {{devolucoes_condicoes}}</p>
<h3>Observações</h3>
<p>{{observacoes}}</p>
${VIGENCIA}
${ASSINATURA}`,
  },
];
