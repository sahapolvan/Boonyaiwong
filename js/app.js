import { familyRawData } from '../data.js';
import { buildTree, renderForest, expandAll, collapseAll, setSearch } from './tree.js';

const container = document.getElementById('treeContainer');
const roots = buildTree(familyRawData);

renderForest(roots, container);

document.getElementById('expandAll').addEventListener('click', () => expandAll(container));
document.getElementById('collapseAll').addEventListener('click', () => collapseAll(container));

document.getElementById('searchInput').addEventListener('input', (e) => {
  setSearch(e.target.value.trim());
  renderForest(roots, container);
});
