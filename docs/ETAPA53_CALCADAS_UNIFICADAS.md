# Etapa 5.3 — Meio-fio e calçada derivados do asfalto unido

## Objetivo

Remover as antigas calçadas individuais que ficavam sobre o asfalto em cruzamentos. O OSM continua definindo eixo, conectividade e escala, mas o mundo gerado passa a considerar o **contorno final da união das pistas** antes de desenhar passeios e guias.

## Como funciona
1. O asfalto continua sendo gerado pela `unionAsphaltPatches` (Etapa 5.1), com metragem 1:1 e altitudes drapeadas do Mapzen.
2. As faixas de calçada previstas pelo Buzun são recolhidas em `walkPatches`. **Nenhuma** é enviada diretamente ao Three.js antes de resolver o corredor.
3. `composeRoadsideMeshes` constrói um índice espacial dos triângulos que formam a **união das áreas de asfalto**. Faz a diferença poligonal das calçadas contra todas as pistas da mesma camada, inclusive contra as vias de outro ID OSM. A própria via também impede que uma esquina exagerada produza calçada dentro do asfalto.
4. As calçadas restantes são unidas por prioridade (avenidas antes das vias locais); polígonos sobrepostos deixam de duplicar geometria e material.
5. O motor testa as **bordas externas** dos polígonos resultantes: uma face de meio-fio só nasce se um lado do segmento for asfalto e o outro não. Não desenha mais meio-fio dentro do cruzamento, sobre calçada ou no meio do terreno.
6. Editor Buzun Create: o recuo opcional do meio-fio perto de um nó real OSM continua funcionando sem recortar o asfalto; o padrão permanece em zero.
7. O mesh acompanha o perfil longitudinal do próprio lençol de asfalto; pontes e túneis permanecem em níveis separados.

## Arquivos
- `src/sidewalk-union.js`: subtração geométrica, união dos passeios, extração dos meios-fios, índice espacial.
- `src/city-road-mesh.js`: substituiu o desenho por segmentos separados por uma composição pós-asfalto.
- `src/city-world.js`: adicionou contagens de geração em `stats.roadsideStats`.
- `tests/sidewalk-union.test.js`: cruzamentos T, bordas asfaltadas, sobreposição de calçadas, pontes, desníveis e recuo das guias.
- `tests/grajau-roadside-real.test.js`: recorte real do Grajaú (400 vias, 18 mil faixas de passeio) com medição de tempo e vértices finitos.

## Observações e limites
- A saída visual equivale a passeios de polígonos não sobrepostos sobre o **perímetro da união do asfalto**. Ainda não é um único `BufferGeometry` com todos os vértices topologicamente soldados.
- O meio-fio acompanha **linhas retas do contorno**. Curvas suaves/arredondamentos geométricos de esquinas são refinamento futuro.
- Onde duas ruas chegam com alturas diferentes ao cruzamento, há diferenças de altitude que ainda podem exigir reconciliação adicional do perfil drapeado. Os testes sintéticos de ladeira passam, mas não garantem perfeição em cada trecho real.
- A representação de ponte/túnel respeita camadas OSM; sem `layer` confiável, erros de origem podem existir.
- O recorte de terreno do Buzun ainda é uma máscara separada calculada do corredor original, com folga. Em alguns trechos poderá precisar ser derivado do mesmo polígono de passeio no futuro.
- A nova união de polígonos aumenta o trabalho na inicialização; a renderização continua agrupada por chunks para economizar GPU.
- Não foram adicionados edifícios, veículos de IA ou sinalização nesta etapa.

## Critérios de aceitação visual
1. Abrir a nova versão do Buzun, esperar o Grajaú carregar e ir à Belmira Marín.
2. Em cruzamentos T e X, **nenhuma calçada deve atravessar a pista**. O meio-fio segue o limite verdadeiro do asfalto.
3. As calçadas devem se encontrar nos cantos de esquina, sem placas sobrepostas nem guias cruzando a rua.
4. Na ladeira, verificar calçada elevada de maneira contínua e sem terreno brotando no asfalto.
5. No Buzun Create, selecionar uma rua, mudar largura de calçada ou altura/recuo do meio-fio, aplicar e conferir a reconstrução.
6. Inspecionar o console `[Buzun WorldGen] Calçadas e meio-fios:` para ver o número de polígonos, paredes de guia e operações de recorte.

## Próxima fase
Validar visualmente as esquinas críticas, suavizar o encontro vertical entre duas ruas e adicionar cantos arredondados quando fizer sentido. Depois prosseguir para ilhas, faixas de pedestres e mobiliário urbano.
