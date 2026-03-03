import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import type { Algorithm } from '../../types/patch';
import { ALGO_DIAGRAMS } from '../../algo/algorithms.static';
import { renderAlgoSvg } from '../../algo/renderAlgoSvg';
import { useFMSynthContext } from './FMSynthContext';
import { useThemeStore } from '../../theme/themeStore';

const VisualizationContainer = styled.div`
  width: 280px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0; /* Espacement autour du SVG */
  background: ${props => props.theme.colors.background};
  zoom:1.4;

  svg {
    max-width: 100%;
    max-height: 100%;
  }
`;

interface AlgorithmVisualizationProps {
  algorithm: Algorithm;
}

export const AlgorithmVisualization = ({ algorithm }: AlgorithmVisualizationProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { highlightedLink, highlightedNode } = useFMSynthContext();
  const { theme } = useThemeStore();

  // Effet 1: Render initial du SVG (seulement quand l'algorithme change)
  useEffect(() => {
    if (!containerRef.current) return;

    const diagram = ALGO_DIAGRAMS.find(d => d.id === String(algorithm.id));
    
    if (!diagram) {
      containerRef.current.innerHTML = `<p style="color: ${theme.colors.textMuted};">Algorithm ${algorithm.id} not found</p>`;
      return;
    }

    const svg = renderAlgoSvg(diagram, { theme });
    containerRef.current.innerHTML = svg;
  }, [algorithm.id, theme]);

  // Effet 2: Mise à jour des classes pour highlighted link
  useEffect(() => {
    if (!containerRef.current) return;
    
    const allEdges = containerRef.current.querySelectorAll('.edge-group');
    allEdges.forEach(edge => {
      edge.classList.remove('edge-highlighted');
    });

    if (highlightedLink) {
      const targetEdge = containerRef.current.querySelector(
        `.edge-group[data-source="${highlightedLink.sourceId}"][data-target="${highlightedLink.targetId}"]`
      );
      if (targetEdge) {
        targetEdge.classList.add('edge-highlighted');
      }
    }
  }, [highlightedLink]);

  // Effet 3: Mise à jour des classes pour highlighted node
  useEffect(() => {
    if (!containerRef.current) return;
    
    const allNodes = containerRef.current.querySelectorAll('.node');
    allNodes.forEach(node => {
      node.classList.remove('node-highlighted');
    });

    if (highlightedNode !== null) {
      const diagram = ALGO_DIAGRAMS.find(d => d.id === String(algorithm.id));
      if (diagram) {
        const nodeIndex = diagram.nodes.findIndex(n => {
          const nodeId = parseInt(n.id.replace(/\D/g, ''));
          return nodeId === highlightedNode;
        });
        
        if (nodeIndex >= 0) {
          const targetNode = containerRef.current.querySelector(`#node-${nodeIndex}`);
          if (targetNode) {
            targetNode.classList.add('node-highlighted');
          }
        }
      }
    }
  }, [highlightedNode, algorithm.id]);

  return <VisualizationContainer ref={containerRef} />;
};

export default AlgorithmVisualization;