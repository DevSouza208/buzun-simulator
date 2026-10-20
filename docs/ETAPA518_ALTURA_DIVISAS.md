# Etapa 5.18 — continuidade de altura nas divisas de regiões e antecipação de carregamento

## Problema identificado no código da v0.1.69

O streaming usa setores de **880 × 880 metros**. O modelo 3D de cada setor é calculado com as vias OSM inteiras que cruzam uma margem técnica de 52 m, mas seus triângulos visíveis são recortados no limite exato do setor.

Antes desta etapa, `heightAt(x,z)` consultava apenas o índice físico do **setor dono da coordenada**, ignorando a superfície completa de setores vizinhos já finalizados. Se o ônibus chegasse a uma divisa enquanto o setor seguinte ainda estava sendo construído, o sistema passava subitamente ao fallback `OSM + DEM`, que poderia ter um greide ligeiramente diferente. O problema era especialmente sensível em ladeiras e estradas junto à linha de 880 m.

O pré-carregamento também só reordenava a fila depois de mover o foco aproximadamente **200 m**; é grande demais para ruas curtas junto a uma divisa.

## 1. Altura física compartilhada na divisa

`src/worldgen-boundary-height.js` contém uma implementação pura que consulta, dentro de **9 m da fronteira**, o setor dono e os setores adjacentes com geometria de estrada pronta. A prioridade continua sendo o dono da região; um vizinho só supre a consulta se o primeiro não dispõe de uma superfície local válida.

A ordem de avaliação reproduz o motor tradicional:
- superfície asfaltada da rua quando dentro do seu meio-largura;
- curvas de esquina;
- perfil esculpido da rampa, caso presente;
- superfície da calçada elevada;
- somente em último caso, estimativa OSM/DEM original.

Quando ambos os lados estão carregados e retornam **a mesma via OSM, mesmo nível físico (layer) e mesmo tipo de pavimento**, a altura física pode ser interpolada numa estreita faixa de 9 m ao redor da fronteira. A interpolação só é aceita se a diferença entre os dois perfis for **menor ou igual a 45 cm**, para não unir pistas em desníveis muito diferentes por engano. **Pontes, pistas diferentes, rampa versus pista e arredondamentos de esquina não são misturados.**

O corte do terreno também tenta ler o índice viário de um vizinho pronto antes de recorrer ao modelo aproximado, evitando discordâncias desnecessárias entre o solo e a pista durante a chegada do próximo setor.

A função de consulta pode ler **o índice de altura de um setor em cache LRU sem reanexar seu Mesh nem alterar a prioridade do LRU**. Isso é usado somente para consultar a física, não para manter uma região invisível permanentemente como visual pronta.

## 2. Carregamento prioritário antes do ônibus chegar à divisa

`roadRegionAhead(x,z,heading)` calcula a primeira fronteira de 880 m na direção do movimento real do veículo, inclusive em coordenadas negativas e nos cantos diagonais. Quando a travessia prevista está a **130 m ou menos**, o próximo setor é colocado em primeiro lugar na fila de background (após qualquer trabalho já iniciado), sem duplicar a região ou remover as demais.

O planejamento da direção foi ajustado de **200 para 60 m de deslocamento**, para atualizar a prioridade mais frequentemente em ruas urbanas curtas. As regiões seguem sendo montadas por lotes com os Workers de asfalto e de calçadas, sob o orçamento cooperativo existente.

A compilação síncrona emergencial da região atual continua como último recurso se o ônibus entrar antes do pré-carregamento terminar. O motivo é preservar a superfície necessária para dirigir em vez de permitir atravessar um vazio visual; esse último recurso ainda pode causar pausa e deve ser acompanhado nos diagnósticos.

## 3. Contadores de diagnóstico

Em `?worldgen=stream`, o painel apresenta:
- `Próxima divisa`: previsões de nova região colocadas à frente da fila;
- `Altura na divisa`: consultas com suavização e consultas que aproveitam uma região vizinha;
- `Carregamentos urgentes`: número de compilações imediatas porque o setor atual ainda não estava pronto.

`window.buzunWorldgenReport().streaming` inclui `boundaryPrefetches`, `boundaryHeightBlends`, `boundaryNeighborSamples`, `boundaryUrgentLoads` e `borderFallbackHeights`.

## 4. Testes

`tests/worldgen-boundary-height.test.js` valida:
- vizinhos próximos da fronteira positiva/negativa e quinas diagonais;
- reaproveitamento de altura física da região anterior enquanto o dono ainda está em construção;
- continuidade matemática do mesmo asfalto de ambos os lados mesmo com pequena diferença no greide;
- proibição de misturar IDs de vias, níveis de ponte e alturas muito diferentes;
- precedência de rampas e curvas de esquina;
- prefetch nos quatro sentidos e a prioridade da fila sem duplicatas;
- consulta não destrutiva do índice de altura em cache;
- **uma via real do snapshot de 4.777 vias do Grajaú**, que cruza a fronteira local **X = 3.520 m**.

No ensaio com essa via OSM, os dois índices simulavam uma diferença de base de 13 cm entre regiões. Ao atravessar a fronteira em dois pontos separados por 2 mm, o desnível final de colisão foi aproximadamente **0,000041 m (0,041 mm)**. Isso é um **teste de consistência matemática com dados OSM reais e perfis sintéticos**, não uma medição topográfica real do local, nem uma inspeção do mesh desenhado.

**CI: 232 testes aprovados, zero falhas.**

## Limitações e próximos passos

- A interpolação atua no modelo **físico de altura**; não corrige por si só qualquer rachadura visual dos polígonos asfaltados. A composição 3D continua recortada independentemente em cada setor, e requer inspeção direta de screenshots nas fronteiras.
- Não há confirmação de passagem real de ônibus no navegador nesta etapa. Os testes automatizados validam a seleção de regiões e a matemática do greide, mas não o WebGL nem o FPS.
- A interpolação só afeta pequenas diferenças entre registros inequivocamente correspondentes. Se os dois lados escolherem vias distintas ou níveis diferentes, a física conserva cada altura em vez de suavizar indevidamente.
- O cache LRU, os dois Workers, a geração cooperativa e o modo tradicional continuam como na versão anterior. O streaming segue opcional.
- Um prefetch iniciado antes da fronteira não garante que o setor ficará pronto a tempo em computadores lentos; o contador de carregamentos urgentes ajuda a medir quando isso acontece.

### Inspeção recomendada

Abrir https://devsouza208.github.io/buzun-simulator/?worldgen=stream e dirigir ao longo de vias que cruzem divisas de 880 m. Conferir que a pista não desaparece e que o ônibus não dá um salto vertical na troca de setor. Repetir após uma volta pelo cache e observar **`Altura na divisa`**, **`Próxima divisa`** e **`Carregamentos urgentes`**.

**Próxima etapa 5.19:** teste visual dirigido de fronteiras, instrumentação para comparar as malhas dos dois lados de uma divisa e reparo de possíveis fissuras 3D ainda visíveis, sem fazer mais alterações ao modelo de colisão sem evidência.
