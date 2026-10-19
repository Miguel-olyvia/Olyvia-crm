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
| `OutrosSimples.tsx` | Clientes, Marketing e Definições; o Catálogo passa para o `CatalogoV1.tsx` (14/10/2026). |
| `CatalogoV1.tsx`, `FichaServicoSimples.tsx`, `fichaServico.ts`, `fichaNav.ts` | O Catálogo do V1 em cinco separadores e a ficha do serviço numa página (ver [Ficha do serviço no V1](#ficha-do-serviço-no-v1-14102026)). |
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

Na **Atual** e na **V2** (16/10; na V2 funcional ficam o item e a vista "Inventário" de sempre) o **Inventário** é **um item do menu lateral único**, no lugar do item antigo: tem o ícone e o estilo dos restantes, um chevron, e abre-se (sozinho ao entrar em qualquer ecrã do inventário, e recolhe fora) para os subitens do mockup `mockup-inventario-ui.html`, indentados com uma linha à esquerda: **Hoje** (48), o grupo **Compras** (Encomendas 3, Fornecedores 8) e o grupo **Armazém** (Existências 13, Movimentos "Novo", Saídas para clientes 7, Receção 3, Contagens 1, Armazéns). Os contadores vêm da base em memória. A mesma estrutura está no **Mais** do telemóvel e o botão **Inventário** da barra de baixo abre-o. Já **não há painel roxo separado nem o item "Inventário completo"**. O "Simular perfil" (que filtra o menu) passou para o rodapé do menu geral e só aparece dentro do inventário. Cada item abre diretamente o ecrã (sem separadores internos). A vista antiga `inventario` do motor (o "Abrir no Inventário" das obras) continua a existir no motor, mas na V2 leva às **Encomendas** do novo inventário. O módulo foi reconstruído **nativamente** (sem iframe, sem browser, sem localhost), com o CSS do mockup copiado com escopo `.inv-root` (`inventario.css`), cujas variáveis `--i-*` apontam para os **tokens do protótipo** (`--background`, `--primary`, `--radius`…): não há paleta nem tema próprios, o claro/escuro vem da app e as folhas e diálogos herdam o mesmo aspeto e dados de exemplo com o dia de hoje fixo em **09/10/2026**. Por decisão do utilizador, no módulo Inventário o mockup manda sobre as regras de desenho do protótipo (texto de 14 px, alvos menores, cor nos selos), com perfil simulado que bloqueia ações, edição na célula, importar e exportar CSV e Receção por código.

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

## Frota (Atual e V2, 14/10/2026; na Atual desde 16/10)

O protótipo HTML aprovado `vault/frota-prototipo.html` passado a React, com a **UI do Inventário** (as classes de `inventario.css`, escopo `.inv-root`, e as peças genéricas do Inventário importadas sem mudanças: `Selo`, `Pesquisa`, `Texto`, `Lista`, `Notas`, `AbasFolha`, `useAvisoInv`). Na **Atual** e na **V2** (como o Inventário; não na V2 funcional): um grupo **Frota** (ícone `Truck`) no menu lateral, a seguir ao Inventário, que se abre para os dez ecrãs com os contadores do HTML; a mesma entrada no **Mais** do telemóvel; o topo (pesquisa "Procurar matrícula, modelo ou condutor", "Mostrar fontes de dados" e "Repor dados de demonstração") desenha-se por portal no cabeçalho do protótipo (`alvoTopo`); o "Frota · a ver como" fica no rodapé do menu enquanto a Frota está aberta. **Abrir a Frota fecha o Inventário e vice-versa.** "Repor a demonstração" chama `esquecerFrota()`. Hoje fixo em **14/10/2026**; período dos custos 1/9 a 14/10.

### Ficheiros (`frota/`)

| Ficheiro | O que tem |
|---|---|
| `tipos.ts`, `base.ts` | Os tipos (Viatura, Pessoa, Atribuicao, Manutencao, Leitura, Custo, Ocorrencia, Compromisso, ObraRef) e o básico: `HOJE`, datas (`dias`, `addDias`, `addMeses`, `diasUteis`), formatos e `ErroFrota`. |
| `seed.ts` | Os dados de exemplo (`seedFrota`, a `seed()` do HTML) já ligados ao protótipo (ver Ligações); `CENTROS`, `OFICINAS`, `POSTOS`, `TIPOS_CUSTO`; `centroObra`/`obraDoCentro` ("Obra #1022"). |
| `regras.ts` | As regras puras: `revisao` (km ou data, a primeira), `vencimentos`/`tomData`/`textoData`, `alertas`, `cartaOk`, `cobre`/`atribEm` (com `devolvida`), `prazoMulta` (15 dias úteis), `quemConduzia`, `kmPeriodo`, `custoKm`, `consumo`, `utilizacao`, `custoKmMedio`, `bloqueios`/`ocupada` (o que ocupa a viatura num dia), `compromissos`, `viaturasDaObra`, `custoKmDeslocacao` (fallback 0,40 €/km). |
| `acoes.ts` | Os 13 diálogos do objeto `DLG`: para cada um `ini*`, `validar*` (os mesmos textos do HTML) e `gravar*`, que volta a validar e recusa com `ErroFrota`; `exigir` recusa pelo perfil (não só o botão); `cancelarReserva`, `resolverOcorrencia`, `podeReservar`. |
| `loja.ts` | A base própria (`useSyncExternalStore`), guardada no `localStorage` na chave **`olyvia-prototipo-frota`**; `executar` corre numa cópia (`structuredClone`) e um erro de regra não muda nada; `esquecerFrota()` apaga a chave, o ecrã e o perfil. |
| `perfil.ts`, `PerfilFrotaSimulado.tsx` | Os perfis simulados (gestora Sofia Martins, técnico João Silva p1, financeiro) e `pode`/`porqueNao` do HTML. |
| `ctxFrota.ts`, `itensMenuFrota.ts`, `MenuFrota.tsx` | O contexto dos ecrãs; o menu (`MENU_FROTA`, `contagem`, `visiveisDe`) e o grupo do menu lateral. O ficheiro do menu chama-se `itensMenuFrota.ts` e não `menuFrota.ts` porque, no Windows, colide com `MenuFrota.tsx` (o tsc recusa nomes só diferentes nas maiúsculas). |
| `FrotaPagina.tsx` | A página (default export, carregada com `lazy`): ecrã do menu, pesquisa global, folha, diálogos, "Repor", "/" para a pesquisa. |
| `HojeFrota.tsx`, `ViaturasFrota.tsx`, `AtribuicoesFrota.tsx`, `CondutoresFrota.tsx`, `ManutencaoFrota.tsx`, `CustosFrota.tsx`, `OcorrenciasFrota.tsx`, `DocumentosFrota.tsx`, `RelatoriosFrota.tsx`, `LigacoesFrota.tsx` | Os dez ecrãs. Viaturas em lista ou cartões; Atribuições com o calendário semanal e Em curso, Reservas e Histórico; Relatórios com barras feitas à mão e "Ver como tabela". |
| `ViaturaFolha.tsx`, `DialogosFrota.tsx`, `pecasFrota.tsx` | A ficha (8 abas), os diálogos (moldura `.dlg` com o contexto da Frota, erro por campo e foco no primeiro) e as peças (matrícula `Placa`, `Src` nova/existe, `Cab`, `KpiF`, `ChipF`, `Btn` com permissão, `LigObra`). |
| `pontes.ts`, `pontesInv.ts` | As ligações para fora: obras do Estado, recursos da Agenda, custo/km, pedido de navegação (`pedirFrota`/`usePedidoFrota`); e, à parte para não carregar o motor do Inventário no resto do protótipo, o stock das carrinhas e a reposição. |
| `RecursosFrotaAgenda.tsx`, `ViaturasObra.tsx` | O que a Frota mostra noutros módulos: os veículos na Agenda (Definições) e as viaturas na página da obra. |
| `frota.css` | Só os extras que o `inventario.css` não tem: matrícula, calendário (`.blk`), barras, `.two`, `.vlist`, cartões das ligações, `src.nova`. |

### Ligações com os dados de exemplo do protótipo

- **Pessoas:** os condutores técnicos são os técnicos do motor (`TECS`): João Silva, Rui Alves, Marco Antunes, Sérgio Faria, Hugo Neves e Paulo Mota (campo `tec`); o comercial é o Rúben e a gestora de frota a Sofia Martins (só da Frota). As regras de exemplo mantêm-se: carta a caducar (Rui Alves, 20/11), carta B+C (Marco Antunes), sem carta (Paulo Mota).
- **Obras e ordens:** as obras são as do Estado de exemplo, **#1022 Marta Lima (WC, Odivelas, em curso)** e **#1050 Joana Ribeiro (Remodelação WC principal, Lisboa, concluída)**, lidas do Estado (`obrasDoEstado(S)`, passadas pela `PrototipoNegocios`); as "ordens" são as **tarefas do plano** (Demolição 13/10 com o João Silva, Canalização 14/10 e Louças 17/10 com o Marco Antunes, Revestimento 15–16/10 com o Hugo Neves, que reserva a partilhada BX-55-RT). A visita de 15/10 é a da Luísa Freitas (#1036). Os centros de custo das obras são "Obra #1022"/"Obra #1050". Clicar numa obra na Frota abre-a em **Operações** (`A.abrirPlano`); a **página da obra** (`ObraV2`) mostra as viaturas que lá foram, com o custo por km real e "Abrir na Frota". Um teste confirma que cada tarefa referida existe no plano da seed e com o mesmo técnico.
- **Inventário:** cada carrinha com armazém é um **armazém do tipo "viatura"** no Inventário (`Armazem.tipo`/`matricula`, novos e opcionais; dados em `inventario/carrinhas.ts`; `criarSeedComCarrinhas()` em `inventario/seed.ts`), com o stock de exemplo do HTML a entrar por movimento ("Carga inicial", 01/09, arrumado junto dos saldos iniciais para não aparecer nos últimos movimentos), `serves: false` (não entra na reserva FIFO). A loja do Inventário usa esta base; **`criarSeed()` continua a ser a do mockup** (o `seed.test.ts` compara-a número a número e não mudou). A aba **Stock na carrinha** lê do Inventário e **"Pedir reposição ao armazém central"** cria pedidos de transferência reais (`criarPedidoTransf`, Armazém Central → carrinha, o que falta até ao mínimo; não repete artigos com pedido pendente). Uma viatura nova com "Criar armazém móvel" cria o armazém no Inventário. O cartão do armazém (Inventário › Armazéns) mostra "Armazém móvel · viatura AA-12-BC". Mudou um teste do Inventário: em `regrasCadastros.test.ts`, "repor volta aos dados de exemplo" passa a contar os 25 movimentos do mockup mais a carga das carrinhas.
- **Agenda:** as viaturas ativas são os recursos **Veículo** (`recursosFrota`); a "Carrinha Renault Master" que já existia nos recursos é a **AA-12-BC** (`recursoAgenda`). Em **Definições › Agenda › Recursos** aparece a lista "Veículos da Frota" (só leitura), com os bloqueios dos próximos 7 dias e "Abrir na Frota"; os dados da Agenda (`agendaInicial`) não mudaram. **As reservas pontuais e as manutenções marcadas bloqueiam a viatura**: o calendário mostra-as, a atribuição pontual recusa um dia com manutenção marcada e a manutenção recusa um dia reservado. A ficha (aba Ligações) mostra os compromissos da agenda e tem "Ver na Agenda".
- **Custos:** `custoKmFrota(vid?)` (em `pontes.ts`) dá o custo por km real da viatura, a média da frota, ou 0,40 €/km sem dados. **No protótipo não há nenhum cálculo com 0,40 €/km** (esse valor está em `sugestaoFichaLocal.ts`, da app), por isso nada foi substituído: a função fica pronta e a página da obra já mostra o €/km real de cada viatura. A categoria "Viaturas" dos custos V2 (`custosModelo.ts`) não foi ligada.

### Fontes de dados ("Mostrar fontes de dados")

Como no HTML: a **laranja** ("nova ·") as tabelas e funções que não existem (`fleet_vehicles`, `fleet_assignments`, `fleet_odometer_readings`, `fleet_maintenance_plans`, `fleet_maintenance_events`, `fleet_expenses`, `fleet_incidents`, `fleet_documents_due`, `rpc_fleet_assign`, `rpc_fleet_create_vehicle`, `rpc_fleet_cost_report`, a edge function `fleet-import-statement`); a **violeta** ("existe ·") o que já existe (`schedule_resources`/`schedule_items`, `warehouses`/`get_effective_stock`/`rpc_register_stock_transfer`, `pessoas_identificacao` do ramo RH, `ops_centro_custo`/`ops_obra`, `documents`). O ecrã **Ligações** junta-as por módulo e diz também o que já está ligado neste protótipo, com atalhos (Agenda, obra, Inventário).

### Correções da revisão de código (14/10/2026)

- **Armazém móvel nunca serve clientes:** `armazemServe` (reserva FIFO e saídas), `opcoesExpedicao`, o armazém por defeito e os interruptores recusam um armazém `tipo: "viatura"` (`MOVEL_NAO_SERVE` em `cadastros.ts`); no cartão do armazém o interruptor "Serve clientes" fica desativado com o porquê.
- **Stock das carrinhas à parte:** conta no valor e nas existências do Inventário, mas não no "stock baixo / a encomendar" (`contadores.ts`: `low` e `estadoStock`) nem, por isso, no Hoje V2 e no menu; a falta nas carrinhas vê-se só na Frota. Com `criarSeedComCarrinhas()`: stock baixo 13 (igual ao mockup), valor 29 152,75 € (28 233,80 € sem carrinhas), 37 linhas com stock e 2291 unidades (17 e 1974 sem carrinhas).
- **Atribuições:** a carta verifica-se no início e no último dia; a reserva pontual percorre todos os dias (`ocupada`/`bloqueios`), com as manutenções em curso até à data prevista.
- **Ações:** devolver, abastecer e km recusam datas no futuro; não se devolve duas vezes; o extrato fica registado (`Frota.importados`) e não se importa duas vezes; concluir diz o estado real; o técnico só age sobre a sua viatura (`exigir(acao, F, vid)`).
- **Nova viatura:** permissão e validações antes de criar o armazém; `criarArmazemCarrinha` reaproveita um armazém vazio da mesma matrícula (recriar depois de "Repor" funciona) e a cidade escolhe-se (campo opcional "Cidade da carrinha"); "Criar recurso na Agenda" grava `Viatura.agenda` e só essas viaturas são recursos (todas as da seed). `VERSAO_FROTA` passou a 2.
- **Navegação:** "Abrir na Frota" só aparece quando a moldura a consegue abrir (`definirMolduraFrota(comInvFrota)`, na Atual e na V2 em `PrototipoNegocios`, `useMolduraFrota`); a moldura trata o pedido logo e passa a viatura à Frota como propriedade, por isso um pedido antigo nunca é consumido mais tarde. A ficha devolve o foco a quem a abriu (ou a `#frota-h1`).
- **Na Atual (16/10):** os grupos Inventário e Frota no menu (no telemóvel, a Frota no "Mais"); as viaturas da obra na página da obra (`ObraOperacoes.tsx`), os veículos da Frota em Definições › Agenda · Recursos (`OutrosSimples.tsx`, âncora `agenda-recursos`) e o resumo do Inventário no Hoje do Armazém (`HojeSimples.tsx`, o mesmo de `v2/hojeArmazem.ts`). "Abrir na Frota" funciona também aqui.
- **Viatura ligada a obras e transporte por fases (16/10, `transporteObra.ts`, `OperacoesViatura.tsx`):** ficha da viatura › Ligações › "Operações (ordens e obras)", com "Ligar a ordem ou obra" (as obras do Estado, cada uma "Pronta" ou "Por preparar" com o que falta). Liga-se sempre; **Carregar** só com a obra pronta (encomenda de cliente toda em armazém e plano aprovado). Cada fase do plano leva os materiais da EC dessa fase: Carregar = transferência do armazém da EC para a carrinha (`transferir`), Entregar na obra = saída da linha da EC a partir da carrinha (`sairLinha`); o estado (por carregar / na carrinha / entregue) lê-se dos movimentos do Inventário. Não se desliga com material dessa obra na carrinha. A ligação guarda-se na Frota (`ligObras`); a ficha da obra (Atual e V2) mostra a viatura e as fases; o arranque no negócio mostra "Viatura ligada" só como informação.
- **Revisão:** quando a data chega antes dos km, o texto ("Faltam 10 d (até 24/10/2026)") e a percentagem seguem a data.

### Testes (Frota)

`frota/regras.test.ts` (revisão, vencimentos, alertas, carta, `cobre`, prazo da multa, sugestão do condutor, atribuição recusada, loja que não muda com erro, perfil, `localStorage`, custos, e as ligações: técnicos, obras e tarefas da seed, armazéns móveis, reserva FIFO igual, reposição, recursos da Agenda, bloqueios) e `frota/FrotaPagina.test.tsx` (só na V2, Frota fecha o Inventário e vice-versa, Hoje filtra, abrir a viatura e repor stock, atribuir recusando carta inválida, km que descem, perfil técnico, Agenda, página da obra e o pedido de fora a abrir a viatura).

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

## Definições (V2, 13/10/2026)

Na **V2** e na **V2 funcional**, "Definições" é **uma só página** (`v2/DefinicoesV2.tsx`), sem separadores e sem diálogos; edita-se na própria linha e fica logo guardado. Responde ao lote 1, ponto 3, de `docs/melhorias-v2-2026-10-13/README.md` e à etapa 5 do `plano-execucao.md` (definições num só sítio com pesquisa, modelos de setor e arranque). A Atual continua com as Definições de sempre.

- **Pesquisa em cima** ("/" em qualquer sítio vai para ela; Esc limpa; Enter vai ao primeiro resultado). Procura num **índice estático** (`v2/definicoesIndice.ts`: nome, sinónimos e âncora; os sinónimos incluem as palavras do antigo, como "etapas", "SMTP", "apagados", "funções"). Cada palavra tem de aparecer; os que começam pelo nome vêm primeiro. Por baixo, a lista "Nesta página" com as âncoras das secções.
- **Secções:** **Arranque** · **Empresa e setor** (os nomes de Cliente/Local/Obra escolhidos em chips; os modelos de setor) · **Fases e campos** (as seis fases fixas com o nome editável; os campos de cada fase com o editor de campos embebido) · **Orçamento** (margem mínima e alvo da empresa, no motor; mínima e alvo por linha de serviço; estrutura, no motor; taxas de deslocação por zona; modelos de orçamento e PDF) · **Documentos** (modelos de proposta, contrato e email, com "Usado em") · **Email** (SMTP da empresa com porta e segurança em chips e "Testar a ligação"; falhas de envio com "Reenviar") · **Equipa e acessos** (utilizadores com o perfil num seletor; os cinco perfis fixos, Comercial, Direção, Financeiro, Armazém e Operações, com o que podem e não podem) · **Dados** (o Lixo com filtro por tipo em chips e "Restaurar") · **Aspeto e demonstração** (Leitura fácil, Ver o aspeto atual e Repor a demonstração, com as mesmas ações das Definições simples).
- **"?" de ajuda** (`v2/Ajuda.tsx`): um botão de 44 px com `aria-expanded` e `aria-controls` que abre o texto de ajuda logo por baixo, na página. Há um no título e um em cada secção. Serve para as outras páginas da V2 (`<Ajuda titulo="…">texto</Ajuda>`, ou `ComAjuda` + `AjudaBotao` + `AjudaTexto` quando o botão vai no título).
- **Arranque** (`v2/arranque.ts`, regras puras): cinco perguntas com chips (setor, serviços do setor, n.º de pessoas, como cobra, quantas empresas). Enquanto faltar alguma, diz o que falta; com tudo respondido mostra **o que vai ser aplicado** (modelo, nomes, linhas de serviço, margens, perfis ativos pelo tamanho da equipa, campos da visita novos e escondidos, e notas como a faturação recorrente). "Aplicar o modelo X" (o **único botão primário** da página) aplica os campos, o setor e as margens no motor, e os nomes e as margens por linha na store.
- **Modelos de setor novos** (`v2/setoresV2.ts`): **Limpeza** e **Manutenção** (os do plano de 06/10), no mesmo formato de `setores.ts`, que não mudou. Cada modelo tem também um resumo (nomes, linhas de serviço, margens, como cobra). A V2 mostra os cinco.
- **Onde vivem os dados:** o que o motor já tem (margens da empresa, estrutura, campos, setor, aspeto) lê-se e muda-se no `Estado`, como nas Definições simples. O resto (nomes, fases, margens por linha, deslocação, modelos, SMTP, falhas, equipa, Lixo) vive **só em memória**, numa store de módulo (`v2/definicoesDados.ts`, `useSyncExternalStore`, como o `diaADia.ts`): dura até recarregar. "Repor a demonstração" desta página volta-a ao início e chama a reposição de sempre. Não se tocou no `motor.ts`, no `seed()` nem na `VERSAO`.
- **`CamposEditor.tsx` corrigido** (vale para todas as versões, na vista "campos"): a fase escolhe-se num grupo de rádios (`fieldset`) em vez de `tablist`; os modelos de setor são linhas de uma lista, não cartões; a confirmação do modelo é uma linha na página; o detalhe do campo e o "Novo campo" já não são cartões dentro do cartão do grupo; campos, botões de subir/descer, ícones e chips de 44 px; texto a 15 px; sem cor no texto ("campo da empresa" e o papel do campo a cinzento); "Usar este modelo" e "Criar o campo" passaram a secundários. Exporta `ModelosSetor` e `EditorFases`, que as Definições da V2 usam. Nenhum teste dependia da marcação antiga.
- **Testes:** `v2/definicoes.test.ts` (índice da pesquisa, arranque, modelos novos) e `v2/DefinicoesV2.test.tsx` (página única com todas as âncoras e sem separadores nem diálogos, um só primário, "/" e resultados, "?", arranque aplicado, Lixo, Reenviar, perfis, margens no motor, nome da fase, Repor).
- **Por fazer:** os nomes das fases e os nomes de Cliente/Local/Obra só se veem nesta página (não chegam a Negócios nem à ficha); as margens por linha e as taxas de deslocação não entram no cálculo do orçamento; os modelos de documentos não abrem; convidar utilizadores e criar modelos novos ficam para a app real.

**Secções acrescentadas (13/10/2026, secções 4.1, 4.3 e 4.4 do levantamento, prioridades Baixa e Média).** A ordem passa a ser Arranque · Empresa e setor · Fases e campos · **Funil e pontuação** · Orçamento · **Agenda** · Documentos · Email · **Marketing** · Equipa e acessos · **Plataforma** · Dados · Aspeto e demonstração. Cada uma tem âncora, "?" e entradas no índice com as palavras do antigo ("scoring", "dry run", "MQL", "quadros", "veículos", "antecedência", "canais", "RGPD", "auth audit log"…). Tudo na linha, escolhido em listas, chips e mais/menos; os botões novos são secundários (o único primário continua a ser "Aplicar o modelo"). As peças comuns (Secao, Sub, Escolhas, Passo, Interruptor, Chip) saíram para `v2/pecasDefinicoes.tsx`; as secções novas estão em `v2/DefinicoesMais.tsx`.
- **Funil e pontuação das leads** (substitui o diálogo de 5 separadores de Leads, `LeadWorkflowConfig`; regras puras em `v2/funil.ts`): as seis fases fixas, cada uma com uma frase "Passa a Contacto quando [houver chamada registada]" em que o facto se escolhe numa lista (a Lead é a entrada e não se muda); a fase de uma lead avança fase a fase, **sem saltar** (sem chamada não passa a Visita, mesmo com visita marcada). A pontuação são linhas "Se [campo] [é/não é] [valor] → [+N pontos]" com quatro listas (campos: Origem, Serviço, Orçamento estimado, Prazo desejado, Zona), "Juntar regra" e o lixo na linha; o total nunca desce de 0. Limiares **MQL** e **SQL** com mais/menos (o MQL nunca passa o SQL). **Experimentar**: as regras aplicadas a três leads de exemplo (Teresa 50 pontos, SQL, em Negócio; Paulo 20, MQL, em Contacto; Helena 0, por qualificar, em Lead), com o porquê, e muda logo que se mexe numa regra.
- **Agenda** (substitui os separadores Quadros, Recursos e Regras do `/scheduling` e o `ScheduleSettingsDialog`; tipos e regras em `v2/agendaDefinicoes.ts`): **Quadros** com nome na linha, cor numa lista (só se vê no ícone) e quem vê (Toda a equipa, Comercial, Operações, Só a Direção); **Recursos** (pessoas, veículos e equipamentos, com o tipo numa lista) com os dias disponíveis em chips de segunda a domingo e o resumo ("Seg a Sex"); **Regras de marcação**: duração por tipo de visita e intervalo mínimo em passos de 15 min, antecedência mínima em chips, horário de trabalho em duas listas (o fim acerta-se para ficar depois do início) e dias de trabalho em chips.
- **Marketing · Tipos de canal** (saem das Definições antigas para aqui): os cinco canais fixos de `campanhas.ts`/`toquesDocs.ts` (Redes sociais pagas, Pesquisa, Offline, Parcerias, Outros), cada um com ícone, as origens que lhe pertencem (o `CANAL_DE_ORIGEM`) e um interruptor "Pago". As campanhas continuam no Marketing; o "pago" ainda não muda nada lá.
- **Plataforma** (só aparece, e só entra na pesquisa e em "Nesta página", com "A ver como" = Direção; nota "Só para o administrador da Olyvia"): uma só lista, só de leitura e de exemplo, com os acessos de suporte, as entradas na conta (também as falhadas) e os pedidos de apagamento RGPD com o estado. No antigo eram três ecrãs do menu Plataforma. Na app real deve depender das permissões `platform.*` e `rgpd.erasure.manage`, não do perfil Direção.
- **Dados:** quadros, recursos, regras de marcação, regras do funil, pontuação, limiares e "pago" vivem na mesma store em memória (`definicoesDados.ts`); "Repor a demonstração" volta-os ao início (`esquecerDefinicoes`). Nada disto chega ainda ao motor: a agenda do Hoje, a fase dos negócios e as campanhas não leem estas regras.
- **Testes:** `v2/funil.test.ts` (frases, fase sem saltos, pontos, qualificação, limiares, Experimentar, agenda, store e índice) e `v2/DefinicoesMais.test.tsx` (âncoras, "?", funil e Experimentar, regras de pontuação, limiares, agenda, canais, Plataforma só para a Direção, um só primário). O teste das âncoras de `DefinicoesV2.test.tsx` passou a ignorar as entradas `soDirecao`.

## Marketing (V2, 13/10/2026)

Só na **V2** e na **V2 funcional** (o ecrã `v2/MarketingV2.tsx`). Na **Atual** fica o `MarketingSimples` de sempre (`OutrosSimples.tsx`, sem mudanças). Segue o lote 1, item 5, e a secção 4.3 de `docs/melhorias-v2-2026-10-13/README.md`.

**Três conceitos distintos** (decisão 8, com a proposta do levantamento):
- o **canal** é a categoria fixa da empresa (Redes sociais pagas, Pesquisa, Offline, Parcerias, Outros: `Canal` de `toquesDocs.ts`);
- a **campanha** é o que se cria e se mede;
- o **anúncio** é a colocação paga dentro da campanha (Meta Ads, Google Ads, Outdoor…), com o seu **investimento**.

**A lista** (`MarketingV2.tsx`): uma tabela com Campanha (com o canal por baixo e "N por rever"), Leads, Ganhos, Receita, Investimento, Custo por lead e Custo por ganho. Os cabeçalhos ordenam (botão no cabeçalho, `aria-sort`); começa por **Ganhos**, do maior para o menor, e os vazios ("—") ficam sempre no fim. Há uma pesquisa (nome, canal ou onde anuncia, sem acentos). A linha toda abre a campanha. Por baixo diz-se quem ficou **sem campanha** (com os dados de exemplo, só a Ana Martins, com uma UTM do TikTok por mapear). Único primário: **Nova campanha**.

**De onde vêm os números** (`v2/campanhas.ts`, funções puras): as leads são os negócios de exemplo (`dealsTodos`: a seed e as pessoas de exemplo), ligados à campanha pelo **primeiro toque** da pessoa (`toquesDe`): pela campanha do toque ou, sem campanha, pela origem. Cada negócio conta numa campanha no máximo. **A receita só vem dos negócios ganhos** (`ehGanho`: contrato assinado, ou proposta aceite numa venda direta) e é o total do orçamento (`tot().pf`); nunca se escreve à mão. O custo por lead e por ganho é o investimento a dividir; sem investimento, ou sem leads ou ganhos, é "—". Com a seed: Site 6 leads e 2 ganhos; Cozinhas outubro 3 leads, 1.130 € em dois anúncios; Chamadas diretas 4; Recomendações 3; Cozinhas setembro, Casa de banho outubro, Outdoor A1 e Feira Casa e Obra 1 cada. As oito campanhas, os anúncios, os investimentos e as submissões por rever são **de exemplo**.

**Nova campanha** (na própria página, sem modal): Nome, Canal (chips) e Modelo de formulário (chips: Pedido de orçamento, Marcar visita, Contacto simples; vem escolhido o primeiro) → **Criar e abrir a campanha**. São 4 cliques e o nome. A campanha nova não tem anúncios nem leads.

**A página da campanha** (`v2/CampanhaV2.tsx`), sem separadores, com âncoras no topo:
- **Submissões por rever**, quando as há: um aviso com a contagem e, em cada linha, **Aceitar** (passa a lead da campanha, na fase Lead, e conta nas leads) e **Rejeitar** (sai e não conta).
- **Resumo**: os seis números e o **funil** Lead → Contacto → Visita → Negócio → Ganho, em barras cinzentas com o número (um perdido conta até à fase onde ficou).
- **Formulário**: os campos na linha, com o tipo escolhido numa lista, Obrigatório, Subir, Descer e Tirar; "Juntar campo" escolhe de uma lista de campos prontos (não se escreve). Por baixo, a **pré-visualização** como o cliente a vê.
- **Onde anuncia**: os anúncios com o investimento editável na linha (grava ao sair do campo) e Tirar; "Juntar anúncio em" com chips das origens pagas.
- **Leads**: a lista só de leitura das pessoas da campanha (nome, fase e valor). Faz as vezes do filtro "Campanha" em Pessoas, que **não** se juntou (a página Pessoas é de outro colega).
- **Partilhar**: Link, No site (iframe) ou Pixel, em chips; o código num campo só de leitura e **Copiar** (o único primário da página; se a área de transferência recusar, o texto fica selecionado). O domínio `formularios.olyvia.pt` é de exemplo.

**O limite.** As campanhas vivem **só em memória** (`v2/campanhasStore.ts`, `useSyncExternalStore`, como o `diaADia.ts`): duram até recarregar a página. Não tocam no `Estado`, no `motor.ts`, no `seed()` nem na `VERSAO`, e o "Repor a demonstração" não as apaga (o `repor` vive no `PrototipoNegocios.tsx`, que não se mexeu); recarregar a página volta aos exemplos. Peças comuns em `v2/pecasMarketing.tsx`. Testes: `v2/campanhas.test.ts` (contas, lista, formulário, partilha e store) e `v2/MarketingV2.test.tsx` (lista, nova campanha, página, por rever, editor e anúncios).

## Catálogo e custos (V2, 13/10/2026)

Na V2 e na V2 funcional, "Catálogo e custos" deixa de ser o `CatalogoSimples` (a Atual e o aspeto simples sem V2 ficam iguais). Tudo em `v2/`; o `motor.ts`, o `OutrosSimples.tsx` e o `CustoServico.tsx` não mudaram.

**Uma só página, com âncoras:** Serviços · Parâmetros · Perfis · Equipamentos · Estrutura.

- **Serviços** (`v2/CatalogoV2.tsx`): uma só tabela com os serviços em uso (`S.svc`) e o Catálogo real (`catalogo.ts`), sem repetir. Colunas: Serviço (e ofício), Uso ("Em uso" / "Não usado" e em quantos orçamentos), Medida, Custo por medida, Preço, Margem (sobre o preço) e Alertas (ícones com o nome para o leitor de ecrã). Começa ordenada por uso (os em uso primeiro, depois os mais pedidos); os cabeçalhos ordenam, com `aria-sort`. Pesquisa sem acentos e chips com contagem: Em uso, Sem receita, Margem abaixo do mínimo, Preço desatualizado.
- **Ficha do serviço** (`v2/FichaServicoV2.tsx`): abre no lugar da lista, com "Voltar ao Catálogo" (o foco volta à linha). Não é modal. A receita em três listas editáveis na linha: mão de obra (passo, perfil, horas por medida × €/h do perfil), equipamentos (horas por medida × €/h do equipamento) e consumíveis (produto, quantidade por medida, unidade, preço e a data do preço; mudar o preço põe a data de hoje). O custo por medida soma-se sozinho (mais a estrutura, se as Definições a somarem). Preço "Tabela" ou "Custo + margem", com o único botão primário da página, "Guardar o preço", que fica no histórico de preços. Entre o mínimo e o alvo escolhe-se a justificação (lista, não se escreve).
- **Custo sem modal** (`v2/CustoServicoInline.tsx`): o resumo do `CustoServico` (custo, preço, margem, as partes numa barra cinzenta e de onde vem o €/h) dentro da ficha. O salário só a Direção vê. O `CustoServico` (modal) continua na Atual e no orçamento.
- **Custos** (`v2/CustosV2.tsx`): Parâmetros (meses de salário, TSU, seguros, horas produtivas do técnico e da empresa, meses até um preço ficar desatualizado, margem mínima por linha: Casa de banho e Cozinha); Perfis (salário → €/h = salário × 14 × (1 + TSU) + seguros, ÷ horas produtivas; o salário só a Direção vê e muda); Equipamentos (compra, vida útil, residual, manutenção/ano, uso/ano → €/h); Estrutura (custos do mês, categoria, conta ou não; taxa = Σ mensal ÷ horas produtivas). Retirar uma linha mostra "Anular" no aviso (região `aria-live`).

**As contas** (`v2/custosModelo.ts`, funções puras) reutilizam `amortHora` e `consUn` de `receitas.ts`. No arranque batem com o motor: um técnico de 1.900 € dá 25,00 €/h, a estrutura (3.400 € ÷ 672 h) dá 5,06 €/h e os equipamentos dão a amortização de `receitas.ts`. O ladrilhador não tem salário: é o "Técnico sem custo/hora" do revestimento, e usa a média dos perfis.

**Os alertas novos** (puros, em `custosModelo.ts`; o `alertas()` do motor não mudou):
- `alertasServico`, no Catálogo: "Linha sem custo" quando o serviço não tem receita (só as horas do Catálogo, em vez dos 25 €/h inventados por `garantirServico`); "Técnico sem custo/hora"; "Preço desatualizado" pela data dos consumíveis, ao fim de N meses (6 por omissão, muda-se em Parâmetros); "Preço abaixo do custo"; "Margem abaixo do mínimo", com o mínimo por linha de serviço (o mais alto das linhas onde o serviço entra; Cozinha a 30%, Casa de banho usa a geral); "Falta a justificação" entre o mínimo e o alvo.
- `alertasOrcamentoV2(d, S, custos, { justificacao })`, para o orçamento: os do motor, sem a frase fixa do "desatualizado", mais "Linha sem custo", o desatualizado com data, a margem mínima da linha do negócio e a justificação da margem total. Ainda não está ligado ao ecrã do orçamento (o `OrcamentoSimples` não se mexeu).

**O limite.** Os custos, as receitas editadas e o histórico de preços vivem **só em memória** (`v2/custosStore.ts`, store de módulo com `useSyncExternalStore`): duram até recarregar, e "Repor a demonstração" não os apaga (o `repor` está no `PrototipoNegocios.tsx`, que não se mexeu). Ao editar, as horas, o €/h, os equipamentos, os consumíveis e o preço passam para `S.svc` (`aplicarTodos`), para o orçamento usar o mesmo custo; esses ficam guardados com o estado. O motor continua a somar a estrutura a 5,06 €/h fixos.

Testes: `v2/custosModelo.test.ts` (contas, lista, alertas, passagem para o motor) e `v2/CatalogoV2.test.tsx` (lista, chips, ordenação, ficha sem modal, histórico, salário só para a Direção).

### Pacotes, materiais e classificação (V2, 13/10/2026, auditoria 4.2 "Média")

Mais três secções na mesma página, com âncoras (Serviços · **Pacotes · Materiais · Classificação** · Parâmetros · Perfis · Equipamentos · Estrutura). Sem separadores e sem modais; um só editor na linha aberto de cada vez (o `editor` do `CatalogoV2`); os botões das secções são secundários.

- **Pacotes** (`v2/PacotesV2.tsx`): cada pacote é uma lista de serviços e materiais com a quantidade a sair da medida da obra ("1 por m² de pavimento", "1,1 por m² de paredes, arredondado", "fixo 1"), escolhida numa lista (fixo, por m² de pavimento, por m² de paredes, por ponto de água, por peça) com o fator e "Arredondar". As **alternativas ficam na linha** ("ou": chips, a escolhida conta no custo; "+ ou…" junta outra), em vez dos grupos de escolha num diálogo. Custo, preço e margem com as contas dos serviços (`receitaDe`, `custoReceita`, `precoReceita`): serviços pelo custo e preço por medida da receita × quantidade; materiais pelo custo ÷ (1 − margem dos materiais do pacote). Cada pacote tem medidas de exemplo, a linha de serviço (para a margem mínima) e a classificação. Arrancam dos `LINHAS` do motor (só leitura: os serviços por medida e os materiais com a mesma regra; há um teste que as compara com as funções do motor; o cimento-cola, que no motor usa duas medidas, fica como ⌈paredes ÷ 4⌉). **Criar em 4 toques:** "Novo pacote" → nome e "Criar pacote" → a pesquisa abre já com o foco → um toque por chip (serviço ou material). Retirar uma linha, uma alternativa ou o pacote tem "Anular". Um link leva às **taxas de deslocação**, que continuam nas Definições (não se duplicaram).
- **Materiais e consumíveis** (`v2/MateriaisV2.tsx`): nome, classificação, custo, unidade, marca, fornecedor preferido e a data do preço (com o relógio quando passa dos N meses de Parâmetros). Unidade, marca e fornecedor escolhem-se numa **combobox com "criar ao escrever"** (`Combo` em `v2/pecasCatalogo.tsx`: escreve-se, aparecem as que batem sem acentos e, se não houver igual, "Criar «X»"; setas, Enter e Escape). Mudar o custo põe a data de hoje e **leva o preço às receitas** que usam o material (pelo nome, `propagarProduto`), o que tira o "Preço desatualizado" do serviço e passa ao motor (`aplicarTodos`); "Anular" volta tudo. Material novo na linha (nome, custo, unidade, marca, classificação → "Juntar material"). Sem pesquisa mostram-se os primeiros 10 ("Mostrar todos"). Arrancam com os materiais dos pacotes do motor (e alternativas: sanita compacta, banheira, bancada laminada) e os consumíveis de `receitas.ts`.
- **Na ficha do serviço** (`v2/FichaServicoV2.tsx`): os consumíveis juntam-se também **da lista de materiais** ("Juntar da lista de materiais…": custo, unidade, fornecedor e data vêm de lá), e escolhe-se a classificação do serviço.
- **Classificação numa só árvore** (`v2/ClassificacaoV2.tsx`): ofício › sub, partilhada por serviços, materiais e pacotes (substitui as categorias de produtos e de serviços separadas). Toca-se num nome para ver as ações: renomear, subir, descer, "+ sub" e retirar (com "Anular"; o que estava num sub passa para o ofício, o que estava num ofício fica sem classificação). "Novo ofício" no fim. Os ofícios de arranque são os do Catálogo real, com subs de exemplo. A **lista única** de Serviços ganha **chips por ofício** (com contagem) e mostra o caminho "Ofício › Sub".

**O modelo** (`v2/catalogoModelo.ts`, funções puras): regras de quantidade (`quantidade`, `textoRegra`, `regraDaUnidade`), árvore (`juntarNo`, `renomearNo`, `moverNo`, `retirarNo`, `caminho`, `dentroDe`, `contarNo`), "criar ao escrever" (`filtrarCombo`, `garantirValor`), materiais (`criarProduto`, `mudarCusto`, `produtoDesatualizado`, `consumivelDe`, `propagarProduto`) e pacotes (`contaPacote`, `alertasPacote`, `criarPacote`, `juntarLinha`, `juntarAlternativa`, `escolherAlternativa`, `retirarAlternativa`, `mudarRegra`, `moverLinha`, `opcoesPacote`). **A store** (`v2/catalogoStore.ts`) vive em memória como a dos custos; `reporCustos()` chama `reporCatalogo()`, por isso "Repor a demonstração" (`esquecerV2`) também a limpa. Os pacotes ainda não entram no orçamento (o `criarOrc` do motor continua a usar os `LINHAS`).

Testes: `v2/catalogoModelo.test.ts` (regras e LINHAS, árvore, criar ao escrever, materiais e propagação, contas dos pacotes, store) e `v2/CatalogoPacotes.test.tsx` (pacote em 4 toques, alternativas na linha, um editor de cada vez, combobox "Criar «X»", custo que tira o desatualizado e "Anular", consumível escolhido da lista, árvore e chips por ofício).

## Hoje (V2, 13/10/2026)

Com a **V2** ou a **V2 funcional** escolhida, o Hoje é `v2/HojeV2.tsx`; a **Atual** continua com o `HojeSimples` (aspeto simples) e o `Hoje` (aspeto atual), sem mudanças. O `HojeV2` já não desenha o `HojeSimples`. Segue a auditoria `docs/melhorias-v2-2026-10-13` (2 · lote 1 · item 2, e 4.1).

- **Um só Hoje por papel**, uma lista "Para tratar" em que cada coisa aparece **uma vez**, com a razão em texto e por prioridade (regras puras em `v2/hojeV2Regras.ts`).
  - **Comercial:** junta as quatro listas de Pessoas (`funcHoje.ts`) e as quatro de Negócios (`funcNegocios.ts`) numa linha por pessoa. A razão de maior prioridade manda (Tarefas para hoje, Contactar, Visitas, Orçamentos por enviar, À espera do cliente, Contratos por assinar, A faturar) e as outras ficam em "Também: …". Um negócio que só repete a lista da pessoa não se repete. Com a seed: 16 pessoas (Contactar 7, Visitas 2, Orçamentos 4, À espera 1, Contratos 1, A faturar 1).
  - **Outros papéis:** os passos do motor (`minhas`) e a agenda de `Hoje.tsx` (`agenda`), uma linha por negócio, com o passo na linha. O **Financeiro** tem os contadores **Faturas por registar** e **Pagamentos por validar** (o passo diz "Registar fatura": a Olyvia regista, não emite). A **Direção** tem as exceções à margem (Aprovar, Recusar) e **A equipa**, uma tabela por comercial (por contactar, visitas, orçamentos por enviar, propostas à espera, por assinar, valor em proposta e atrasos), com "Ver os negócios" (Negócios com o filtro "Os meus"). O **Armazém** tem os números do Inventário (contagens abertas e paradas, stock baixo, saídas prontas, guias, encomendas atrasadas; `v2/hojeArmazem.ts`, a partir de `inventario/contadores.ts`) e "Abrir o Inventário".
- **Contadores e alertas.** Os contadores são chips (`aria-pressed`) que filtram a lista no próprio Hoje, e o filtro é anunciado. Os alertas levam a outro ecrã: "Negócios com atraso" abre Negócios **já filtrado** (`A.filtro("atraso")`); "Propostas à espera do cliente" (Direção), "Planos de obra com conflitos" e "Encomendas por confirmar" só navegam, porque o filtro por fase de Negócios e o separador do Inventário vivem em ficheiros de outros (a memória das páginas e `PrototipoNegocios.tsx`). Na V2, "Abrir o Inventário" abre nas Encomendas, não nas Contagens.
- **Marcar a visita na linha** (leads em Contactar): "Marcar visita" (`aria-expanded`) abre, por baixo da linha, os chips do dia (os 5 dias úteis a seguir a sáb 10/10) e da hora (09:30, 11:00, 14:30, 16:00) e "Guardar". Num negócio da seed em Contacto e com o Contacto completo usa a ação do motor `marcarVisita` (o negócio passa a Visita). Nos outros casos (pessoa de exemplo, negócio ainda em Lead, ou campos do Contacto em falta, que o texto nomeia: o Manuel Costa tem "Quem vai estar" por preencher) a visita fica **em memória** e o texto diz porquê. Em ambos a pessoa passa para Visitas e a visita entra na agenda.
- **Tarefas sempre ligadas a uma pessoa** (e ao negócio, quando é da seed): "+ Tarefa" em cada linha, com o quê em chips (Ligar, Enviar orçamento, Confirmar visita, Outro…, que pede um texto curto com rótulo) e quando em chips (Hoje, Amanhã, Em 3 dias). A tarefa aparece na linha da pessoa, com "Feita", e na agenda; uma tarefa para hoje põe a pessoa em **Tarefas para hoje**, no topo (ou fá-la entrar, se não estava no Hoje).
- **A semana:** chips com os 7 dias a partir de hoje e o número de compromissos de cada um; ao escolher um dia, a agenda mostra só esse dia ("Toda a semana" volta atrás). Só leitura.
- **Só um editor aberto de cada vez:** o "Guardar" dele é o único botão primário do ecrã. Esc fecha e devolve o foco ao botão que o abriu; depois de guardar, o foco vai para o título da lista. Os avisos vão para uma região `aria-live` (`useAviso`).
- **Onde vive o que se marca:** `v2/hojeV2Store.ts`, uma store de módulo **só em memória** (como `diaADia.ts`): dura até recarregar. Não toca no `Estado`, no `seed()` nem na `VERSAO`, e o `motor.ts` não mudou. **"Repor a demonstração" ainda não a apaga** (o botão vive em `PrototipoNegocios.tsx`, que não era deste trabalho): basta chamar `esquecerHojeV2()` lá.
- **Datas:** o "hoje" é o mesmo da V2 funcional, sáb 10/10/2026 (`HOJE_FUNC`); a saudação usa a hora real.
- **Testes:** `v2/hojeV2Regras.test.ts` (regras) e `v2/HojeV2.test.tsx` (ecrã, com as regras de desenho: texto ≥ 15 px, alvos de 44 px, cor só nos ícones, um só primário). Com eles, o protótipo tem 54 ficheiros e 880 testes.
- **Perguntas do cliente** (auditoria 4.1, "Média E"; acrescentado a 13/10/2026): as mensagens que os clientes deixam no portal (na app real, o sino e o diálogo "Mensagem do cliente" do `TopHeader.tsx`) aparecem no Hoje do **Comercial** e da **Direção**, numa lista "Perguntas do cliente" dentro de "Para tratar", com o contador **Perguntas N** (filtra como os outros, e conta no "Tudo"). Cada linha mostra o cliente, o negócio, de onde veio (Portal do cliente · Proposta / Obra), há quanto tempo, **a mensagem inteira** e o contacto já resolvido a partir do negócio (email e telefone). Responde-se na linha: as respostas rápidas estão à vista ("Vou confirmar e respondo hoje", "Ligo-lhe para explicar", "Sim, está incluído", "Escrever outra"); escolher uma abre o editor com o canal já escolhido (Email ou WhatsApp, cada um com o destino; o preferido do cliente, ou o email) e o texto à vista, e **"Enviar"** é o primário desse editor: **2 cliques** com uma resposta rápida. "Escrever outra" pede um texto curto (280 caracteres, com rótulo). Depois de enviar, a pergunta sai da lista e fica em "Perguntas respondidas" com **"Respondida há instantes por …"**, e o aviso vai para a região `aria-live`. É o mesmo editor único do Hoje (abrir uma resposta fecha a visita ou a tarefa); Esc fecha e devolve o foco.
  - Dados e regras puras em `v2/perguntasCliente.ts` (3 perguntas de exemplo ligadas a negócios da seed: Carla Nunes, Sérgio Pinto, Marta Lima). As respostas vivem **em memória** em `v2/hojeV2Store.ts` (`responderPergunta`, campo `respostas`) e `esquecerHojeV2()` também as apaga. Nada é enviado: o ecrã di-lo.
  - Testes: `v2/perguntasCliente.test.ts` (regras e store) e 5 testes novos em `v2/HojeV2.test.tsx` (lista, contador, 2 cliques, escrever outra, um só editor, papéis).

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
- **Várias faturas, uma por tranche** do plano de pagamento do contrato (campo `pagamento`): "50% + 50% no fim" dá **Adiantamento 50%** e **Final 50%**; "30% + 40% + 30%" dá Adiantamento, A meio e Final; "100% na adjudicação" dá uma só. A última tranche leva o resto, para a soma bater com o total com IVA. **19/10:** as tranches saem da mesma fonte da proposta, do contrato e do portal (`prestacoes` em `planoObra.ts`): "Por fases" usa as prestações guardadas no orçamento (`pagFases`, que se guardam ao escolher a condição, também pelo campo), com as do meio com o nome da fase ("Fim da fase 2 (canalização) 25%"); sem condições, **50% + 50% no fim**, como em todo o lado.
- **Permissões (19/10, `permissoes.ts`):** validar pagamentos (`finance.validate_payment`) e registar ou emitir faturas (`finance.invoice`) são do **Financeiro** e da **Direção**; os outros papéis veem as tranches mas não os botões ("Só o Financeiro ou a Direção registam faturas e validam pagamentos", com "Mudar para Sandra"). O motor verifica outra vez (`A.validar`, `A.emitir`, `A.emitirEc`, `A.registarFatura`, `A.reciboTranche`), porque há ecrãs que chamam a ação do passo sem olhar para o papel.
- **Registar, não emitir (V2):** o passo do Financeiro sem fatura diz **"Registar a fatura"** (emita-a no programa certificado e registe-a no Financeiro do negócio), sem botão; `A.emitir` na V2 recusa ("A fatura não se emite na Olyvia"). Na Atual continua a emitir, com a permissão.
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

- ~~O botão do fim da fase Financeiro ainda diz "Emitir fatura" na V2~~ (resolvido a 19/10: `proximo()` diz "Registar a fatura", sem botão, e `A.emitir` recusa na V2).
- O documento da fatura para o cliente (`FaturaDoc`, partilha no portal) não aparece no Financeiro V2, porque a fatura deixa de ser feita pela Olyvia.
- Validações, atrasos e faturas não ficam guardados ao recarregar (estão em memória). Na app real: `client_invoices`, `client_receipts` e as tabelas da obra.
- O real do "Previsto contra real" é de exemplo até haver `calculo_snapshot` e registos de horas.

### Equipamentos na obra e receita contra o real (13/10/2026)

A auditoria 4.5 ("Baixa": equipamentos na obra; atualizar a receita com dados reais). Duas secções novas na página da obra (`v2/ObraV2.tsx`), também nas ligações "Nesta página"; nenhuma tem botão primário (o da página continua a ser o do estado do plano).

- **Equipamentos:** os equipamentos que os serviços da obra usam, tirados das receitas (horas por medida × medida do orçamento; `receitaDe` dos custos da V2, por isso uma receita editada no Catálogo conta logo), juntos por tarefa do plano, com os **dias reservados** (os da tarefa), as horas previstas, os serviços e o €/h. Numa tarefa já feita, **"Confirmar as horas"** abre na linha as horas para escolher (a sugestão de exemplo, à meia hora, e meia hora e uma hora para cada lado) e "Confirmar X h"; a linha passa a "X h reais, confirmadas" (e pode mudar-se). Só um editor aberto de cada vez nesta secção; Esc fecha; o aviso vai para uma região `aria-live` nova da página. As horas ficam no registo da obra (`RegObra.horasEquip`, em memória em `v2/estadoV2.ts`: "Repor a demonstração" recomeça-as).
- **Previsto contra real:** a linha dos **Equipamentos** passa a contar as tarefas feitas pelas horas: previsto = horas da receita × €/h; real = horas confirmadas × €/h (as por confirmar usam o fator de exemplo de `realExemplo.ts`). O texto diz quantas estão confirmadas. As outras linhas ficam iguais. (`previstoReal` ganhou um 4.º argumento opcional; sem ele, faz o que fazia.)
- **Receita contra o real:** para cada serviço da obra, as horas por medida da receita contra a **mediana** das horas reais por medida das **obras concluídas de exemplo** (5 obras em `v2/receitaReal.ts`; a mediana, como a app de obra em `ObraMetricas`). Com 3 obras ou mais e mais de 5% de diferença aparece **"Usar a mediana (X h)"** (secundário): a receita do serviço passa a ter essas horas (os passos da mão de obra na mesma proporção) e fica "editada". Escreve-se **pela mesma API que a ficha do Catálogo usa** (`mudarCustos` da `v2/custosStore.ts` + `aplicarTodos`), sem mexer nos ficheiros do Catálogo: a ficha do serviço mostra logo a receita nova e `S.svc` (o orçamento) também. "Desfazer" repõe a receita anterior. Só as Operações e a Direção a mudam. Limite: como as outras receitas editadas, vive **só em memória** (até recarregar; "Repor a demonstração" não a apaga) e, porque muda `S.svc`, o "previsto" da própria obra passa a usar as horas novas.
- **Regras puras e testes:** `v2/equipamentosObra.ts` e `v2/receitaReal.ts`, testados em `v2/equipamentosObra.test.ts`; o ecrã em `v2/ObraV2Equipamentos.test.tsx`. Com as perguntas do cliente no Hoje, o protótipo fica com 67 ficheiros e 1019 testes.
- **Por fazer:** as obras concluídas e as horas sugeridas são de exemplo (na app real: os registos de horas dos técnicos e dos equipamentos no fecho da tarefa); as datas reservadas não bloqueiam o equipamento noutras obras (não há agenda de equipamentos).

## Prazo previsto no orçamento (13/10/2026, versão Atual)

No orçamento (`OrcamentoSimples.tsx`), a seguir às linhas, a secção "Prazo previsto" (`PrazoOrcamento.tsx`, cálculo em `ganttOrcamento.ts`):
- Um Gantt **sem técnicos**: uma tarefa por serviço do orçamento e uma para a demolição e entulho, por etapas (demolição → canalização/eletricidade/gás → revestimentos → montagem e teto falso → pintura). A montagem de louças vem depois do revestimento, mesmo feita pelo canalizador.
- **Em simultâneo quando é válido:** cada etapa começa quando a anterior acaba. Dentro da etapa, ofícios diferentes trabalham ao mesmo tempo (canalizador e eletricista), e o mesmo ofício faz uma tarefa de cada vez (uma equipa por ofício; o ladrilhador faz a parede e depois o chão).
- A duração vem das horas do orçamento, a 8 h por dia e ao meio dia (pelo menos meio dia).
- Tocar numa tarefa mostra o custo: mão de obra (h × €/h), equipamento e consumíveis. Na demolição, o custo só a Direção o vê, como na linha.
- Mudar os dias (−/+ meio dia) passa as horas da tarefa a dias × 8. O custo do orçamento e a margem mudam (o ajuste entra no `tot()` e na mão de obra do `partes()`); **o preço ao cliente não muda**. "Repor" volta aos dias das horas. Com menos horas do que o orçamento conta, aparece um aviso.
- Guardado em `Orcamento.prazo` (dias por tarefa). Sem dias mudados, o orçamento fica exatamente igual. Numa proposta enviada não se mexe.
- Confirmado pelo Ruben (13/10): 8 h por dia; tarefas em simultâneo quando é válido; mudar os dias muda o custo e a margem, não o preço.
- **O prazo de execução da proposta** (`prazo_exec`) vem do prazo previsto: os dias arredondados para cima (`sugerirPrazo` no motor). Acompanha o Gantt enquanto for sugestão. Se alguém o mudar à mão, fica, e o "Prazo previsto" mostra "Usar N dias na proposta".
- Reabrir o levantamento guarda os dias mudados à mão (`preservarManuais`).

## Linha "Materiais" do modelo sem contar a dobrar (13/10/2026)

A estimativa de materiais do modelo (`LINHAS[…].mat` no `motor.ts`) está dividida em partes, cada uma com o seu peso e o ramo do Catálogo. `materiaisDoModelo` (`produtosVisita.ts`):
- **WC (1.400 €):** cerâmico de parede 25% (Revestimentos › Parede), pavimento 15% (Revestimentos › Pavimento), louças, base e torneiras 50% (Canalização › Louças e torneiras), colas e pequeno material 10% (nunca coberto).
- **Cozinha (3.800 €):** móveis e bancada 70% (Carpintaria › Mobiliário), cerâmico de parede 10%, pavimento 10%, torneira e pequeno material 10%.
- Se **o cliente mantém** o que tem ("Sim" a "O cliente mantém…?" de um serviço da parte), a parte sai.
- Os **produtos escolhidos** (também os fornecidos pelo cliente) descem só a parte do seu ramo, até zero. Os produtos fora do modelo (espelho, toalheiro…) **não descem nada**, porque têm linha própria.
- O preço desce na mesma proporção do custo. Se não sobrar nada, a linha sai.
- Os pesos são um exemplo, a confirmar com a Mudelar.

## Ficha do serviço no V1 (14/10/2026)

Na versão **Atual** (aspeto simples), "Catálogo e custos" é o `CatalogoV1.tsx`. Usa o mesmo modelo da V2 (`v2/custosModelo.ts`, `v2/catalogoModelo.ts` e as suas stores), por isso o orçamento tira dali o mesmo custo. A V2 continua com o `CatalogoV2`.
- **Separadores:** Serviços · Produtos · Equipamentos · Consumíveis · Técnicos, cada um com uma lista simples e uma pesquisa. Para aguentar o catálogo real (cerca de 360 serviços e 2.200 produtos): os serviços aparecem por ofício, 8 de cada um, com "Mostrar mais"; os produtos e os consumíveis aparecem 40 de cada vez. As contas ficam em `useMemo`.
- **A ficha** abre no lugar da lista (não é um modal), com "Voltar ao Catálogo", que devolve o foco à linha. Também se abre a partir da linha do orçamento ("Abrir a ficha do serviço", `fichaNav.ts`). Tem estas secções:
  - **Medida:** a unidade e de onde vem a quantidade na visita (pav, par, pts, pcs, ou "O comercial escreve"), com um exemplo.
  - **Quem faz:** os passos, o tipo de técnico e as h/un.
  - **Equipamentos:** a conta do €/h, (compra − residual) ÷ vida + manutenção ÷ uso.
  - **Consumíveis:** cada um tem o interruptor "Opcional". O opcional fica fora do custo, e a ficha diz quanto custaria com ele.
  - **Produtos ligados:** os produtos que trazem o serviço e se a visita obriga a escolher um.
  - **Custo e preço:** as partes, o modo (tabela ou custo + margem) e um só primário, **"Guardar o preço"**.
- **Campos opcionais do contrato** (`contrato-catalogo-14-10.md`), todos com o caso em falta tratado:
  - `ReceitaV2.medida`: em falta, usa a do modelo (`LINHAS`) ou a que sai da unidade (`medidaDe`).
  - `UsoCons.opcional`: `custoReceita` deixa-os em `consOpc`, salvo com `{ opcionais: true }`.
  - `Catalogo.icone`: em falta, o ícone sai do nome e depois do ofício (`iconeDoServico`).
  - `Produto.sku/pvp/img/desc/sub`: sem `pvp`, o preço é o custo com a margem-alvo; sem `img`, usa-se a ilustração `generico`.
- `ilustracoes.tsx`: na junção de 14/10 ficou a versão das necessidades (ver a secção seguinte); a ficha usa `ICONES_SERVICO` no "Mudar o ícone".
- **Testes:**
  - `fichaServico.test.ts`: o custo com e sem opcionais, a depreciação, a medida, o ícone, os produtos e os consumíveis.
  - `CatalogoV1.test.tsx`: os separadores, 2.200 produtos com "Mostrar mais" e a pesquisa por SKU, a ficha com as seis secções, o "Opcional" a passar para o motor e "Guardar o preço".

## Necessidades do cliente, visual e guiada (14/10/2026, versão Atual)

A etapa "Necessidades do cliente" da visita deixou de ser texto e listas (o Ruben achou-a "complexa e chata"):
- **Resumo** em cima, numa linha ("5 serviços · 1 produto · 1.476,02 € estimado"), e o que falta em palavras, cada parte com ligação ao sítio.
- **Serviços** (`ServicosCatalogo.tsx`): mosaicos com ícone (`IconeServico`; `Catalogo.icone`, senão pelo nome, senão o do ofício), agrupados por ofício; os do pacote e os escolhidos à frente e depois os mais pedidos desta linha (`usos`); "Ver mais serviços" e uma pesquisa sem acentos. Os postos à mão têm o − 1 + (`ContadorQtd.tsx`).
- **Produtos** (`NecessidadesVisita.tsx`): cada serviço que pede produto é uma escolha guiada: "O cliente mantém a sanita?" → Não → os cartões (ilustração, marca, preço `pvp` ou custo com margem, "traz instalação"); o escolhido fica com o − 1 +. Escolher sem responder conta como "Não". O serviço que um produto traz e que esse produto já resolve não volta a perguntar.
- **Outros produtos**: grelha por categoria (`Produto.sub`, senão o nó), pesquisa (nome, marca, sku, ramo; texto guardado por produto) e "Mostrar mais" de 12 em 12. Testado com 2.200 produtos.
- **`ilustracoes.tsx`** (dono: este trabalho): `Ilustracao` (32 desenhos SVG próprios, traço de 2 px, cinzento e o acento, `aria-hidden`) e `IconeServico` (lucide), com todas as chaves fixas do contrato de 14/10. A ilustração de um produto é o `img`; senão deduz-se da subcategoria, do nome e da categoria (contra os 2.159 produtos reais da Mudelar só 4 ficam "generico").
- A lógica sem React está em `necessidades.ts` (`tilesServicos`, `gruposServicos`, `procurarServicos`, `filtrarProdutos`, `passoGuiado`, `tocarProdutoGuiado`, `obrigacoesAMostrar`, `resumoNecessidades`); testes em `necessidades.test.tsx`.
- Modelo: `Produto` ganhou `sku`, `pvp`, `img`, `desc` e `sub` e `Catalogo` ganhou `icone` (todos opcionais, em `v2/catalogoModelo.ts`); `ProdVisita` guarda o `pvp`, que manda no preço da linha do produto.

## Catálogo real da Mudelar (14/10/2026)

O catálogo inteiro da Mudelar está no protótipo, para validar a estrutura serviço ↔ produto ↔ receita. Os dados são gerados por `operacao-app/tools/catalogo-mudelar/gerar.mjs` (re-executável e determinístico: semente fixa, sem `Math.random`) a partir dos extratos da base (`_entrada/mudelar-servicos.json` e `mudelar-produtos.json`, só leitura, fora do git; o caminho é o 1.º argumento ou `MUDELAR_ENTRADA`):

```bash
node operacao-app/tools/catalogo-mudelar/gerar.mjs [pasta-dos-extratos]   # escreve dados/mudelarServicos.ts e dados/mudelarProdutos.ts
```

- **Real:** os nomes, os sku, as categorias, o PVP e o custo dos 358 serviços e dos produtos, e as marcas e os fornecedores quando a base os tem.
- **Inventado (com regras fixas no gerador):** 9 perfis novos com salário (pedreiro, carpinteiro, serralheiro, ajudante, marmorista, técnico de AVAC, pladurista, projetista, motorista; a média dos salários novos é a dos de antes, para o custo/hora médio não mudar), 38 equipamentos novos (43 no total, com compra, vida útil, residual, manutenção e uso por ano), 86 consumíveis (8 opcionais, datas de preço variadas; mais 20 que vieram dos produtos, ver abaixo), a árvore ofício › sub, a receita de cada serviço, a medida da visita, os ícones, as ilustrações, as marcas e os fornecedores em falta, a descrição de uma linha e as relações.
- **As receitas são calibradas:** as horas de cada serviço são as que fazem o custo do motor (`custoReceita`, com a estrutura) ficar perto do custo real (a ±12%, com uma variação fixa por serviço). Resultado: **346 de 346** serviços com custo ficam a ±30% (os 12 de subempreitada sem preço, pedido por obra, ficam de fora). O preço de tabela é o PVP real.
- **Produtos:** 2.136 de 2.159 (ficam de fora 3 artigos de teste e 20 passaram a consumíveis; na extração não há Calçado, Vestuário, Periférico, Processador nem Placa Gráfica). Cada um tem nó da árvore, `sub` (a subcategoria real), marca, fornecedor, `img` (só as chaves fixas de `IlustracaoKey`), `pvp`, `sku` e `desc`. 2.044 trazem o serviço que os instala.
- **Relações:** produto → serviço de instalação (ex.: cada armário de cozinha traz a "Instalação" do mesmo nome; as sanitas suspensas trazem a "Instalação de Sanita Suspensa") e 21 serviços que exigem produto, com a pergunta "O cliente mantém…?". As misturadoras e os lava-loiças de cozinha ficam em Canalização › Lava-loiças e torneiras de cozinha, para não descerem a parte das louças da casa de banho.

**Onde vive:** `dados/catalogoMudelar.ts` (lê os dados gerados, com tipos). `catalogo.ts`: os c1..c41 ficam com o mesmo id e ganham o `sku`, o `pvp`, o `custoReal` e, desde a secção seguinte, a receita da Mudelar (sem duplicar); os outros 317 ficam em `CATALOGO_MUDELAR` (id `s-<sku>`), e `CATALOGO_TODO` e `itemCatalogo(sid)` dão o Catálogo inteiro. **O `CATALOGO` não cresce**, porque a V2 mostra-o inteiro numa tabela; para o V1 e a visita usa-se `listaCatalogoCompleta` (`custosModelo.ts`) e `CATALOGO_TODO`. `OFICIOS` tem os ofícios novos no fim. `custos0()` junta os perfis e os equipamentos, `receitaDe` dá a receita completa dos serviços novos (com `medida`), `catalogo0()` junta os subs e os ofícios novos (sem mudar os ids de antes), os produtos (no fim), as relações e `icone`, e `garantirServico` (motor) cria um serviço novo com a receita e o PVP. Na V2, os Materiais só mostram os produtos da Mudelar a pesquisar (são milhares) e a escolha de consumível na ficha não os lista. `VERSAO` passou a 7. Testes: `dados/catalogoMudelar.test.ts`.

### Liga tudo: os problemas das Ligações no catálogo real (14/10/2026)

A vista "Problemas" das Ligações, com o catálogo real (`seed()`, `custos0()`, `catalogo0()`), dava 41 serviços sem receita, 40 produtos sem serviço de instalação e 4 equipamentos sem uso. Agora dá **0, 0, 7, 0 e 0** (os 7 são os termoacumuladores, com razão):
- **Os c1..c41 têm a receita da Mudelar** (`receitaMudelar` deixou de os pôr de fora): passos, equipamentos, consumíveis, `medida` e o PVP real como preço de tabela. O `ItemCatalogo` deles ganhou o `rs`, por isso o `garantirServico` os cria com as horas, o custo e o PVP da Mudelar. Os ids e o `hf`/`hu`/`qm` não mudam, e a demolição do c1 (`DEM-SAN-01`) também não.
  - **Muda um orçamento de exemplo:** a Joana (1050) tem os extras c28, c3, c14 e c19, que passam do preço estimado (25 €/h + 35%) ao PVP real. O total passa de 4.045,21 € para 3.966,22 € (−78,99 €; custo de 2.753,38 € para 2.708,00 €). Os outros quatro orçamentos (1031, 1030, 1027 e 1022) ficam iguais. Os testes dos valores ganhos e contratados foram atualizados (39.913,67 € em vez de 39.992,66 €).
  - Os testes que precisavam de um serviço sem receita usam agora um criado no próprio teste (`x-sem-receita`).
- **20 produtos passaram a consumíveis** (`eConsumivel` no gerador): o material da pré-instalação do AVAC (tubos de cobre, tubo anelado, tubo de esgoto, calha, cabo, caixas, tabuleiro, válvula de carga, buchas, parafusos e fita) e, na Elétrica, o fio, o tubo e a terra (caixa de medição e elétrodos). Ficam com a marca, o fornecedor, o custo real, a unidade de compra (rolo, cx, saco, ml, un), a data do preço e o `sku`, e entram nas receitas: o AVAC na "Mão de Obra - Técnico de AVAC", a terra e a alimentação no quadro, o fio enfiado nas tomadas e o tubo de 25 mm na deslocação do ponto de luz.
- **13 produtos ganharam o serviço de instalação:** a bomba de condensados (técnico de AVAC, 1 h), os 2 focos LED (Instalação de Aplique Led), a tela radiante da TECNISIS, o termóstato e a sonda (Instalação de Sistema Tela Radiante), as 4 redes mosquiteiras (o serviço com o mesmo nome) e os 3 roupeiros (a instalação com as mesmas portas e medidas).
- **Ficam sem serviço os 7 termoacumuladores:** a Mudelar não tem um serviço que os instale (precisam de canalizador e eletricista; o do esquentador é de gás). Estão em `SEM_SERVICO_MUDELAR`, com a razão. A pedir à Mudelar.
- **Os 4 equipamentos** entram nas receitas: a máquina airless na pintura de paredes e tetos, o soldador de PPR na deslocação do ponto de água, a serra de esquadria para alumínio e PVC nas janelas e redes, e o flangeador no técnico de AVAC (também na anulação de gás e na rede de gás, agora que o c7 e o c34 têm receita).
- O gerador falha se um consumível vindo de um produto ou um equipamento novo ficar sem uso, ou se um produto desses ramos ficar sem serviço sem razão. Continua determinístico (duas corridas dão o mesmo md5). As receitas continuam a ±30% do custo real em 346 de 346. `VERSAO` passou a 8.

## Seleção guiada das necessidades (14/10/2026, versão Atual)

Na versão **Atual** (aspeto simples), com o levantamento aberto, a etapa "Necessidades do cliente" passou a ser um passo de cada vez (`SelecaoGuiada.tsx`), para o comercial de pé, com o telemóvel numa mão. O aspeto "atual" (escuro) e a leitura das fases feitas continuam com o ecrã de antes (`NecessidadesVisita.tsx`).
- **Os passos (2.ª volta, 14/10):** O que se faz → uma troca por pergunta ("O cliente mantém a sanita?") → Mais produtos → Escolhas do cliente → O que o cliente fornece (só com "fornece materiais = Sim") → Resumo. As Escolhas passaram para o fim porque o "Sim" a "fornece materiais" abre logo o fornece, já com os serviços e os produtos escolhidos. A etapa abre nos serviços (nada mexido), na primeira troca por resolver, nas Escolhas por responder ou no Resumo. Em cima, uma barra de progresso compacta; em baixo, fixo, o "Seguinte" (o único primário), o "Voltar" e o total estimado.
  - **A mobilidade reduzida** deixou de vir antes dos produtos: enquanto não tem resposta, pergunta-se num cartão rápido (Sim · Não) no início da troca, e a resposta reordena logo os produtos (um toque, o mesmo que nas Escolhas, que já a mostram respondida). Com a resposta dada, o cartão não aparece.
  - A fase (`NegocioSimples.tsx`, `FaseSimples`) esconde o seu "Continuar" e não salta sozinha enquanto o passo guiado está aberto (`guiaPasso.ts`). No Resumo, "Continuar" passa ao passo seguinte da fase.
- **Os cartões ligam e desligam ao toque** (`CartoesSelecao.tsx`): sem "+", com `aria-pressed`, borda e fundo com o acento e um visto. O nome tem no máximo 2 linhas (`line-clamp-2`), com o nome completo no `title` e no `aria-label`. `encurtar()` em `selecao.ts` tira as medidas, as referências, o que vem depois de " - " ou " | " e o prefixo da categoria, e passa tudo isso para a 2.ª linha.
- **As quantidades** vêm da medida da visita ou são 1, escritas no cartão em texto discreto ("16 m² · da visita", ou "1 un"; mudada à mão, deixa de dizer "da visita"; `textoQtd`). Não há fila 1 · 2 · 3: no cartão escolhido há um "Mudar" discreto (`QtdMudar`, em `CartoesSelecao.tsx`) que abre um campo numérico pequeno (Enter ou sair grava, Escape desiste). Nos serviços do pacote não há "Mudar": a quantidade é a medida (muda-se em "Medidas da área").
- **A troca:** "Mantém" (tira os produtos que se tinham escolhido para ela) e "Troca", que mostra logo os produtos. Os produtos aparecem intercalados por parte da pergunta (uma sanita, uma base…), e com mobilidade reduzida as bases de duche, as barras e os bancos vêm à frente e as banheiras vão para o fim. Escolhido o produto de cada parte (`trocaResolvida`), avança-se sozinho; qualquer outro toque cancela o avanço.
- **Os filtros:** por baixo da pesquisa, uma fila de filtros clicáveis, um ativo de cada vez. Nos serviços são as áreas (ofícios, pelos mais usados); nos produtos são os tipos (`categoriaFiltro`: Sanitas, Bases de duche…). O filtro junta-se à pesquisa, e tocar no ativo volta a "Todos". A fila fica numa só linha, sem barra de scroll visível (`scrollbar-width`, `::-webkit-scrollbar`, `-ms-overflow-style`): desliza com o dedo, a arrastar com o rato (cursor `grab`; um arrasto de mais de 5 px não ativa o filtro) e com a roda (o vertical passa a horizontal). A ponta com mais filtros esbate-se (máscara em gradiente), e o filtro focado com o Tab fica à vista.
- **Primeiro os mais prováveis:** 6 cartões, e o resto com "Ver mais" (de 12 em 12) ou com a pesquisa. A ordem fica parada enquanto se toca, para os cartões não saltarem.
- **Escolhas do cliente** (grupo `ESCOLHAS`) ficaram dentro da etapa: Sim e Não em cartões grandes, e as cores em escolhas rápidas, com texto livre só em "Outro". No V1 simples o passo "Escolhas do cliente" da fase saiu, e a etapa só fica feita com as escolhas respondidas (`PaginaNegocio.tsx`). As faltas do portão contam no passo "Necessidades".
- **O que o cliente fornece, por serviço** (`blocosFornece` em `selecao.ts`; o modelo em `forneceCliente.ts`): um bloco por serviço escolhido, com o nome, os atalhos dele ("Fornece tudo" e "Nenhum") e o que baixa ("− 17,10 €"); por baixo, cartões compactos de liga/desliga com os produtos escolhidos para esse serviço (os do ramo que ele exige e os que o trazem), o material da troca ainda sem produto, e os consumíveis (sem os opcionais) e os equipamentos da receita (quantidade por unidade × a quantidade do serviço). Cada bloco mostra os 6 que mais pesam e o resto em "Ver mais". Os produtos que não são de nenhum serviço ficam em "Outros produtos". Em cima, os atalhos gerais e o total que baixa.
  - Um produto fornecido fica a zero (`p.cliente`) e mantém a instalação; o material de uma troca usa "o cliente compra" (`clienteCompra`); um consumível ou um equipamento fica em `visita.fornece[sid]` ("c:<nome>", "e:<id>") e sai do custo dessa linha de serviço (`criarOrc`: `menos` na linha, `custoUnLinha`). A mão de obra e a estrutura ficam sempre. As receitas do Catálogo não mudam: o motor lê os itens pela store dos custos (`ligarReceitas`, como o Catálogo em `produtosVisita.ts`).
  - **A validar com o Ricardo:** o consumível ou o equipamento fornecido sai do custo e, pelos mesmos euros, do preço da linha (a margem em euros fica igual); o produto sai pelo preço de venda, como antes.
  - No orçamento, cada um aparece numa linha "Fornecido pelo cliente · Tubo multicamada 16 mm (Canalização)" a zero, e a linha do serviço diz "sem o fornecido pelo cliente". Responder "Não" a "fornece materiais" limpa tudo (`motor.ts`, `campo`). O material do modelo do pacote (a linha "Materiais") ainda não entra neste passo.
- **O mapeamento:** o produto traz o serviço de instalação, e a pergunta desse serviço não se repete (`obrigacoesAMostrar`). Desligar o produto tira o serviço.
- **Com o catálogo real** (358 serviços e 2.156 produtos, junção de 14/10): no browser, abrir a etapa leva cerca de 18 ms, filtrar uma área 8 ms e pesquisar 10 ms.
- **Testes:** `selecao.test.tsx` cobre os nomes curtos, os filtros com a pesquisa (e o arrasto, que não ativa o filtro), o liga/desliga (rato e teclado), a quantidade em texto e o "Mudar" (serviços e produtos, sem 1 · 2 · 3), a ordem dos passos e o cartão da mobilidade, o mapeamento, a troca que avança sozinha, o resumo, o fornece por serviço (produto, consumível e equipamento fora do custo, a mão de obra fica, os atalhos, o "Não" que limpa tudo, o custo e o preço do orçamento a bater com o "− €" do passo) e os 2.200 produtos.

## Ligações do Catálogo (14/10/2026, versão Atual)

Um sexto separador, **Ligações**, no Catálogo do V1 (`LigacoesCatalogo.tsx`) serve para validar o modelo de dados do catálogo e para o mostrar à Mudelar:
- **O mapa:** o elemento escolhido fica no centro e os grupos ligados ficam à volta:
  - **serviço no centro:** os produtos que o trazem ou que ele exige (com a pergunta "O cliente mantém…?"), os técnicos (h/un e €/h), os equipamentos (€/h × h/un) e os consumíveis (com a marca de opcional);
  - **produto no centro:** o serviço que traz, os serviços que o pedem, as alternativas (as da mesma subcategoria; sem ela, as do mesmo ramo) e quem o instala;
  - **equipamento, consumível ou técnico no centro:** os serviços que os usam.
- **Desenho:** no computador (≥ 1024 px) os grupos ficam em duas colunas, uma de cada lado do centro. No telemóvel ficam em camadas: o centro em cima e os grupos por baixo, com uma espinha vertical.
- **Animação** (framer-motion), de 200 a 500 ms:
  - as ligações são curvas SVG que se desenham do centro para fora (`pathLength`), com um pequeno escalonamento;
  - ao tocar num nó, o desenho dele voa para o centro (`layoutId`);
  - passar o rato ou o foco num nó ou numa ligação acende a ligação e mostra o porquê no nó (ex.: "traz 1 × Instalação de Sanita Compacta", "0,85 €/h · 0,4 h/pt"). No telemóvel, o porquê está sempre escrito;
  - com `prefers-reduced-motion`, aparece tudo de imediato.
- **Rasto** em cima (até 6 passos) para voltar atrás, e uma **pesquisa** para escolher o centro. No máximo aparecem 12 nós por grupo; o resto fica em "+ N", que abre uma lista com pesquisa e "Mostrar mais".
- **Problemas:**
  - avisos discretos no centro e nos nós;
  - uma vista "Problemas" com a contagem por tipo, em que um toque abre o elemento no mapa;
  - os tipos são: serviço sem receita, serviço que exige um produto de um ramo vazio (ou que já não existe), produto que se instala sem serviço de instalação, consumível sem uso e equipamento sem uso;
  - um produto "devia ter" serviço quando a ilustração é de uma peça que se instala ou quando um irmão da mesma subcategoria tem serviço. Fica de fora quando está num ramo que um serviço exige, porque o serviço do pacote o instala.
- **Na ficha do serviço:** "Ver ligações" abre o mapa centrado no serviço. Em "Produtos ligados", o nome do produto abre-o no mapa. No mapa, "Abrir a ficha" volta à ficha.
- **Lógica sem React** em `ligacoes.ts`:
  - `montarCatalogo(S, C, K)` junta tudo num objeto simples;
  - `ligacoesDe(no, catalogo)`, `problemasCatalogo(catalogo)`, `procurarNos` e `centroInicial` trabalham sobre esse objeto.
- **Testes:**
  - `ligacoes.test.ts`, incluindo um catálogo com 360 serviços e 2.200 produtos;
  - `LigacoesCatalogo.test.tsx`, que testa o separador, as camadas e as colunas, o "+ N", a pesquisa, os problemas e as ligações a partir da ficha.

## Entulho dos serviços e ficha sem dropdowns (14/10/2026, versão Atual)

O pedido do Ruben: "não falta na ficha do serviço se ele gera ou não entulho? e por m³ do produto associado e isto ser dinamicamente calculado no serviço?" E, a seguir: "na ficha do serviço não quero dropdowns feias; consumíveis e equipamentos devem ser otimizados, mais bonitos".
- **Modelo (campos opcionais):** `Produto.entulho?: { m3; kg? }` e `Catalogo.entulhoServico?: Record<SvcId, { modo: "nao" | "artigo" | "produto" | "m3"; m3?; kg? }>`. Com `K.artigoDoServico[sid]` o modo é sempre "artigo".
- **Por omissão (`entulhoPadrao.ts`, aplicado em `catalogo0()`):** demolir, remover, retirar (e levantar, nas Demolições) → "artigo" se houver artigo, senão "m3" pelo nome; instalar no lugar de um produto exigido (com "O cliente mantém…?") ou substituir/trocar → "produto", menos os de m² e ml (a remoção é um artigo de demolição) → "nao"; o vazadouro → "nao"; o resto → "nao". O entulho dos produtos vem do tipo (subcategoria, nome, ilustração): os valores da especificação (sanita 0,06 m³ e 25 kg, bidé 0,05, lavatório com móvel 0,15, banheira 0,40, torneiras 0,01) e estimativas para o resto; os revestimentos e os eletrodomésticos (REEE) dão 0.
- **No orçamento (`volumesDasLinhas`, `calcularDemolicao(…, vols)`):** os modos "produto" e "m3" entram como volume (`ItemVol`): somam ao m³, às toneladas, à carga e à deposição e contam para os big bags; **não somam horas** de demolição nem a proteção. O produto que sai é o da visita (o que traz o serviço ou do ramo que ele obriga); se o cliente mantém, nada; com "Troca" e sem produto, vale o tipo. Sem demolição ligada, a linha liga-se sozinha (menos se a desligaram à mão: `Orcamento.semDemolicao`). O detalhe mostra "Entulho dos serviços" com a origem ("1 × sanita que sai"). O cliente vê uma só linha.
- **Ficha do serviço (V1):** secção **Entulho** (Não gera · Do artigo de demolição · Do produto que sai · m³ por unidade), com a conta de exemplo (`contaExemplo`, `entulhoFicha`): "2 un × 0,06 m³ = 0,12 m³ · ≈ 50 kg → deposição 7,60 € + carga 4,43 €", com os parâmetros de produção.
- **Sem `<select>` na ficha (`pecasFicha.tsx`):** `Segmentos` (até 6 opções) e `SeletorPesquisa` (popover com pesquisa, ícone e o valor à direita; ↑ ↓ Enter Esc). Equipamentos e consumíveis numa linha cada, com a conta numa só linha, o "De onde vem o €/h" fechado, o `Switch` do opcional (esbatido, "fora do custo"), a data só quando está desatualizada e o total do bloco.
- **Testes:** `entulhoServico.test.ts` (modos, volume sem horas, big bags, tipo por omissão, sanita trocada no `seed()`) e `FichaServicoEntulho.test.tsx` (sem `select`, juntar e tirar pelo seletor, opcional, a conta do entulho a atualizar). Os testes da demolição continuam iguais (39,08 / 1.043,28 / 1.103,69 € e 602,49 / 860,70 €).

## Movimento, preenchimento rápido e fases nas Necessidades (14/10/2026, versão Atual)

O pedido do Ruben: uma experiência de terreno com "WOW", guiada, com poucos toques e animações, sem dropdowns nem "+".
- **O movimento** (`movimento.tsx`, framer-motion): só se anima `transform` e `opacity`; uma mola curta (`MOLA`, cerca de 300 ms) e outra para os cartões (`MOLA_CARTAO`).
  - **A passagem entre passos** (`deslize`): avançar entra pela direita e voltar entra pela esquerda.
  - **Os cartões** entram em cascata (`cascata`, 35 ms entre cada um) e reorganizam-se com `layout="position"` quando se filtra. Os títulos das fases também deslizam.
  - **Listas compridas:** com mais de `ANIMAR_ATE` (40) itens, entram sem animação.
  - **Medição com scroll:** o `<main>` do V1 e a fila de filtros têm `layoutScroll`, para que as medições do framer contem com o scroll.
  - **Pequenos sinais:** o visto que se desenha (`VistoDesenho`), os totais que contam até ao valor novo (`Contagem`), a barra de passos com o indicador que desliza (`Progresso`, `layoutId`) e o "press" a 0,97.
  - **Com `prefers-reduced-motion`** (ou `MotionGlobalConfig.skipAnimations` nos testes; `useReduzir`): não há deslizes, cascatas nem vibração, só um fade de 100 ms.
- **O preenchimento rápido** (`rapido.ts`, funções puras):
  - **Modelos rápidos** no primeiro passo ("Remodelação completa", "Só louças", "Só pavimento e paredes"): ligam e desligam os serviços do pacote que têm medida, e o aviso em baixo dá 5 s para "Desfazer" (`aplicarModelo`, `desfazerModelo`). O modelo aplicado aparece escolhido (`modeloAtual`).
  - **Resposta sugerida nas trocas** (`sugestaoTroca`): com a demolição ligada sugere-se "Troca", sem ela "Mantém". A sugestão fica destacada (borda tracejada e "Sugerido") mas nunca escolhida. **A validar.**
  - **O gesto:** deslizar o dedo na horizontal (mais de 70 px, em menos de 0,7 s, mais horizontal do que vertical) avança ou recua. A fila dos filtros e os campos de texto ficam de fora (`data-sem-gesto`).
  - **A vibração** (`vibrar`): 10 ms ao ligar um cartão e 10-30-10 ms ao avançar sozinho, só onde o browser a suporta.
  - **O passo onde se ficou** guarda-se no browser (`localStorage`, `olyvia.necessidades.passo.<id>`), e a etapa volta a abrir nele.
- **As fases da obra** (`fasesObra.ts`): 1 Preparação e demolições · 2 Infraestruturas · 3 Revestimentos · 4 Montagem final.
  - **De onde vêm:** um serviço pode estar em várias fases; vale o que está na ficha (`Catalogo.fasesServico`) e, sem isso, as regras pelo nome e depois pelo ofício (`fasesPadrao`). Um produto fica na última fase do serviço que o instala ou, sem serviço, na do tipo de produto (`faseDoProduto`).
  - **Nas Necessidades:** serviços, Mais produtos, trocas e fornece agrupam-se por fase (`porFase`), com o seletor "Todas · 1 · 2 · 3 · 4", e o Resumo segue a cronologia.
  - **No catálogo real:** fase 1 = 10 serviços, fase 2 = 24, fase 3 = 11, fase 4 = 286, mais 27 em várias fases.
    - A fase 4 é quase toda certa: carpintaria (195 serviços, sobretudo armários e roupeiros), caixilharia (47), louças e torneiras, e bancadas.
    - Regras corrigidas a 14/10: o "levantamento de parede" é erguer, não remover; os roços são da fase 2; "carpintaria" deixou de cair na pintura (a regra passou a usar limites de palavra); os pontos (luz, água, esgoto) são da fase 2; os Modelos 0–3 e a Remodelação completa ocupam as fases 1–4; o projeto 3D e a deslocação ao km ficam na fase 1.
    - **A validar:** as janelas (caixilharia) estão na fase 4, mas numa remodelação podem entrar antes dos acabamentos.
- **iPhone:** enquanto o protótipo está aberto, a meta viewport ganha `viewport-fit=cover`, e o menu de baixo, o "Mais" e o fundo do `<main>` somam `env(safe-area-inset-bottom)`. Os lados e o topo usam os `safe-area-inset` respetivos.
- **Contraste (contas WCAG no tema `.calma`):** o acento `256 56% 48%` dá 7,7:1 sobre branco e 7,1:1 sobre o fundo. O texto secundário dá 7,6:1 e 7,0:1. O "Sugerido" (acento sobre o cartão) dá 7,7:1. O pior caso, texto secundário sobre o acento a 10%, dá 6,5:1: tudo AA com folga.

## Plano da obra no orçamento (14/10/2026, versão Atual)

O pedido do Ruben: "o orçamento tem de ser dinâmico, interativo, com mapa de Gantt com as fases e custos e previsão de duração, bonito mas útil". O "Prazo previsto" de 13/10 (`PrazoOrcamento.tsx`, apagado) deu lugar a `PlanoObraOrcamento.tsx`, com a lógica em `planoObra.ts` e `ganttOrcamento.ts`.
- **As etapas seguem as fases da obra** (`ganttOrcamento.ts`). A ordem é a fase (1–4) e, dentro dela, a ordem dos ofícios: a pintura é da fase 3, depois do ladrilhador, e as louças, da 4, montam-se no fim. Um serviço com várias fases entra na primeira. Na mesma etapa, ofícios diferentes trabalham em simultâneo e o mesmo ofício faz uma tarefa de cada vez.
- **Em datas reais** (`planoObra.ts`):
  - só contam os dias úteis: saltam-se os fins de semana e os feriados nacionais (os fixos, a Sexta-feira Santa e o Corpo de Deus, com a Páscoa pelo algoritmo de Meeus), e a lista diz que feriados se saltaram;
  - o início escolhe-se num toque ("Próxima segunda", "Daqui a 2 semanas", "Daqui a um mês" ou "Outra data") e guarda-se em `Orcamento.inicioObra`;
  - mudar o início só mexe nas datas, nunca no custo nem no preço.
- **As fases** (cartões):
  - cada cartão mostra os dias, a data de início, o preço (com o desconto), a margem (a vermelho abaixo do mínimo), o custo e os materiais;
  - tocar num cartão realça a fase no Gantt e na curva;
  - o custo das fases com a demolição só a Direção o vê;
  - **as contas das fases:**
    - as linhas de materiais vão para a fase pela descrição (`faseDosMateriais`);
    - o preço da linha da demolição fica na fase 1, e o custo dela está na tarefa;
    - a soma das fases dá o custo e o preço do orçamento.
- **O Gantt:**
  - as colunas são os dias úteis com a data, e as barras usam uma rampa do acento, da fase 1 (clara) à 4 (escura), todas com contraste de pelo menos 3:1;
  - o custo fica ao lado da barra, nunca por cima, e uma barra mudada à mão leva riscas;
  - arrastar a ponta da barra muda os dias, de meio em meio dia, e tudo se atualiza ao vivo: as datas, o custo, a margem lá em cima e o aviso "os dias mudados à mão somam X € ao custo";
  - cada barra é um `role="slider"`: ← → mudam meio dia, e Enter abre o detalhe da tarefa (o custo por partes, − / + e "Repor");
  - com o orçamento enviado, as barras ficam paradas;
  - no telemóvel, a grelha desliza na horizontal e os nomes ficam presos à esquerda.
- **A curva do custo acumulado** está alinhada com os dias:
  - a mão de obra entra ao ritmo de cada tarefa, e os materiais entram no dia em que a sua fase começa;
  - uma linha tracejada marca o preço ao cliente, e ao lado aparece o lucro previsto;
  - ao passar o rato, mostra a data e o que já se gastou.
- **Testes:** `planoObra.test.ts` (a Páscoa, os feriados, os dias úteis, as fases a somar o orçamento, a curva e o desconto) e `PlanoObraOrcamento.test.tsx` (as barras, ← →, as fases, o início e o orçamento enviado). Em `ganttOrcamento.test.ts`, a pintura passa a vir antes das louças.

### Pagamentos, tesouraria, reforço e a obra na proposta (14/10/2026)
- **Tesouraria** (`planoObra.ts`: `prestacoes`, `recebidoAte`, `tesouraria`):
  - cada prestação tem a percentagem e o momento em que se recebe: na adjudicação, no fim de uma fase ou no fim da obra;
  - o saldo é o que se recebeu menos o que se gastou, sem IVA, e o pior momento diz quanto e quando a obra fica a descoberto;
  - na curva, a linha cinzenta em degraus é o recebido, e os troços a descoberto ficam a vermelho claro.
- **"Por fases"** (`sugerirPorFases`), uma 4.ª condição de pagamento (também no campo "Condições de pagamento"):
  - há uma prestação na adjudicação, uma no fim de cada fase (menos a última) e uma no fim da obra;
  - cada uma cobre o que se gasta até à seguinte, mais 5% de folga, arredondada aos 5%;
  - o sinal é de pelo menos 25%, uma prestação intermédia de pelo menos 10%, e uma que não faz falta sai;
  - o fim fica com pelo menos 10%.

  Na cozinha da Carla Nunes, por exemplo: com 50% + 50%, a obra fica a descoberto até 1.762 €; "Por fases" dá 25% / 55% (no fim dos revestimentos, antes dos móveis) / 20%, sem nunca ficar a descoberto.
- **O painel "Pagamentos e tesouraria":**
  - as 4 condições aparecem em cartões, cada um com "sempre coberta" ou "a descoberto até X €";
  - por baixo, as prestações com a data e o valor com IVA, e a frase do pior momento;
  - escolher guarda `d.f.pagamento` e, com "Por fases", também `Orcamento.pagFases`;
  - se o plano mudar depois, aparece "recalcular as prestações por fases".
- **O reforço** (`Orcamento.equipa`): "1 pessoa / 2 pessoas" por ofício.
  - Com 2 pessoas, as mesmas horas cabem em metade dos dias e o custo não muda. O botão mostra quantos dias se ganham.
  - Os dias mudados à mão passam a contar com as horas das duas pessoas.
  - A demolição tem equipa própria e fica de fora.
- **Na proposta do cliente** (`DocsCliente.tsx`, "Como vai decorrer a obra"):
  - uma barra com as fases e a sua largura em dias, e um cartão por fase com as datas e os trabalhos, sem custos;
  - o pagamento leva as datas das prestações (`tranches(d, total, S)`).

### Previsto e real por fase, na Obra (14/10/2026)
- **Onde:** na fase Obra do negócio (V1, `FasesSimples.tsx` → `ObraPorFases.tsx`), com a obra concluída. Substitui as barras de horas por tarefa.
- **As contas** (`planoObra.ts`: `realPorFase`, `maiorDesvio`):
  - as horas reais de cada tarefa usam o fator real do serviço (`fatorReal`);
  - o custo real da fase é o previsto mais a diferença de horas × €/h;
  - os dias reais da fase são os previstos na proporção das horas, e as fases seguem umas atrás das outras;
  - a soma dá o mesmo custo real da obra (`realObra`), e há um teste a garanti-lo.
- **O ecrã:**
  - em cima, os dias úteis, o custo e a margem: o real, o previsto e a diferença;
  - por baixo, a frase da fase que mais se afastou e porquê (ex.: "A fase 3 (revestimentos) foi a que mais se afastou: +110,02 € e +0,5 dias. Revestimento de parede levou 18,45 h em vez de 15 h (+23%)");
  - uma linha por fase: a barra tracejada é o previsto e a cheia é o real, na mesma régua; ao lado, os dias, o custo com a diferença e a margem contra a orçada;
  - o "Atualizar a receita" continua por baixo.

### Pagamentos a rever, no Hoje (14/10/2026)
- **O que mostra:** `HojeSimples.tsx` lista os orçamentos ainda não aceites que, com as condições de pagamento escolhidas, deixam a obra a descoberto (`aDescoberto` em `planoObra.ts`), do maior buraco para o menor.
- **Cada linha:** "A descoberto até X €", o cliente, o serviço e as condições; tocar abre o negócio.
- **Quem a vê:** o comercial, a Direção e o Financeiro, e só quando há algum orçamento nessa situação.
- **Na seed:** o Sérgio Pinto (WC, 50% + 50%) fica a descoberto até 578,72 €.

## Voltar atrás e versões da proposta (14/10/2026, versão Atual)

Pedido do Ruben: poder voltar do orçamento à Visita, "fluido, intuitivo, guiado e lindo". Código em `VoltarAtras.tsx`; ações `reabrirVisita`, `desistirVisita` e `novaVersao` em `motor.ts`; testes em `versoesProposta.test.ts`.

- **Onde se procura:** no topo do orçamento há uma faixa com o estado da proposta e a ação do momento. A mesma pergunta aparece na Visita já feita (lista "Fases feitas"). O antigo "Reabrir levantamento", escondido nos produtos, sai da página simples.
- **Antes de enviar → "Voltar à visita":** abre uma confirmação que diz o que fica (preços mudados, desconto, datas, equipa e pagamento do plano da obra) e o que se refaz (as quantidades; a verificação e a aprovação). Na Visita, uma faixa diz "De volta à visita" e tem "Não mudar nada e voltar ao orçamento", que desfaz sem pedir campos.
- **Depois de enviar e antes de aceite → "O cliente pediu alterações":** dois passos. (1) O que pediu (outros materiais, juntar ou tirar trabalhos, baixar o preço, outras datas, outra forma de pagamento, e uma nota). (2) Onde se mexe: só no orçamento, ou na visita (sugerido quando o pedido são materiais ou trabalhos). A versão enviada fica guardada como substituída (`Orcamento.versoes`) e começa a seguinte.
- **Versões:** linha do tempo com o total de cada versão e a diferença para a anterior. O Hoje e o histórico dizem "Verificar e enviar a versão 2", "Proposta v2 enviada"; a proposta leva "PR 2026/1031 · v2" e "substitui a v1".
- **Refazer o orçamento** (fechar a visita outra vez) passa a guardar também o início da obra, a equipa, as prestações "Por fases" e as versões.
- Depois de aceite não há nova versão: o contrato parte da proposta aceite.

## Editar as ligações no mapa (14/10/2026, versão Atual)

Pedido do Ruben: "através da página de ligações, rapidamente adicionar e remover técnicos, consumíveis, equipamentos e produtos".
- **Juntar:** cada grupo de ligações diretas tem um botão no fim ("Juntar técnico", "Juntar equipamento", "Juntar consumível", "Ligar um produto"; com um técnico, equipamento ou consumível no centro, "Juntar a um serviço" / "Usar num serviço"; com um produto, "Escolher o serviço"). Abre o seletor com pesquisa, só com o que ainda não está ligado. O nó novo aparece aceso e a ligação desenha-se.
- **Retirar:** o × no nó (à vista no telemóvel; no computador ao passar o rato ou com o foco) desliga. Os produtos que o serviço só "pede" (pelo ramo), as alternativas e "quem instala" não se retiram daqui: não são ligações diretas.
- **Anular:** uma faixa escura em baixo diz o que mudou ("Canalização deixa de usar Fita e vedante.") com "Anular" durante 7 s; repõe a receita e o produto como estavam.
- **Valores por omissão:** técnico e equipamento entram com 0,5 h por unidade e o consumível com 1 por unidade; afinam-se na ficha. A receita passa a "editada" e os custos vão logo para os serviços em uso (o orçamento usa o mesmo custo).
- Lógica sem React em `editarLigacoes.ts` (`candidatos`, `juntar`, `retirar`, `podeJuntar`, `podeRetirar`); testes em `editarLigacoes.test.ts`.

## Contentor escolhido sozinho (14/10/2026)

O Ruben não via o contentor a ser calculado no orçamento: o motor punha sempre big bags e só *propunha* o contentor (a partir de 3 m³, com um toque). Agora (`entulho.ts`, `calcularDemolicao`):
- **A visita manda:** "Contentor de entulho" = "Na via pública (licença)" ou "Em espaço privado" → contentor, mesmo com pouco entulho; "Não" → big bags.
- **Sem resposta:** contentor a partir de "Contentor · usar a partir de" (3 m³), senão big bags.
- **Escolher à mão** continua a ganhar a tudo (com "repor o cálculo").
- **O porquê** aparece por baixo do meio: "Automático: 5,04 m³ chegam para o contentor (a partir de 3 m³)", "A visita pediu contentor (na via pública (licença))", etc.
- **Licença de via pública:** com o contentor na via pública aparece o aviso; o valor (por obra) configura-se nas Definições ("Contentor · licença de via pública") e entra no custo. Sem valor configurado, só o aviso (não se inventam preços).
- O preço da deposição não muda com o meio (o C_dep é "tudo incluído").

## Do contrato à obra (14/10/2026; circuito refeito a 16/10/2026)

Pedido original do Ruben (14/10): "o orçamento gera o contrato; depois do contrato assinado, gera uma encomenda de cliente e o plano…". **16/10 (decisão aprovada):** a encomenda de cliente deixa de nascer no contrato e de ser aprovada pelo comercial; nasce do **pagamento validado**, já no **Inventário novo** (`inventario/`).
- **Contrato assinado** (ou venda direta aceite) → `prepararPlanoDe`: só o **plano da obra**, gerado do plano do orçamento (`planoDoOrcamento`: as tarefas por fase, em dias úteis, cada uma com um técnico do ofício que não está de férias), **por aprovar**. **Encomenda nenhuma** (nem rascunho): o cartão "Encomenda" diz "Emite-se quando o pagamento for validado" e fica com o cadeado "depois do pagamento".
- **Pagamento** (Financeiro): a fatura e, ao **validar o pagamento** (`validar`), o recibo e logo a **encomenda de cliente `EC-<id do negócio>`**, emitida sozinha (sem aprovação) no Inventário novo pela ponte `inventario/ponteNegocios.ts` (`emitirNoInventario` → `emitirEcNoInventario`, que reaproveita o "Simular venda": `criarEc`). Lá aplicam-se as regras de sempre do Inventário: **reserva FIFO** do stock do Armazém Central e, do que faltar, a **encomenda ao fornecedor preferencial**, que nasce **Pendente** (por aprovar), mesmo com "envio direto" na definição; aprova-a no Inventário quem tem `purchase_orders.approve` (o perfil simulado) e, como os fornecedores das obras têm o portal ativo, segue pelo **portal do fornecedor**. O cartão mostra a fase de cada uma: por aprovar → no portal → recebida. Sem fornecedor preferencial, fica "sem fornecedor". O negócio passa à Obra.
  - A origem no Inventário é o contrato `CT 2026/<id>` (ou a venda direta `VD 2026/<id>`); é por ela que a encomenda se reconhece: **validar outra vez não a duplica** (idempotente). O número `EC-<id>` é o mesmo no negócio e no Inventário.
  - As linhas são as da encomenda do negócio (`gerarEncCliente`: os materiais do modelo pelas medidas e os produtos escolhidos na visita, menos os que o cliente fornece), com o preço do contrato; as quantidades arredondam para cima (o Inventário conta em unidades inteiras).
  - Os materiais das obras (cerâmico, pavimento, sanita, base de duche, cimento-cola, móveis, bancada) e os três fornecedores de exemplo (Cerâmica do Centro, Sanitários do Tejo, Madeiras e Cozinhas) entram no Inventário da primeira vez que são precisos (`garantirArtigosObra`), com o stock de abertura que o motor já tinha; os produtos da visita entram como produtos novos com o artigo do fornecedor. O resto do Inventário (regras, ecrãs, seed) não mudou.
  - O Inventário vive em memória: ao recarregar a página (ou ao "Repor dados" lá), `sincronizarEcsNegocios` volta a emitir as encomendas dos negócios pagos que lá faltam (não as das obras concluídas nem as eliminadas no Inventário).
  - Se a emissão falhar (uma regra do Inventário recusa), o passo "Emitir a encomenda de cliente" fica para o Financeiro (`A.emitirEc`).
- **Plano aprovado (Operações)**, só depois do pagamento.
- **Arrancar a obra (Operações), 19/10:** com o pagamento validado, o plano aprovado e os **materiais garantidos no Inventário** (`faltaParaArrancar` → `faltaMateriais` em `ponteNegocios.ts`): a encomenda de cliente emitida e não eliminada, nenhuma linha sem fornecedor, **nenhuma encomenda a fornecedor por aprovar nem por receber** (as enviadas e ainda não recebidas também seguram o arranque, como na Frota) e cada linha saída, pronta a sair no armazém ou a bordo da carrinha (o critério da Frota para carregar, `faltaParaCarregar`). O "Falta …" diz o que fazer e onde ("aprovar a encomenda a fornecedor PO-… no Inventário (Compras)", "receber no armazém a encomenda PO-… (prevista a dd/mm)"). As obras antigas do exemplo (encomenda sem origem no Inventário) não bloqueiam. Os ecrãs que mostram isto leem o Inventário ao vivo (`useInventario`): o cartão do negócio, a página e a lista das obras (Atual e V2), a fase Obra e as condições ("Materiais no armazém").
- **Anular depois do contrato (19/10, dois sentidos):** no negócio (aspeto simples e Atual), **"Anular contrato"** (ou "Anular venda") com o motivo obrigatório, só a **Direção** (`contracts.cancel`) e só antes de a obra arrancar (com a obra em curso ou concluída recusa: "Anular agora pede o acerto do que já foi feito: fora do protótipo"). `A.anularContrato` marca o negócio **perdido** (`anulado`, com o motivo) e elimina a encomenda de cliente no Inventário (`anularEcNoInventario` → `eliminarEc`: estorna as saídas, liberta as reservas e anula as encomendas a fornecedor ligadas). Se o sinal já estava pago, fica a nota no histórico (devolve-se fora da Olyvia). No outro sentido, eliminar no Inventário a encomenda de um negócio ("Vem do negócio #…") anula o negócio sozinho (`ecsEliminadasDeNegocios` → `A.ecEliminadaNoInventario`, na sincronização do `PrototipoNegocios.tsx`). "Marcar perdido" deixa de servir depois do contrato. No Inventário, "Anular contrato" pede `contracts.cancel` ao perfil simulado (o Administrador tem tudo).
- **Sem encomendas a fornecedor no motor (19/10):** saíram `obra.enc`, as ações `confirmarEnc`, `receberEnc`, `confirmarEntrega`, `receberLinhas` e o portal do fornecedor do protótipo (`PortalFornecedor.tsx`); as encomendas a fornecedor vivem só no Inventário (e o portal do fornecedor é o da app real). VERSAO 17.
- **Ecrã** (`CaminhoObra.tsx`), no negócio a partir do Financeiro: "Do contrato à obra", com a barra de progresso, o contrato em cima, o Pagamento a toda a largura e depois a Encomenda e o Plano. O trilho da Encomenda **lê o estado da encomenda no Inventário** (`useInventario` + `resumoEcNegocio`: reservada, encomendada ao fornecedor com a PO, saiu para a obra), redesenha quando lá muda alguma coisa e tem "Abrir no Inventário", que abre a folha da encomenda em **Saídas para clientes** (`A.abrirInv(id)` → `pedirAbrirEcInv`). O arranque mostra as três condições (sinal pago, encomenda emitida, plano aprovado).
- **Hoje:** antes do pagamento, o Financeiro (fatura, pagamento); depois, as Operações (plano, arranque). Ninguém aprova a encomenda (`aprovarEc` e `validarEf` foram retirados do motor).
- **Exemplo:** Tiago Almeida (1027): contrato assinado, só com o plano. As obras antigas do exemplo (Marta 1022 e Joana 1050) foram pagas antes do Inventário novo: a encomenda delas (`EC 2026/001` e `002`) fica como histórico, sem origem no Inventário ("Materiais na obra"). Lógica sem React em `preparacaoObra.ts` e `inventario/ponteNegocios.ts`; testes em `preparacaoObra.test.ts` (assinar → sem EC; validar → EC no Inventário com reserva e PO do que falta; idempotência; venda direta; Hoje; arranque). VERSAO 16.
- **Custos da encomenda** (14/10): cada linha da encomenda de cliente tem custo e preço por unidade. Nos materiais do modelo, reparte-se a linha de materiais do orçamento pelas partes da estimativa (`LINHAS.mat.partes`) e, dentro de cada parte, em partes iguais (`custosDosMateriais`); os produtos da visita usam o custo do Catálogo. Mostra-se o custo, o valor na proposta e a margem.
- **Operações:** a lista mostra as obras desde o contrato (plano por aprovar depois do pagamento); a página da obra (Atual) mostra as condições para arrancar, os materiais por fase com o estado lido do Inventário ("na obra", "reservado", "encomendado", "a chegar") e as viaturas da obra (Frota).
- **Nota de encomenda** (`NotaEncomendaDoc`, em `DocsCliente.tsx`): o documento do cliente, com o **preço** (nunca o custo) e o estado de cada linha lido do Inventário (reservado em armazém, encomendado ao fornecedor, saiu para a obra). Vai ao portal do cliente quando a encomenda é emitida.
- **V2 funcional:** o `InventarioSimples` fica com os separadores Encomendas de cliente e Stock (19/10: sem "Encomendas a fornecedor", que vivem no Inventário); as encomendas de cliente leem o estado do Inventário novo e o "a chegar" do Stock soma o que as encomendas a fornecedor de lá ainda trazem.
- **Revisão do fluxo inteiro** (14/10, no browser, papel a papel, até "Obra em curso"):
  - o valor recebido por omissão passa a ser o **sinal com IVA** (a primeira prestação, `valorSinal`), igual ao da fatura. Antes era o total da obra sem IVA. As taxas de IVA passam a estar só no motor;
  - a pergunta **"Contentor de entulho"** passa para a **visita** (Acesso e estacionamento); estava em "Preparar a obra", tarde demais para o orçamento. Mudar o acesso ou o contentor refaz a conta do entulho;
  - o **"Início"** da preparação da obra vem preenchido com o início do plano quando as Operações o aprovam;
  - VERSAO 14.
- **Férias em datas reais** (14/10): os técnicos têm as férias no calendário (`Tecnico.feriasDatas`; o Sérgio, de exemplo, a 21–23 out). Nos planos do orçamento, os conflitos, o técnico escolhido sozinho, a troca e o "adiar" usam as datas reais (`diaDeFerias`); a escolha do técnico diz "de férias a qua, 21 out". Os planos de exemplo continuam pelo índice do dia.
- **Entrega no dia do arranque:** se as encomendas a fornecedor da encomenda de cliente (no Inventário: a data prometida no portal ou, sem ela, a prevista) chegam no dia em que a obra começa (ou depois), avisa nas Operações, com as encomendas e um botão "Começar a {dia útil a seguir à entrega}" (`entregaTarde`, 19/10).
- **Mudar a proposta depois de aceite:** enquanto o contrato não está assinado, "O cliente pediu alterações" continua a funcionar. A versão aceite fica guardada como aceite e substituída, e o contrato enviado fica anulado.
- **Trabalhos a mais (adenda)** (`adendas.ts`, `TrabalhosAMais.tsx`, `AdendaDoc`):
  - **Quando:** depois do contrato assinado (ou da venda direta aceite) e antes do fim da obra.
  - **Como se faz:** escolhe-se o porquê (o cliente pediu, surpresa em obra, erro de medição) e os serviços do Catálogo, com a quantidade. As contas aparecem ao vivo (+ € sem IVA, + € com IVA a 6%, + dias). Depois envia-se ao cliente.
  - **O documento** `AD 2026/{negócio}-{n}` partilha-se como os outros.
  - **Ao assinar** (no portal; aqui, simulado), as tarefas entram no plano no fim da fase de cada serviço e as das fases seguintes andam para a frente. Se o plano já estava aprovado, volta às Operações.
  - **Pagamento:** com a última prestação.
- **Portal do cliente** (`PortalCliente.tsx`, botão "Portal do cliente" no negócio, a partir da proposta enviada): o que o cliente vê no telemóvel.
  - **Em que ponto está:** Proposta → Contrato → Materiais → Obra.
  - **"O que precisa de si":** ver e aceitar a proposta, ou "Gostava de mudar alguma coisa" (o pedido vai para o histórico do comercial); ler e assinar o contrato e as adendas; pagar a fatura, com "Já paguei" e a referência (o comprovativo fica para o Financeiro validar).
  - **A sua obra:** as fases com as datas e os materiais.
  - **Documentos:** proposta, contrato, nota de encomenda, adendas e fatura.
  - As ações são as do motor, por isso o resto do protótipo reage.
- ~~Portal do fornecedor (`PortalFornecedor.tsx`)~~: retirado a 19/10 (as encomendas a fornecedor vivem só no Inventário; o portal do fornecedor é o da app real).
- **Toques nas Necessidades** (medido a 14/10, WC típico): 11 toques do primeiro ecrã ao fim do passo (detalhe em `docs/melhorias-v2-2026-10-13/toques-necessidades-2026-10-14.md`, local). GIF do percurso para a Mudelar: `docs/melhorias-v2-2026-10-13/percurso-mudelar-2026-10-14.gif` (11 ecrãs, do Hoje à obra concluída).
- **A proposta formal** (`PropostaDoc` em `DocsCliente.tsx`, 14/10): quatro páginas A4, com o cabeçalho e o rodapé da empresa e a numeração das páginas.
  - **Capa:** a marca, "Proposta de remodelação", a obra e a morada, para quem é, a data por extenso e a validade. Por baixo, o essencial: o total com IVA, o prazo da proposta, o início previsto e a garantia. Fecha com a carta de apresentação, assinada pelo comercial.
  - **1. O que vamos fazer:** os trabalhos por fase da obra.
  - **2. Materiais e escolhas:** os incluídos no modelo e os escolhidos com o cliente.
  - **3. Orçamento detalhado:** por fase, com a quantidade, o preço unitário, o subtotal da fase, o desconto, a mão de obra e os materiais sem IVA, o IVA a 6% e a 23%, e o total.
  - **4 a 7:** o planeamento, o pagamento (prestações com as datas), as condições e a aceitação, com as assinaturas.
- **O leitor** ("Abrir em ecrã inteiro", em todos os documentos): fundo de secretária, as páginas com sombra, zoom de 60% a 160%, "Imprimir ou PDF" (uma página por folha) e Escape para fechar. Abre no `body`, por portal, para cobrir o ecrã todo mesmo dentro de um passo animado.

## O cliente fornece só produtos; o Catálogo virá do fornecedor (15/10/2026)

- **O cliente fornece só produtos** (e o material das trocas sem produto escolhido). Os consumíveis e os equipamentos das receitas são sempre da empresa: saíram do passo "O cliente fornece", do orçamento e da proposta (`forneceCliente.ts` removido). Na proposta, "Fornecido por si" mostra quanto o cliente poupa em cada produto.
- **Campos só de casa de banho** ("Toalheiro elétrico", "Mobilidade reduzida") não aparecem numa cozinha: `visivel()` em `campos.ts` aceita `se: { k: "@divisao" | "@divisoes", v: [...] }`.
- **Para a migração (decisão do Ruben):** o Catálogo de produtos e os seus custos serão **inseridos pelo fornecedor, no portal do fornecedor** (nome, marca, referência, unidade, custo, disponibilidade, prazo, fotografias, com data de atualização). A empresa escolhe os fornecedores e produtos que usa, as margens/PVP e o serviço que instala cada produto. O orçamento guarda uma cópia do custo, por isso uma proposta enviada não muda com a atualização do fornecedor. No protótipo, o Catálogo é de exemplo (o portal do fornecedor do protótipo saiu a 19/10: testa-se o da app real).
