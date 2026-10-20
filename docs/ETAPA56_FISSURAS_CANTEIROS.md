# Etapa 5.6 — auditoria de costuras, curvas especiais e canteiros justificados

## Por que esta mudança?
No ciclo 5.5, a união de asfalto ainda pulava sobreposições quando dois trechos tinham o **mesmo ID de rua OSM**. Isso podia duplicar triângulos em curvas fechadas ou em vias sobrepostas. Além disso, as triangulações independentes calculavam pontos coincidentes com diferenças numéricas muito pequenas e geravam microcosturas.

## Reparação da malha
- `src/asphalt-union.js`: aplica diferença poligonal inclusive entre triângulos de um mesmo OSM way; não altera os eixos ou categorias geográficas.
- `src/mesh-seams.js`: estabiliza os vértices gerados com grade de **1 milímetro** no plano X/Z. Vértices que se tornam coincidentes e estão no mesmo nível podem compartilhar a altura média; diferenças maiores que 8,5 cm são preservadas, evitando apagar separações reais. Nas paredes dos meio-fios, o agrupamento de alturas ocorre só com coincidência praticamente exata, para preservar o bisel.
- A sanitização é feita antes de criar os `BufferGeometry` de cada setor de 440 m. As superfícies permanecem em triângulos e não são transformadas em uma malha topológica `watertight`.
- Diagnóstico `stats.seamStatistics`: vértices alinhados, níveis independentes e triângulos degenerados, sem deslocar os nós OSM.

## Primeiro gerador conservador de canteiros
- `src/median-islands.js` **não** planta gramado simplesmente em todo vão. Exige duas pistas *distintas* com sentido único indicado no OSM, em sentidos opostos, com mesma camada física, aproximadamente paralelas, corrida longitudinal contínua de 14 m ou mais e **faixa livre entre 0,85 m e 5,5 m**. Não gera nas vias normais de mão dupla.
- O canteiro de grama low poly é uma superfície independente apenas *na faixa livre*. Usa o compositor de calçadas para subtrair asfalto real, inclusive ruas que cortem o canteiro. Tem prioridade sobre faixas de calçada virtuais coincidentes, sem alterar a pista e sem criar ilha sobre cruzamentos.
- Mapa da região não traz todas as informações de divisor físico; onde OSM não comprova duas pistas paralelas separadas, **nenhum canteiro é criado**.
- Uma calçada ilhada preexistente continua preservada onde um canteiro não for confirmado.
- Novo material `median` para visualização; os demais polígonos de passeio e meios-fios permanecem no sistema das etapas 5.3–5.5.

## O que NÃO foi feito
- Não identifica canteiros por visão computacional de satélite, nem presume árvores, grades ou semáforos.
- Não detecta ilhas centrais em vias de duas mãos representadas por um único eixo OSM.
- Não considera medidas legais ou de engenharia; a classificação é uma reconstrução visual plausível.
- Costuras de elevação maiores que a tolerância e discrepâncias DEM de grandes declives **não** são corrigidas automaticamente.
- Não modifica o minimapa, o relevo Mapzen ou as coordenadas originais.

## Verificação
- Testes sintéticos para cortes no mesmo way ID, vértices compartilhados, ponte separada, perfil do meio-fio, faixas de canteiro entre vias opostas, rua atravessando e proibição de canteiros falsos.
- Auditoria automatizada do snapshot Grajaú com 4.777 vias.
- Validação visual pendente: conferir calçadas e canteiros na Av. Dona Belmira Marin, sobretudo em trechos com pistas separadas. O número de canteiros será mostrado em `[Buzun WorldGen] Canteiros entre pistas`.

## Próxima etapa
Inspecionar o corredor a partir de capturas da cena 3D, ajustar trechos reais com as pistas separadas e avançar para travessias, pintura de faixas de pedestres e sinalização somente em cruzamentos topologicamente válidos.
