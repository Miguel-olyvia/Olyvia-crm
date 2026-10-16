# O V1 do Ruben: Pessoas, Negócios, Números e Frota (16/10/2026)

> **Ramo `feat/v1`** (desde 16/10). O protótipo é só o V1: não há seletor de versão e "Pessoas numa página" vem ligada por defeito (`src/pages/prototipo-negocios/ramoV1.ts`). A V2 e a V2 funcional continuam nos ficheiros, para os merges do ramo partilhado `feat/negocios-prototipo` serem fáceis. No ramo partilhado, a proposta fica desligada por defeito.

Para o Rafael e o Miguel. A proposta parte do que fizeram na V2 e na V2 funcional: aproveita a lógica e corta na interface.

**Como ver:** no protótipo, escolha a Versão **Atual** e ligue **"Proposta nova"** no menu lateral (no telemóvel está em "Mais"). Desligada, o V1 fica como estava. A V2 e a V2 funcional não mudam.

## O que estava a complicar

Contagem feita na V2 e na V2 funcional, antes da primeira linha da lista:

- **Pessoas:** cerca de 15 controlos à vista e outros 20 no popover de filtros, com 12 `<select>`.
- **Negócios:** cerca de 20 controlos.
- **Pessoas › Lista (funcional):** cerca de 25 controlos.

Os problemas que se repetem:

1. **O mesmo filtro em 2 a 4 sítios.**
   - "Atrasadas" aparece como chip, como interruptor e como grupo do Hoje.
   - "Para enviar", "À espera" e "Por assinar" repetem as próprias colunas do quadro.
2. **Oito níveis até ao documento de um negócio:** separador › papel › chips › vistas › popover › painel › separador da ficha › mestre-detalhe.
3. **Os filtros servem o dashboard, não o comercial.** O README diz que alguns existem "porque os cartões do dashboard têm de os aplicar".
4. **Três "Hoje" diferentes:** o do menu, Pessoas › Hoje e Negócios › Hoje.
5. **Ferramentas de back-office à frente de quem está na rua:** CSV, colunas, densidade, seleção múltipla e atalhos j/k.
6. **Registar coisas que não fazem avançar nada.** Os registos do dia perdem-se ao recarregar e o quadro funcional não muda a fase. Isto vai contra a regra P6 das guidelines.

## A proposta: três decisões

1. **Uma pessoa, uma página.** A lista tem só pesquisa e três grupos: Em curso, Clientes e Perdidas.
   - Sem dashboard, sem popover e sem painel lateral.
   - A ficha é uma página sem separadores, por esta ordem:
     - o que fazer agora, com **um** primário (o próximo passo do motor);
     - os negócios, cada um abre a sua página;
     - o histórico;
     - os dados.
   - Se o passo é de outro papel, diz de quem é (guidelines C27) e não mostra o botão.
2. **Negócios fica o quadro de sempre, da lead à obra** (decisão aprovada a 16/10: Pessoas e Negócios não se separam). O quadro só por documento (quatro colunas, NegociosV1Docs.tsx) fica nos ficheiros, sem uso.
   - Proposta original, posta de lado: quatro colunas, Orçamento, Proposta, Contrato e Pagamento.
   - Lead, contacto e visita são da pessoa e ficam em Pessoas; a obra fica nas Operações.
   - Por baixo do quadro, uma frase diz quantos estão antes e depois, com ligações.
   - O cartão, a pesquisa e os filtros são os do V1 de sempre.
3. **Um só Hoje: o do V1.** O que há para fazer está no Hoje e no "O que fazer agora" da pessoa, e nada mais. O dashboard é uma ferramenta da Direção e passa para lá (fica por fazer).

**Os factos fazem avançar.** O primário da ficha é a ação do motor (`fazer(A, act, id)`), a mesma do Hoje. Exemplo: "Registar chamada" passa o Pedro Lopes a "Marcar a visita" sem sair da página.

**Orçamentos alternativos (decisão de 13/10).** Na ficha, um negócio com vários orçamentos mostra o intervalo ("1.000,00 € a 3.000,00 €") e "2 orçamentos alternativos". Os valores nunca se somam. `valorNegocio` em `negociosApp.ts` ainda soma: é preciso alinhar.

## O que se reaproveitou da V2 (sem mudar nada)

- `leadsApp`, `clientesApp`, `perdidasApp` e `proximoNegocio`, de `pessoasDocs.ts`;
- `negociosDe`, `docFase` e `semPaginaPropria`, de `negociosApp.ts`;
- `perfilDe`, `atividadeDe` e `estadoDe`, de `perfilDocs.ts`.

## Ficheiros

- `src/pages/prototipo-negocios/pessoasV1Docs.ts`: a lógica, sem React. Testes em `pessoasV1Docs.test.ts`.
- `src/pages/prototipo-negocios/PessoasV1.tsx`: a lista e a ficha.
- `src/pages/prototipo-negocios/NegociosV1Docs.tsx`: o quadro por documento.
- `PrototipoNegocios.tsx`: o interruptor (localStorage `olyvia-prototipo-v1-proposta`), o encaminhamento e a barra de baixo no telemóvel. Só se acrescentou código.
- `NegocioSimples.tsx`: o voltar regressa à pessoa quando o negócio se abriu a partir da ficha.

## Auditoria e testes de A a Z (16/10, à tarde)

Fiz o percurso no browser, em computador (1440 px) e telemóvel (390 px): lead nova, chamada, visita, levantamento, fatura e pagamento. Usei vários papéis (Comercial e Financeiro), pessoas de exemplo, perdidas e clientes com negócio novo. Também experimentei ligar e desligar o interruptor, trocar para a V2 e voltar, e "Repor a demonstração".

O que se corrigiu:

1. **"Nova lead" levava ao quadro antigo de 6 colunas**, que tinha outro primário ("Novo negócio"). Além disso, um formulário a meio (`S.novo`) ficava pendurado e tapava o quadro novo com o erro "Falta o nome.". Agora a lead cria-se na própria página Pessoas e a ficha abre logo. Com a proposta ligada, Negócios mostra sempre o quadro por documento.
2. **Dentro da ficha, o menu "Pessoas" não voltava à lista**, e o utilizador ficava preso. Agora o menu e a barra de baixo levam sempre à lista.
3. **O voltar da página do negócio dizia sempre "Negócios".** Quando se entra a partir da ficha, mostra agora o nome da pessoa e regressa à ficha (`pessoaDeOrigem`, em `NegocioSimples.tsx`).
4. **Num cliente, o passo real pendente ficava escondido atrás de um negócio de exemplo.** Era o caso do Tiago Almeida, com "Emitir a fatura" por fazer. Agora o negócio principal manda enquanto não estiver concluído; só depois conta o negócio novo. A lista e a ficha usam a mesma regra.
5. **Um cliente com o negócio antigo concluído mostrava "Novo negócio · Concluído".** Agora mostra o negócio novo e o seu estado.
6. **Uma lead criada agora mostrava notas inventadas**, com data anterior a ela existir. Deixam de aparecer. A ordem errada vem de `minutosAtras` (`perfilDocs.ts`), que conta "10/10 15:08" como mais recente do que "hoje 10:34"; fica para o Miguel ver.
7. **Pessoa de exemplo:** mostrava o passo sem botão e sem dizer porquê. Agora explica que não tem página própria.
8. **Pormenores:**
   - "é de o cliente" passou a "é do cliente";
   - morada vazia mostra "Por indicar";
   - o leitor de ecrã diz "1 pessoa", no singular;
   - o erro só fica ligado ao campo em falta;
   - com o formulário aberto há um só primário.
9. **Telemóvel:** com a proposta, Pessoas passa para a barra de baixo e o Inventário vai para "Mais". É o ecrã que o comercial mais usa.

Testes:
- `pessoasV1Docs.test.ts` (10) testa a lógica;
- `PessoasV1.test.tsx` (5) testa a app inteira: o interruptor, a nova lead, o voltar e o menu, e o passo de outro papel.

A suite do protótipo tem 1444 testes. Na execução completa falham 2 da V2 (`CatalogoV2` e `DefinicoesV2`) por tempo (5 s); sozinhos passam.

## 16/10, à tarde: o V1 assumido ("assume tu")

Decisões tomadas sozinho, para o Ruben validar:

1. **Ramo próprio.** Ver o aviso no topo. Nos testes, `RAMO_V1` vale `false`, para os testes dos colegas continuarem a valer sem lhes mexer; os testes do ramo forçam-no com `vi.mock`.
2. **Ficha da pessoa:**
   - "Marcar como perdida" é uma ligação cinzenta (C1). A confirmação abre no sítio (C23), pede o motivo em botões (P5) e diz a consequência. O motivo fica no negócio (`motivoPerda`) e sobrevive a recarregar a página.
   - Num passo de outro papel aparece "Mudar para …" (C27).
3. **Números** (menu, só no V1): o que a Direção vem ver, no lugar dos dashboards que saíram do ecrã do comercial.
   - Primeiro o que pede uma decisão (exceções à margem), com o único primário.
   - Depois quatro números: em proposta, ganho, conversão e margem média com o mínimo.
   - Depois as etapas a que os negócios chegam, de onde vêm e porque se perdem.
   - Só dados do Estado, nada inventado. Barras de uma só cor, com o valor escrito ao lado.
4. **Frota** (menu, só no V1). A Frota do Rafael tem 10 ecrãs, 9 separadores e 13 diálogos. Aqui são dois ecrãs, com as regras e as ações dele sem mudar (`frota/`):
   - **Frota:** "O que fazer agora" com a tarefa mais urgente e o formulário dela ali mesmo. As tarefas são: manutenção a dar como feita, documento a renovar, revisão a marcar e multa a identificar (com o condutor sugerido, marcado como tal). Depois vêm as outras tarefas e as viaturas.
   - **Viatura:** uma página com o que fazer agora, "Registar" (km, abastecimento, avaria, multa ou sinistro), datas, esta semana, custos e histórico. Com um registo aberto, o primário passa a ser o desse registo (P1).
   - Os erros das regras aparecem no campo, com o foco lá (R6). As datas escolhem-se num toque (C7).
   - Ficheiros: `frotaV1Docs.ts` (lógica e testes) e `FrotaV1.tsx` (testes de interface).
5. **Robô do botão principal (Q2)** a 390 px, do Hoje em diante. Em cada ecrã toca no primário, responde ao que está marcado em falta e troca de papel quando o passo é de outro. Encontrou três coisas, já corrigidas:
   - **Perguntas sem marca.** O contador e as datas rápidas em falta só tinham a borda vermelha: sem `aria-invalid`, o leitor de ecrã não dizia nada e o foco da validação (R6) não chegava lá. Agora o "Mais" do contador e as datas rápidas ficam marcados (`CamposFase.tsx`, teste `camposInvalidos.test.tsx`).
   - **"Completo" com uma falta por resolver.** Um passo dizia "completo" com a fotografia ainda em falta. Agora diz "falta 1 coisa, em baixo" (`NegocioSimples.tsx`). Além disso, o "Tirar foto" fica marcado e ligado ao aviso (`FotosEtapa.tsx`).
   - **O resumo das Necessidades fazia andar em círculos.** Com respostas em falta, o primário era "Continuar": levava ao "Fim", o portão falhava e voltava-se aqui. Agora, com faltas, o primário é "Responder o que falta" e leva à primeira resposta em falta; com tudo respondido, volta a "Continuar" (`SelecaoGuiada.tsx`, teste em `selecao.test.tsx`).

   Na Frota, o robô chega a "Nada por fazer" em 7 toques, sem becos.
6. **Margens (Q1)** a 360, 390 e 1280 px (emulação de dispositivo, com o movimento reduzido ligado) em Pessoas, ficha, perda, Negócios, Frota, viatura, Números e Hoje: nada sai das margens. Os únicos alvos abaixo de 44 px eram as ligações "Pessoas" e "Operações" no rodapé de Negócios, já corrigidas.

## Fica por decidir

- **Marcar como perdida na ficha.** Hoje faz-se na página do negócio.
- **Dashboards de Pessoas e Negócios.** Passam para uma página da Direção?
