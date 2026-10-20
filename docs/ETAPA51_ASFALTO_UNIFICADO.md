# Etapa 5.1 — Unificação das superfícies de asfalto

## Problema
No Buzun 0.1.50, as fitas de asfalto das vias OSM eram trianguladas independentemente. Uma via secundária atravessava a avenida em T, produzindo duas superfícies de asfalto na mesma região; os discos artificiais nos nós OSM também sobrepunham a pista e criavam artefatos.

## Nova ordem do worldgen
1. A rede OSM estabelece as coordenadas horizontais e os níveis de ponte/túnel. **Não deslocamos os vértices OSM**.
2. Cada via recebe seções transversais e perfil de altitude já suavizado (o “lençol” que acompanha o relevo).
3. `unionAsphaltPatches` subdivide o asfalto em triângulos convexos e executa diferenças planares entre triângulos próximos da **mesma camada física**. A classe e largura da via definem prioridade: a Belmira e outras vias principais mantêm sua superfície; partes da via menor que coincidiriam com ela são removidas.
4. A união retorna uma **superfície equivalente à união 2D dos polígonos**, sem dupla área de asfalto em uma mesma camada. Não há, ainda, soldagem topológica de todos os vértices em um único objeto Three.js, mas todas as superfícies resultantes utilizam a mesma cor e têm áreas internas não sobrepostas.
5. Alturas dos novos vértices são interpoladas no perfil original da via proprietária. Em locais de sobreposição, o sistema de altura do carro e a leitura do relevo usam a prioridade da mesma via.
6. Os discos de fechamento artificiais foram retirados tanto da geometria de asfalto quanto da máscara de terreno; o recorte do terreno acompanha somente os corredores reais.
7. O motor agrupa os triângulos resultantes em chunks renderizados próximos ao jogador.

## Garantias e limites
- OSM é fonte de geometria, **não editor de malha**. Tudo em metros locais nominais 1:1.
- Uma via menor não pinta asfalto sobre a via principal quando suas superfícies se interceptam no mesmo nível.
- Pontes, túneis e vias de camadas distintas não são unidos apenas porque se cruzam no plano.
- Vias do mesmo OSM ID têm continuidade geométrica existente e não sofrem recorte mútuo, mesmo que façam curvas fechadas.
- **Os meio-fios, passeios e linhas de sinalização ainda usam a lógica antiga.** Fragmentos de calçada podem continuar visíveis em cruzamentos; isso pertence à próxima etapa, depois de confirmarmos a malha de asfalto.
- A técnica executa diferença de polígonos por índice espacial. Nas curvas extremas podem existir bordas com vértices duplicados (não são ainda um mesh com conectividade soldada).

## Testes
`npm run verify`: inclui interseções T, X, duplicações, níveis separados, declives, altura do carro e um recorte do snapshot real de 4.777 vias.

### Checklist visual
1. Abrir Buzun na Belmira, especialmente entroncamento perto da Rua Mamoneira e da praça com a alça; conferir que uma via lateral não desenha uma segunda superfície sobre a avenida.
2. Navegar pelo Buzun Create em vista aérea: procurar buracos no asfalto em curvas ou saídas laterais.
3. Dirigir por ladeiras e cruzamentos: carro não deve saltar ao escolher o piso prioritário.
4. Registrar capturas das calçadas ainda incorretas; **não corrigir via OSM**.
5. No ciclo seguinte: gerar meio-fio a partir do contorno **do asfalto unido**, depois calçadas. Após isso, derivar as faixas a partir de larguras/oneway/lanes OSM sem fabricar faixa extra onde não couber.

## Próximo alvo
- Etapa 5.2: marcações e faixa para cada sentido conforme largura disponível e metadados do OSM.
- Etapa 5.3: meio-fio e calçada do perímetro da superfície já unificada, não de cada centerline separadamente.
