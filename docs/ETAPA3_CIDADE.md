# Buzun Simulator — Etapa 3: cara de avenida paulistana

## Referência

O protótipo da Av. Dona Belmira Marin usa traçado/contornos OSM e altitudes SRTM aproximadas; o criador comparou a cena com uma captura própria do Google Street View da altura do nº 1188. A captura foi **apenas inspiração visual**, sem extrair/capturar texturas ou redesenhar fotos. A morfologia real das ruas e dos lotes é o ponto de partida, mas não se afirma precisão fotográfica de fachadas.

## Implementado

1. **Sinalização horizontal low poly:** dupla linha amarela para representação de pista de mão dupla, bordas brancas e traços brancos interrompidos nas pistas/segmentos marcados como mão única pelo OSM. O número de faixas, o uso dos espaços e a pintura exata continuam simplificações artísticas e não são navegação real.
2. **Fachadas modulares:** inferência determinística da frente do lote a partir do contorno OSM e da via mais próxima; composição de portões de garagem, grades, portas de enrolar, vitrines, molduras e janelas de sobrados com materiais coloridos. Propriedades OSM de altura prevalecem quando existirem; uso comercial desconhecido é *inventado visualmente*, sem reescrever OSM.
3. **Comércio fictício:** placas na parede (não etiquetas suspensas) com nomes engraçados como **Mc Donaits**, **Assento do Brasil**, **Casas Ceará**, Padoca do Zé, Rei da Coxinha e outros. O terminal de rota do McDonald's/Habib's continua geograficamente identificado pelo endereço real, mas os letreiros dos estabelecimentos no jogo usam `Mc Donaits` / `HabiBuz`. A lista está em `src/store-brands.js`; a posição física das placas está ligada aos contornos do OSM. Os nomes são criativos, não cadastros reais.
4. **Infraestrutura de rua:** postes e cabos procedurais simplificados. Sua distribuição é aproximada — **não corresponde aos postes ou redes elétricas reais**. Postes repetidos utilizam InstancedMesh e cabos compartilham um LineSegments.

## Extensão do motor

- `src/road-markings.js`: planeja faixas a partir da própria polilinha OSM.
- `src/facade-kit.js` e `src/facade-detail.js`: escolhem a parede frontal e planejam módulos.
- `src/store-brands.js` e `src/store-signs.js`: biblioteca substituível de marcas fictícias e seus letreiros.
- `src/street-props.js` / `src/street-furniture.js`: planejamento e renderização de postes/cabos leves.
- `src/world.js`: reúne as peças, sem alterar colisores, rota de direção, altimetria nem dados originais OSM.

## Verificação antes de considerar concluída visualmente

Rode `npm run verify`. Depois, no PC e celular, verificar se as linhas estão sobre o asfalto, não nas calçadas; se as fachadas ficam voltadas para a rua; se os letreiros são legíveis a distância; se os postes não ficam no meio de prédios/ruas; e se o FPS continua adequado. Comparar em vários pontos, não somente na frente do McDonald's.

## Evolução do Buzun Create

O editor deverá preservar `osmBuildingId` e permitir substituir por edifício as receitas procedurais, materiais, componentes e **nome fictício do comércio**. Guarde `OSM → contorno`, `SRTM → altura`, `preset visual` e `override do usuário` em camadas separadas. A Etapa 3 prepara módulos; o editor de clicar e arrastar ainda não está implementado.
