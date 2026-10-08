# Olyvia — ponto de situação (para a reunião de administração de 06/10/2026)

Situação a 03/10/2026. Fontes: o histórico do repositório `Miguel-olyvia/Olyvia-crm` (ramo principal e ramos por integrar), a documentação do projeto e a reunião de Operações de 02/10/2026.

O que é: a Olyvia é a plataforma do grupo BMLAR. O CRM comercial está na raiz de www.olyvia-ai.com e as Operações em /operacao. A Mudelar é a empresa que já a usa com dados reais.

Marca da apresentação: BMLAR Group (bmlar.pt).
- Cores: preto `#000000`, osso `#F5F0E8`, verde Mudelar `#81CEBA` / `#67A392`, azul BMG `#4462FF`, coral `#E84F70`.
- Olyvia em roxo `#763CE9`.
- Letra do site: Jost (títulos) e Mulish (texto). Na apresentação foram substituídas por Century Gothic e Calibri, que vêm com o Office.

Nas secções seguintes, as linhas `Mensagem-chave:` são o texto de uma linha para pôr em cada diapositivo.

---

## 1. Em resumo

Mensagem-chave: a Olyvia já cobre o percurso do cliente de ponta a ponta; o próximo passo depende de decisões da administração.

- O percurso comercial está em produção, da lead ao contrato assinado, com portal do cliente.
- As Operações já planeiam obras sozinhas a partir do contrato. Os tempos padrão estão carregados na Mudelar desde 03/10: 52 serviços e 168 passos.
- Para avançar faltam decisões:
  - o impacto da ficha do local no preço;
  - os custos de deslocação;
  - RH e faturação, que estão por integrar;
  - as datas de conclusão.

## 1a. Porquê a Olyvia

Mensagem-chave: de ferramentas soltas a um só sistema.

| Hoje | Com a Olyvia |
|---|---|
| Manuais de obra em Word e tempos em Excel | Percurso único: lead, visita, orçamento, contrato, obra |
| Marcações e confirmações por telefone e mensagens | O cliente marca a visita e confirma por SMS |
| Ordens de trabalho noutra ferramenta (Infraspeak) | A obra é planeada sozinha a partir do contrato |
| Levantamento da casa em papel ou de memória | Ficha do local com campos fechados |
| Ninguém sabe quanto tempo uma obra demora de facto | Previsto contra real em cada tarefa; o sistema aprende |

## 1b. A visão

Mensagem-chave: uma plataforma para o grupo inteiro.

O ciclo tem quatro passos: **captar** (lead e visita) → **vender** (orçamento e contrato) → **transformar** (obra Mudelar) → **manter** (manutenção BMG).

A Mudelar entrega a obra e a BMG mantém a casa. A Olyvia guarda o histórico do cliente, do primeiro contacto à manutenção.

## 2. Números

Mensagem-chave: três meses e meio de desenvolvimento, com quatro pessoas.

- Primeira versão no repositório: 18/06/2026. O código já vinha de uma versão anterior.
- Cerca de 1 190 alterações distintas publicadas: 1 461 commits no total, incluindo cópias do mesmo trabalho entre ramos.
- 714 alterações à base de dados.
- Alterações por mês: junho 65, julho 286, agosto 445, setembro 495, outubro (1–3) 36.
- Quem desenvolve:
  - Miguel Carvalho (base, segurança, leads, agendamento, RH);
  - Rafael Gromicho (orçamentos, stock, compras, venda direta);
  - Ruben Carvalho (Operações e Obras);
  - Ricardo Paiágua (App DUC).

## 3. Feito e em produção

Mensagem-chave: o percurso do cliente já existe de ponta a ponta, mas é pesado de usar.

**Percurso do cliente**
- **Lead**: entrada pelo site, origem detetada, sem repetidas.
- **Visita**: marcada pelo cliente, com SMS e lembretes.
- **Orçamento**: catálogo, margens, moradas e ficha do local.
- **Proposta**: numerada e fixa depois de enviada.
- **Contrato**: assinado e congelado; o stock fica reservado.
- **Obra**: criada e planeada a partir do contrato.
- **Portal do cliente**: o cliente assina e descarrega os documentos.

**Comercial: leads e funil**
- Funil configurável por empresa, com qualificação MQL/SQL.
- Origem de marketing detetada sozinha e mantida até cliente.
- Formulário público sem leads repetidas.
- Motivo obrigatório quando se perde uma lead ou negócio.
- Página "O Meu Dia", com tarefas e calendário.

**Comercial: visitas e agenda** (integrado até 30/09)
- Marcação embebida no site da Mudelar.
- Comercial escolhido por distrito, distância e tempo de viagem.
- SMS de confirmação, lembretes e confirmação pelo cliente.
- Feriados, almoço e antecedência mínima respeitados.
- Envios falhados visíveis, com reenvio.

**Orçamentos**
- Ficha técnica dos serviços, com mão de obra e materiais.
- Margens visíveis só para quem tem permissão.
- Morada fiscal e morada do serviço no PDF.
- Ficha do local com exterior e interior (02/10).

**Propostas e contratos**
- Numeração automática.
- Documento fixo depois de enviado.
- O contrato assinado fica congelado.
- Ao assinar, o stock é abatido e é feito o pedido ao fornecedor.

**Portal do cliente**
- O cliente assina ou rejeita.
- Descarrega propostas e contratos em PDF.
- Uma conta pode ter várias empresas.
- Fuga de dados corrigida a 01/10.

**Operações**
- Ordens de trabalho ao estilo Infraspeak publicadas a 31/08.
- Módulo de Obras a 01/10.
- Planeamento automático a 03/10. A obra:
  - nasce do contrato assinado;
  - é planeada sozinha, com fases, tarefas em paralelo, esperas de secagem e feriados;
  - recebe as pessoas livres, com aviso de choques de agenda.
- No terreno: relógio por tarefa no telemóvel, fotos e atrasos com justificação.
- No fecho: o supervisor valida e compara o previsto com o real, e o sistema aprende os tempos.
- Os tempos padrão foram propostos por nós e aguardam validação da equipa de obra.

**Base da plataforma**
- **Segurança e RGPD**: cada empresa só vê os seus dados, NIF cifrado, histórico de alterações e direito ao esquecimento.
- **Stock e compras**: fornecedores com histórico de preços, inventário com a câmara, receções parciais.
- **Venda direta**: proforma, PDF, registo da fatura e custo/margem interno.
- **Planos e limites**: teste de 14 dias, limites por plano e créditos de IA. Os pagamentos ainda não estão ativos.
- **App DUC** (Documento Único de Cliente): etapas, chat, link público e PDF.
- **Monitorização**: erros e falhas silenciosas reportados, alertas de novas sessões.

## 3b. O potencial

**Dados próprios**

Mensagem-chave: cada obra torna a próxima mais certa.

O ciclo: visita (ficha do local e medidas) → orçamento (preço com o risco real) → obra (tempos reais por tarefa) → o motor ajusta os tempos padrão.

Ganhos:
- **Orçamentos mais certos**: o custo de uma casa difícil passa a estar no preço, e não na margem perdida.
- **Prazos que se cumprem**: os tempos vêm de obras reais.
- **Melhor uso das equipas**: o plano mostra quem está livre, quando e onde.
- **Um ativo do grupo**: fotografias, medidas e tempos de centenas de casas, bem organizados.

**Manutenção BMG** (potencial; a plataforma ainda não está a ser usada pela BMG)

Mensagem-chave: a mesma plataforma pode servir a manutenção da BMG.

O fluxo: obra concluída (Mudelar) → equipamentos registados no local do cliente → plano preventivo que gera ordens sozinho → técnico no local, com checklist, fotos e relatório.

Já existe nas Operações:
- locais, equipamentos, medições e checklists;
- planos preventivos que geram ordens;
- ordens respondidas no telemóvel;
- custos e relatório PDF.

Falta:
- integrar o trabalho de setembro (QR nos equipamentos, rota do dia, assinatura no telemóvel, sem rede);
- avisos no sino e agenda a contar com férias;
- um piloto: um edifício, um técnico, uma semana.

**Produto para o mercado**

Mensagem-chave: a Olyvia já está preparada para outras empresas.

- Várias empresas, cada uma com os seus dados e a sua marca nos emails.
- Planos e limites, com avisos.
- Teste grátis de 14 dias.
- Pagamentos por Stripe, preparados mas por ativar.
- IA com custo controlado.
- Portal do cliente e app DUC.

O caminho proposto: provar a Olyvia na Mudelar, depois na BMG, e só então abrir a outras empresas de remodelação e manutenção.

## 4. Em curso, ainda fora da plataforma

Mensagem-chave: há cinco frentes desenvolvidas em parte que ainda não estão na plataforma.

| Frente | Quem | Estado | Próximo passo |
|---|---|---|---|
| RH: assiduidade, férias, contratos, salários | Miguel | 104 alterações por integrar (último trabalho a 22/09) | Decidir quando integrar |
| Faturação e pagamentos (Stripe) | A confirmar | Retirada da integração de 30/09; pagamentos não ativos | Decidir a ativação |
| Orçamento V2: da medida à quantidade de material | Equipa | Parcial: diagnóstico feito, falta o motor de rácios | Rácios reais da Mudelar (bloqueante) |
| Operações: QR, rota do dia, assinatura no telemóvel, sem rede | Ruben | Trabalho de 31/08–02/09 por integrar | Integrar ou abandonar |
| Stock: receção por código, packs, catálogo do fornecedor | Rafa | Cerca de 17 alterações por integrar | Concluir e integrar |

## 5. O que falta

Mensagem-chave: três tarefas até à demo; o resto ainda não tem data.

**Até 07/10 (demo)**
- Dados de demonstração na Mudelar, para mostrar Validar e Métricas.
- Textos em inglês nos ecrãs da demo.
- Testes de ponta a ponta (5–6/10).

**Depois da demo (data a definir)**
- Ficha do local no orçamento, com proteções (papel, plásticos) e deslocação (km, combustível, estacionamento) discriminadas.
- Tempos padrão validados pela equipa de obra.
- Fotos da área de intervenção na visita.
- Dados do local ao marmorista, com a data prevista da obra, para preparar as bancadas.
- Pessoas por especialidade e capacidade no plano.
- Prazos de entrega dos materiais a condicionar a obra.
- Avisos no sino do CRM e agenda a contar com férias.
- Simplificar o percurso lead → cliente. No teste de 03/10 houve passos, abas, botões e scroll a mais, e a morada da lead tem campos diferentes da do cliente.

## 6. Calendário

Mensagem-chave: só há quatro datas fixadas; as restantes devem sair desta reunião.

| Data | Marco | Estado |
|---|---|---|
| 03/10 | Planeamento automático em produção | Feito |
| 05–06/10 | Testes de ponta a ponta | Previsto |
| 06/10 | Reunião de administração | Hoje |
| 07/10 | Apresentação e demo | Previsto |
| A definir | Próxima fase: decisões, integrações e simplificação | Por fixar |

Nenhuma das frentes em curso tem data de conclusão nos documentos do projeto. Proposta: cada responsável traz uma estimativa até ao fim da semana da demo.

## 7. Decisões pedidas à administração

Mensagem-chave: seis decisões desbloqueiam a próxima fase.

1. **Impacto da ficha do local no preço**: percentagem fixa por parâmetro, ou definida por quem preenche? Com responsabilização na comissão?
2. **Armazém de referência**: o ponto de partida para calcular quilómetros, combustível e estacionamento no orçamento.
3. **RH e faturação**: se e quando integrar na plataforma; ativar os pagamentos.
4. **Rácios reais da Mudelar**: quem fornece as quantidades por medida de que o Orçamento V2 precisa.
5. **Simplificar o percurso**: mandato para cortar passos e ecrãs entre lead e cliente depois da demo.
6. **Datas e piloto BMG**: uma data por frente, com responsável; avançar ou não com o piloto de manutenção.

## Notas de fiabilidade

- A contagem de alterações inclui cópias entre ramos; o número distinto é aproximado.
- Não se confirmou se o ramo de Operações de setembro foi abandonado.
- Não há datas de conclusão inventadas: o que não está nos documentos aparece como "a definir".
