# Levantamento do projeto Olyvia (situação a 03/10/2026)

Levantamento só de leitura.

**Fontes:**
- `origin/main` depois de `git fetch`;
- os ramos remotos que ainda não estão no `main`;
- a documentação do repositório.

A data "em produção" é a data do commit no `main`, que o Vercel publica a cada push. Os passos manuais na base de dados (SQL corrido no editor) só estão confirmados onde a documentação o diz.

## 1. Números gerais

- **Primeiro commit**: 18/06/2026, de Miguel Carvalho (`c7c21dd6`). O código vinha de uma versão anterior.
- **Último commit no main**: 03/10/2026 (`ea307d4e`).
- **Commits no main**: 1 461, dos quais 1 327 de trabalho e 134 de junção.
  - Sem as mensagens repetidas por cópias entre ramos, ficam cerca de 1 190 alterações distintas.
- **Migrações de base de dados**: 714.
- **Commits de trabalho por pessoa**:
  - Miguel Carvalho: 855
  - Rafael Gromicho: 376
  - Ruben Carvalho: 56
  - Ricardo Paiágua: 40
- **Commits por mês**: junho 65, julho 286, agosto 445, setembro 495, 1–3 de outubro 36. O pico foi na semana de 24–30/08, com 218.
- **Pedidos de integração no GitHub**: #9 a #23.

## 2. Feito e no main

### Segurança, proteção de dados e base técnica (junho–julho)
- Cada empresa só vê os seus dados (`5b7c19f2`, `e346d73a`).
- Histórico de alterações (`811f5fcd`, `4fc6de79`).
- NIF cifrado (`12c05653`…`094fe11e`).
- Direito ao esquecimento (`67708c3f`, `e310e167`).
- Lixo com recuperação (`f8dad16d`, `a4b0e450`).
- Limites contra abusos (`2284e6b1`, `1debde0c`).
- Exportações registadas (`7832960c`, `90a425c5`).
- Alertas de nova sessão (`20044f66`).
- Monitorização (`b05bd7c5`, `dfb62632`).
- Falhas silenciosas reportadas (`968b7e24`, `84c582c0`).
- Fuga de dados do portal corrigida a 01/10 (`5a57f0d1`).

### Leads e funil
- Kanban (`2b17c58c`).
- Contactos passam a ser leads (`0570d9fd`).
- Qualificação MQL/SQL (`7ef66ee2`).
- Funil configurável com regras (`ffc589c7`, `9120a802`).
- Separador "Percurso" (`11eeb442`).
- Motivo de perda (`3e8438d4`).
- Origem automática pelo site e pelo Google Analytics (`9641cfc3`, `def91154`).
- Formulário sem leads repetidas (`2cee1b26`, `cbf51699`).
- Lead que volta a contactar sobe na lista (`28c72d52`).
- Motor sequencial do funil (`9f6d483c` 18/09, `7c3f1324` 22/09).
- Página "O Meu Dia" (`43d42517`, `66c10582`).

### Formulários públicos e agendamento (PR #15 a #21, até 30/09)
- Página onde o cliente gere a marcação (`05ffd9b0`).
- Comercial por distrito (`946f5cb3`).
- Marcação embebida no site da Mudelar (`497307e9`).
- O calendário só oferece horas válidas (`4473f294`).
- Antecedência mínima (`af84fab3`).
- SMS de confirmação e lembrete (`2b269fb9`, `0a135a30`).
- Confirmação pelo cliente (`186d5a82`).
- Emails com a marca da empresa (`7e8c463a`).
- Envios falhados, com reenvio (`3e92a9e5`).
- Distância e tempo de viagem (`9bdc0e90`, `00f58506`).
- Feriados e almoço (`eae04a14`, `62c6f3e5`).
- Aviso de mudança de agenda (`f262101d`).

### Orçamentos, propostas e contratos
- Margens por permissão (`3c2941de`).
- Preço definido à mão não é recalculado (`8cee2d4d`).
- Ficha técnica dos serviços (`6abc13dd`).
- Diagnóstico Fase 1 (`c16d3c31`, `f97d44b1`).
- Moradas no orçamento e no PDF (`cfbb5173`).
- Propostas:
  - número automático (`911307cb`);
  - acrescentar orçamentos a uma proposta enviada (`9650e7a8`);
  - proposta enviada fixa (`ed8b5846`).
- Contratos:
  - anular e substituir (`de1f411d`);
  - contrato assinado congelado (`c85d20b1`);
  - contrato sem ser já cliente (`f685c8bd`).

### Portal do cliente
- Assinar ou rejeitar faz avançar o processo (`c7314f59`, `e9bf1d6d`).
- PDF do contrato e da proposta (`ed7fc2a1`).
- Escolha entre CRM e portal (`888a4bff`).
- Várias empresas (`f65c7b91`).

### Clientes e moradas
- Pessoa ou empresa (`1c6a45ce`).
- Várias moradas de entrega (`954457b7`).
- Morada validada e ficha do local exterior/interior (`cfbb5173`, `7f7d25a8`, 02/10).
- Diagnóstico da necessidade com medidas (`1d84a3a1`, 03/10).

### Stock, compras e venda direta (Rafa)
- Vários fornecedores por produto (`2673540d`).
- Movimentos de stock (`fdd3daf5`).
- Receção parcial (`8144e3a6`).
- Ao assinar: stock abatido e pedido ao fornecedor (`c52def0c`, `f62446ee`).
- Encomendas de clientes (`172476bb`).
- Inventário com a câmara (`faeabbc2`).
- Prazo por fornecedor (`fe78aec4`).
- Venda direta: proforma, PDF e fatura (`32416418`…`482d140e`).
- Reserva por ordem de assinatura (`b6510c5a`).
- Receção por linha (`81d8e694`).

### Planos, limites e IA
- Créditos de IA e limites (`a4390e19`).
- Stripe preparado, por ativar (`8364fc45`).
- Teste de 14 dias (`7b9d4f13`).
- Limites por recurso, com avisos (`fcc8f74a`, `608a66d1`).
- Custo real da IA registado (`a636fab0`).

### Outros
- Página inicial revista (`92da452d`).
- "Registe-se" retirado do login (`5014c4b6`).
- App DUC, de Ricardo Paiágua, em olyvia-ai.com/duc-app (`02d1702c`, `e6cb3d4c`, `7b603eac`).

### Operações e Obras (Ruben)
- **31/08**: ordens de trabalho ao estilo Infraspeak (`502b9ae4`…`47207e4b`):
  - locais, equipamentos, checklists;
  - planos preventivos;
  - agenda com aviso de choques;
  - telemóvel;
  - fotos e custos;
  - relatório PDF.
- **01/10**: módulo de Obras (PR #22, `8b3baed6`):
  - quatro fases, Gantt e relógio por tarefa;
  - validação pelo supervisor;
  - previsto contra real.
- **02/10**:
  - obra a partir do contrato (`3f06aada`);
  - tarefas em paralelo (`73c072f1`);
  - "entrar como", fotos, Gantt por dia/semana/mês (`0d8caa12`);
  - equipa vinda do CRM (`3b70815a`);
  - stock (`ae9087c5`);
  - atrasos e alertas (`28355de7`).
- **03/10**: planeamento automático (`f365927e`):
  - tempos padrão;
  - esperas e feriados;
  - medidas;
  - extras;
  - aprendizagem.
  - Aplicado na Mudelar: 52 serviços e 168 passos.

## 3. Em curso: ramos fora do main

| Ramo | Último commit | Conteúdo |
|---|---|---|
| `feature/rh-pessoas` | Miguel, 22/09 | 104 commits: assiduidade, férias, contratos, admissão, fardamento, documentos, processamento salarial, horas de obra |
| `development-rafael` | Rafa, 02/10 | Cerca de 17 alterações que não estão no main: receção por código (fase 2), packs e catálogo do fornecedor (em curso), correções do funil (uma com "MIGRATION POR APLICAR"), segurança do assistente de IA |
| `feature/operacoes` | Ruben, 02/09 | 63 commits, 72 ficheiros que não estão no main: QR nos equipamentos, rota do dia com mapa, assinatura no telemóvel, envio automático do relatório, sem rede, conversa na ordem, análises. Não se sabe se foi abandonado |
| `feat/operacao-dados-teste` | Ruben, 03/10 | Um commit; parece já estar coberto no main (não confirmado) |
| `worktree-retirar-contacto-fase1` | Miguel, 01/10 | Retira da interface as últimas menções a "Contacto" |
| `worktree-seg-portal-cliente-rls` | Miguel, 01/10 | Provavelmente já integrado (`5a57f0d1`) |

**Faturação:**
- A junção `4e5ef043` (30/09) deixou de fora a página Faturação e o Stripe (checkout, portal, webhook).
- A página não existe no main.
- Os pagamentos não estão ativos.

**Orçamento V2** (`docs/orcamento-v2`, por enquanto noutro ramo):
- O diagnóstico está em parte feito.
- O motor de rácios (da medida à quantidade de material) não aparece em nenhum commit.
- A etapa E0, obter os rácios reais da Mudelar, é bloqueante.

## 4. Planeado, nos documentos (nenhum item tem data)

- **`operacao-app/docs/planeamento.md`**:
  - capacidade por especialidade;
  - prazos dos materiais;
  - impacto da ficha do local no preço;
  - distância ao armazém;
  - tempos padrão por validar.
- **`operacao-app/docs/a-seguir.md`**:
  - notificações no sino do CRM (meio dia);
  - iniciar a ordem sozinha;
  - relatório do equipamento;
  - agenda com férias e horários (meio dia);
  - percentagem de preventiva cumprida;
  - assinatura no telemóvel;
  - funcionar sem rede;
  - WhatsApp, a decidir.
- **`operacao-app/docs/onde-estamos.md`**: piloto "um edifício, um técnico, uma semana".
- **`operacao-app/docs/obras.md`**: oito perguntas em aberto:
  1. nomes das fases 3 e 4;
  2. subempreiteiros;
  3. extras → orçamento;
  4. fecho com ou sem assinatura;
  5. origem da obra;
  6. tempo por pessoa ou por equipa;
  7. tempos por tarefa;
  8. fase de cada serviço.
- **`operacao-app/docs/portal-do-cliente.md`**: pedir assistência pelo portal; hipótese, depois do piloto.
- **`src/lib/addresses/README.md`**: as Operações lerem a ficha do local; a percentagem de impacto entrar no preço.

## 5. Datas fixadas (fora dos documentos)

- Testes: 5 e 6/10/2026.
- Reunião de administração: 06/10/2026.
- Apresentação e demo: 07/10/2026.

A 03/10, na Mudelar, faltavam dados de demonstração (0 tarefas validadas, 0 extras) para mostrar Validar e Métricas.
