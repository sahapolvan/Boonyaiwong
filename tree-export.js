// /js/tree-export.js
// ส่งออกผังเป็น PNG / JPG / PDF

import { getSvg, getFlatNodes, getContainerEl, getTreeBounds } from './tree-core.js';
import { showToast } from './tree-ui.js';

const jsPDF = window.jspdf?.jsPDF;

function serializeSvg(svgNode, width, height, viewBox) {
  const cloned = svgNode.cloneNode(true);
  const innerG = cloned.querySelector('g');
  if (innerG) innerG.removeAttribute('transform');

  cloned.setAttribute('width', width);
  cloned.setAttribute('height', height);
  cloned.setAttribute('viewBox', viewBox);
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  if (!cloned.getAttribute('xmlns:xlink')) {
    cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }

  // เติมพื้นหลังสีครีม
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', viewBox.split(' ')[0]);
  bg.setAttribute('y', viewBox.split(' ')[1]);
  bg.setAttribute('width', width);
  bg.setAttribute('height', height);
  bg.setAttribute('fill', '#f6f3ed');
  cloned.insertBefore(bg, cloned.firstChild);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(cloned);
}

export function exportImage(format) {
  const svg = getSvg();
  const flatNodes = getFlatNodes();
  const containerEl = getContainerEl();

  if (!svg || !flatNodes.length || !containerEl) {
    showToast('ไม่พบผังสำหรับบันทึก', 'error');
    return;
  }

  const bounds = getTreeBounds();
  const treeWidth = bounds.maxX - bounds.minX;
  const treeHeight = bounds.maxY - bounds.minY;

  if (treeWidth <= 0 || treeHeight <= 0) {
    showToast('ไม่พบผังสำหรับบันทึก', 'error');
    return;
  }

  const scale = 3;
  const canvasW = Math.ceil(treeWidth * scale);
  const canvasH = Math.ceil(treeHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f3ed';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const svgStr = serializeSvg(svg.node(), treeWidth, treeHeight, `${bounds.minX} ${bounds.minY} ${treeWidth} ${treeHeight}`);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
    URL.revokeObjectURL(url);

    if (format === 'png' || format === 'jpg') {
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const link = document.createElement('a');
      link.download = `family-tree.${format}`;
      link.href = canvas.toDataURL(mime, 0.95);
      link.click();
    }
    else if (format === 'pdf') {
      if (!jsPDF) {
        showToast('ไม่พบไลบรารี jsPDF', 'error');
        return;
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: treeWidth > treeHeight ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgWmm = treeWidth * 0.264583;
      const imgHmm = treeHeight * 0.264583;
      const ratio = Math.min(pageW / imgWmm, pageH / imgHmm) * 0.92;

      pdf.addImage(
        imgData, 'PNG',
        (pageW - imgWmm * ratio) / 2,
        (pageH - imgHmm * ratio) / 2,
        imgWmm * ratio,
        imgHmm * ratio
      );
      pdf.save('family-tree.pdf');
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    showToast('ไม่สามารถสร้างภาพได้ อาจเกิดจากรูปภาพถูกบล็อก CORS', 'error');
  };

  img.src = url;
}
