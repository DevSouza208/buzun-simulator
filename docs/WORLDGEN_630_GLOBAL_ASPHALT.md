# WorldGen 6.3 — Todas as ruas, um atlas global de asfalto

## Contrato visual

O jogador não deve enxergar uma cidade de ruas em placas independentes.
Existe **uma única autoridade geométrica global do asfalto** derivada de
todas as vias presentes no snapshot OSM. O jogador vê cortes espaciais
desse conjunto, não versões do asfalto recompostas por chunk.

- Todas as ruas térreas do OSM entram na mesma união de polígonos
  em coordenadas globais, incluindo as curvas, cruzamentos e a
  rede de ruas de bairros; não apenas a avenida do showcase.
- Pontes e túneis continuam como **camadas físicas separadas**.
- Ruas realmente desconectadas no OSM mantêm componentes separados;
  não criar um corredor invisível ligando duas quadras distantes.
- O atlas contém todas as vias, mas **não vira um único
  `THREE.Mesh` carregado de uma vez**. Armazenamos só os tiles próximos
  ao carro e as geometrias locais necessárias.
- A divisão em chunks nunca pode alterar o relevo, a escolha da
  faixa prioritária ou a união entre os braços da rua.

## Implementação piloto

1. `createGlobalAsphaltAtlas(renderRoads, worldSheet, ...)`
   recebe toda a malha OSM e os perfis canônicos globais.
2. Todos os cruzamentos são suavizados a partir do grafo **global**;
   os fillets de um encontro não dependem de quais chunks estão visíveis.
3. Um índice de células fixas de 220 m encontra as fontes necessárias.
   Há halo de 32 m apenas para garantir cobertura do operador de união;
   os polígonos resultantes são recortados no limite **exato** da célula.
4. A união 2D com prioridades iguais à base atual é executada uma vez
   por célula canônica. O resultado entra no cache LRU (máximo 32
   células) e pode ser reaproveitado por regiões vizinhas.
5. A renderização do modo `?worldgen=sheet` passa a montar regiões
   a partir destes triângulos já compostos, cortando apenas para
   os limites finais dos chunks.
6. As marcações, faixas, meio-fios e calçadas continuam com seus
   geradores existentes enquanto são validados para posterior
   integração à autoridade global.

## Escopo e riscos

O atlas representa uma **superfície global em união lógica por camada**,
com componentes conexos segundo a topologia real OSM. Isso não
significa que todas as ruas devam fazer parte de um único componente
matemático: entradas privadas e vias isoladas existem. Também não
significa que a GPU receba um mesh único sem indexação, o que
inviabilizaria o streaming do Grajaú completo.

A performance deste primeiro piloto ainda precisa ser medida no Chrome.
O custo da união dentro de um tile ocorre quando ele é criado pela
primeira vez e pode causar frame spikes. Durante geração em segundo
plano, o processo cede entre tiles. Os perfis dos caminhos são mantidos
em cache para os chunks subsequentes.

## Critérios de aceite para promover a versão

- Todas as vias reais que compartilham nós e camada estão fisicamente
  conectadas no piso, sem buracos, costuras ou degraus.
- Travessia de região 880 m e célula 220 m sem diferenças de altura,
  deslocamentos horizontais ou triangulação divergente.
- O mesmo encontro viário tem sempre o mesmo asfalto ao ser
  reconstruído após descarte do cache.
- Continua impossível atravessar viaduto/túnel para a rua inferior
  por engano ou ligar duas avenidas paralelas sem nó OSM real.
- Teste no percurso McDonald's → Habib's e em ruas residenciais do
  mapa do Grajaú. Comparar performance com v0.1.77.
- O modo padrão permanece estável até validação por screenshots.

**Importante:** a topologia de calçadas, a malha de sinalização, a
física de cruzamentos e detalhes de offsets ainda devem ser revisadas
em conjunto com o atlas. Uma suíte de testes passando não equivale
à validação visual de todas as 4.777 vias no browser.
