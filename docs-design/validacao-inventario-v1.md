# Validação da lógica nova do Inventário no V1 (16/10/2026)

Commits validados (Rafael, ramo partilhado `feat/negocios-prototipo`, trazidos para o `feat/v1`):
- `08d73000`: a encomenda de cliente é emitida no Inventário novo quando o pagamento é validado; Inventário e Frota passam para a Atual;
- `d3a26885`: as encomendas a fornecedor que nascem da encomenda de cliente ficam pendentes e seguem pelo portal;
- `184a3453`: viatura ligada a obras e transporte dos materiais por fases.

Como se validou:
- **Testes:** `src/pages/prototipo-negocios/validacaoInventarioV1.test.ts`. O que está certo é um teste normal. Os achados ficam como `it.fails`: falham hoje e avisam quando forem corrigidos.
- **Browser:** o percurso feito a partir do V1. Na ficha do Tiago Almeida, como Financeiro: emitir a fatura, validar o pagamento, ver no Inventário, aprovar a encomenda a fornecedor e recarregar a página.

## O que está certo

A lógica está certa e pode ser replicada.

1. **O número da encomenda.** Fica "EC-1027" e a origem "CT 2026/1027", iguais no negócio e no Inventário. Validar outra vez não duplica (testes do Rafael e meus).
2. **A reserva.** Segue a ordem de entrada (FIFO) no Armazém Central, e o que falta vai ao fornecedor preferido. No Tiago, 44 unidades: 21 em stock e 23 em encomenda a fornecedor (Cerâmica do Centro e Madeiras e Cozinhas). O reservado e o em falta do negócio batem com o Inventário, linha a linha.
3. **As encomendas a fornecedor.** Nascem "Pendente". Aprovadas no Inventário ("Aprovar e enviar"), passam a "Encomendado · No portal", e o negócio lê "no portal do fornecedor".
4. **No V1:** o negócio pago sai do quadro de Negócios e passa a contar em "em obra". Na ficha da pessoa, o passo seguinte é "Aprovar o plano", com "Este passo é de Filipe" e "Mudar para".

## Achados

| # | O quê | Impacto | Proposta |
|---|---|---|---|
| 1 | **O Inventário não grava nada.** `inventario/loja.ts` vive em memória; o negócio e a Frota gravam no `localStorage`. Ao recarregar, `sincronizarEcsNegocios` volta a emitir a encomenda do zero. Visto no browser: a PO-2026-0147 aprovada voltou a "Pendente". O mesmo acontece ao receber, dar saída ou carregar a carrinha (o transporte por fases lê os movimentos do Inventário, mas a ligação da viatura à obra está gravada na Frota). | Alto numa demonstração: recarregar a página desfaz o trabalho no Inventário e deixa o negócio e a Frota a dizer outra coisa. | Gravar o Inventário no `localStorage`, como a Frota (`executar` grava). Teste: `it.fails` "sobrevive a recarregar". |
| 2 | **Duas contas de stock.** O motor estima o reservado antes do pagamento com `S.stock`, o stock de abertura (`calcMats`), que já não desce. O Inventário é que reserva. | Médio: depois de uma obra reservar, a estimativa de um segundo negócio conta com material que já não está livre. O aviso de materiais a tempo fica otimista. | Antes do pagamento, estimar com o stock livre do Inventário (`livreEm`, armazém LIS). Teste: `it.fails` "usa o stock livre do Inventário". |
| 3 | **Dois primários na página do negócio, depois da fatura.** O cartão "Do contrato à obra" (`CaminhoObra.tsx`) tem "Validar o pagamento" e o passo tem "Validar pagamento". | Baixo; contra a regra P1. | No cartão, o botão passa a secundário, ou a ligação leva ao passo. |
| 4 | **Três "hojes".** A encomenda tem a data de 09/10 (o relógio do Inventário), o negócio usa 10/10 e a Frota 14/10. | Baixo: estranha-se ao ver lado a lado. | Uma só data de "hoje" no protótipo. |
| 5 | **"A aguardar PO" dá 0** com 23 unidades em encomendas a fornecedor por aprovar. | Baixo: parece contar só as encomendas já enviadas. | Confirmar com o Rafael e o Miguel o que o indicador deve contar. |
| 6 | **Um caso raro no emparelhamento das linhas.** O motor junta as linhas do negócio às do Inventário pela posição. Se duas linhas derem o mesmo artigo, ou uma quantidade for arredondada a 0, desalinham. | Muito baixo hoje. | Emparelhar pelo artigo (SKU). |

## O que se corrigiu no nosso V1 durante a validação

- **O passo na Obra.** A ficha da pessoa usava a regra da camada de Pessoas da V2, que diz "Concluído" a partir da Obra. Isso escondia passos reais: "Aprovar o plano" (Operações), "Obra em curso" e "Rever a margem real" (o próprio comercial). Agora usa o passo do motor.
- **O estado na lista da ficha.** Um negócio pago com a obra por fazer aparecia como "Concluído"; agora diz "Em obra".

## Para replicar no nosso V1

- **Transporte por fases** (`184a3453`). "Ligar a ordem ou obra", "Carregar" e "Entregar na obra" estão só na ficha da Frota de exemplo (Ligações), que o nosso V1 esconde. Falta pô-los na viatura da Frota do V1, como uma tarefa do "O que fazer agora": "Carregar os materiais da obra #1027".
- **Inventário.** Fica o do Rafael, sem mudanças. Quando o achado 1 estiver resolvido, revalidar com o teste `it.fails` correspondente.
