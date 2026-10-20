# Etapa 5.16 — calçadas e meio-fios em Web Worker

## Objetivo
A partir do WorldGen 5.15, a união de asfalto de regiões vizinhas já podia operar num Worker independente. Mas a reconstrução de **calçadas, guias, rampas, canteiros e piso tátil** ainda fazia muito trabalho na thread principal. A Etapa 5.16 desloca a parte geométrica desse compositor para outro Worker, exclusivamente no **streaming experimental**.

## Fluxo de construção
1. O gerador principal obtém a topologia original OSM, o perfil de altitude, os quads de asfalto, os passeios e os pontos válidos de travessia.
2. A união do asfalto continua usando o Worker da Etapa 5.15 (ou seu fallback).
3. O **Worker de calçadas** recebe `asphaltPatches`, `walkPatches` incluindo canteiros, `junctions` e `rampSites` previamente confirmados. Esse Worker chama **a mesma função `composeRoadsideMeshes`** do modo tradicional, com a mesma prioridade de vias e o mesmo algoritmo de recorte.
4. O resultado contém quatro `Float64Array`: `walk` (triângulos), `median` (triângulos), `curb` (quads com 4 vértices) e `tactile` (triângulos). Cada categoria mantém sua ordem original de emissão e as alturas originais.
5. O Worker transfere os quatro buffers em uma única mensagem, sem copiar os arrays de retorno. A thread principal reexecuta apenas a distribuição das primitivas entre buffers Three.js, cedendo o controle a cada 120 primitivas.
6. Somente depois da conclusão de todas as fases o setor entra na cena, sem exibir um passeio ou meio-fio incompleto.

O compositor de calçadas não foi substituído por um algoritmo aproximado. A saída do Worker é construída a partir de sua implementação original, importada como JS puro.

## Proteções

- **Modo tradicional**, **setor inicial** e **teleporte emergencial** continuam síncronos, sem esperar Worker e sem criar deadlocks.
- Se o navegador não aceitar Web Worker ESM, recusar a criação, emitir erro, devolver saída inválida ou ficar sem responder após **12 segundos**, a região usa o mesmo compositor cooperativo da 5.14.
- O generator tem `finally` para cancelar o Worker quando uma região é abandonada. Mensagens atrasadas não reativam setores descarregados.
- As estatísticas do streaming e do painel exibem o número de regiões concluídas pelo Worker de calçadas e o número de fallbacks.
- O Worker **não acessa WebGL nem a cena**, e não altera o índice de física, o relevo Mapzen, as posições OSM ou o minimapa.

## Arquivos
- `src/worldgen-roadside-job.js`: cálculo puro, separação de materiais, validação e replay em lotes.
- `src/worldgen-roadside.worker.js`: ponto de entrada ESM do Worker do navegador.
- `src/worldgen-roadside-client.js`: ciclo de vida, mensagens, cancelamento e fallback.
- `src/city-road-mesh.js`: integração condicional no streaming, mantendo a API síncrona existente.
- `src/city-world-stream.js`: métricas acumuladas por região.
- `src/worldgen-overlay.js`: contadores no HUD.

## Testes
`tests/worldgen-roadside-worker.test.js` compara exatamente os vértices e estatísticas das quatro categorias, incluindo cenários com canteiros, rampas e piso tátil. Testa replay tipado, respostas inválidas, fallback, cancelamento e um recorte com **100 vias OSM reais do Grajaú**.

`tests/worldgen-roadside-thread.test.js` inicia a implementação exata do Worker em uma **thread Node.js real**, com guias, rampas e sinalização tátil, conferindo buffers e resposta a mensagens inválidas. Isso vai além de usar mocks.

No CI: **214 testes aprovados, zero falhas.** Na amostra de 100 vias:
- 953 patches de asfalto como contexto para o compositor de passeio;
- 11.009 triângulos de calçada;
- 3.519 quads de meio-fio;
- 1.130.472 bytes transferíveis no conjunto de materiais;
- os dados coincidiram com o compositor síncrono original.

As contagens se referem a essa amostra do teste e **não equivalem ao total de triângulos carregados no jogo**.

## Como inspecionar no navegador
Abrir o modo experimental:

https://devsouza208.github.io/buzun-simulator/?worldgen=stream

Esperar algumas regiões vizinhas chegarem e conferir no painel:
- `Asfalto Worker` — concluídas e fallback;
- `Calçadas Worker` — concluídas e fallback;
- `Pior etapa` — operação que mais consumiu tempo na thread principal;
- `FPS`, `Triângulos no frame` e `draw calls`.

Conferir visualmente em uma entrada lateral da Av. Dona Belmira Marin: guia e calçada contínuas, rampas e piso tátil assentados, sem calçadas atravessando asfalto ou rachaduras nas fronteiras dos setores.

## Limitações
O envio dos quads para o Worker envolve clonagem da entrada; o resultado transferido economiza a cópia de volta. O replay, a costura da malha, o terreno, a construção inicial e as operações emergenciais ainda rodam na thread principal. Por isso o ganho dependerá do custo relativo de composição versus comunicação e não representa garantia de 60 FPS.

A geometria foi testada em Worker real **em Node**, mas o desempenho visual ainda precisa ser medido no Chrome/Firefox, especialmente após percorrer uma fronteira de região dirigindo o ônibus. O streaming **permanece opcional**, e o modo tradicional continua sendo o padrão até termos esse teste.

## Próxima etapa
**5.17 — estabilidade de condução e cache de regiões**: medir tempos de construção com o overlay durante movimento efetivo do ônibus, reduzir recomposições quando uma região recém-visitada é descartada e revisitar a precisão de altura no limite de setores.
