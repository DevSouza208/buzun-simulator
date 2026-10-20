# Etapa 5.14 — geração cooperativa por setores (sem bloquear toda uma região)

## Problema medido

As versões 5.11–5.13 iniciavam a geração de cada região vizinha num `requestIdleCallback`, mas executavam `createRoadScene` inteiro dentro da mesma callback. Em regiões grandes, uma única operação concentrava união do asfalto, recorte de calçadas, meio-fio e construção de BufferGeometry — potencialmente **centenas de milissegundos sem renderizar novo frame**, mesmo que tivesse começado num momento ocioso.

A Etapa 5.14 modifica **somente a maneira de agendar e executar** a mesma composição geométrica. Os procedimentos de recorte, prioridade viária, altura, guias, rampas e zebra continuam os mesmos.

## Geradores retomáveis

- `src/asphalt-union.js` exporta `unionAsphaltSteps(...)`: após cada lote de 20 triângulos de entrada completamente processados, o generator produz um checkpoint. Todos os polígonos do lote são finalizados e inseridos no índice de prioridade antes de ceder. O contrato síncrono anterior `unionAsphaltPatches` é um wrapper que consome o mesmo generator até o fim.
- `src/sidewalk-union.js` exporta `composeRoadsideSteps(...)`: gera checkpoints a cada 14 patches de passeio concluídos, e também durante o cálculo posterior das guias, para permitir que a animação retome entre as fases mais pesadas. O antigo `composeRoadsideMeshes` executa exatamente esse generator até o fim.
- `src/city-road-mesh.js` exporta `createRoadSceneSteps` e mantém `createRoadScene`. O processo retoma entre conjuntos de vias, composição do asfalto, passeio, guia, recorte de região, fechamento de costuras e criação de cada material WebGL. A cena **só recebe o grupo de renderização depois que todos os materiais da região estão montados**, impedindo exibí-la pela metade.
- `src/worldgen-diagnostics.js`: o cronômetro de construção agora tem `pause/resume`; tempo ocioso entre quadros não entra na estatística de CPU.

## Agendamento real em segundo plano

O novo `src/worldgen-cooperative.js` contém um `createCooperativeRunner` puro e testável, com orçamento-alvo de **6 ms ou 6 checkpoints por callback**, o que terminar primeiro. O gerador continua na próxima callback ociosa, não na mesma chamada. Esse módulo não usa timers, DOM, Workers ou bibliotecas.

Em `src/city-world-stream.js`, a fila de regiões vizinhas continua ordenada pela posição/direção do ônibus; agora uma região fica como `pendingTask` até o último lote. O compositor só a insere no Three.js quando termina, aplica LOD inicial e atualiza métricas. Mudanças grandes de localização podem cancelar tarefas que ficaram longe.

**Exceções necessárias:**
- **Região inicial:** ainda é compilada sincronicamente, para garantir pista sob o carro no primeiro quadro.
- **Teletransporte / chegada a uma região antes do pré-carregamento:** mantém um fallback de compilação imediata, sem permitir carro sobre buraco visual.

O modo tradicional `/buzun-simulator/` e o gerador completo não usam cooperação, permanecendo com o mesmo comportamento de antes.

## Inspeção e diagnóstico

Abra o streaming experimental em:

https://devsouza208.github.io/buzun-simulator/?worldgen=stream

O painel no canto inferior direito acrescenta:
- `Lotes cooperativos`: número de callbacks efetivamente processadas;
- `Maior lote`: duração máxima observada (ms) numa callback;
- `Etapa`: fase da região que está sendo preparada;
- `Regiões em segundo plano`: regiões efetivamente concluídas com o agendador.

Outras estatísticas do objeto `window.buzunWorldgenReport().streaming`: `cancelledBackgroundRegions`, `cooperativeCpuMs`, `maxRegionBuildMs`, `urgentRegionLoads` e `readyRegions`.

A partir de `worldgen=stream`, observar o botão Começar a dirigir e o painel durante o carregamento dos vizinhos. Andar em linha reta ou usar Buzun Create para trocar de região permite conferir se nenhum setor fica parcialmente visível.

## Testes

`tests/worldgen-cooperative.test.js` cobre:
- **Igualdade exata** (ordem, altitudes, valores e triângulos) do asfalto síncrono e do generator;
- Calçadas e meio-fios equivalentes, sem diferenças geométricas;
- Retomada/cancelamento do runner e limite de checkpoints;
- Cronometria CPU excluindo pausas entre frames;
- Amostra de 250 vias reais do Grajaú, em que a união fatiada reproduziu o mesmo resultado final com **479 checkpoints de asfalto e 1.738 checkpoints de calçada/meio-fio**.

Último CI: **200 testes aprovados, zero falhas**. Essas quantidades de checkpoints representam lotes/retomadas em teste, não frames da GPU nem tempo real de usuário.

## Limitações

- JavaScript no thread principal **não pode interromper uma operação em andamento**; um único patch de calçada ou uma subrotina pesada de geometria ainda pode exceder 6 ms. O orçamento é cooperativo e um alvo, não uma garantia de tempo máximo.
- A ordenação e indexação inicial dos polígonos ainda ocorrem em blocos síncronos antes de chegar ao primeiro checkpoint do estágio correspondente.
- Não há Worker separado para esta versão. Para travadas restantes, os candidatos seguintes são processamento da geometria em Web Worker e cache de setores concluídos.
- A primeira região e a carga emergencial de teleporte continuam podendo bloquear um frame.
- O teste de geometria em CI não mede FPS nem simula latência de browser: a avaliação do usuário no PC e o painel do navegador são necessários antes de tornar o streaming padrão.
- Os números prévios de v0.1.65 (54 draw calls, 242.958 triângulos/frame, FPS remoto 2,6–2,8) são apenas referência **pré-jogo**, não ganho garantido nesta fase. Esta alteração visa fluidez **enquanto as regiões carregam**, não redução adicional de triângulos estáticos.

## Próxima etapa
**5.15**: medir os piores lotes observados durante a condução, reduzir etapas individualmente caras e, se necessário, mover a união/triangulação de calçadas para um Web Worker com comunicação segura da altitude DEM e sem acoplamento ao Three.js.
