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

  const edges = diagram.edges.map((e, i) => {
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
    
    const imLabel = `IM${i + 1}`;
    
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
          <text class="edge-label" x="${loopCenterX}" y="${loopCenterY - 8}" text-anchor="middle" font-size="10" font-weight="bold" fill="${opts.theme?.colors.textMuted || '#0c0d0e'}" style="pointer-events: none;">${imLabel}</text>
        </g>
      `;
    }
    
    // Cas normal : ligne droite entre deux nœuds
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    return `
      <g class="edge-group" data-source="${sourceId}" data-target="${targetId}" data-base-color="${baseColor}">
        <line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${baseColor}" stroke-width="2" />
        <text class="edge-label" x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="10" font-weight="bold" fill="${opts.theme?.colors.textMuted || '#a0aec0'}" style="pointer-events: none;">${imLabel}</text>
      </g>
    `;
  });

  const nodes = diagram.nodes.map((n, i) => {
    const cx = offsetX + n.x * cell;
    const cy = offsetY + n.y * cell;
    const isCarrier = n.type === "CARRIER";
    const nodeId = parseInt(n.id.replace(/\D/g, '')); // "op1" -> 1
    
    const radius = isCarrier ? 16 : 12;
    const fillColor = isCarrier ? "#68D391" : (opts.theme?.colors.primary || "#63B3ED");
    const strokeColor = opts.theme?.colors.border || "#2D3748";
    const textColor = opts.theme?.colors.text || "#1a202c";
    
    return `
      <g id="node-${i}" class="node" data-node-id="${nodeId}">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" />
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="${textColor}">${n.label}</text>
      </g>
    `;
  });

  const highlightColor = opts.theme?.colors.highlight || "#fbbf24";
  const backgroundColor = opts.theme?.colors.background || "#0b1020";
  
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .node circle {
        transition: stroke 0.5s ease, stroke-width 0.5s ease;
      }
      .node-highlighted circle {
        stroke: ${highlightColor};
        stroke-width: 4;
        transition: stroke 0.03s ease, stroke-width 0.3s ease;
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
      }
      .edge-highlighted .edge-label {
        fill: ${highlightColor};
        transition: fill 0.03s ease;
      }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${backgroundColor}" />
  ${edges.join("\n")}
  ${nodes.join("\n")}
</svg>`.trim();
}
