// /js/tree-core.js
// วาดผัง คำนวณตำแหน่ง node ซูม/แพน และ highlight การค้นหา

import { getPhoto, genderColor } from './utils.js';
import { openPersonModal, showToast } from './tree-ui.js';

const d3 = window.d3;
if (!d3) throw new Error('ต้องโหลด D3.js ก่อนใช้งาน tree-core.js');

// --- Constants ---
const CARD_W = 170;
const CARD_H = 50;
const PHOTO_SIZE = 36;
const COUPLE_GAP = 30;
const LEVEL_H = 120;
const SIBLING_GAP = 40;
const ROOT_GAP = 80;
const MARGIN = { top: 40, left: 40 };

// --- State ---
let svg = null;
let g = null;
let zoomBehavior = null;
let containerEl = null;
let flatNodes = [];
let peopleMap = new Map();

// --- Public getters ---
export function getSvg() { return svg; }
export function getFlatNodes() { return flatNodes; }
export function getContainerEl() { return containerEl; }

// --- Data helpers ---
function buildPeopleMap(rawData) {
  const map = new Map();
  rawData.forEach(p => map.set(String(p.id), { ...p, _id: String(p.id) }));
  return map;
}

function findSpouses(person, map) {
  if (!person) return [];
  const spouses = [];
  if (person.spouse) {
    const s = map.get(String(person.spouse));
    if (s) spouses.push(s);
  }
  map.forEach(p => {
    if (String(p.spouse) === String(person.id) && !spouses.find(x => x._id === p._id)) {
      spouses.push(p);
    }
  });
  return spouses;
}

function findChildren(personId, map) {
  return Array.from(map.values()).filter(p =>
    String(p.father) === String(personId) || String(p.mother) === String(personId)
  );
}

function sortCouple(people) {
  return [...people].sort((a, b) => {
    if (a.gender === 'ช' && b.gender !== 'ช') return -1;
    if (b.gender === 'ช' && a.gender !== 'ช') return 1;
    return 0;
  });
}

function getUnitWidth(unit) {
  if (unit.type === 'single') return CARD_W;
  if (unit.type === 'couple') return CARD_W * 2 + COUPLE_GAP;
  if (unit.type === 'multi') {
    return (unit.spouses.length + 1) * CARD_W + unit.spouses.length * COUPLE_GAP;
  }
  return CARD_W;
}

function getChildUnits(unit) {
  if (unit.type === 'multi') {
    return unit.spouses.flatMap(su => su.children || []);
  }
  return unit.children || [];
}

// --- Build family units ---
function buildFamilyUnit(person, visited = new Set()) {
  if (!person || visited.has(person._id)) return null;
  visited.add(person._id);

  const spouses = findSpouses(person, peopleMap);
  const children = findChildren(person._id, peopleMap).filter(c => !visited.has(c._id));

  if (spouses.length === 0) {
    return {
      type: 'single',
      people: [person],
      children: children.map(c => buildFamilyUnit(c, visited)).filter(Boolean),
      person: person
    };
  }

  if (spouses.length === 1) {
    const spouse = spouses[0];
    visited.add(spouse._id);
    const spouseChildren = findChildren(spouse._id, peopleMap).filter(c => !visited.has(c._id));
    const allChildren = [...new Map([...children, ...spouseChildren].map(c => [c._id, c])).values()];
    return {
      type: 'couple',
      people: sortCouple([person, spouse]),
      children: allChildren.map(c => buildFamilyUnit(c, visited)).filter(Boolean),
      husband: person.gender === 'ช' ? person : spouse,
      wife: person.gender === 'ญ' ? person : spouse
    };
  }

  // Multi-spouse
  const spouseUnits = spouses.map(spouse => {
    visited.add(spouse._id);
    return {
      spouse: spouse,
      children: findChildren(spouse._id, peopleMap)
        .filter(c => !visited.has(c._id))
        .map(c => buildFamilyUnit(c, visited))
        .filter(Boolean)
    };
  });

  return {
    type: 'multi',
    anchor: person,
    spouses: spouseUnits,
    person: person
  };
}

// --- Layout ---
function layoutPass1(unit, depth) {
  unit.y = depth * LEVEL_H + MARGIN.top;
  unit.depth = depth;

  const childUnits = getChildUnits(unit);

  if (childUnits.length === 0) {
    unit.width = getUnitWidth(unit);
    unit.centerX = unit.width / 2;
    unit.childrenOffset = 0;
    return;
  }

  let currentX = 0;
  childUnits.forEach(child => {
    layoutPass1(child, depth + 1);
    child.offsetX = currentX;
    currentX += child.width + SIBLING_GAP;
  });

  const childrenSpan = Math.max(0, currentX - SIBLING_GAP);
  const unitWidth = getUnitWidth(unit);
  unit.width = Math.max(unitWidth, childrenSpan);
  unit.childrenOffset = (unit.width - childrenSpan) / 2;
  unit.centerX = unit.width / 2;
}

function layoutPass2(unit, parentLeftX) {
  unit.absX = parentLeftX + unit.centerX;

  if (unit.type === 'single') {
    unit.personX = unit.absX - CARD_W / 2;
  }
  else if (unit.type === 'couple') {
    unit.husbandX = unit.absX - COUPLE_GAP / 2 - CARD_W;
    unit.wifeX = unit.absX + COUPLE_GAP / 2;
  }
  else if (unit.type === 'multi') {
    const startX = unit.absX - unit.width / 2;
    unit.anchorX = startX;
    let currentX = startX + CARD_W + COUPLE_GAP;
    unit.spouses.forEach(su => {
      su.cardX = currentX;
      currentX += CARD_W + COUPLE_GAP;
    });
  }

  const childUnits = getChildUnits(unit);
  childUnits.forEach(child => {
    layoutPass2(child, parentLeftX + unit.childrenOffset + child.offsetX);
  });
}

function calculateLayout(rootUnits) {
  flatNodes = [];
  rootUnits.forEach(root => layoutPass1(root, 0));

  let currentX = MARGIN.left;
  rootUnits.forEach(root => {
    layoutPass2(root, currentX);
    currentX += root.width + ROOT_GAP;
  });
}

// --- Drawing ---
function setupSvg(containerId) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) throw new Error(`ไม่พบ container #${containerId}`);
  containerEl.innerHTML = '';

  const rect = containerEl.getBoundingClientRect();
  svg = d3.select(containerEl)
    .append('svg')
    .attr('width', rect.width)
    .attr('height', rect.height)
    .attr('viewBox', `0 0 ${rect.width} ${rect.height}`)
    .style('background', '#f6f3ed');

  zoomBehavior = d3.zoom()
    .scaleExtent([0.05, 3])
    .on('zoom', (e) => g.attr('transform', e.transform));

  svg.call(zoomBehavior);
  g = svg.append('g').attr('class', 'tree-root');
}

function drawPersonCard(container, x, y, person) {
  const card = container.append('g')
    .attr('class', 'person-card node-group')
    .attr('transform', `translate(${x},${y})`)
    .on('click', (e) => {
      e.stopPropagation();
      openPersonModal(person);
    });

  card.append('rect')
    .attr('class', 'person-bg')
    .attr('x', 0).attr('y', 0)
    .attr('width', CARD_W).attr('height', CARD_H)
    .attr('fill', genderColor(person.gender))
    .attr('rx', 999).attr('ry', 999);

  const clipId = `clip-${person._id}`;
  const defs = card.append('defs');
  const clip = defs.append('clipPath').attr('id', clipId);
  clip.append('circle')
    .attr('cx', 7 + PHOTO_SIZE / 2)
    .attr('cy', CARD_H / 2)
    .attr('r', PHOTO_SIZE / 2);

  card.append('image')
    .attr('class', 'person-photo')
    .attr('x', 7).attr('y', 7)
    .attr('width', PHOTO_SIZE).attr('height', PHOTO_SIZE)
    .attr('href', getPhoto(person))
    .attr('crossorigin', 'anonymous')
    .attr('clip-path', `url(#${clipId})`)
    .attr('preserveAspectRatio', 'xMidYMid slice');

  card.append('text')
    .attr('class', 'person-name')
    .attr('x', 7 + PHOTO_SIZE + 10)
    .attr('y', CARD_H / 2)
    .attr('dominant-baseline', 'middle')
    .text(person.name || '');
}

function drawHeart(container, x1, x2, y) {
  const heartX = (x1 + CARD_W + x2) / 2;
  container.append('text')
    .attr('class', 'heart')
    .attr('x', heartX)
    .attr('y', y + CARD_H / 2)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .text('❤');
}

function getConnectionX(unit) {
  if (unit.type === 'single') return unit.personX + CARD_W / 2;
  if (unit.type === 'couple') return (unit.husbandX + unit.wifeX + CARD_W) / 2;
  if (unit.type === 'multi') {
    const first = unit.anchorX;
    const last = unit.spouses[unit.spouses.length - 1].cardX;
    return (first + last + CARD_W) / 2;
  }
  return unit.absX;
}

function drawLinks() {
  const linkGroup = g.append('g').attr('class', 'links');

  flatNodes.forEach(unit => {
    const childUnits = getChildUnits(unit);
    if (childUnits.length === 0) return;

    const parentX = getConnectionX(unit);
    const parentY = unit.y + CARD_H;

    if (childUnits.length === 1) {
      const child = childUnits[0];
      const childX = getConnectionX(child);
      const midY = parentY + (child.y - parentY) / 2;
      linkGroup.append('path')
        .attr('class', 'link')
        .attr('d', `M${parentX},${parentY} V${midY} H${childX} V${child.y}`);
    } else {
      const firstChild = childUnits[0];
      const lastChild = childUnits[childUnits.length - 1];
      const firstX = getConnectionX(firstChild);
      const lastX = getConnectionX(lastChild);
      const midY = parentY + (firstChild.y - parentY) / 2;

      linkGroup.append('path')
        .attr('class', 'link')
        .attr('d', `M${parentX},${parentY} V${midY} H${firstX} M${firstX},${midY} H${lastX}`);

      childUnits.forEach(child => {
        const cx = getConnectionX(child);
        linkGroup.append('path')
          .attr('class', 'link')
          .attr('d', `M${cx},${midY} V${child.y}`);
      });
    }
  });
}

function drawNodes() {
  const nodeGroup = g.append('g').attr('class', 'nodes');

  flatNodes.forEach(unit => {
    const el = nodeGroup.append('g').attr('class', 'family-unit');

    if (unit.type === 'single') {
      drawPersonCard(el, unit.personX, unit.y, unit.person);
    }
    else if (unit.type === 'couple') {
      drawPersonCard(el, unit.husbandX, unit.y, unit.husband);
      drawPersonCard(el, unit.wifeX, unit.y, unit.wife);
      drawHeart(el, unit.husbandX, unit.wifeX, unit.y);
    }
    else if (unit.type === 'multi') {
      drawPersonCard(el, unit.anchorX, unit.y, unit.anchor);
      let prevX = unit.anchorX;
      unit.spouses.forEach(su => {
        drawPersonCard(el, su.cardX, unit.y, su.spouse);
        drawHeart(el, prevX, su.cardX, unit.y);
        prevX = su.cardX;
      });
    }
  });
}

// --- Zoom & Search ---
function centerNode(nodeEl) {
  const transform = d3.zoomTransform(svg.node());
  const bbox = nodeEl.getBBox();
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const rect = containerEl.getBoundingClientRect();

  const x = rect.width / 2 - cx * transform.k;
  const y = rect.height / 2 - cy * transform.k;

  svg.transition().duration(750)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(transform.k));
}

export function searchNode(term) {
  if (!term) {
    g.selectAll('.person-card').classed('dim highlight', false);
    return;
  }

  const lower = String(term).toLowerCase();
  let found = null;

  g.selectAll('.person-card').each(function (d) {
    // d ที่นี่คือ person object ที่ผูกไว้ใน drawPersonCard
    const person = d3.select(this).datum();
    const text = (person?.name || '').toLowerCase();
    const match = text.includes(lower);

    d3.select(this).classed('dim', !match).classed('highlight', match);
    if (match && !found) found = this;
  });

  if (found) centerNode(found);
  else showToast('ไม่พบข้อมูลที่ค้นหา', 'error');
}

export function zoomIn() {
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.25);
}

export function zoomOut() {
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.8);
}

export function fitToScreen() {
  const bounds = getTreeBounds();
  const rect = containerEl.getBoundingClientRect();
  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;

  if (dx <= 0 || dy <= 0) return;

  const scale = Math.min(rect.width / dx, rect.height / dy, 1) * 0.9;
  const x = (rect.width - dx * scale) / 2 - bounds.minX * scale;
  const y = (rect.height - dy * scale) / 2 - bounds.minY * scale;

  svg.transition().duration(750)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
}

export function resetZoom() {
  fitToScreen();
}

export function getTreeBounds() {
  if (!flatNodes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  flatNodes.forEach(u => {
    let left, right, top = u.y, bottom = u.y + CARD_H;

    if (u.type === 'single') {
      left = u.personX;
      right = u.personX + CARD_W;
    }
    else if (u.type === 'couple') {
      left = u.husbandX;
      right = u.wifeX + CARD_W;
    }
    else if (u.type === 'multi') {
      left = u.anchorX;
      const last = u.spouses[u.spouses.length - 1];
      right = last ? last.cardX + CARD_W : left + CARD_W;
    }

    const childUnits = getChildUnits(u);
    childUnits.forEach(c => {
      if (c.y + CARD_H > bottom) bottom = c.y + CARD_H;
    });

    minX = Math.min(minX, left - 20);
    maxX = Math.max(maxX, right + 20);
    minY = Math.min(minY, top - 20);
    maxY = Math.max(maxY, bottom + 40);
  });

  return { minX, maxX, minY, maxY };
}

// --- Main entry ---
export function drawTree(containerId, rawData, rootIds) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error('ข้อมูลต้นไม้ว่างเปล่า');
  }

  peopleMap = buildPeopleMap(rawData);

  const rootUnits = rootIds
    .map(id => peopleMap.get(String(id)))
    .filter(Boolean)
    .map(p => buildFamilyUnit(p))
    .filter(Boolean);

  if (rootUnits.length === 0) {
    throw new Error('ไม่พบ root node จาก rootIds ที่กำหนด');
  }

  calculateLayout(rootUnits);

  setupSvg(containerId);
  drawLinks();
  drawNodes();

  // ซูมให้พอดีจอหลังวาดเสร็จ
  requestAnimationFrame(() => fitToScreen());

  // รองรับ resize
  window.addEventListener('resize', throttle(() => {
    if (!svg || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    svg.attr('width', rect.width).attr('height', rect.height);
    fitToScreen();
  }, 300));
}
