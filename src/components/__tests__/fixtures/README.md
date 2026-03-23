# Fixtures pour les tests ReorderingComponent

Ce dossier contient les fichiers de test (fixtures) pour le composant de réorganisation de banks.

## Ajouter un fichier .patch

1. Exporter un preset depuis le PreenFM3 ou depuis l'UI (clic-droit → Exporter en .patch)
2. Placer le fichier `.patch` (1024 octets exactement) dans ce dossier
3. Lancer `npm test`

Les tests détecteront automatiquement tout fichier `.patch` présent et vérifieront :
- Que le fichier fait exactement 1024 octets
- Que `readName` extrait un nom non-vide
- Que `writeName` + `readName` round-trip correctement
- Que l'insertion dans une bank puis ré-extraction donne des données identiques

## Format attendu

Un fichier `.patch` est un bloc brut de **1024 octets** correspondant à un seul preset PreenFM3
(structure `FlashSynthParams`). Le nom du preset se trouve à l'offset 720 (13 octets max,
terminé par un octet nul).
