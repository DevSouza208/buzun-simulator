# Buzun WorldGen 5.20 — Continuidade física e marcações

## Sintoma reproduzido (v0.1.70/v0.1.71)

No Grajaú e na Dona Belmira Marin, algumas junções apresentavam asfalto
visual desconectado, buracos azulados entre o terreno e a calçada, e faixas
com orientação inesperada. Screenshots enviados no chat em 20/10/2026.

## Contrato para o gerador

- O **mapa lógico** é global: toda via usa o mesmo OSM, eixo, largura, nível,
  perfil altimétrico e âncoras de cruzamentos independentemente do chunk.
- O **render** continua fragmentado em regiões de 880 m e utiliza halo OSM
  de 52 m; geometrias podem ser anexadas e descartadas sem recalcular a
  autoridade física global.
- Interseções no mesmo nível devem ter altura consistente; pontes e túneis
  não devem ser soldados artificialmente.
- Malha visual e física consultam os mesmos perfis regionais concluídos.
- A máscara do terreno cobre apenas o interior do corredor pavimentado,
  terminando **sob** a calçada (sobreposição de 0,6 m), nunca fora dela.
- As barras brancas da faixa são paralelas ao eixo de aproximação e
  distribuídas transversalmente, permanecendo na área asfaltada conhecida.

## Mudanças desta etapa

1. Graus de junção e âncoras são criados uma vez para a cidade e passados
   ao compositor síncrono da primeira região e ao gerador cooperativo das
   demais. O asfalto regional mantém as malhas e cache existentes.
2. Faixas passam por verificação da propriedade do asfalto nos quatro
   vértices de cada barra.
3. Máscara do terreno deixa de usar `envelope` (que incluía uma folga
   vazia). Uma sobreposição controlada elimina valetas transparentes
   causadas pela resolução do mapa alfa.
4. Testes automatizados verificam altura canônica, divisas de chunks,
   orientação das faixas e sobreposição de terreno.

## Validação necessária

- Abrir o endereço normal sem query; deve iniciar com streaming e sem debug.
- Repetir os mesmos pontos dos screenshots: faixa no cruzamento inicial,
  acesso lateral e rampa da avenida em descida.
- Verificar se toda via conectada por nós OSM possui pavimento contínuo.
- Comparar FPS, tempo da primeira região, memória estimada e frames lentos.
- Examinar travessia da borda de dois chunks, retorno via cache, visão
  da câmera baixa e rápida; testar em desktop e celular.
- Revisar as entradas/saídas de pontes ou cruzamentos sobrepostos.

**Limite técnico:** chunks são meshes separados por renderização; a
continuidade lógica é global, mas a topologia GPU ainda não é literalmente
um único objeto Three.js. Para garantir uma malha completamente soldada
em todas as vias, será necessário um compositor global de polígonos e um
clip em chunks da geometria já consolidada (custo de CPU/memória a
avaliar com o mapa real). Não afirmar que isso já ocorreu.

O OSM não substitui medições reais de altitude e faixas sinalizadas:
crosswalks deste protótipo são inferidos; DEM é aproximado.
