import type { AlgoDiagram } from "./algorithms.static";
import type { HighlightedLink } from "../components/fmEngine/FMSynthContext";
import type { Theme } from "../theme/theme";

type RenderOptions = {
  cell?: number;
  margin?: number;
  highlightedLink?: HighlightedLink | null;
  highlightedNode?: number | null;
  theme?: Theme;
};

export function renderAlgoSvg(diagram: AlgoDiagram, opts: RenderOptions = {}): string {
  const cell = opts.cell ?? 48;  // Espacement entre nœuds
  const padding = 32; // Padding uniforme autour du contenu réel

  // Vérifier s'il y a des boucles de feedback (self-loops)
  const hasFeedbackLoop = diagram.edges.some(e => e.from === e.to);
  const feedbackExtraSpace = hasFeedbackLoop ? 30 : 0; // Espace supplémentaire en haut pour les feedback loops

  // Calculer les positions réelles min/max des nœuds
  const minX = Math.min(...diagram.nodes.map((n) => n.x));
  const maxX = Math.max(...diagram.nodes.map((n) => n.x));
  const minY = Math.min(...diagram.nodes.map((n) => n.y));
  const maxY = Math.max(...diagram.nodes.map((n) => n.y));
  
  // Dimensions du contenu réel
  const contentWidth = (maxX - minX + 1) * cell;
  const contentHeight = (maxY - minY + 1) * cell;
  
  // Dimensions totales avec padding - crop de 50px à droite, 30px en bas, ajout d'espace en haut pour feedback
  const width = contentWidth + padding * 2 - 50;
  const height = contentHeight + padding * 2 - 30 + feedbackExtraSpace;
  
  // Offset pour centrer le contenu (compenser minX/minY non-zéro + espace feedback)
  const offsetX = padding - minX * cell;
  const offsetY = padding - minY * cell + feedbackExtraSpace;

  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));

  // Helper function to calculate IM index exactly like in ModulationIndexesEditor
  const calculateEdgeIMIndex = (fromOpId: string, toOpId: string): number => {
    const fromId = parseInt(fromOpId.replace(/\D/g, ''));
    const toId = parseInt(toOpId.replace(/\D/g, ''));
    
    // Use the same logic as ModulationIndexesEditor: iterate through edges in diagram order
    let idx = 0;
    for (const edge of diagram.edges) {
      const src = parseInt(edge.from.replace(/\D/g, ''));
      const tgt = parseInt(edge.to.replace(/\D/g, ''));
      const isFb = src === tgt;
      
      // If this is the edge we're looking for
      if (src === fromId && tgt === toId) {
        return isFb ? 5 : idx;
      }
      
      // Only increment for non-feedback edges
      if (!isFb) idx++;
    }
    
    return 0; // Fallback
  };

  const edges = diagram.edges.map((e) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;

    const x1 = offsetX + a.x * cell;
    const y1 = offsetY + a.y * cell;
    const x2 = offsetX + b.x * cell;
    const y2 = offsetY + b.y * cell;

    // Extraire les IDs numériques des opérateurs ("op1" -> 1)
    const sourceId = parseInt(e.from.replace(/\D/g, ''));
    const targetId = parseInt(e.to.replace(/\D/g, ''));

    // Déterminer la couleur de base selon le type de liaison
    let baseColor: string;
    if (e.kind === "sync") {
      // Synchronisation : rose/accent
      baseColor = opts.theme?.colors.accent || "#b910ab";
    } else {
      // Modulation : primary (vers CARRIER) ou variant plus clair (vers MODULATOR)
      baseColor = b.type === "CARRIER" ? (opts.theme?.colors.primary || "#0ea5e9") : "#7c3aed";
    }
    
    const imLabel = `IM${calculateEdgeIMIndex(e.from, e.to) + 1}`;
    
    // Cas spécial : feedback (self-loop) - dessiner un arc au-dessus du nœud
    if (e.from === e.to) {
      const nodeRadius = a.type === "CARRIER" ? 16 : 12;
      const loopRadius = 12;
      const loopCenterX = x1;
      const loopCenterY = y1 - nodeRadius - loopRadius;
      
      // Arc SVG pour le feedback
      const arcPath = `M ${x1} ${y1 - nodeRadius} 
                       A ${loopRadius} ${loopRadius} 0 1 1 ${x1 + 0.1} ${y1 - nodeRadius}`;
      
      return `
        <g class="edge-group feedback" data-source="${sourceId}" data-target="${targetId}" data-base-color="${baseColor}">
          <path class="edge" d="${arcPath}" stroke="${baseColor}" stroke-width="2" fill="none" />
          <text class="edge-label" x="${loopCenterX}" y="${loopCenterY - 8}" text-anchor="middle" font-size="10" font-weight="bold" style="pointer-events: none;">${imLabel}</text>
        </g>
      `;
    }
    
    // Cas normal : ligne droite entre deux nœuds
    let midX = (x1 + x2) / 2;
    let midY = (y1 + y2) / 2;
    
    // Vérifier si le label est trop proche d'un node et le décaler si nécessaire
    const minDistanceFromNode = 20; // Distance minimale d'un node
    for (const node of diagram.nodes) {
      const nodeX = offsetX + node.x * cell;
      const nodeY = offsetY + node.y * cell;
      const nodeRadius = node.type === "CARRIER" ? 16 : 12;
      const distanceToNode = Math.sqrt((midX - nodeX) ** 2 + (midY - nodeY) ** 2);
      
      if (distanceToNode < minDistanceFromNode + nodeRadius) {
        // Décaler le label perpendiculairement à la ligne
        const lineAngle = Math.atan2(y2 - y1, x2 - x1);
        const perpAngle = lineAngle + Math.PI / 2;
        const offsetDistance = 15;
        midX += Math.cos(perpAngle) * offsetDistance;
        midY += Math.sin(perpAngle) * offsetDistance;
        break;
      }
    }
    
    return `
      <g class="edge-group" data-source="${sourceId}" data-target="${targetId}" data-base-color="${baseColor}">
        <line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${baseColor}" stroke-width="2" />
        <text class="edge-label" x="${midX}" y="${midY - 4}" text-anchor="middle" font-size="10" font-weight="bold" style="pointer-events: none;">${imLabel}</text>
      </g>
    `;
  });

  const nodes = diagram.nodes.map((n, i) => {
    const cx = offsetX + n.x * cell;
    const cy = offsetY + n.y * cell;
    const isCarrier = n.type === "CARRIER";
    const nodeId = parseInt(n.id.replace(/\D/g, '')); // "op1" -> 1
    
    const radius = isCarrier ? 16 : 12;
    const gradientId = isCarrier ? "carrierGradient" : "modulatorGradient";
    const strokeColor = opts.theme?.colors.border || "#2D3748";
    const textColor = "#1A202C"; // Texte sombre pour lisibilité sur les billes colorées
    
    // Calcul du reflet brillant (petit ellipse blanc en haut à gauche)
    const shineRadius = radius * 0.4;
    const shineCx = cx - radius * 0.3;
    const shineCy = cy - radius * 0.3;
    
    return `
      <g id="node-${i}" class="node" data-node-id="${nodeId}">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#${gradientId})" stroke="${strokeColor}" stroke-width="1.5" />
        <ellipse class="highlight-shine" cx="${shineCx}" cy="${shineCy}" rx="${shineRadius}" ry="${shineRadius * 0.7}" fill="white" opacity="0.6" />
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="${textColor}">${n.label}</text>
      </g>
    `;
  });

  const highlightColor = opts.theme?.colors.highlight || "#fbbf24";
  const backgroundColor = opts.theme?.colors.background || "#0b1020";
  
  // Déterminer si on est en mode sombre ou clair
  const isDarkMode = backgroundColor.length === 7 ? 
    parseInt(backgroundColor.slice(1), 16) < 0x888888 : true;
  
  // Couleurs adaptées au thème
  const labelTextColor = isDarkMode ? "#e2e8f0" : "#2d3748";
  const labelShadowColor = isDarkMode ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)";
  const labelStrokeColor = isDarkMode ? "rgba(0, 0, 0, 0.6)" : "rgba(255, 255, 255, 0.6)";
  
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <!-- Gradients pour effet bille - Carrier (vert) -->
    <radialGradient id="carrierGradient" cx="25%" cy="25%" r="75%">
      <stop offset="0%" style="stop-color:#D1E7DD;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#75B798;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#52796F;stop-opacity:1" />
    </radialGradient>
    
    <!-- Gradients pour effet bille - Modulator (bleu) -->
    <radialGradient id="modulatorGradient" cx="25%" cy="25%" r="75%">
      <stop offset="0%" style="stop-color:#BFDBFE;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#63B3ED;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3182CE;stop-opacity:1" />
    </radialGradient>
    
    <!-- Filtres pour ombres -->
    <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="2" dy="3" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
    
    <style>
      .node circle {
        transition: stroke 0.5s ease, stroke-width 0.5s ease, filter 0.3s ease;
        filter: url(#dropShadow);
      }
      .node-highlighted circle {
        stroke: ${highlightColor};
        stroke-width: 4;
        transition: stroke 0.03s ease, stroke-width 0.3s ease;
        filter: url(#dropShadow) brightness(1.2);
      }
      .node .highlight-shine {
        opacity: 0.6;
        transition: opacity 0.3s ease;
      }
      .node-highlighted .highlight-shine {
        opacity: 0.9;
      }
      .edge {
        transition: stroke 0.5s ease, stroke-width 0.5s ease;
      }
      .edge-highlighted .edge {
        stroke: ${highlightColor} !important;
        stroke-width: 4;
        transition: stroke 0.03s ease, stroke-width 0.03s ease;
      }
      .edge-label {
        transition: fill 1s ease;
        fill: ${labelTextColor};
        text-shadow: 0 1px 2px ${labelShadowColor};
        paint-order: stroke fill;
        stroke: ${labelStrokeColor};
        stroke-width: 1px;
        stroke-linejoin: round;
      }
      .edge-highlighted .edge-label {
        fill: ${highlightColor};
        transition: fill 0.03s ease;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
        stroke: rgba(0, 0, 0, 0.5);
      }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${backgroundColor}" />
  ${edges.join("\n")}
  ${nodes.join("\n")}
</svg>`.trim();
}
