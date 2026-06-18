// Pre-written contract base templates for quick start

export interface BaseTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  clauseCount: number;
  html: string;
}

export const BASE_TEMPLATES: BaseTemplate[] = [
  {
    id: "prestacao-servicos",
    name: "Prestação de Serviços",
    description: "Partes, objecto, valor, duração, garantias, rescisão, foro",
    icon: "📄",
    clauseCount: 7,
    html: `<h2 style="text-align:center;"><strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</strong></h2>
<p style="text-align:center;">N.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_numero}}</span></p>
<br/>
<p><strong>PRIMEIRA — Partes Contratantes</strong></p>
<p>Entre <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_nome}}</span>, com sede em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_morada}}</span>, contribuinte fiscal n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_nif}}</span>, adiante designada por <strong>PRIMEIRA CONTRATANTE</strong>, e <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_nome}}</span>, com morada em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_morada}}</span>, contribuinte fiscal n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_nif}}</span>, adiante designado por <strong>SEGUNDO CONTRATANTE</strong>, é celebrado o presente contrato que se rege pelas seguintes cláusulas:</p>
<br/>
<p><strong>SEGUNDA — Objecto do Contrato</strong></p>
<p>O presente contrato tem por objecto a prestação de serviços de remodelação e/ou construção, conforme descrito na proposta n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{proposta_numero}}</span> e orçamento aceite pelo SEGUNDO CONTRATANTE, documentos que fazem parte integrante do presente contrato.</p>
<br/>
<p><strong>TERCEIRA — Preço e Condições de Pagamento</strong></p>
<p>1. O preço total acordado para os serviços é de <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_valor}}</span> ( <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_valor_extenso}}</span> ), com IVA incluído à taxa legal em vigor.</p>
<p>2. O pagamento será efectuado da seguinte forma:</p>
<p>&nbsp;&nbsp;&nbsp;a) 50% do valor total no início dos trabalhos;</p>
<p>&nbsp;&nbsp;&nbsp;b) 50% do valor restante na conclusão e entrega dos trabalhos.</p>
<br/>
<p><strong>QUARTA — Prazo e Duração</strong></p>
<p>O presente contrato tem início em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_data_inicio}}</span> e termo previsto em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_data_fim}}</span>, com duração total de <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_duracao}}</span>.</p>
<br/>
<p><strong>QUINTA — Obrigações da Primeira Contratante</strong></p>
<p>1. Executar os trabalhos com qualidade profissional e materiais adequados.</p>
<p>2. Cumprir os prazos acordados, salvo motivos de força maior.</p>
<p>3. Garantir a segurança no local de trabalho.</p>
<br/>
<p><strong>SEXTA — Garantias</strong></p>
<p>A PRIMEIRA CONTRATANTE garante a qualidade dos serviços prestados por um período de 5 (cinco) anos sobre mão de obra e pela garantia do fabricante sobre materiais utilizados.</p>
<br/>
<p><strong>SÉTIMA — Rescisão e Foro</strong></p>
<p>1. O presente contrato pode ser rescindido por qualquer das partes mediante comunicação escrita com antecedência mínima de 30 dias.</p>
<p>2. Para resolução de qualquer litígio emergente do presente contrato, é competente o foro da comarca de Lisboa, com renúncia a qualquer outro.</p>
<br/>
<p style="text-align:center;"><span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_morada}}</span>, <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{data_atual}}</span></p>
<br/>
<p>A PRIMEIRA CONTRATANTE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;O SEGUNDO CONTRATANTE</p>`,
  },
  {
    id: "manutencao",
    name: "Manutenção",
    description: "Serviços incluídos, periodicidade, valor mensal, renovação",
    icon: "🔧",
    clauseCount: 8,
    html: `<h2 style="text-align:center;"><strong>CONTRATO DE MANUTENÇÃO</strong></h2>
<p style="text-align:center;">N.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_numero}}</span></p>
<br/>
<p><strong>PRIMEIRA — Partes Contratantes</strong></p>
<p>Entre <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_nome}}</span>, com sede em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_morada}}</span>, contribuinte fiscal n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_nif}}</span>, adiante designada por <strong>PRESTADOR</strong>, e <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_nome}}</span>, com morada em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_morada}}</span>, contribuinte fiscal n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_nif}}</span>, adiante designado por <strong>CLIENTE</strong>, é celebrado o presente contrato de manutenção:</p>
<br/>
<p><strong>SEGUNDA — Objecto</strong></p>
<p>O presente contrato tem por objecto a prestação de serviços de manutenção preventiva e correctiva nos equipamentos e instalações do CLIENTE, conforme descrito no anexo técnico.</p>
<br/>
<p><strong>TERCEIRA — Serviços Incluídos</strong></p>
<p>1. Inspecção e manutenção preventiva periódica.</p>
<p>2. Reparação de avarias e substituição de componentes desgastados.</p>
<p>3. Relatório técnico após cada intervenção.</p>
<p>4. Assistência técnica telefónica em dias úteis (9h-18h).</p>
<br/>
<p><strong>QUARTA — Periodicidade</strong></p>
<p>A manutenção preventiva será realizada com periodicidade mensal/trimestral, em datas a acordar entre as partes. As intervenções correctivas serão realizadas num prazo máximo de 48 horas após comunicação do CLIENTE.</p>
<br/>
<p><strong>QUINTA — Preço e Pagamento</strong></p>
<p>1. O valor mensal do presente contrato é de <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_valor}}</span> ( <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_valor_extenso}}</span> ), acrescido de IVA à taxa legal.</p>
<p>2. O pagamento será efectuado por transferência bancária até ao dia 8 de cada mês.</p>
<br/>
<p><strong>SEXTA — Duração e Renovação</strong></p>
<p>1. O presente contrato tem início em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_data_inicio}}</span> e termo em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_data_fim}}</span>, com duração de <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_duracao}}</span>.</p>
<p>2. O contrato será automaticamente renovado por períodos iguais, salvo denúncia por qualquer das partes com antecedência mínima de 30 dias.</p>
<br/>
<p><strong>SÉTIMA — Exclusões</strong></p>
<p>Não estão cobertos por este contrato: danos causados por mau uso, actos de vandalismo, catástrofes naturais, ou alterações realizadas por terceiros sem autorização do PRESTADOR.</p>
<br/>
<p><strong>OITAVA — Foro</strong></p>
<p>Para resolução de qualquer litígio, é competente o foro da comarca de Lisboa.</p>
<br/>
<p style="text-align:center;"><span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_morada}}</span>, <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{data_atual}}</span></p>
<br/>
<p>_________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;_________________________</p>
<p>O PRESTADOR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;O CLIENTE</p>`,
  },
  {
    id: "remodelacao-obra",
    name: "Remodelação / Obra",
    description: "Descrição obra, materiais, prazos, pagamento faseado",
    icon: "🏗️",
    clauseCount: 9,
    html: `<h2 style="text-align:center;"><strong>CONTRATO DE EMPREITADA / REMODELAÇÃO</strong></h2>
<p style="text-align:center;">N.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_numero}}</span></p>
<br/>
<p><strong>PRIMEIRA — Partes Contratantes</strong></p>
<p>Entre <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_nome}}</span>, com sede em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_morada}}</span>, contribuinte fiscal n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_nif}}</span>, adiante designada por <strong>EMPREITEIRO</strong>, e <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_nome}}</span>, com morada em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_morada}}</span>, contribuinte fiscal n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{cliente_nif}}</span>, adiante designado por <strong>DONO DA OBRA</strong>, é celebrado o presente contrato:</p>
<br/>
<p><strong>SEGUNDA — Descrição da Obra</strong></p>
<p>O presente contrato tem por objecto a execução dos trabalhos de remodelação/construção conforme descrito na proposta n.º <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{proposta_numero}}</span> e respectivo orçamento, que fazem parte integrante deste contrato.</p>
<p>Os trabalhos incluem:</p>
<p><span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{orcamento_itens}}</span></p>
<br/>
<p><strong>TERCEIRA — Materiais</strong></p>
<p>1. Os materiais a utilizar serão de primeira qualidade, conforme especificados no orçamento.</p>
<p>2. Qualquer alteração de materiais deverá ser previamente aprovada pelo DONO DA OBRA.</p>
<p>3. Os materiais sobrantes serão propriedade do DONO DA OBRA.</p>
<br/>
<p><strong>QUARTA — Prazos</strong></p>
<p>1. A obra terá início em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_data_inicio}}</span> e conclusão prevista em <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_data_fim}}</span>, com duração estimada de <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_duracao}}</span>.</p>
<p>2. Eventuais atrasos por motivos de força maior ou por solicitação do DONO DA OBRA não são imputáveis ao EMPREITEIRO.</p>
<br/>
<p><strong>QUINTA — Preço e Pagamento Faseado</strong></p>
<p>1. O valor total da empreitada é de <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_valor}}</span> ( <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{contrato_valor_extenso}}</span> ), com IVA incluído.</p>
<p>2. O pagamento será faseado da seguinte forma:</p>
<p>&nbsp;&nbsp;&nbsp;a) 30% na assinatura do contrato (adiantamento);</p>
<p>&nbsp;&nbsp;&nbsp;b) 30% a meio da execução da obra;</p>
<p>&nbsp;&nbsp;&nbsp;c) 30% na conclusão dos trabalhos;</p>
<p>&nbsp;&nbsp;&nbsp;d) 10% após vistoria final e aceitação da obra.</p>
<br/>
<p><strong>SEXTA — Garantias</strong></p>
<p>1. O EMPREITEIRO garante a qualidade da mão de obra por 5 (cinco) anos.</p>
<p>2. Os materiais estão cobertos pela garantia do respectivo fabricante.</p>
<p>3. O prazo de garantia conta-se a partir da data de aceitação da obra.</p>
<br/>
<p><strong>SÉTIMA — Penalizações por Atraso</strong></p>
<p>1. Em caso de atraso na conclusão da obra por motivos imputáveis ao EMPREITEIRO, será aplicada uma penalização de 0,5% do valor total por cada semana de atraso, até um máximo de 10%.</p>
<p>2. Esta penalização não se aplica a atrasos causados pelo DONO DA OBRA, por terceiros ou por motivos de força maior.</p>
<br/>
<p><strong>OITAVA — Rescisão</strong></p>
<p>1. Qualquer das partes pode rescindir o contrato mediante comunicação escrita com 15 dias de antecedência.</p>
<p>2. Em caso de rescisão, o DONO DA OBRA pagará os trabalhos já executados e os materiais adquiridos.</p>
<br/>
<p><strong>NONA — Foro</strong></p>
<p>Para resolução de litígios é competente o foro da comarca de Lisboa, com renúncia a qualquer outro.</p>
<br/>
<p style="text-align:center;"><span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{empresa_morada}}</span>, <span class="bg-primary/20 text-primary px-1 rounded text-sm font-mono" contenteditable="false">{{data_atual}}</span></p>
<br/>
<p>_________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;_________________________</p>
<p>O EMPREITEIRO&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;O DONO DA OBRA</p>`,
  },
];

// Clause ordinals in Portuguese
export const CLAUSE_ORDINALS = [
  "PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA", "QUINTA",
  "SEXTA", "SÉTIMA", "OITAVA", "NONA", "DÉCIMA",
  "DÉCIMA PRIMEIRA", "DÉCIMA SEGUNDA", "DÉCIMA TERCEIRA",
  "DÉCIMA QUARTA", "DÉCIMA QUINTA",
];

// Variable categories for organized display
export interface VariableCategory {
  label: string;
  icon: string;
  variables: { key: string; label: string; description: string }[];
}

export const VARIABLE_CATEGORIES: VariableCategory[] = [
  {
    label: "Empresa",
    icon: "🏢",
    variables: [
      { key: "{{empresa_nome}}", label: "Nome da Empresa", description: "Nome da organização" },
      { key: "{{empresa_nif}}", label: "NIF da Empresa", description: "NIF da organização" },
      { key: "{{empresa_morada}}", label: "Morada da Empresa", description: "Morada da organização" },
    ],
  },
  {
    label: "Cliente",
    icon: "👤",
    variables: [
      { key: "{{cliente_nome}}", label: "Nome do Cliente", description: "Nome do cliente/contacto" },
      { key: "{{cliente_nif}}", label: "NIF do Cliente", description: "NIF do cliente" },
      { key: "{{cliente_morada}}", label: "Morada do Cliente", description: "Morada do cliente" },
      { key: "{{cliente_email}}", label: "Email do Cliente", description: "Email do cliente" },
      { key: "{{cliente_telefone}}", label: "Telefone do Cliente", description: "Telefone do cliente" },
      { key: "{{cliente_localidade}}", label: "Localidade do Cliente", description: "Código postal e cidade do cliente" },
    ],
  },
  {
    label: "Contrato",
    icon: "📑",
    variables: [
      { key: "{{contrato_numero}}", label: "Nº do Contrato", description: "Número do contrato" },
      { key: "{{contrato_valor}}", label: "Valor do Contrato", description: "Valor total do contrato" },
      { key: "{{contrato_valor_extenso}}", label: "Valor por Extenso", description: "Valor por extenso" },
      { key: "{{contrato_data_inicio}}", label: "Data de Início", description: "Data de início" },
      { key: "{{contrato_data_fim}}", label: "Data de Fim", description: "Data de fim" },
      { key: "{{contrato_duracao}}", label: "Duração", description: "Duração do contrato" },
    ],
  },
  {
    label: "Proposta",
    icon: "📋",
    variables: [
      { key: "{{proposta_numero}}", label: "Nº da Proposta", description: "Número da proposta" },
      { key: "{{proposta_valor}}", label: "Valor da Proposta", description: "Valor da proposta original" },
      { key: "{{proposta_data}}", label: "Data da Proposta", description: "Data de emissão da proposta" },
      { key: "{{orcamento_itens}}", label: "Itens do Orçamento", description: "Tabela de itens" },
    ],
  },
  {
    label: "Comercial",
    icon: "👤",
    variables: [
      { key: "{{comercial_nome}}", label: "Nome do Comercial", description: "Comercial responsável" },
      { key: "{{comercial_email}}", label: "Email do Comercial", description: "Email do comercial responsável" },
      { key: "{{comercial_telefone}}", label: "Telefone do Comercial", description: "Telefone do comercial responsável" },
    ],
  },
  {
    label: "Assinatura",
    icon: "✍️",
    variables: [
      { key: "{{signatario_nome}}", label: "Nome do Signatário", description: "Nome do signatário pela empresa (escolhido no separador Assinaturas)" },
      { key: "{{signatario_cargo}}", label: "Cargo do Signatário", description: "Cargo/role do signatário pela empresa" },
    ],
  },
  {
    label: "Datas",
    icon: "📅",
    variables: [
      { key: "{{data_atual}}", label: "Data Atual", description: "Data de hoje" },
    ],
  },
];

