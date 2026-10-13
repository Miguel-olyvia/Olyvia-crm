# Reunião de Operações de 02/10/2026: o que está feito e o que falta

Cruzamento entre a reunião (gravação transcrita localmente) e o `main` a 03/10/2026 (`ea307d4e`), que está publicado no Vercel.

Em resumo, a reunião pediu três coisas:
- a ficha do local, em duas partes: exterior (o edifício) e interior (a casa);
- que essa ficha influencie o orçamento;
- que as tarefas das obras tenham tempos.

A recolha dos dados está quase toda feita. Falta usá-los no orçamento.

## Feito e em produção

- **Ficha do local, Exterior**: acesso, estacionamento, elevador, andares (`cfbb5173`, `7f7d25a8`).
- **Ficha do local, Interior**: habitada durante a obra, tipologia, área, canalização, gás, amianto… (`7f7d25a8`).
- **Diagnóstico da área de intervenção** (`1d84a3a1`):
  - distância da entrada (curta, média ou longa);
  - casa mobilada;
  - portas a proteger;
  - se tem janela;
  - onde se fazem os cortes (na área, varanda ou fora);
  - se o cliente recusou fotos;
  - medidas.
- **"Morada de entrega / do serviço"**; a primeira morada passa a ser a fiscal.
- **Campos fechados e todos opcionais**, como pedido: não partem o histórico.
- **Tempos padrão das tarefas**, propostos por nós e carregados na Mudelar: 52 serviços e 168 passos (`f365927e`).

Todos os SQL destes trabalhos foram aplicados em produção a 02/10 e 03/10.

## Falta

### 1. Ligar a ficha do local ao orçamento (o objetivo central da reunião)

- Calcular sozinho os métodos e as quantidades de proteção (papel canelado, plásticos).
- Pôr a logística no orçamento: estacionamento, quilómetros desde o armazém e combustível, para o orçamento sair discriminado.
- Calcular a distância ao armazém a partir da morada. Hoje não é calculada e o armazém não está definido no sistema.
- Refletir no orçamento os fatores que já se recolhem. Exemplo da reunião: cortes fora da área dão um "orçamento X ou Y".

### 2. Decisões em aberto

- **Impacto no preço**: percentagem configurada por parâmetro, ou definida por quem preenche? Hoje só existe o `impacto_percent` para acesso difícil, preenchido à mão.
- **Responsabilização**: quem preencher mal e com isso causar custo à operação perde comissão?
- **Campos obrigatórios**: quais passam a sê-lo e quando. A equipa tem de ser avisada antes.

### 3. Fotos da área de intervenção

Hoje só existe o campo "cliente recusou fotos". Não se podem carregar fotos nem no diagnóstico nem na ficha do local.

### 4. Bancadas e marmorista

Passar cedo ao marmorista os dados do local e a data prevista da obra, para ele preparar os cortes e encomendar. Ainda não foi feito.

### 5. Tarefas, o ponto que a reunião considerou crítico

- O Hugo tem de validar o Excel dos tempos padrão. Tem 16 perguntas para ele.
- Confirmar que os manuais enviados "em bulk" estão todos cobertos.

### 6. Interface

Corrigir a mistura de inglês e português.

### 7. Para mais tarde (a reunião disse "automatizar por último")

- Pré-preencher o exterior a partir da morada, na fase MQL ou na preparação da visita.
- Um tablet ou telemóvel dedicado para a visita.

## Experiência de uso (teste de 03/10)

Ao percorrer a plataforma de lead até cliente, o processo revelou-se pesado:
- muitos passos, abas e botões;
- muito scroll;
- a morada da lead com campos diferentes da do cliente.

O modelo de dados está razoável. O problema está nos ecrãs e no percurso.

Proposta:
- antes da demo, mexer só no que bloqueia;
- depois da demo, contar ecrãs, cliques e campos em cada passo e simplificar com base nisso;
- juntar a visita num só ecrã, na ordem edifício → casa → área.
