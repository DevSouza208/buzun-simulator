# WorldGen 7.5 — Asfalto puro para corrigir cruzamentos

## Objetivo
Os prints do Buzun Create mostraram vias vetoriais **desenhadas uma
sobre a outra**, com patamares de calçada exagerando a separação.
Vamos isolar a geometria viária: **sem calçadas, guias, rampas ou
meio-fios**, tanto no gameplay como no editor de referência.

## O que foi alterado
- O modo vetorial (padrão da branch) agora usa `asphaltOnly`.
- Não gera as camadas vetoriais sidewalk / curb nem suas cores.
- Interrompe o gerador de calçadas 3D de regiões, incluindo pontes:
  `noSidewalks` e `flatSkipRoadside` desligam os workers e a
  triangulação desses elementos.
- O WorldSheet não reserva degrau/altura de calçada, e faz apenas a
  transição suave asfalto ⇢ solo.
- **Antes de enviar o asfalto à GPU**, os triângulos planos de faixas
  que se sobrepõem são subtraídos usando união booleana geométrica,
  prioridade dos tipos de via OSM e índice espacial. Isso cria um
  único *footprint de cobertura* em cada setor. As altitudes de
  interseção usam a MESMA função H(X,Z) do terreno e da física.
- O editor BUZUN CREATE mantém as ferramentas de arrastar vértices
  e arestas; oculta a opção de puxar calçada, desabilita parâmetros
  de curb/walk e desenha uma prévia apenas do asfalto.
- Ultra continua como padrão e os chunks de 420m seguem sendo somente
  unidades de renderização. Não há cópia extra do grafo oficial.

## Links
- Experimento 7.5: `?worldgen=flat&roads=vector&debug=worldgen`
- Experimento 7.5 sem relevo: `?worldgen=flat&roads=vector&relief=flat&debug=worldgen`
- Comparação com 7.4 no mesmo branch: `?worldgen=flat&roads=vector&sidewalks=on&debug=worldgen`
- Produção e branch 7.4 não foram alteradas.

## Critérios de aceite
1. Cruzamento da Rua Tenente-Coronel Herman José Rocha: sem calçadas
   geométricas e sem duas cores/planos de asfalto atravessando a esquina.
2. Verificar carro/câmera e declive em ruas adjacentes; uma máscara
   booleana 2D não resolve, sozinha, um erro topográfico de origem.
3. Percorrer chunks vizinhos e voltar, verificando a proteção de borda
   de 10 cm ainda ativa.
4. Medir os FPS em Ultra e Econômico. A união booleana é feita
   ao gerar o chunk, não foi ainda certificada em dispositivos lentos.
5. Ferramentas de mover vértices e arestas continuam disponíveis.
   Não alterar dados originais OSM; correções continuam locais por JSON.

### Limitação importante
A união **remove sobreposições de asfalto**, mas não cria endpoints
de navegação entre vias que o OSM não conecta e não corrige por si só
todos os desníveis da SRTM. Depois do teste visual poderemos tratar
ligações vetoriais reais (nós compartilhados) com o editor, antes de
voltar a desenhar calçadas.

**Não mesclar em main sem teste visual.**
