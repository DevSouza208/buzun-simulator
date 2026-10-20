# Etapa 5.7 — travessias de pedestres ilustrativas

## Objetivo

Depois da união do asfalto (5.1), pistas inteligentes (5.2), calçadas e meio-fios (5.3), concordância de altitude (5.4), arredondamento de esquinas (5.5) e reparo de microcosturas (5.6), a rede viária recebe **faixas de pedestres ilustrativas** nos entroncamentos onde a topologia do OSM sugere um local plausível.

**Importante**: não conhecemos o inventário oficial de faixas pintadas, semáforos, sinais PARE e preferências de travessia. As faixas geradas nesta fase são uma interpretação visual para o protótipo e NÃO constituem informação real ou recomendação de travessia segura.

## Algoritmo

O novo `src/pedestrian-crossings.js` é JS puro, não depende de WebGL e não altera eixos OSM.

1. Começa exclusivamente por nós compartilhados por **mais de um way OSM**, com braços que se encontram de fato em ângulo diferente (não dois tramos colineares de uma única rua).
2. Não gera pintura sobre vias de ponte/túnel, vias expressas/trunk ou vias de serviço. Largura de asfalto deve ficar entre 5,2 e 19,5 m.
3. Prefere abordagens da rua secundária em cruzamentos T. Em cruzamentos com múltiplos braços pode sugerir no máximo duas faixas, com distância mínima de 17 m de qualquer outra cruzamento gerado, evitando zebras duplicadas em junções consecutivas.
4. Mede o afastamento desde a interseção: pelo menos metade da largura da avenida dominante + 4 m (mínimo 7,5 m, máximo 16 m), para a zebra **não entrar na área comum das pistas**. Anda ao longo de vários segmentos curtos do OSM para não descartar ruas apenas por possuírem vértices intermediários.
5. Exige pista contínua além da marcação e não pinta em curvas bruscas. Nenhuma geometria horizontal da via é transformada.
6. Gera 6 barras transversais brancas, cada uma com 45 cm ao longo do eixo, separadas a cada 76 cm. Cada ponta fica 55 cm para dentro da borda do asfalto.
7. Antes de enviar triângulos ao Three.js, `buildZebraBars` consulta a malha de altura `createRoadSurfaceIndex` **no centro e nas bordas** de todas as barras, conferindo que pertencem ao mesmo way. Se não couberem, rejeita a pintura inteira (não empurra a barra para a calçada).
8. O material da tinta fica ligeiramente elevado sobre o asfalto (4 cm acima da sua superfície visual), usando o mesmo perfil longitudinal de altitude.
9. Marcas centrais e separadores de faixas gerados na Etapa 5.2 não são desenhados na área reservada a zebras, evitando linha amarela passando pelo meio.

## Onde está
- `src/pedestrian-crossings.js`: seleção conservadora, offsets métricos, geometria e validação de superfície.
- `src/city-road-mesh.js`: índice espacial por 40 m, supressão de outras marcas e criação dos triângulos da pintura no próprio chunk 3D.
- `src/city-world.js`: `stats.crossingStatistics` e relatório no console `[Buzun WorldGen] Travessias sugeridas:`.
- `tests/pedestrian-crossings.test.js`: T/X, superfície correta, vias separadas, expressways, trechos curtos, geometria e auditoria de vias do Grajaú.
- `tests/grajau-crossing-surface.test.js`: simulação com o índice de superfície montado a partir dos 38.258 segmentos originais do snapshot. Resultado do CI: **3.757 locais candidatos, 3.148 com tinta válida, 609 rejeitados pela checagem de piso e 18.888 barras**, em cerca de 0,27 s para validar a tinta depois de construir o índice. A produção usa seções de 5 m e suavização de relevo, portanto os totais finais podem variar.

## Limitações
- **Curb ramps acessíveis e rebaixamento efetivo das calçadas ainda não foram implementados**. As zebras são pintura visual; por isso não devem ser apresentadas como travessias reais/seguras para pedestres.
- A classificação do cruzamento é aproximada e depende do grau de detalhamento da topologia OSM; recomenda-se inspeção manual em cruzamentos com formas complexas e vias bifurcadas.
- Nenhum semáforo, PARE, tachão ou placa de trânsito é criado sem dados confiáveis.
- Pode haver trechos sem travessia se a geometria for curta, ambígua ou superposta. Isso é intencional.
- As barras são desenhadas como quads seguindo o declive do centro da rua; nas curvas extremas será necessária reamostragem por seção para melhorar o assentamento.

## Verificação de campo no Buzun
1. Abrir a versão 0.1.57 e entrar no corredor Av. Dona Belmira Marin.
2. No Buzun Create aproximar uma entrada lateral; a zebra deve estar **sobre a rua lateral**, não sobre a avenida, passeio ou canteiro.
3. Conferir que as linhas amarelas/brancas de pista desapareçam imediatamente junto à zebra e reapareçam além dela.
4. Em ladeiras, conferir tinta posicionada levemente sobre o asfalto sem saltos estranhos.
5. No console, ler `crossingsPlanned`, `crossingsPainted`, `barsPainted` e `rejectedSurface`: só o número efetivamente pintado é visível no jogo.

## Próxima etapa proposta
Rampa acessível em ambos os lados das faixas e correção do perfil do meio-fio, sem desenhar rampas flutuantes: construir recorte real da calçada, passeio e guia a partir do mesmo footprint topológico.
