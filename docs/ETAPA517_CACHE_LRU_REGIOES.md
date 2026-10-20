# Etapa 5.17 — cache LRU de regiões visitadas

## Motivação
Até a v0.1.68, o streaming experimental descartava as geometrias de um setor distante para economizar memória. Ao dirigir de volta à mesma área, precisava refazer a união do asfalto, as calçadas, as guias, os detalhes táteis, a costura de malhas e os buffers GPU — mesmo que a região já tivesse sido construída minutos antes.

A Etapa 5.17 acrescenta um **cache quente temporário de regiões concluídas**. Ele evita trabalho duplicado ao retornar a locais recém-visitados e estabelece limites conservadores para não guardar o Grajaú inteiro na RAM/VRAM.

## Como funciona
1. Quando uma região sai do raio de interesse ou ultrapassa o número de setores ativos, seus grupos Three.js são **retirados da cena**. Um grupo retirado não participa das chamadas de desenho.
2. O sistema tenta guardar seu registro completo — `scenery.tiles`, `BufferGeometry`, índices de altura do asfalto e das rampas, estatísticas e bounding boxes — no módulo puro `src/worldgen-region-cache.js`.
3. O cache LRU aceita **no máximo 4 regiões e até 24 MiB estimados de buffers geométricos**. A posição é atualizada quando um setor sai do cache e volta a ser guardado; setores menos recentemente guardados são os primeiros descartados.
4. Se um setor não cabe sozinho no orçamento, não é armazenado. Se uma nova entrada extrapola os limites, o cache expulsa as mais antigas e chama a rotina de descarte real. Essa rotina libera exclusivamente os `BufferGeometry` dos meshes. **Materiais e texturas compartilhados não são descartados**, pois podem estar sendo usados por outras regiões.
5. Ao voltar, a região é retirada do LRU e seus mesmos grupos são adicionados à cena. Os mesmos índices de `surface.sample`, curvas, rampas e alturas são reaproveitados, **sem recalcular OSM/DEM nem solicitar Workers**.
6. Ao restaurar, a visibilidade LOD é atualizada forçadamente para a câmera atual, evitando grupos invisíveis quando o carro retorna de outra posição.
7. Ao encerrar o mundo, todos os setores ativos e em cache são liberados de verdade, sem cachear a cidade durante `dispose()`.

O streaming **continua experimental** via `?worldgen=stream`. O modo tradicional segue sem mudanças.

## Diagnóstico
O painel do WorldGen passa a mostrar:
- `Cache: N regiões (X MiB)` — setores prontos, mas desanexados da cena;
- `Retornos sem reconstrução` — quantas vezes uma região voltou do cache;
- `Descartes` — quantas regiões antigas foram expurgadas para manter os limites.

`window.buzunWorldgenReport().streaming` também apresenta `cachedRegions`, `cachedGeometryMiB`, `cachedRestores`, `cacheDiscards`, `cacheRejects`, `cacheStores` e as métricas existentes de regiões e Workers.

O orçamento da cache é apenas uma **estimativa dos atributos GPU de posição, normal e UV**. Não corresponde ao uso total de RAM/VRAM, pois não inclui o índice de colisão, estruturas JS da geometria, texturas e custo dos drivers. Ainda assim, impõe um limite explícito à parte maior dos dados geométricos retidos.

## Testes
`tests/worldgen-region-cache.test.js` cobre:
- configuração padrão e entradas vazias;
- reuso da **mesma instância de cena e do modelo de altura**, sem recalcular;
- limite rígido de contagem e de 24 MiB estimados;
- expulsão do menos recente, substituição segura de chaves, rejeição de setor grande demais;
- desligamento do cache e descarte sem liberar uma geometria duas vezes;
- teste de ida/volta simulada com coordenadas de setores extraídas do snapshot de **4.777 vias reais do Grajaú**.

**CI da Etapa 5.17:** 222 testes aprovados, zero falhas. O teste de movimentação com coordenadas reais usa instâncias simuladas de geometria para verificar as transições do LRU e continuidade de altura. **Não é teste de WebGL nem comprovação de FPS**; isso precisa ser conferido no navegador, conduzindo entre regiões.

## Procedimento de inspeção no jogo
1. Abrir https://devsouza208.github.io/buzun-simulator/?worldgen=stream e aguardar os setores vizinhos.
2. Dirigir em linha reta por mais de uma região de 880 m, acompanhando no painel os contadores de cache.
3. Retornar ao trajeto anterior. Se os setores ainda estiverem no LRU, `Retornos sem reconstrução` deve aumentar sem disparar nova união de asfalto ou calçadas.
4. Verificar se a guia, calçada, faixa e superfície do ônibus continuam à mesma altura após o retorno, sobretudo nas bordas de setor.
5. Voltar ainda mais longe. Quando o cache completar 4 entradas ou 24 MiB, os setores antigos devem ser descartados; a recompilação passa a ser esperada.
6. Comparar a fluidez durante o retorno com trajetos inéditos. Não inferir ganho de FPS parado: o benefício esperado é **evitar pausas de reconstrução**.

## Limitações e próxima etapa
- Os grupos em cache não são desenhados, mas ainda consomem memória de geometria.
- O limite de 24 MiB é estimativa, não rastreamento exato da memória de WebGL.
- O cache é volátil; recarregar a página perde os setores guardados.
- Após trajetos longos, regiões fora do LRU precisam ser reconstruídas pelos Workers. Isso é intencional para restringir memória.
- Streaming ainda requer uma validação efetiva de direção no navegador antes de virar o padrão.

**Próxima etapa — 5.18:** verificar ao vivo atravessamentos de limites OSM, melhorar amostragem de altura nas bordas e diagnosticar qualquer travamento residual em setores ainda não visitados.
