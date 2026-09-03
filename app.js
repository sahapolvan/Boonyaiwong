// /js/app.js
// ประกอบร่างทุกอย่างเข้าด้วยกัน และสร้าง public API

import { drawTree, zoomIn, zoomOut, resetZoom, searchNode } from './tree-core.js';
import { exportImage } from './tree-export.js';
import { closeModal } from './tree-ui.js';

const TreeApp = {
  init: function (containerId, rawData, rootIds) {
    drawTree(containerId, rawData, rootIds);
  },

  zoomIn: zoomIn,
  zoomOut: zoomOut,
  resetZoom: resetZoom,
  search: searchNode,
  exportImage: exportImage,
  closeModal: closeModal
};

window.TreeApp = TreeApp;
export default TreeApp;
