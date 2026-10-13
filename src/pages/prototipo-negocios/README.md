# Protótipo de Negócios

Este protótipo é a proposta de 08–09/10/2026 para o fluxo comercial da Olyvia, num só item de menu, **Negócios**, com seis fases: **Lead → Contacto → Visita → Negócio → Financeiro → Obra**.

Cada fase pede os seus campos e só se passa à seguinte com eles preenchidos.

Funciona como se fosse a app, mas **só com dados de exemplo**:
- não usa a base de dados nem a sessão da Olyvia;
- o que se faz fica guardado no `localStorage` do browser de quem usa.

- **Rota:** `/prototipo/negocios`, pública e fora do `Layout` do CRM, registada em `src/App.tsx`.
- **Preview:** https://olyvia-crm-git-feat-negocios-prototipo-bmgest.vercel.app/prototipo/negocios. Pede o login da equipa bmgest no Vercel.
- **Ramo:** `feat/negocios-prototipo`.
- **Maquetas estáticas** (a 1.ª versão, de 08/10): `public/prototipo/maquetas.html`.

> **Backup antes de mexer:** ver [Backup](#backup) no fim. O estado de 09/10/2026 está guardado no commit `ec9c43c2`, de três formas locais.

---

## Como correr

```bash
npm install
npm run dev                                  # e abrir http://localhost:8080/prototipo/negocios
npx vitest run src/pages/prototipo-negocios  # os testes do protótipo (43 ficheiros, 697 testes a 12/10/2026)
npx tsc --noEmit -p tsconfig.app.json        # o tipo (há erros antigos noutros ficheiros da app; os do protótipo têm de ficar a zero)
```

- Para recomeçar a demonstração, use **Definições → Repor a demonstração** ou apague a chave `olyvia-prototipo-negocios` do `localStorage`.
- Se mudar a forma do estado guardado, suba `VERSAO` em `motor.ts`. Os dados antigos são então ignorados e o protótipo recomeça com os dados de exemplo.

---

## Dois aspetos

| Aspeto | O que é | Onde |
|---|---|---|
| **Simples** (por defeito) | A proposta de 09/10: fundo claro, cartões, uma coisa de cada vez, letra Lexend, contraste AA e leitura fácil para dislexia | os ficheiros `*Simples.tsx`, `CamposFase.tsx` (`CampoSimples`) e as classes `.calma` em `prototipo.css` |
| **Atual** | A estética de hoje da Olyvia, só para comparar | `PaginaNegocio.tsx` (`PaginaNegocio`, `FaseAtual`), `Hoje.tsx` e a moldura escura em `PrototipoNegocios.tsx` |

Troca-se com **"Comparar com o aspeto atual"** no menu. O estado fica em `S.aspeto`.

### O seletor de versão: Atual · V2 · V2 funcional (só no aspeto simples)

No menu lateral, junto a "Comparar com o aspeto atual", e no menu "Mais" do telemóvel: três botões ("Versão", com `aria-pressed`) e, por baixo, a versão ativa ("A comparar: V2 funcional"). Desde 12/10/2026 substitui o antigo interruptor "Ver a V2". **Atual** e **V2** comportam-se exatamente como o interruptor desligado e ligado; a **V2 funcional** é descrita em [V2 funcional](#v2-funcional-12102026). A tabela abaixo compara a Atual (antes "V2 desligada") com a V2:

| | V2 desligada (por defeito) | V2 ligada |
|---|---|---|
| Menu | Leads, Clientes | **Pessoas** (no lugar dos dois) |
| Negócios | a lista de sempre, uma coluna por fase | `NegociosV2`: só negócios, por documento |
| Leads e Clientes | `LeadsSimples` e a página de Clientes | `PessoasSimples` |

- A escolha **não é do `Estado`**: vive num `useState` de `PrototipoNegocios.tsx`, gravado em `localStorage` na chave própria `olyvia-prototipo-v2` (`versaoPrototipo.ts`): `"0"` é a Atual, `"1"` a V2 e `"funcional"` a V2 funcional. O valor antigo do interruptor continua a valer (`"1"` abre na V2 e `"0"` na Atual). Não mexe na `VERSAO` e não é apagada por "Repor a demonstração".
- Ao mudar de versão, se a vista atual deixa de existir no menu, o protótipo muda para a equivalente (`vistaEquivalente`): `leads` e `clientes` passam a `pessoas`, e `pessoas` passa a `leads`. Entre a V2 e a V2 funcional a vista mantém-se.
- No **aspeto atual** o seletor não aparece e nenhuma das V2 se aplica.
- Enquanto se cria uma lead com a V2 ligada ("Nova lead" abre `A.novo()`), mostra-se a lista de Negócios de sempre, porque é ela que tem o formulário. Depois de criada, a lead vê-se em Pessoas.

**As regras de desenho, pedidas pelo Ruben:**
- um só botão primário por ecrã;
- texto a 15–16 px;
- alvos de pelo menos 44 px;
- escolher em vez de escrever;
- cor só nos ícones (`FASE_COR` e `BLOCO`), nunca no texto;
- nada de cartões dentro de cartões.

---

## Ficheiros

### Estado e regras (sem React)

| Ficheiro | O que tem |
|---|---|
| `motor.ts` | O modelo de dados (`Estado`, `Negocio`) e os dados de exemplo (`seed()`, incluindo a **Joana Ribeiro**, id 1050, com tudo preenchido). Também tem as **ações** (`acoes()`), o próximo passo (`proximo()`), o cálculo do orçamento (`tot`, `linhaCalc`, `alertas`), o plano da obra (`gerarPlano`), as **visitas** (`criarVisita`, `visitas`), as sugestões automáticas (`derivar`, `sugerir`) e o **portão de fase** (`portao` dentro de `acoes`). |
| `campos.ts` | Os campos de cada fase (`LEAD`, `CONTACTO`, `EXTERIOR`, `INTERIOR`, `AREA`, `ESCOLHAS`, `PROPOSTA`, `FINANCEIRO`, `OBRA`), os campos de cada visita (`grupoVisita(n)`), as regras de obrigatório (`obrigatorio`, `emFalta`) e os **campos à medida** (`AjusteGrupo`, `efetivo`, `camposAjustados`). |
| `setores.ts` | Os modelos de setor para os campos à medida: Remodelação, Climatização (AVAC) e Painéis solares. |
| `catalogo.ts` | Os 41 serviços **reais** da Mudelar vendidos fora dos pacotes, gerados a partir de `operacao-app/tools/planeamento/dados.mjs` (EXTRAS). Os preços são de exemplo. |
| `receitas.ts` | A receita detalhada de cada serviço: equipamentos (amortização), consumíveis e o custo/hora do técnico. São de exemplo, mas batem com o motor (há um teste). |

### Ecrãs (aspeto simples)

| Ficheiro | Ecrã |
|---|---|
| `PrototipoNegocios.tsx` | A raiz: o estado, a gravação, os avisos (toasts), a moldura dos dois aspetos e o encaminhamento entre ecrãs (`S.view`). |
| `HojeSimples.tsx` | O Hoje: o que é mais urgente, depois o resto, e a agenda. A agenda (`agenda()`) vem de `Hoje.tsx`. |
| `NegociosSimples.tsx` | A lista de Negócios, com uma coluna por fase. |
| `filtrosNegocios.ts`, `dashboardNegocios.ts` | A lógica dos filtros e do dashboard de Negócios V2, sem React e sem mudar o `Estado`: `linhasNegocios(S)` (cada negócio com o cartão do Quadro, quando o tem), `selecionarQuadro` (o que o Quadro mostra e o dashboard conta), `selecionarResultados` (os ganhos e os perdidos), os cartões (`cartoesNegocios`) e as barras. Testes em `filtrosNegocios.test.ts`, `dashboardNegocios.test.ts` e `NegociosDashboard.test.tsx`. |
| `PessoasDashboard.tsx`, `NegociosDashboard.tsx`, `NegociosFiltros.tsx` | Os ecrãs dos dois dashboards e a barra de filtros de Negócios. Usam as peças comuns: `Kpi`, `BarrasH`, `Funil`, `Tendencia`, `CaixaGrafico`, `MaisGraficos`, `TabelaAlternativa`, `ChipsFiltros`, `FiltrosPopover` e os tipos de `graficosTipos.ts`. Gráficos feitos à mão em HTML e CSS, **sem biblioteca** (a app tem `recharts`, mas não foi preciso). |
| `NegociosV2.tsx` | A **V2 da lista de Negócios** (10/10/2026), que aparece em Negócios quando o interruptor **Ver a V2** está ligado: só negócios, por fase de documento: Orçamento, Proposta, Contrato, e depois Financeiro (quatro colunas); um negócio sem contrato exigido (venda direta) com a proposta aceite passa direto ao Financeiro. A Obra vê-se em Operações. Lead, Contacto e Visita saem, porque são fases da pessoa. Cada cartão é **um negócio** (nunca um orçamento): mostra o título, "2 orçamentos" quando há mais de um (com cada orçamento e o seu valor), o valor total e o próximo passo; a coluna é a fase do negócio. Uma pessoa pode ter vários cartões (a Carla Nunes tem três). **Um cartão de exemplo** (marcado "exemplo": os ids 90101 a 90109 e o negócio principal das pessoas de exemplo 90201 a 90210, tudo decidido por `semPaginaPropria`, a mesma regra para a marca e para o clique) abre um painel lateral (`NegocioExemploPainel.tsx`, `Sheet` de largura `min(720px, 100vw)`) com o detalhe desse negócio: título, pessoa e papel, estado, valor total, probabilidade de fechar, percurso, "O que falta" e os documentos reais (cada orçamento, a proposta com "inclui N orçamentos" e o contrato com o estado); um perdido mostra o motivo. Não tem botão primário nem ações: só "Fechar" e "Ver a pessoa" (fecha o painel, limpa a pesquisa global, guarda a pessoa na memória de Pessoas com `escolherPessoa` e vai para Pessoas; fica desativado, com a razão em texto, se a pessoa não existir na lista). Os "Próximos passos em atraso" do dashboard também deixam de fora os negócios de exemplo. Esc fecha, o foco entra no título e volta ao cartão. Os cartões da seed continuam a abrir o negócio. A página antiga do negócio (`PaginaNegocio.tsx`) não mudou e ainda tem o passo a passo antigo de seis fases. Desde 11/10 tem **dois separadores**, Quadro (o de sempre) e Dashboard, e uma barra de filtros única (`NegociosFiltros.tsx`); ver "Dashboards e filtros". |
| `negociosDocs.ts` | A lógica da V2, sem React: os cartões (`cartoesV2`, **um por negócio**, vindos de `negociosDe`) e `docFase`, que se reexporta de `negociosApp.ts`. Perdidos, levantamento e obra ficam de fora. Não muda o `Estado`, o `seed()` nem a `VERSAO`. O ficheiro não se chama `negociosV2.ts` porque, no Windows, colide com `NegociosV2.tsx`. |
| `negociosApp.ts` | **A única fonte dos negócios de uma pessoa** (`negociosDe(S, nome)`): o negócio da seed, mapeado para o tipo `NegocioApp`, mais os de exemplo. Também tem `docFase` (a coluna da V2), `ehGanho` (a regra do ganho), `valorNegocio` (a soma dos orçamentos), `documentosDoNegocio` (os documentos reais: cada orçamento, a proposta e o contrato) e `resumoDoc`. Cada `NegocioApp` guarda o `deal` no formato do motor (o real, ou uma cópia do negócio base nos exemplos), e é com ele que se calculam o percurso, o estado e o próximo passo, sem duplicar lógica. |
| `exemplosDocs.ts` | A tabela tipada dos negócios de exemplo por pessoa (ver "O modelo do negócio"): ids 90101 a 90109, marcados `demo`, que não existem no `Estado`. Só dados. |
| `LeadsSimples.tsx` | A página de **Leads** (menu "Leads", antes de Clientes, com a V2 desligada; o aspeto atual não a tem): lista curta por urgência (pesquisa, quatro chips e "Só as minhas", um só botão "Nova lead" que abre o formulário de novo negócio em Negócios) e, ao escolher uma lead, a ficha na mesma página, sem diálogo. A ficha tem contactos (Ligar, WhatsApp, Email), um botão com o próximo passo e quatro separadores: **Negócios** (os cartões da V2, com os de exemplo), **Informação** (com "Marcar como perdida"), **Submissões e registos** e **Histórico**. A ficha (`FichaLead`) e a linha (`LinhaLead`) são só desta página: desde 10/10 a página de Pessoas tem as suas (`PessoaFicha.tsx` e `PessoaLinha.tsx`). |
| `leadsDocs.ts` | A lógica dos Leads, sem React e sem mudar o `Estado`: quem é lead (pessoa, agrupada por nome, sem negócio em Financeiro ou Obra nem contrato assinado, e sem perdidos; **esta é a regra antiga, que a página de Leads V1 mantém**: a página de Pessoas tem a sua própria regra, por negócio ganho, em `pessoasDocs.ts`), a ordem por urgência, os filtros, o "há quanto tempo" (com um "hoje" fixo, 10/10/2026) e a informação de contacto e local. A origem, as submissões e os registos à mão vêm de `toquesDocs.ts`. Testes em `leadsDocs.test.ts`. |
| `PessoasSimples.tsx` | A página de **Pessoas** (só com a V2 ligada), refeita a 10/10/2026 para ser **lista primeiro**. É só a casca: guarda o estado (separador, pesquisa, filtros, ordem, pessoa aberta e separador da ficha, numa variável de módulo que `esquecerPessoas` apaga em "Repor a demonstração") e liga a lista ao painel. **Ninguém vem escolhido por defeito** e já não há painel "Escolhe uma pessoa": a lista ocupa a largura toda (até 1600 px) e, ao clicar numa pessoa, abre-se a ficha num painel. Ao abrir um negócio e voltar, o painel reabre na mesma pessoa e no mesmo separador (e com o mesmo negócio escolhido no separador Negócios); o foco **não** regressa a nenhuma linha, porque a página desmontou. |
| `PessoaLista.tsx`, `ListaTopo.tsx`, `PessoasFiltros.tsx` | A página de Pessoas tem **dois separadores principais**, Dashboard e Lista (a **Lista** por defeito), e **uma só barra de filtros** que vale para os dois. Cabeçalho: (1) "Pessoas", os separadores shadcn `Tabs` Dashboard e Lista e "Nova lead" (secundário); (2) pesquisa, os separadores Leads, Clientes e Todos com contagens (14, 5 e 21; Todos inclui as perdidas) e o botão "Filtros" (`Popover` com Ordenar, 12 selects nativos com etiqueta e os interruptores Voltou a contactar, Com visita, Atrasadas, Com negócio novo em curso e Só as minhas); (3) os chips rápidos Todas, Por contactar, Atrasadas, **Perdidas** e Só as minhas (nos clientes só Todas e Atrasadas), cada um com quantas pessoas dá; (4) os **filtros ativos** como chips removíveis ("Tirar o filtro: Distrito: Lisboa") com "Limpar tudo", e o contador de resultados (`aria-live`). Há uma segunda região `aria-live`, invisível, que anuncia o que um cartão ou uma barra do dashboard fez ("Lista filtrada por Lisboa: 7 pessoas"). O estado vazio, o "Limpar filtros" e a nota única "Exemplo" no fim da lista mantêm-se. |
| `PessoaTabela.tsx`, `PessoaLinha.tsx` | As linhas. Em lg e acima uma tabela densa (shadcn `Table`, `th scope="col"`, legenda só para leitores de ecrã) com uma linha de cerca de 56 px por pessoa e sete colunas: Pessoa (avatar, nome, Lead ou Cliente), Serviço · localidade, Etapa (ícone e palavras: Por contactar, Contactada, Com visita, "Negócio · proposta", Cliente ou "Perdida · Preço"), **Formulário** (o do primeiro toque ou "Registada à mão"), Último contacto ("há 4 dias" ou "sem contacto há 10 dias", com o selo do resultado da última chamada), Próximo passo (com o alerta "Atrasada" em ícone e texto) e Valor (leads: o que está em orçamento ou "—"; clientes: o contratado). A célula do nome tem **um botão** (o elemento acessível) e a linha toda é clicável; por baixo do nome, pequenas: Lead ou Cliente, "Empresa", MQL ou SQL, "Atrasada", "exemplo" e, derivado, "Voltou a contactar". Abaixo de lg a tabela vira cartões de três linhas, sem scroll horizontal (`useDesktop.ts` diz se o ecrã é lg; sem `matchMedia` conta como pequeno). A 1440x900 a primeira linha começa a cerca de 180 px do topo e cabem as primeiras pessoas (a lista tem agora 21, com as de exemplo; **estimativa pela soma das alturas, não medida no ecrã**). |
| `toquesDocs.ts` | Os **toques** de cada pessoa (11 pessoas da seed, mais as 10 de exemplo de `pessoasExemplo.ts`): cada vez que entrou em contacto, online por formulário ou registada à mão. Um toque tem via, formulário, origem (da lista da empresa), canal (o mapa fixo: Meta Ads e TikTok Ads = Redes sociais pagas; Google Ads = Pesquisa; Outdoor, Panfleto e Feira = Offline; Influencer e Indicação = Parcerias; o resto Outros), campanha, UTM em bruto (com `gclid`, `fbclid`…), data, campos preenchidos, estado de revisão, motivo e aviso de conflito. Puro, determinístico e **de exemplo**: calcula-se a partir do nome, da linha, da origem, dos campos e da data de cada negócio, com uma tabela por pessoa para a variedade (Google Ads, Meta Ads, Indicação, chamada, Outdoor por QR, Site, uma UTM de TikTok "por mapear", uma lead que voltou por outra campanha, e um conflito de email e telefone). Não toca no `Estado` nem na seed. Testes em `toquesDocs.test.ts`. |
| `PessoaPainel.tsx` | O painel lateral com a ficha (shadcn `Sheet`, a deslizar da direita, largura `min(760px, 100vw)`, ecrã inteiro no telemóvel): ao abrir, o foco vai para o nome da pessoa (o título do painel); Esc e "Fechar" fecham e devolvem o foco à linha da pessoa; enquanto o painel está aberto, os avisos (toasts) passam para dentro dele (`alvoAvisos`, num portal), porque o Radix esconde o resto da página; as setas "Anterior" e "Seguinte" (com `aria-label` com o nome) passam à pessoa vizinha da lista sem fechar, com a posição "3 de 8" (`vizinhasDe` em `listaDocs.ts`). Como a ficha é recriada a cada pessoa, o foco volta à seta usada (ou ao nome, se ela já não puder usar-se). O botão X de série do `Sheet` fica escondido (está em inglês); o painel tem o seu "Fechar". |
| `PessoaFicha.tsx`, `FichaCabecalho.tsx` | A ficha no painel. O cabeçalho tem no máximo três faixas: (1) avatar, nome, "Lead · Por contactar · Amadora", a etiqueta "Atrasada" junto ao nome (na lista, também junto ao nome) e as setas e Fechar; (2) Ligar, WhatsApp e Email (secundários, com ícone e rótulo, só ícone com tooltip num ecrã estreito) e o botão primário do próximo passo, que quebra para baixo em vez de ficar cortado; (3) as cinco etapas da pessoa (Lead, Contacto, Visita, Negócio, Cliente; ícones de `IconeFase` e `UserCheck` para Cliente) numa linha compacta (`.etapas` em `prototipo.css`: o nome de cada etapa a partir de 560 px, senão só os ícones e o nome da atual por baixo). A faixa de factos e os avisos passaram para o Resumo. Separadores shadcn: Resumo, Negócios, Entradas, Atividade e, nos clientes, Contratos e documentos; o cabeçalho e os separadores ficam fixos e o conteúdo rola. |
| `SepNegocios.tsx`, `NegocioBloco.tsx`, `iconeNegocio.ts` | O separador Negócios, em **mestre-detalhe**: à esquerda a lista simples dos negócios da pessoa (cada linha é um botão com `aria-pressed` quando o detalhe está ao lado, e `aria-expanded` com `aria-controls` quando está por baixo, nunca os dois: ícone do negócio, serviço como título, estado em palavras (Em preparação, Orçamento, Proposta, Contrato, Financeiro, Concluído, ou Perdido com o motivo, a cinzento; `estadoDe`), "2 orçamentos" quando há mais de um e o valor total ou "Sem valor ainda"; **um item por negócio**); ao clicar, o detalhe aparece **ao lado** (a partir de 640 px de largura do separador, por container query) ou por baixo, com o foco nele. Com **um só** negócio, vem escolhido; com vários, ao lado abre por defeito o **mais avançado ainda em curso e não perdido** (Financeiro, Contrato, Proposta, Orçamento, Em preparação; em empate, o primeiro; se todos forem perdidos ou concluídos, o primeiro) e, com o detalhe por baixo da lista, nenhum (`negocioPorDefeito`, `negocioMaisAvancado`). O detalhe tem estado, valor, probabilidade de fechar (exemplo), o próximo passo (botão), o percurso Levantamento, Orçamento (com "(2 orçamentos)" quando são vários), Proposta, Contrato (só se exigido) e Financeiro numa linha fina (a partir de 560 px; senão lista) com o atual em texto e ícone e a marca "Ganho" no passo em que a pessoa passa a cliente, "O que falta para o orçamento" (depois, para o contrato, para fechar a venda ou para o pagamento) e "Documentos" (ícone por tipo): a lista REAL do negócio, com cada orçamento (título e valor), a proposta ("inclui 2 orçamentos" e o estado) e o contrato (estado, só se exigido); sem nenhum documento diz quando aparecem. Um negócio perdido não tem próximo passo, percurso nem "o que falta": mostra o estado "Perdido", o motivo e os documentos. O **ícone do negócio** é o `Handshake` do lucide, o mesmo do item "Negócios" do menu lateral: vem de `iconeNegocio.ts`, que o menu também usa, para não divergirem. |
| `filtrosPessoas.ts`, `dashboardPessoas.ts` | A lógica dos filtros e do dashboard de Pessoas, **sem React e sem mudar o `Estado`**. `filtrosPessoas.ts`: `FiltrosP` (os 19 filtros), `linhasDe(S)` (cada pessoa enriquecida uma vez: dias desde que chegou, origem, canal, formulário, resultado do último contacto, voltou, distrito, etapa, valor em jogo e contratado), `selecionar`/`listaP` (a lista como se vê), os chips rápidos, `chipsAtivos` e as opções dos selects. `dashboardPessoas.ts`: os cartões de cada separador, o funil, as entradas por dia, as barras por formulário, origem e canal, distrito, resultado do contacto, motivo da perda e pessoa ou empresa. Testes em `filtrosPessoas.test.ts` e `dashboardPessoas.test.ts`; a interface em `PessoasDashboard.test.tsx`. |
| `listaDocs.ts` | As peças puras novas, sem React: a pessoa vizinha e a posição (`vizinhasDe`, `posicaoTexto`, sem dar a volta nos limites), o texto do último contacto (`contactoTexto`), as cinco etapas da pessoa (`ETAPAS_PESSOA`, `etapaPessoa`) e a etapa em palavras (`etapaTexto`), o valor da coluna por papel (`valorColuna`) e o negócio escolhido por defeito (`negocioPorDefeito`, `negocioMaisAvancado`). Testes em `listaDocs.test.ts`; a página inteira tem um teste de interface em `PessoasSimples.test.tsx`. |
| `FichaResumo.tsx` | O separador Resumo, **numa só coluna**: próximo passo e prazo (com a visita, se houver), avisos (só se houver), contacto (telefone, email, morada, **distrito**, e numa empresa a pessoa de contacto e o NIF da empresa; o NIF existe na lead e no cliente), origem (origem, canal, campanha, via de entrada e formulário), "Sobre a pessoa" (saúde com barra e "exemplo", último contacto com o resultado, comercial, criada, tipo de cliente, contacto preferido; `factosResumo`), 3 notas no máximo e "Marcar como perdida" (só nas leads em curso, com a confirmação no lugar do botão, que pede o motivo da perda: `MarcarPerdida.tsx`). Numa lead perdida a secção "Perdida" mostra o motivo e não há próximo passo. O aviso "Voltou a contactar" entra nos Avisos. Sem cartões dentro de cartões. |
| `FichaListas.tsx` | Os separadores que são listas: Negócios (da lista de negócios, ver `SepNegocios.tsx`), Entradas (os toques de `toquesDocs`), Atividade (histórico, chamadas, emails e notas numa só linha do tempo) e Contratos e documentos (a mesma lista de documentos de cada negócio mais a fatura e o recibo, com pago e por pagar, de exemplo). |
| `perfilDocs.ts` | Os dados de cada pessoa, sem React e sem mudar o `Estado`: `perfilDe` (email, telefone, morada completa, distrito, NIF (os clientes, as empresas e algumas leads de exemplo), comercial, criada, último contacto e dias sem contacto, saúde, visita, notas, chamadas e emails, origem e prazo), `atividadeDe` (sem os eventos de obra), `pagamentoDe`, `probabilidade`, o percurso do negócio (`percursoDe`, com e sem contrato, e a marca de ganho), `estadoNegocio`, `estadoCurto` e `factosResumo`. Tudo o que não vem da seed é de exemplo, calculado por regras fixas a partir do nome, das fases e das datas. Testes em `perfilDocs.test.ts` e `modeloPessoas.test.ts`. |
| `pessoasDocs.ts` | A lógica de Pessoas, sem React: a pessoa tem cinco etapas (Lead, Contacto, Visita, Negócio, Cliente) e só é **cliente** com pelo menos um negócio **ganho** (`ehGanho`): o contrato assinado, ou, quando o negócio não exige contrato (`orc.vendaDireta`), a proposta aceite; um negócio em Financeiro ou Obra já passou pelo ganho e um perdido nunca ganha. É **lead** a pessoa sem nenhum negócio ganho (com um negócio em curso está na etapa Negócio). Quem já é cliente continua cliente para sempre: um negócio novo dele leva "Novo negócio em curso" e não o faz voltar à etapa Negócio. A **obra não entra** na página Pessoas (é um fluxo posterior, das Operações): a fase 5 aparece só como "Concluído". Os negócios de cada pessoa (`PessoaApp.todos`) vêm de `negociosDe` (seed mais exemplos); **só os negócios da seed decidem o papel** (lead ou cliente), por isso nenhum exemplo muda ninguém de papel. Também agrupa as pessoas pelo nome a partir de `dealsPessoas.ts` (a seed mais as de exemplo; quem só tem negócios perdidos é uma **lead perdida**: `perdidasApp`, `PessoaApp.perdida`), e tem os dados do cliente (valor dos negócios ganhos, n.º de contratos, último negócio) e os contratos e documentos (contrato, fatura e recibo, derivados de `fin`). Também ordena (`ordenarPessoas`: urgência, mais recentes, valor) e filtra por origem e comercial (`filtrarPessoas`). Testes em `pessoasDocs.test.ts`. |
| `NegocioSimples.tsx` | A página do negócio: o cabeçalho, os passos da fase (um de cada vez), as fases feitas, o botão "Ouvir" (leitura em voz alta) e a mensagem de fase concluída. |
| `PaginaNegocio.tsx` | **`passosDaFase(ctx, d, simples)`**: os passos de cada fase, partilhados pelos dois aspetos. Também tem `BotaoFase` e o aspeto atual. |
| `CamposFase.tsx` | Os campos: `Campos` (os blocos), `CampoSimples` (botões, contador, datas rápidas), `Assistente` (o acordeão do aspeto atual) e o ícone de cada bloco (`BLOCO`). |
| `Visitas.tsx` | As várias visitas de um negócio, cada uma com os seus campos. |
| `ServicosCatalogo.tsx` | Os "serviços necessários": os do pacote e os juntados do Catálogo, com pesquisa e filtro por ofício. |
| `OrcamentoSimples.tsx` | O orçamento: total, margem e linhas. Ao tocar numa linha abre `CustoServico`. |
| `CustoServico.tsx` | O detalhe do custo de um serviço: técnico, equipamentos, consumíveis e estrutura. |
| `DocsCliente.tsx` | A proposta, o contrato e a fatura como documentos, com o IVA a **6% na mão de obra e 23% nos materiais** (`totais()`). Também tem a partilha: link, email, WhatsApp, ver como o cliente e imprimir. |
| `FasesSimples.tsx` | As fases Financeiro e Obra. |
| `OperacoesSimples.tsx` | As Operações (o plano da obra) e o Inventário. |
| `OutrosSimples.tsx` | Catálogo, Clientes, Marketing e Definições. |
| `CamposEditor.tsx` | O editor dos campos à medida, em Definições → Campos e formulários. |
| `Localizacao.tsx` | A morada pela localização do dispositivo. Usa o OpenStreetMap/Nominatim. |
| `pecas.tsx` | As peças comuns: `Ctx`, `IconeFase`, `Chip`, `Progresso`, `fazer`, e outras. |
| `prototipo.css` | Os ecrãs antigos (classes `.pg`), os tokens do aspeto simples (`.calma`) e a leitura fácil (`.leitura`). |
| `motor.test.ts` | Os testes: o fluxo da Ana Martins da Lead à Obra, a aprovação da Direção, os campos e as visitas, o exemplo completo, as receitas, o IVA e os campos à medida. |

---

## O modelo do negócio

- Um **negócio** é um serviço (o título) com **fases**: Levantamento, Orçamento, Proposta, Contrato (só se o negócio o exige) e Financeiro.
- Na fase de orçamento tem **um ou mais orçamentos** (cada um com título e valor). No fim, os orçamentos geram **uma só proposta** (por gerar, enviada, aceite) e, se o negócio exigir, **um contrato** (por gerar, enviado, assinado).
- **Venda direta**: o negócio não exige contrato; o ganho é a proposta aceite (percurso de quatro passos). Com contrato, o ganho é o contrato assinado (cinco passos).
- **Perdido**: fica a cinzento, com o motivo, e não conta para valores nem para o papel da pessoa.
- Um **orçamento nunca é um negócio**: a V2 e a ficha têm um cartão ou um bloco por negócio, e os orçamentos aparecem dentro dele.
- A pessoa só passa a cliente com um negócio **ganho**, e só contam os negócios da seed.

### Dados de exemplo (negócios)

Os negócios de exemplo vivem em `exemplosDocs.ts` e juntam-se ao negócio real (o da seed) em `negociosDe`. Não tocam no `seed()`, no motor nem na `VERSAO`; cada um é uma cópia do negócio base da pessoa e **não tem página própria nem ações**: na V2 de Negócios abre um painel só de leitura (ver `NegocioExemploPainel.tsx`). O que mostram:

| Pessoa | Negócio | Fase | Orçamentos | Proposta | Contrato |
|---|---|---|---|---|---|
| Carla Nunes (lead) | Cozinha (seed) | Proposta | 1 | enviada | exigido |
| | Casa de banho e pintura | Orçamento | 2, a compor | por gerar | exigido |
| | Varanda fechada | Proposta | 2 | enviada | venda direta |
| Sérgio Pinto (lead) | WC (seed) | Proposta | 1 | enviada | venda direta |
| | Pintura interior | Orçamento | 1 | por gerar | exigido |
| Tiago Almeida (cliente) | Cozinha (seed) | Financeiro | 1 | aceite | assinado |
| | Climatização e isolamento | Financeiro | 2 | aceite | venda direta |
| | Pintura exterior | Orçamento | 1 | por gerar | exigido |
| Joana Ribeiro (cliente) | WC principal (seed) | Concluído | 1 | aceite | assinado |
| | WC de serviço e lavandaria | Contrato | 2 | aceite | enviado |
| Marta Lima (cliente) | WC (seed) | Concluído | 1 | aceite | assinado |
| | Cozinha nova | Orçamento | 1 | por gerar | exigido |
| | Pavimento exterior | Perdido (preço) | 1 | enviada | exigido |
| Rita Sousa (lead) | Cozinha nova (seed) | Em preparação | 0 | por gerar | exigido |
| | WC social | Perdido (adiou) | 1 | enviada | exigido |

Daqui sai a cobertura da V2: Orçamento, Proposta, Contrato e Financeiro têm cartões; há negócios de um orçamento em Orçamento e em Proposta e de vários em cada uma das quatro colunas; há uma venda direta (quatro passos) e um negócio com contrato (cinco); dois perdidos; seis pessoas com dois ou mais negócios. As 8 leads e os 3 clientes da seed continuam com o mesmo papel (com as pessoas de exemplo novas, ver a secção seguinte, são 14 leads e 5 clientes). Testes em `negociosApp.test.ts`.

### Pessoas: os sete campos novos e as pessoas de exemplo

A lista e a ficha de Pessoas ganharam sete campos (aprovados na lista de campos por entidade). **Lead e cliente são papéis da mesma entidade**: a ficha tem os mesmos campos nos dois, e o papel só decide o que já existe para mostrar (por exemplo, o motivo da perda só aparece numa lead perdida).

| # | Campo | Onde aparece | Quem o mostra (exemplos) |
|---|---|---|---|
| 1 | **Formulário** (por onde entrou) | Coluna "Formulário" da lista, no lugar de "Origem" (tabela e cartões): o nome do formulário do primeiro toque, ou "Registada à mão". A campanha **não** aparece na lista, só na ficha (Resumo > Origem e Entradas). O filtro Origem do popover mantém-se. | Todas. "Registada à mão": Manuel Costa, Hugo Matos, Joana Ribeiro, Teresa Antunes, Duarte Gouveia, o Condomínio. |
| 2 | **Resultado do último contacto** | Selo em texto, com ícone, junto do "há N dias" (lista) e no Resumo, em "Sobre a pessoa > Último contacto". É o resultado da última chamada das interações (perfilDocs), por isso é coerente com elas; sem chamadas diz "Sem contacto". | Sem contacto: Ana, Pedro, Rita, Inês Carvalho. Atendeu · ligar mais tarde: Manuel, Sérgio, Ricardo Nogueira. Não atendeu: Bruno Teixeira. Atendeu · interessado: as restantes. |
| 3 | **MQL ou SQL** | Etiqueta em texto por baixo do nome (lista) e junto ao papel no cabeçalho da ficha; o significado ("qualificada para marketing" ou "para vendas") está num texto só para leitores de ecrã na etiqueta e, em texto visível, no Resumo > Sobre a pessoa > Qualificação (sem `title`, que só aparece com o rato). Só alguns exemplos. | MQL: Pedro Lopes, Ricardo Nogueira. SQL: Carla Nunes, Filipa Moreira. SQL histórico num cliente: Armando Figueiredo. |
| 4 | **Voltou a contactar** | Por baixo do nome (lista) e nos Avisos do Resumo. **Derivado**, não escrito à mão (`voltouAContactar`, em `camposPessoa.ts`): é verdade quando há um toque online de uma pessoa já existente (estado "Associada à ficha") depois do último contacto da equipa (o email de boas-vindas é automático e não conta), ou sem nenhum contacto. Desaparece quando alguém regista um contacto. Só as leads em curso. | Com aviso: Inês Carvalho (sem nenhum contacto) e Ricardo Nogueira. Sem aviso, apesar de ter voltado a preencher: Carla Nunes (a proposta foi depois). |
| 5 | **Distrito** | Resumo > Contacto, a seguir à morada (que inclui a localidade), e como uma das respostas de cada entrada por formulário (Entradas). Derivado da localidade por um mapa fixo (`distritos.ts`); sem localidade no mapa diz "Por indicar". | Seed: Lisboa e Setúbal. Novas: Lisboa, Setúbal, Porto, Braga, Faro e Coimbra. |
| 6 | **Motivo da perda** | Na lead perdida: etiqueta "Perdida" junto ao nome e secção "Perdida" com o motivo no Resumo; na lista, etapa "Perdida · Preço". Escolha fixa: Preço, Adiou, Foi para outra empresa, Sem resposta, Não era o que procurava. O chip **Perdidas** (separadores Leads e Todos) mostra só as perdidas; a lista de Leads não as mostra por defeito e Todos mostra-as. "Marcar como perdida" pede o motivo num `select` nativo com rótulo. Uma pessoa perdida não tem botão de próximo passo. | Teresa Antunes (Preço) e Duarte Gouveia (Adiou). |
| 7 | **Pessoa ou empresa** | Numa empresa o nome mostrado é o da empresa (em toda a página e na V2 de Negócios), a etiqueta "Empresa" fica junto ao papel (lista e ficha) e o Contacto mostra a pessoa de contacto e o "NIF da empresa". O NIF (de exemplo) existe na lead e no cliente, mas só nalguns exemplos (nas leads: as duas empresas e a Filipa Moreira; os clientes têm sempre). | Condomínio Jardins do Tejo (lead), Modas Aurora (lead, retalho), Hotel Praia Dourada (cliente, hotelaria). |

**Altura da linha da lista (estimativa, sem browser).** O nome fica numa só linha (cortado com o nome completo no `title`) e por baixo dele os selos (papel, Empresa, MQL ou SQL, Atrasada, exemplo e "Voltou a contactar") estão **todos na mesma lista que quebra**, nunca em mais de duas linhas; o resultado do último contacto fica na mesma linha do "há N dias" (quebra só se faltar largura). A coluna Pessoa passou de 19 % para 26 % (Serviço 13, Etapa 11, Formulário 10, Último contacto 16, Próximo passo 13, Valor 11). Com letra de 15 px e linhas de 20 px: nome 20 + uma linha de selos 20 + 8 de margem, mas o botão tem 44 px, por isso **cerca de 52 px** na maioria das linhas; com "Voltou a contactar" (Inês Carvalho e Ricardo Nogueira) os selos passam a duas linhas e a linha fica nos **cerca de 68 px**. O objetivo de 56 a 64 px só se cumpre nas linhas sem "Voltou a contactar"; abaixo de 15 px não se desce. É uma conta feita à mão: **por confirmar no browser**.

**Marcar como perdida.** A confirmação tem o motivo escolhido num componente que só existe enquanto se confirma (nasce sempre vazio). **Esc cancela só a confirmação** (o painel fica aberto e o foco volta ao botão "Marcar como perdida"); um segundo Esc fecha o painel. Numa pessoa de exemplo a frase não promete o "Anular" e a confirmação fica limpa depois de guardar o motivo.

**Onde vivem os dados.** Só em camadas de exemplo, sem tocar em `motor.ts`, no `seed()`, na `VERSAO` nem na forma do `Estado`:

- `pessoasExemplo.ts`: a tabela tipada das **10 pessoas novas** (`PESSOAS_EXEMPLO`), os campos extra das pessoas da seed (a qualificação de Pedro e Carla) e o resultado de contacto que varia (`RESULTADO_SEED`).
- `dealsPessoas.ts`: cada pessoa nova é um **negócio copiado de um negócio base da seed**, com número único a partir de **90201** (os 90101 a 90109 são dos negócios extra de `exemplosDocs.ts`; os extra das pessoas novas começam em 90301). Faz-se de novo em cada chamada e **nunca se escreve no Estado**. É a fonte única: `negociosDe`, `toquesDe`, `cartoesV2` e a lista de pessoas leem daqui.
- `perdaDocs.ts`: os cinco motivos e a **memória de módulo** onde o motivo escolhido na ficha fica guardado. **Só dura a sessão** (não é o Estado, que se grava no `localStorage`): ao recarregar, uma lead da seed marcada como perdida continua perdida mas o motivo passa a "Motivo não registado". "Repor a demonstração" também a limpa (`esquecerPessoas`).
- `camposPessoa.ts`: `formularioDe`, `resultadoContacto` e `voltouAContactar`. `SelosPessoa.tsx`: os selos e as etiquetas. `MarcarPerdida.tsx`: a confirmação com o motivo.

**Sem página própria.** Os negócios de exemplo (os extra e os das pessoas de exemplo) não existem no Estado, por isso **não abrem nenhum negócio**: o clique num cartão de exemplo na V2 de Negócios abre o painel de exemplo (ver `NegocioExemploPainel.tsx`), e na ficha o próximo passo e os documentos desses negócios são só texto, com a nota "Negócio de exemplo: sem ações". O botão principal da ficha de uma pessoa de exemplo diz **"Ver negócios"** e muda para o separador Negócios, onde já vem escolhido o negócio mais avançado. Cada pessoa nova usa um negócio base diferente da seed para copiar a linha, o dono e o orçamento (menos dois pares: o Hotel Praia Dourada e o Armando Figueiredo repetem o 1027 (cozinha) porque a seed só tem dois negócios de cozinha com orçamento para três pessoas que o precisam, e o Bruno Teixeira e a Modas Aurora repetem o 1038 (casa de banho) porque só há quatro de casa de banho sem orçamento para cinco; por isso a Inês Carvalho tem o mesmo comercial da Ana Martins). "Marcar como perdida" numa pessoa de exemplo só grava o motivo na memória da sessão (a seed não muda). Quem quiser que os negócios de uma destas pessoas abram uma página tem de os pôr na seed (e subir a `VERSAO`). `semPaginaPropria` (em `negociosApp.ts`) diz quais são.

#### As pessoas de exemplo novas (todas marcadas "exemplo")

| Pessoa | Papel | Empresa? | Distrito | Formulário | Resultado | MQL/SQL | Voltou | Perdida | Negócios e fases |
|---|---|---|---|---|---|---|---|---|---|
| Inês Carvalho | Lead | não | Setúbal | Site · pedido de orçamento | Sem contacto | não | **sim** | não | WC (em preparação) |
| Bruno Teixeira | Lead | não | Braga | Casa de banho nova (Meta Ads) | Não atendeu | não | não | não | WC social (em preparação, contactada) |
| Filipa Moreira | Lead | não (com NIF) | Porto | Cozinha nova (Google Ads) | Atendeu · interessado | SQL | não | não | Cozinha (visita marcada para sex 16/10) |
| Ricardo Nogueira | Lead | não | Faro | Site · pedido de orçamento | Atendeu · ligar mais tarde | MQL | **sim** | não | WC suite (em preparação, contactada) |
| Condomínio Jardins do Tejo | Lead | **sim** (condomínio) | Lisboa | Registada à mão | Atendeu · interessado | não | não | não | Casas de banho das partes comuns (Proposta enviada, com contrato) |
| Modas Aurora | Lead | **sim** (retalho) | Braga | Site · pedido de orçamento | Atendeu · interessado | não | não | não | WC dos funcionários (em preparação, contactada) |
| Teresa Antunes | Lead perdida | não | Lisboa | Registada à mão | Atendeu · interessado | não | não | **Preço** | Cozinha (perdida depois da proposta enviada) |
| Duarte Gouveia | Lead perdida | não | Coimbra | Registada à mão | Atendeu · interessado | não | não | **Adiou** | WC principal (perdida depois da visita feita) |
| Hotel Praia Dourada | Cliente | **sim** (hotelaria) | Faro | Site · pedido de orçamento | Atendeu · interessado | não | não | não | Cozinha do restaurante (contrato assinado, Financeiro) e Casas de banho dos quartos (Orçamento, por gerar) |
| Armando Figueiredo | Cliente | não | Porto | Cozinha nova (Meta Ads) | Atendeu · interessado | SQL histórico | não | não | Cozinha (contrato assinado, Financeiro) |

**Totais com as pessoas novas:** **14 leads** (8 da seed e 6 novas), **5 clientes** (3 e 2) e **2 perdidas**; Todos mostra **21**. As 8 leads e os 3 clientes da seed **mantêm o papel**: só os totais mudam. O papel das novas segue as mesmas regras (`ehGanho`: contrato assinado ou venda direta com proposta aceite; um negócio perdido não conta). Na V2 de Negócios as novas têm um cartão por negócio nas colunas certas (o Condomínio em Proposta, o Hotel em Financeiro e em Orçamento, o Armando em Financeiro), os perdidos ficam de fora e as quatro colunas continuam cobertas. Testes em `pessoasCampos.test.ts` (lógica) e `camposNovos.test.tsx` (ecrã).

---

## V2 funcional (12/10/2026)

**O que é.** Uma terceira versão das duas páginas que a V2 mudou, Pessoas e Negócios, pensada para o **dia a dia de um comercial**: rapidez e menos cliques. Escolhe-se no seletor de versão ("V2 funcional"); o menu é o da V2 (Negócios e Pessoas). As outras páginas (Hoje, Operações, Inventário...) são as de sempre. As regras de desenho mantêm-se: um só botão primário por ecrã ("Guardar", no registo da chamada; nas páginas não há primário, só "Nova lead" secundário), texto a 15–16 px, alvos de 44 px, cor só nos ícones e nada de cartões dentro de cartões.

**Pessoas · dia a dia** (`PessoasFunc.tsx`). Três separadores: **Hoje** (por defeito), **Lista** e **Dashboard** (o `PessoasDashboard` de sempre, com a barra de filtros de sempre).

- **Hoje** (`FuncHojePessoas.tsx`, regras em `funcHoje.ts`): quatro listas recolhíveis (botão com `aria-expanded` e a contagem), cada pessoa **uma só vez**, na lista de maior prioridade, com a razão em texto. Com a seed e os exemplos: **Contactar hoje: 7** (leads por contactar, que voltaram a contactar, que pediram para ligar mais tarde, atrasadas, ou com "Voltar a ligar em" para hoje ou antes), **Visitas esta semana: 2** (visita marcada nos próximos 7 dias, a contar de 10/10), **À espera de resposta: 1** (leads contactadas sem avanço há 7 ou mais dias, e negócios com a proposta enviada há 5 ou mais dias) e **Contratos e faturação: 4** (contrato por assinar, ou negócio em Financeiro sem fatura). Total 14. As perdidas e os adiados não entram. Cada linha: avatar, nome (com "Empresa"), papel, serviço e localidade, a razão ("Sem contacto há 10 dias", "Voltou a contactar ontem", "Visita qui 15/10 · 10:00", "Proposta enviada há 5 dias") e as ações rápidas em botões de ícone com nome e tooltip: Ligar, WhatsApp, Email (links `tel:`, `wa.me` e `mailto:`), Registar chamada e Adiar. A linha toda abre a ficha no painel.
- **Registar chamada** (`FuncRegistos.tsx`, num popover): o resultado (as opções do campo "Resultado" de `campos.ts`), uma nota curta opcional e o próximo passo (Ligar amanhã, Marcar visita, Enviar orçamento, Sem próximo passo, Voltar a ligar hoje); "Guardar". A chamada entra no topo da Atividade ("registado agora"), passa a ser o último contacto ("hoje") e dá o resultado (na lista, na ficha e no Hoje), o aviso "Voltou a contactar" desaparece e a pessoa sai de "Contactar hoje" (menos com "Voltar a ligar hoje"); com "Ligar amanhã" fica adiada para 11/10.
- **Nota** e **Adiar** (na ficha; Adiar também no Hoje e na Lista): a nota entra na Atividade e nas notas do Resumo; Adiar (Amanhã, Em 3 dias, Na próxima semana) muda o próximo contacto e tira a pessoa do Hoje até lá.
- **Lista** (`FuncListaPessoas.tsx`, `FuncTabela.tsx`, `funcLista.ts`): a barra de filtros de sempre e, por cima da tabela, as **vistas rápidas** com contagem (Contactar hoje 7, Visitas esta semana 2, À espera de resposta 1, Voltaram a contactar 2, Sem contacto 4, Perdidas 2, no separador Leads), o menu **Colunas** (Formulário, Etapa, Origem, Último contacto, Próximo passo, Valor; a Origem começa escondida) e **Exportar lista (CSV)**. Os cabeçalhos Pessoa, Último contacto, Próximo passo e Valor ordenam (botão no cabeçalho, `aria-sort`; os vazios ficam sempre no fim). Cada linha tem uma caixa; ao escolher aparece a barra da seleção ("2 selecionadas", "Exportar selecionadas (CSV)", "Limpar seleção").
- **CSV** (`funcCsv.ts`): BOM, ponto e vírgula, aspas só quando é preciso (as de dentro duplicam-se), CRLF, valor com vírgula decimal; colunas Nome, Papel, Empresa, Serviço, Localidade, Distrito, Formulário, Etapa, Último contacto, Resultado, Próximo passo, Valor, Comercial. Descarrega-se com um Blob e um link temporário, e anuncia-se "Exportadas N pessoas".
- **Ficha**: a mesma ficha (`PessoaFicha`), com peças opcionais: a barra de ações fixa no topo (Ligar, WhatsApp, Email, Registar chamada, Nota, Adiar e, nas leads em curso, Marcar como perdida, que leva à confirmação do Resumo), "Copiar" junto ao telefone, ao email e à morada (aviso "Copiado"; se a área de transferência recusar, o texto fica selecionado e diz-se como copiar) e os registos no topo da Atividade.

**Negócios · dia a dia** (`NegociosFunc.tsx`). Três separadores: **Hoje** (por defeito), **Quadro** e **Dashboard** (o `NegociosDashboard` de sempre), com a barra de filtros de sempre a valer para os três.

- **Hoje** (`FuncHojeNegocios.tsx`, regras em `funcNegocios.ts`): **Orçamentos por enviar: 5**, **Propostas à espera do cliente: 4**, **Contratos por assinar: 1** e **A faturar: 4** (Financeiro sem fatura): os 14 do Quadro, cada um numa só lista. Cada linha diz a pessoa, o serviço, o valor e o tempo parado ("Enviada há 5 dias", "Ganho há 24 dias, por faturar"); ações: Abrir (o da seed abre a página do negócio, o de exemplo o painel de exemplo), Ver a pessoa (abre Pessoas funcional com a ficha dela), Ligar e WhatsApp. Ordena-se dentro de cada lista por "Mais parados" ou "Maior valor".
- **Quadro** (`FuncQuadro.tsx`): as quatro colunas, com vistas rápidas (Para enviar 5, À espera do cliente 4, Por assinar 1, A faturar 4, Parados há 7+ dias 3, Com 2+ orçamentos 4), ordem global ou por coluna (valor, tempo parado, nome), densidade Normal ou Compacta (cartões de uma linha), colunas que se recolhem e "Exportar CSV" do Quadro filtrado. **Nenhuma ação muda a fase** (fica para uma fase seguinte).

**Atalhos** (`funcAtalhos.ts`, `useAtalhos.ts`), no Hoje e na Lista de Pessoas e no Hoje e no Quadro de Negócios: ↓ ou j e ↑ ou k movem o foco entre as linhas (as de uma lista recolhida ficam de fora), Enter abre, "/" vai para a pesquisa, Esc fecha o painel ou limpa a pesquisa, "?" abre a ajuda "Atalhos"; no painel, ← ou [ e → ou ] passam à pessoa anterior e seguinte. Nunca disparam num campo de texto, num select, num separador (Tabs) nem dentro dos popovers da V2 funcional, nem com Ctrl, Cmd ou Alt. Há uma dica discreta: "Prima ? para ver atalhos".

**O limite dos registos.** Os registos do dia a dia (chamadas, notas e adiamentos) vivem **só em memória**, numa store de módulo (`diaADia.ts`, lida com `useSyncExternalStore`): **duram até recarregar e só existem na V2 funcional**. Não tocam no `Estado`, no motor, no `seed()` nem na `VERSAO`; a camada aplica-se por cima dos dados derivados (`perfilFunc`, `linhasFunc`), com funções puras que recebem os registos. "Repor a demonstração" apaga-os (e a memória das duas páginas), mas não a versão escolhida.

**O que NÃO muda na Atual e na V2.** Nenhum ecrã da Atual nem da V2 mudou de comportamento: os ficheiros partilhados só ganharam **props opcionais** (por omissão tudo igual): `PessoaFicha` (`extras`), `PessoaPainel` (`extras`), `FichaCabecalho` (`acoes`), `FichaResumo` (`contacto`) e `SepAtividade` (`registados`). `PrototipoNegocios.tsx` trocou o interruptor pelo seletor e encaminha a V2 funcional. Os testes da Atual e da V2 continuam a passar sem mudanças. Testes novos: `funcHoje.test.ts`, `funcNegocios.test.ts`, `funcOrdenar.test.ts`, `funcCsv.test.ts`, `funcAtalhos.test.ts`, `versaoPrototipo.test.ts`, `PessoasFunc.test.tsx`, `NegociosFunc.test.tsx` e `SeletorVersao.test.tsx`.

---

## Dashboards e filtros (Pessoas e Negócios V2, 11/10/2026)

Só estas duas páginas têm dashboard. Os números **batem sempre com as listas**: o dashboard e a lista usam as mesmas pessoas (ou os mesmos negócios), os mesmos filtros e as mesmas regras (`filtrosPessoas.ts`, `filtrosNegocios.ts`). Regra de ouro: **cada cartão e cada barra traz a ação que aplica ao carregar nele, e o número que mostra é o da lista depois dessa ação**. Há testes que o verificam para todos os cartões e barras, em vários conjuntos de filtros. As barras de cada gráfico somam o total de pessoas (ou negócios) que os filtros deixam passar; carregar numa barra junta o filtro e muda para a Lista (ou para o Quadro). Nada disto escreve no `Estado`, no `seed()` nem na `VERSAO`.

### Pessoas: Dashboard e Lista

- **Filtros** (19; popover e chips, sem scroll horizontal da página): pesquisa; período de criação (Tudo, 7, 30 e 90 dias); origem; canal; formulário (inclui "Registada à mão"); comercial; distrito; qualificação (MQL, SQL, Sem, e "MQL ou SQL"); resultado do último contacto; pessoa ou empresa; estado (Ativas, Perdidas); "Já chegou a" (etapa); motivo da perda; Voltou a contactar; Com visita; Atrasadas; Por contactar; Com negócio novo em curso (clientes) e Só as minhas. A etapa, o motivo da perda e o "negócio novo em curso" não estavam no pedido: existem porque os cartões e as barras do dashboard têm de os aplicar. Nos Clientes não valem Por contactar, Com visita, Voltou a contactar nem Perdidas.
- **Memória:** os filtros, o separador (Dashboard ou Lista) e o de papel ficam numa variável de módulo (`Memoria` em `PessoasSimples.tsx`), que "Repor a demonstração" limpa (`esquecerPessoas`).
- **Cartões:** Leads: ativas, por contactar, atrasadas, qualificadas (MQL ou SQL), voltaram a contactar, perdidas. Clientes: clientes, valor contratado, com negócio novo em curso, valor em aberto, novos nos últimos 30 dias. Todos: pessoas, leads, clientes, empresas, perdidas e valor em jogo. Os cartões em dinheiro dizem de quantas pessoas é a soma.
- **Gráficos:** por defeito só quatro, a seguir aos cartões: funil por etapa (Lead, Contacto, Visita, Negócio, Cliente: quantas já chegaram a cada etapa e que parte do passo anterior passou; "Já chegou a" é o filtro que a barra aplica), entradas por dia nos últimos 30 dias (de 10/09 a 10/10, a partir da data em que a pessoa chegou, que é o negócio mais antigo), por formulário e por distrito. O resto está atrás do botão **Mais gráficos** (`aria-expanded`; o estado fica na memória de módulo, em `MaisGraficos.tsx`, e `esquecerPessoas` limpa-o): origem agrupada por canal, resultado do último contacto, **perdidas com estes filtros** (por motivo) e pessoa contra empresa. As perdidas são sempre as perdidas que passam nos filtros, mesmo com o estado vazio, quando a Lista não as mostra: o gráfico di-lo, e a barra aplica o estado Perdidas e o motivo e passa à Lista. A tendência não tem barras clicáveis (um dia não é um filtro): tem um botão "Ver estas N na lista" que aplica o período de 30 dias.
- **Acessibilidade:** cartões e barras são botões (o nome acessível diz o filtro e o resultado: "Filtrar por Lisboa: 7 pessoas"); depois de carregar num cartão ou numa barra o foco passa para o título da Lista (visível quando tem o foco) e a mudança é anunciada; cada gráfico tem título, o número em texto e um botão "Ver como tabela" (`aria-expanded`) com os mesmos números; a tendência é uma imagem com resumo em texto; a cor de destaque só marca a maior barra, e todas dizem o número e a percentagem; os selects são nativos com etiqueta; sem dependência de hover. Sem pessoas, o dashboard diz "Nenhuma pessoa com estes filtros" e oferece "Limpar filtros" (e não desenha gráficos em branco).

### Negócios V2: Quadro e Dashboard

- **Filtros:** os chips rápidos de sempre (Os meus, Todos, Com atraso, Casa de banho, Cozinha) continuam no Estado (`S.filtro`); a pesquisa é a da página; no painel: comercial, fase, tipo (com contrato ou venda direta), número de orçamentos (um, 2 ou mais), valor (até 3.000, 3.000 a 6.000, mais de 6.000), distrito da pessoa, criado (7, 30 e 90 dias), **parado em Orçamento ou Proposta** (há mais de 7 dias, e as faixas 0 a 7, 8 a 14 e mais de 14) e **serviço** (casa de banho, cozinha ou outros: o 9.º filtro não estava no pedido, existe para a barra "Casa de banho contra cozinha" o poder aplicar). Os filtros do painel ficam na memória de módulo (`esquecerNegociosV2`, chamada por `esquecerPessoas`).
- **Cartões (seis):** **No Quadro** (todos os negócios com coluna no Quadro, Financeiro incluído: é o número do cabeçalho "N no Quadro" e das quatro colunas, com os mesmos filtros), **Por fechar** (n e valor: só os que ainda não são ganhos, ou seja Orçamento, Proposta e Contrato por assinar), **Ponderado** (só sobre os por fechar: valor vezes a probabilidade de exemplo de `probabilidadeDe`), **Ganhos** (n e valor), **Conversão** (ganhos a dividir por ganhos mais perdidos; a nota diz quantos de cada) e **Com 2 ou mais orçamentos**. Um negócio ganho (Financeiro, contrato assinado, venda direta aceite) nunca conta em "Por fechar" nem no ponderado: há um teste que o garante. Só "No Quadro" e "Com 2 ou mais orçamentos" são clicáveis, porque são os que têm filtro no Quadro. Os perdidos e o valor médio deixaram de ter cartão (os perdidos vêm na nota da conversão e no gráfico por motivo).
- **Ganhos, perdidos e conversão:** os negócios ganhos e perdidos **não têm coluna no Quadro** e contam-se à parte, **em todo o período** e com os mesmos filtros para os três (pesquisa, serviço, dono, comercial, tipo, orçamentos, valor, distrito e criado; não a fase, o atraso nem o tempo parado). Escolheu-se "todo o período" porque os negócios perdidos não têm data (nem de exemplo nem derivada), e com janelas diferentes a conversão comparava coisas diferentes; o período vem escrito na nota de cada cartão. Quando a fase, "Com atraso" ou o tempo parado estão ligados, os cartões dos ganhos e da conversão e o gráfico dos perdidos dizem "Não depende da fase, do atraso nem do tempo parado."
- **Gráficos:** por defeito quatro, a seguir aos cartões: funil por fase (as quatro colunas, Financeiro incluído; n e valor), casa de banho contra cozinha, com contrato contra venda direta e os próximos passos em atraso (lista curta; passados 5, "e mais N" e um botão que liga "Com atraso" e passa ao Quadro, com o número que o Quadro vai mostrar). Atrás de **Mais gráficos**: valor por comercial (com um só comercial diz-o em texto, "Todos os negócios são do Rúben.", em vez de uma barra a 100 %), faixas de valor, parados em Orçamento e Proposta, e perdidos por motivo. Depois de carregar num cartão ou numa barra o foco passa para o título do Quadro e a mudança é anunciada ("Quadro filtrado por Casa de banho: 5 negócios").
- **O que os dados de exemplo mostram:** todos os negócios são do mesmo comercial (Rúben), por isso "valor por comercial" tem uma só barra; nenhum negócio em Orçamento ou Proposta está parado há mais de 7 dias (o "parado desde" deriva da data de entrada, ou da de envio da proposta), por isso o filtro "mais de 7 dias" dá zero; e só o Pedro Lopes tem atraso na seed, num negócio ainda em levantamento (que não está no Quadro), por isso a lista dos próximos passos em atraso está vazia.

- **Estilo do Inventário, mais leve (só na V2):** Negócios e Pessoas têm o cabeçalho do Inventário, compacto (migalhas "Negócios › Quadro/Lista" e "Pessoas › Lista", título pequeno, ações à direita; em Pessoas "Nova lead" é o único primário, em Negócios nenhum), o resumo numa só linha no subtítulo (Negócios: "14 no Quadro · … € em proposta · 10 por fechar · 60 % de conversão"; Pessoas: "14 leads e 5 clientes, mais 2 perdidas · 4 por contactar · 1 atrasada") e chips de vista rápida com a contagem, numa linha, junto da pesquisa (Negócios: Para enviar, À espera do cliente, Por assinar, Em Financeiro, Parados 7+, Com atraso; Pessoas: os de sempre mais Voltaram a contactar, Com visita e Com negócio novo). Clicar liga ou desliga o filtro e o número é o da lista depois do clique (`filaNegocios.ts`, `filaPessoas.ts`, `ChipsVista.tsx`). Negócios tem ainda o seletor **Quadro | Lista** (a escolha fica na sessão): a Lista (`NegociosLista.tsx`) é uma tabela com uma linha por negócio, ordenável nos cabeçalhos (aria-sort), com a mesma pesquisa e filtros do Quadro; a linha abre o mesmo painel que o cartão. O estilo está em `blocosPagina.css`, com escopo `.pg-root` (tokens do protótipo), por isso a Atual e a V2 funcional não mudam. O Inventário não usa estas peças.

---

## Inventário

Só na **V2** (na Atual e na V2 funcional ficam o item e a vista "Inventário" de sempre) o **Inventário** é **um item do menu lateral único**, no lugar do item antigo: tem o ícone e o estilo dos restantes, um chevron, e abre-se (sozinho ao entrar em qualquer ecrã do inventário, e recolhe fora) para os subitens do mockup `mockup-inventario-ui.html`, indentados com uma linha à esquerda: **Hoje** (48), o grupo **Compras** (Encomendas 3, Fornecedores 8) e o grupo **Armazém** (Existências 13, Movimentos "Novo", Saídas para clientes 7, Receção 3, Contagens 1, Armazéns). Os contadores vêm da base em memória. A mesma estrutura está no **Mais** do telemóvel e o botão **Inventário** da barra de baixo abre-o. Já **não há painel roxo separado nem o item "Inventário completo"**. O "Simular perfil" (que filtra o menu) passou para o rodapé do menu geral e só aparece dentro do inventário. Cada item abre diretamente o ecrã (sem separadores internos). A vista antiga `inventario` do motor (o "Abrir no Inventário" das obras) continua a existir no motor, mas na V2 leva às **Encomendas** do novo inventário. O módulo foi reconstruído **nativamente** (sem iframe, sem browser, sem localhost), com o CSS do mockup copiado com escopo `.inv-root` (`inventario.css`), cujas variáveis `--i-*` apontam para os **tokens do protótipo** (`--background`, `--primary`, `--radius`…): não há paleta nem tema próprios, o claro/escuro vem da app e as folhas e diálogos herdam o mesmo aspeto e dados de exemplo com o dia de hoje fixo em **09/10/2026**. Por decisão do utilizador, no módulo Inventário o mockup manda sobre as regras de desenho do protótipo (texto de 14 px, alvos menores, cor nos selos), com perfil simulado que bloqueia ações, edição na célula, importar e exportar CSV e Receção por código.

- **Uma só interface:** o inventário usa o cabeçalho e a barra superior do protótipo (a pesquisa global "Procurar PO, EC, produto, SKU, EAN, fornecedor…", o interruptor das fontes de dados e o "Repor dados de demonstração" desenham-se, por portal, na barra de cima enquanto se está no inventário), o tema e os tokens do resto. O interruptor de tema do inventário foi retirado. O conteúdo dos ecrãs (KPIs, tabelas, folhas, regras) mantém a estrutura do mockup.
- **Onde vive:** a pasta `inventario/`. A página é `InventarioPagina.tsx` (carregada só quando se abre, com `lazy`). O resto do protótipo não muda: o `Estado`, o `motor.ts`, a `seed()`, a `VERSAO`, o `pecas.tsx` e os componentes `ui` ficaram como estavam.
- **Estado próprio, em memória:** `loja.ts` guarda uma base de exemplo (`useSyncExternalStore`, como o `diaADia.ts`). Cada ação corre numa **cópia** da base e só a substitui se acabar bem: uma regra que recusa (`ErroInv`) não deixa nada a meio. Não grava no `localStorage`. O botão **Repor inventário** (com diálogo) volta aos dados de exemplo; **Repor a demonstração** não lhe mexe.
- **Separadores** (um por área, como no mockup): **Hoje** (fluxo em cinco passos, fila de trabalho com listas já filtradas, POs automáticas, últimos movimentos, "Simular venda assinada"), **Encomendas** (POs com KPI, filtros e ordenação; folha com Linhas, Receções, Guias, Portal, Anulações, Notas e Histórico; receber com repartição EC/stock, não vou receber o resto, aprovar e enviar, reverter com motivo), **Fornecedores** (lista e ficha: resumo e SLA, dados, artigos e preços com preferido, preços por aprovar, catálogo do portal por ligar), **Stock** (por produto ou por armazém, pedidos de transferência, adicionar stock, detalhe do produto), **Movimentos** (o livro, filtros, nota editável, exportar CSV, "Registar movimento" em dois passos), **Encomendas de cliente** (reserva FIFO, o progresso em texto e barra, saída por linha, pedir o que falta, eliminar ou anular o contrato, editar as manuais), **Guias** (anunciado contra recebido, fechar com nota, reabrir, cancelar), **Contagens** (esperado com o movido durante a contagem, resolução por linha, finalizar gera ajustes) e **Armazéns** (uma lista com estatísticas, as definições e o formulário).
- **Regras de desenho cumpridas:** um só botão primário por ecrã (as ações de linha e os diálogos de confirmação não competem), texto de 15 px no mínimo, alvos de 44 px, cor só nos ícones (`Selo`, `Nota`), nada de cartões dentro de cartões, a marca "exemplo" com 15 px. Listas com pesquisa, filtros e ordenação (cabeçalhos com `aria-sort`; abaixo de `lg` cada linha passa a cartão). O detalhe abre numa `Sheet` lateral (largura `min(720px, 100vw)`) e o foco volta à linha ao fechar. Nunca `confirm()` nativo: os diálogos pedem motivo (≥3 caracteres) quando a regra o exige. Os avisos vão para uma região `aria-live` (`AvisoCaixa`), também dentro das folhas e dos diálogos.
- **Teclado** (como nas páginas funcionais): `↓`/`j` e `↑`/`k` entre linhas, `Enter` abre, `/` vai à pesquisa, `Esc` limpa a pesquisa ou fecha a folha, `?` mostra a ajuda. Um só ouvinte para todo o módulo (`useAtalhos`).
- **Regras do motor portadas como funções puras** (sem React; recebem a base e lançam `ErroInv` quando a regra recusa): `stock.ts` (livro de movimentos, custo médio ponderado, transferência em duas pernas), `po.ts` (estado calculado, totais, envio, portal, edição e bloqueios), `ec.ts` (reserva FIFO, atribuição stock/PO/sem fornecedor, pacotes expandidos, saídas, eliminar e anular o contrato, editar as manuais), `receber.ts` (receção parcial com limites, repartição, reverter, passar para stock, anular o resto e desfazer), `guias.ts`, `contagens.ts`, `movimentos.ts` (registar movimento com resultado parcial por linha e avisos), `cadastros.ts` (armazéns, fornecedores, preços, catálogo) e `fornecedores.ts` (SLA). Os filtros das listas estão em `filtros.ts` e os números do Hoje em `contadores.ts`.
- **Testes:** a seed foi comparada com o motor original do HTML (medido a correr o próprio mockup): os números do Hoje, as POs, as ECs, o stock, as reservas, as guias e as contagens batem. Cada regra do `RULES` do mockup tem testes (`regrasStock`, `regrasPo`, `regrasEc`, `regrasCadastros`, `regrasExtra`, `fornecedores`, `filtros`, `seed`), mais `InventarioPagina.test.tsx` (o grupo Inventário só na V2 e a expandir/recolher, subitens e contadores, o item antigo que já não existe, a vista antiga que leva às Encomendas, tema herdado, separadores, receber, motivo, teclado, repor, "um só primário por ecrã").
- **Diferença ao mockup:** o contrato novo da "Simular venda assinada" recebe sempre o número seguinte ao maior que existe (o mockup repetia o CT-2026-043).

**Por portar** (nada disto aparece vazio no menu; o que não está portado não tem separador nem botão):
- o que ainda difere do mockup: o overlay dos diálogos (shadcn/Radix), o título e os selos da folha lateral (`.chips` em vez de `.row`, sem `mono` no título), a linha das fontes de dados no menu lateral, o texto a 14 px e as mesmas cores, raios e fontes do protótipo (em vez da paleta roxa do mockup), e o estado de "linhas abertas" e "Ver eliminados" que não persiste ao sair do ecrã;
- a **Receção por código** (o telemóvel com leitor, o cesto, as leituras rejeitadas e a fila sem rede) e a "câmara": recebe-se na folha de cada encomenda, escolhendo a guia;
- **criar fornecedor / convidar para o portal** (NIF, emails únicos) e a **simulação do portal do fornecedor** (entrada, ficha e catálogo); no Portal da PO só se simula "abre" e "confirma";
- **editar inline** os dados do fornecedor e dos artigos (preço, embalagem, MOQ, prazo) e as células das listas;
- **importar** CSV e exportar exceto os Movimentos; os **PDF** de encomenda, EC e guia (pré-visualização imprimível); a **pesquisa global**; a **duplicar PO** e o portal do fornecedor. O ecrã "Mockup · cobertura" foi retirado (12/10/2026).

---

## Como funciona (o essencial)

- **O estado é um objeto mutável.**
  - Uma ação corre dentro de `run(() => …)`. O `run` grava no `localStorage` e redesenha o ecrã.
  - Nada é imutável: as ações mudam o `S` no sítio.
- **Os campos** são definições (`Def`), e os valores ficam em `d.f[chave]`.
  - Os campos de cada visita usam a chave `v{n}_{campo}`.
  - Os tipos de campo são `escolha`, `sim_nao`, `contador`, `numero`, `texto`, `texto_longo` e `data`.
- **Obrigatório:**
  - Por defeito, tudo é obrigatório, menos o texto longo e os campos marcados `opcional`.
  - Quem decide em cada caso é `obrigatorio(c)`.
- **O portão de fase:**
  - Cada ação que muda de fase chama primeiro `portao(d, grupos, extras)`.
  - Se faltar algo, preenche `d.valida`, abre o negócio e o ecrã marca os campos em falta (`aria-invalid` e "Falta preencher").
- **Sugestões:**
  - `derivar()` preenche respostas a partir de outras. Por exemplo, a tipologia preenche a área, as divisões e as casas de banho.
  - As sugestões ficam marcadas em `d.sug` até alguém as confirmar ou mudar.
- **Campos à medida:**
  - Só se guardam os ajustes por grupo (`S.campos[titulo do grupo]`).
  - `efetivo(S.campos, grupo)` aplica-os, e usa-se nos passos, nos campos, no portão e nas fases feitas.
  - O `titulo` do grupo é a chave estável. O nome que a empresa vê é `nome`.
- **O IVA:**
  - As linhas de serviço são mão de obra, a 6%. As linhas de materiais levam 23%.
  - O desconto reparte-se pelas duas partes.

---

## O que é de exemplo e o que é real

- **Real:**
  - os nomes, ofícios, unidades e horas dos serviços do Catálogo (`catalogo.ts`);
  - os campos da ficha do local e do diagnóstico, que são os da app (`src/lib/campos/catalogo.ts`, no ramo `feat/campos-configuraveis`).
- **De exemplo:**
  - os preços;
  - o custo/hora do técnico (25 €/h);
  - as receitas (equipamentos e consumíveis);
  - os clientes;
  - os links do portal;
  - a empresa nos documentos (NIF 500 000 000).

---

## Backup

O estado do protótipo em **09/10/2026, commit `ec9c43c2`**, ficou guardado de três formas, todas locais neste PC:

1. **Etiqueta git** `backup/prototipo-negocios-2026-10-09`, no repositório local. Ainda não foi enviada para o GitHub.
   - Para ver o código como estava: `git checkout backup/prototipo-negocios-2026-10-09`.
   - Para ver as diferenças de agora: `git diff backup/prototipo-negocios-2026-10-09 -- src/pages/prototipo-negocios`.
   - Para recuperar só um ficheiro: `git checkout backup/prototipo-negocios-2026-10-09 -- src/pages/prototipo-negocios/motor.ts`.
2. **Bundle git** com o ramo inteiro e o histórico: `D:\Olyvia\backups\prototipo-negocios-2026-10-09\prototipo-negocios.bundle`.
   - Funciona sem o GitHub: `git clone -b feat/negocios-prototipo prototipo-negocios.bundle pasta-nova`.
   - Também se pode trazer para um repositório que já existe: `git fetch <caminho>/prototipo-negocios.bundle feat/negocios-prototipo:recuperado`.
3. **Cópia simples dos ficheiros** em `D:\Olyvia\backups\prototipo-negocios-2026-10-09\ficheiros\`.
   - Inclui a pasta `src/pages/prototipo-negocios`, o `public/prototipo/maquetas.html`, o `src/App.tsx` e o `vercel.json`.

O `README.md` dessa pasta explica cada forma.

---

## Notas para quem continua

- **Pessoas (V2): o botão Voltar do navegador sai do protótipo.** A ficha abre por estado, não por rota, e não se mexeu no histórico do navegador (`history.pushState`) por risco com o router. Para regressar à lista fecha-se o painel (Esc ou "Fechar").
- **Pessoas (V2): o que é de exemplo.** Os negócios de exemplo (ver "O modelo do negócio"), a saúde, as notas, os pagamentos, o prazo e as chamadas e emails são inventados; a lista tem um aviso único no fundo e as secções da ficha marcam "exemplo". Ao nível do campo marcam-se o email e o NIF inventados, o "quem vai" da visita por omissão e o tipo de cliente "Particular" por omissão. O bloco Origem e atribuição continua marcado por inteiro, porque mistura toques da seed com dados gerados.
- **Pessoas (V2): sem escolha automática.** A página abre só com a lista; a ficha só abre com um clique (ou ao voltar de um negócio, na mesma pessoa e no mesmo separador). `primeiraDaLista` e o painel "Escolhe uma pessoa" foram retirados.
- **Pessoas (V2): o que é de exemplo no negócio.** A probabilidade de fechar e o tipo de cliente por omissão são de exemplo; o valor estimado só existe quando já há orçamento. "O que falta para o orçamento" deriva da fase e dos grupos de campos do motor (não inventa passos), mas não conta os extras da visita que o motor também valida.
- **Pessoas (V2): sem memoização na lista.** O estado `S` muda no sítio, por isso um `useMemo` com `[S]` ficaria desatualizado. A lista recalcula por render (11 pessoas); o que se evitou foi recalcular o perfil dentro de `atividadeDe` (recebe o `Perfil` já calculado).
- **Pessoas (V2): contraste e leitura fácil.** Os controlos da página usam `BORDA_CTRL` (`hsl(220 10% 45%)`, cerca de 5:1 sobre branco e 4,6:1 sobre o fundo), porque o token global `--input` dá só 1,7:1 e não se mexeu. A classe `.pessoas-leitura` (em `prototipo.css`) reforça o espaçamento da leitura fácil só nesta página, sem alterar a regra global `.leitura`, O painel (`Sheet`) e o painel dos filtros abrem num portal fora de `.calma`, por isso levam as mesmas classes (`classePortal`). O cabeçalho da lista fica fixo com `sticky` dentro do `main`, sem altura fixa. Os avisos (toasts) passaram a z-index 650 para ficarem acima do painel (610) e abaixo dos menus (700).
- **O ramo está 2 commits atrás do `main`.** São mudanças do portal, de 09/10. Antes de levar o protótipo para o `main`, faça merge do `main` aqui.
- **O `vercel.json` abre duas coisas só para `/prototipo/*`:**
  - a localização do dispositivo (`geolocation=(self)`);
  - o Nominatim no `connect-src`.

  O resto da app continua com a localização bloqueada.
- **Os avisos do lint "Fast refresh only works…"** em `pecas.tsx` e `CamposFase.tsx` são esperados, porque esses ficheiros exportam funções. Não são erros.
- **O aspeto atual** já não recebe as novidades mais recentes. Por exemplo, os documentos e o editor de campos só existem no aspeto simples.
- **Ainda por fazer:**
  - os nomes das fases e as medidas configuráveis por setor;
  - modelos de documentos por setor;
  - ligar o protótipo à base de dados (tabelas de faturas, recibos, aprovações, receitas e campos por empresa).

---

## Operações e Financeiro (V2, 13/10/2026)

O lote 1, item 6, de `docs/melhorias-v2-2026-10-13/README.md` (secções 1, 3 e 4.5). Vale para a **V2** e a **V2 funcional**; a **Atual** fica como era. Tudo com dados de exemplo; não se mexeu na `VERSAO` nem no comportamento do `motor.ts`.

### Operações (menu Operações, `v2/OperacoesV2.tsx`)

- **No topo, o Hoje do supervisor:** as tarefas **por validar** e os **atrasos** das obras abertas, cada coisa uma só vez (`hojeSupervisor`); cada linha abre a obra.
- **A lista das obras**, com o estado em texto e ícone (`v2/EstadoObra.tsx`: Plano por aprovar, Aprovado, Em curso, Concluída), as horas, quantas por validar e quantos atrasos.
- **A página da obra** (`v2/ObraV2.tsx`), em secções seguidas, **sem separadores** e sem modais, com ligações "Nesta página":
  - **Plano:** as tarefas com o técnico, as datas, as horas e o estado. Com o plano por aprovar, o **supervisor** e a **data de início** escolhem-se ali (botões; vêm sugeridos do negócio) e os conflitos resolvem-se na linha (Trocar técnico, Adiar). Um só botão primário, o do estado: **Aprovar plano** (escreve `responsavel` e `inicio` no negócio e chama `A.aprovarPlano`), **Arrancar a obra** ou **Registar o fim da obra**.
  - **Validar:** as tarefas que os técnicos deram por feitas. **Validar** na linha; **Rejeitar** abre o motivo na própria linha (botões com os motivos comuns ou texto livre; sem motivo não rejeita). **Validar todas** quando há mais de uma.
  - **Atrasos:** "Registar um atraso" abre na linha: a fase, os dias e o motivo em botões, e o interruptor **Cliente avisado** (que se pode ligar depois em cada atraso).
  - **Previsto contra real:** mão de obra, equipamentos, consumíveis e estrutura. O previsto é a receita (`partes()` do orçamento); o real é **de exemplo** (`v2/realExemplo.ts`, fatores por obra) e o ecrã di-lo. Numa obra em curso compara só a parte feita. Barras cinzentas e números; o desvio em texto com ícone (até 2% é "dentro do previsto").
  - **Materiais:** só leitura, com "Abrir no Inventário".
- O que o supervisor faz (validações, rejeições, atrasos, supervisor e data) vive **em memória** em `v2/estadoV2.ts`, preso ao objeto `Estado` (um `WeakMap`): "Repor a demonstração" recomeça-o, e recarregar a página também. A obra em curso da Marta Lima traz um atraso **de exemplo**. As regras puras estão em `v2/operacoes.ts`.

### Financeiro (fase Financeiro do negócio, `v2/FinanceiroV2.tsx`)

- **A Olyvia não emite faturas** (certificação da AT): a fatura emite-se no programa certificado e **regista-se** aqui: tranche, número, data, valor (vem da tranche) e, opcional, o PDF. O ecrã diz isto numa frase.
- **Várias faturas, uma por tranche** do plano de pagamento do contrato (campo `pagamento`): "50% + 50% no fim" dá **Adiantamento 50%** e **Final 50%**; "30% + 40% + 30%" dá Adiantamento, A meio e Final; "100% na adjudicação" dá uma só. A última tranche leva o resto, para a soma bater com o total com IVA.
- **Validar pagamento** em cada fatura, na linha: a data (Hoje, Ontem ou o calendário), a conta (botões) e a referência. Sai o **recibo**.
- **O disparo:** o pagamento da tranche que dispara chama a ação do motor de sempre (`A.validar`), que emite o recibo e põe a obra a andar (Inventário + plano por aprovar). Qual é a tranche está na constante `DISPARO` de `v2/financeiro.ts`, com um comentário: **hoje é a primeira** (o adiantamento), porque com "50% + 50% no fim" a final só se paga no fim da obra. É uma **decisão em aberto** (melhorias-v2, decisão 3; negócios de 08/10, secção 6): para mudar, troca-se para `"ultima"`.
- As tranches que faltam depois do disparo (a final) registam-se e validam-se no fim da fase **Obra** do negócio ("Faturas e pagamentos").
- A fatura única que o motor já tinha (a da demonstração, ou a criada pelo botão do fim da fase) conta como a 1.ª tranche; se o motor validou o pagamento por fora, essa fatura fica paga com o recibo dele.
- Liga-se em `FasesSimples.tsx` (`DocumentosSimples` e `ObraSimples`) só quando `lerVersao()` não é a Atual. As faturas também vivem em memória em `v2/estadoV2.ts`; o motor só guarda a primeira em `fin.fatura` e o recibo do disparo em `fin.recibo`.

### Regras de desenho corrigidas

- `OperacoesSimples.tsx`: o "O que fazer" deixou de ser um cartão com cartões dentro; os dias da linha do tempo passaram de 12 px para 15 px; as barras são cinzentas e o estado (feito, conflito) diz-se com um ícone de cor e texto; o "conflito" da lista e o "faltam" do Inventário têm a cor só no ícone.
- `FasesSimples.tsx`: as barras do previsto e real são cinzentas; a cor do "acima do previsto", dos materiais em falta e da receita atualizada passou para ícones; o texto pequeno passou a 15 px; "Atualizar a receita" deixou de ser um segundo botão primário.

### Testes

`v2/financeiro.test.ts` e `v2/operacoes.test.ts` (as regras), `v2/FinanceiroV2.test.tsx` e `v2/OperacoesV2.test.tsx` (os ecrãs, montados com `v2/testeV2.tsx`). O protótipo fica com 56 ficheiros e 884 testes.

### O que ficou por fazer

- O botão do fim da fase Financeiro (em `NegocioSimples` e `PaginaNegocio`, vem de `proximo()` no motor) ainda diz **"Emitir fatura"** na V2 antes de haver uma fatura registada. Não se mexeu, para não mudar o motor nem a página do negócio; registar a primeira fatura muda-o para "Validar pagamento".
- O documento da fatura para o cliente (`FaturaDoc`, partilha no portal) não aparece no Financeiro V2, porque a fatura deixa de ser feita pela Olyvia.
- Validações, atrasos e faturas não ficam guardados ao recarregar (estão em memória). Na app real: `client_invoices`, `client_receipts` e as tabelas da obra.
- O real do "Previsto contra real" é de exemplo até haver `calculo_snapshot` e registos de horas.
