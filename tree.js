// tree.js - ฟังก์ชันสร้างและวาดผังครอบครัว

const TreeApp = (function () {
  /* ===== ค่าคงที่ ===== */
  const CARD_W = 110;
  const CARD_H = 46;
  const PHOTO_SIZE = 32;
  const COUPLE_GAP = 22;
  const LEVEL_H = 130;
  const SIBLING_GAP = 34;
  const MALE_COLOR = "#cfe2f3";
  const FEMALE_COLOR = "#f4cccc";

  /* ===== State ===== */
  let svg, g, zoomHandler;
  let flatNodes = [];
  let familyData = null;
  let containerEl = null;

  /* ===== แปลง flat data เป็น tree ===== */
  function normalizeFamilyData(rawData) {
    const byId = {};
    rawData.forEach(p => {
      let spouses = [];
      if (p.spouse) {
        if (Array.isArray(p.spouse)) spouses = [...p.spouse];
        else if (typeof p.spouse === 'string') spouses = p.spouse.split('|').filter(s => s.trim());
      }

      byId[p.id] = {
        ...p,
        spouse: spouses,
        spouses: [],
        childrenBySpouse: {}
      };
    });

    Object.values(byId).forEach(p => {
      p.spouse.forEach(sid => {
        if (byId[sid] && !p.spouses.includes(sid)) {
          p.spouses.push(sid);
        }
      });
    });

    Object.values(byId).forEach(child => {
      if (child.father && byId[child.father] && child.mother && byId[child.mother]) {
        const father = byId[child.father];
        const mother = byId[child.mother];

        if (father.spouses.includes(child.mother)) {
          if (!father.childrenBySpouse[child.mother]) father.childrenBySpouse[child.mother] = [];
          father.childrenBySpouse[child.mother].push(child.id);
        }

        if (mother.spouses.includes(child.father)) {
          if (!mother.childrenBySpouse[child.father]) mother.childrenBySpouse[child.father] = [];
          mother.childrenBySpouse[child.father].push(child.id);
        }
      }
    });

    return byId;
  }

  function buildFamilyTree(rawData, rootIds) {
    const byId = normalizeFamilyData(rawData);

    function buildNodes(personId, visited = new Set()) {
      if (visited.has(personId)) return [];
      visited.add(personId);

      const person = byId[personId];
      if (!person) return [];

      if (!person.spouses || person.spouses.length === 0) {
        return [{
          type: 'single',
          people: [person],
          children: []
        }];
      }

      if (person.spouses.length === 1) {
        const spouse = byId[person.spouses[0]];
        const childIds = person.childrenBySpouse[person.spouses[0]] || [];
        const children = [];
        childIds.forEach(cid => children.push(...buildNodes(cid, new Set(visited))));
        if (spouse) visited.add(spouse.id);

        return [{
          type: 'couple',
          people: [person, spouse].filter(Boolean),
          children: children
        }];
      }

      return [{
        type: 'multi',
        people: [person, ...person.spouses.map(sid => byId[sid]).filter(Boolean)],
        anchor: person,
        spouses: person.spouses.map(spouseId => {
          const spouse = byId[spouseId];
          const childIds = person.childrenBySpouse[spouseId] || [];
          const children = [];
          childIds.forEach(cid => children.push(...buildNodes(cid, new Set(visited))));
          if (spouse) visited.add(spouse.id);
          return { spouse, children };
        }).filter(s => s.spouse)
      }];
    }

    let roots = rootIds;
    if (!roots || roots.length === 0) {
      roots = [];
      const includedSpouses = new Set();
      Object.values(byId)
        .filter(p => (!p.father || !byId[p.father]) && (!p.mother || !byId[p.mother]))
        .forEach(p => {
          if (!includedSpouses.has(p.id)) {
            roots.push(p.id);
            p.spouses.forEach(sid => includedSpouses.add(sid));
          }
        });
    }

    const children = [];
    roots.forEach(rid => children.push(...buildNodes(rid)));

    if (children.length === 1) return children[0];

    return {
      type: 'root',
      people: [],
      children: children
    };
  }

  /* ===== Helper ===== */
  function getPhoto(person) {
    if (person.photo && person.photo.trim()) return person.photo;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=random&color=fff&size=64`;
  }

  function genderColor(gender) {
    return gender === 'ช' ? MALE_COLOR : FEMALE_COLOR;
  }

  function childrenWidth(children) {
    return children.reduce((sum, c, i) => sum + c.subtreeW + (i > 0 ? SIBLING_GAP : 0), 0);
  }

  /* ===== Layout ===== */
  function measure(node) {
    if (!node) return;
    if (!node.children) node.children = [];

    if (node.type === 'single') {
      node.subtreeW = CARD_W;
    }
    else if (node.type === 'couple') {
      node.children.forEach(c => measure(c));
      node.subtreeW = Math.max(CARD_W * 2 + COUPLE_GAP, childrenWidth(node.children));
    }
    else if (node.type === 'multi') {
      let totalW = CARD_W;
      node.spouses.forEach(s => {
        s.children.forEach(c => measure(c));
        s.columnW = Math.max(CARD_W, childrenWidth(s.children));
        totalW += COUPLE_GAP + s.columnW;
      });
      node.subtreeW = totalW;
    }
    else if (node.type === 'root') {
      node.children.forEach(c => measure(c));
      node.subtreeW = childrenWidth(node.children);
    }
  }

  function placeChildren(children, centerX, baseY) {
    const totalW = children.reduce((sum, c, i) => sum + c.subtreeW + (i > 0 ? SIBLING_GAP : 0), 0);
    let curX = centerX - totalW / 2;
    children.forEach((c, i) => {
      if (i > 0) curX += SIBLING_GAP;
      place(c, curX + c.subtreeW / 2, baseY);
      curX += c.subtreeW;
    });
  }

  function place(node, x, y) {
    if (!node) return;
    node.x = x;
    node.y = y;
    flatNodes.push(node);

    if (node.type === 'single') {
      if (node.children.length > 0) placeChildren(node.children, x, y + LEVEL_H);
    }
    else if (node.type === 'couple') {
      if (node.children.length > 0) placeChildren(node.children, x, y + LEVEL_H);
    }
    else if (node.type === 'multi') {
      node.anchorX = x - node.subtreeW / 2;

      let curX = node.anchorX + CARD_W + COUPLE_GAP;
      node.spouses.forEach(s => {
        s.x = curX + s.columnW / 2;
        s.cardX = s.x - CARD_W / 2;
        s.y = y;

        if (s.children.length > 0) {
          placeChildren(s.children, s.x, y + LEVEL_H);
        }

        curX += s.columnW + COUPLE_GAP;
      });
    }
    else if (node.type === 'root') {
      placeChildren(node.children, x, y + LEVEL_H);
    }
  }

  /* ===== Draw ===== */
  function drawTree(containerId, rawData, rootIds) {
    containerEl = document.getElementById(containerId);
    if (!containerEl) {
      console.error("Tree container not found:", containerId);
      return;
    }

    if (typeof d3 === 'undefined') {
      console.error("D3.js is not loaded");
      return;
    }

    if (!rawData || !rawData.length) {
      updateStatsText("ไม่พบข้อมูล");
      return;
    }

    try {
      familyData = buildFamilyTree(rawData, rootIds || []);
    } catch (err) {
      updateStatsText("สร้างผังไม่สำเร็จ");
      console.error(err);
      return;
    }

    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;

    svg = d3.select("#" + containerId).append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("id", "treeSvg")
      .style("cursor", "grab");

    g = svg.append("g");

    zoomHandler = d3.zoom()
      .scaleExtent([0.1, 2])
      .on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoomHandler);

    flatNodes = [];
    measure(familyData);
    place(familyData, 0, 40);

    drawLinks();
    drawMarriageLines();
    drawHearts();
    drawNodes();

    fitToScreen();
    updateStats();
  }

  function drawLinks() {
    g.selectAll(".link")
      .data(flatNodes.filter(d => d.type !== 'root'))
      .enter().append("path")
      .attr("class", "link")
      .attr("d", d => {
        let path = "";

        if (d.type === 'single') {
          path += childLine(d.x, d.y + CARD_H, d.children);
        }
        else if (d.type === 'couple') {
          const midX = marriageMidX(d);
          path += childLine(midX, d.y + CARD_H, d.children);
        }
        else if (d.type === 'multi') {
          d.spouses.forEach(s => {
            const midX = (d.anchorX + CARD_W + s.cardX) / 2;
            path += childLine(midX, d.y + CARD_H, s.children);
          });
        }

        return path;
      });
  }

  function drawMarriageLines() {
    g.selectAll(".marriage-line")
      .data(flatNodes.filter(d => d.type === 'couple' || d.type === 'multi'))
      .enter().append("path")
      .attr("class", "marriage-line")
      .attr("d", d => {
        let path = "";
        const y = d.y + CARD_H / 2;

        if (d.type === 'couple') {
          const leftX = d.x - (CARD_W + COUPLE_GAP) / 2 + CARD_W;
          const rightX = d.x + (CARD_W + COUPLE_GAP) / 2 - CARD_W;
          path += `M${leftX},${y} L${rightX},${y}`;
        }
        else if (d.type === 'multi') {
          d.spouses.forEach(s => {
            const anchorRight = d.anchorX + CARD_W;
            const spouseLeft = s.cardX;
            path += `M${anchorRight},${y} L${spouseLeft},${y}`;
          });
        }

        return path;
      });
  }

  function drawHearts() {
    g.selectAll(".heart")
      .data(flatNodes.filter(d => d.type === 'couple'))
      .enter().append("text")
      .attr("class", "heart")
      .attr("text-anchor", "middle")
      .attr("y", d => d.y + CARD_H / 2 + 4)
      .attr("x", d => marriageMidX(d))
      .text("❤");
  }

  function drawNodes() {
    const nodeSel = g.selectAll(".node-group")
      .data(flatNodes.filter(d => d.type !== 'root'))
      .enter().append("g")
      .attr("class", "node-group")
      .attr("id", d => "node-" + d.people.map(p => p.name).join("-"))
      .on("click", (e, d) => centerNode(d));

    nodeSel.each(function(d) {
      const el = d3.select(this);

      if (d.type === 'single') {
        drawPersonCard(el, d.x - CARD_W / 2, d.y, d.people[0]);
      }
      else if (d.type === 'couple') {
        const sorted = sortCouple(d.people);
        drawPersonCard(el, d.x - CARD_W - COUPLE_GAP / 2, d.y, sorted[0]);
        drawPersonCard(el, d.x + COUPLE_GAP / 2, d.y, sorted[1]);
      }
      else if (d.type === 'multi') {
        drawPersonCard(el, d.anchorX, d.y, d.anchor);
        d.spouses.forEach(s => {
          drawPersonCard(el, s.cardX, s.y, s.spouse);
        });
      }
    });
  }

  function drawPersonCard(el, x, y, person) {
    const card = el.append("g").attr("transform", `translate(${x},${y})`);

    card.append("rect")
      .attr("class", "person-bg")
      .attr("x", 0).attr("y", 0)
      .attr("width", CARD_W).attr("height", CARD_H)
      .attr("fill", genderColor(person.gender))
      .attr("rx", 999).attr("ry", 999);

    card.append("image")
      .attr("class", "person-photo")
      .attr("x", 7).attr("y", 7)
      .attr("width", PHOTO_SIZE).attr("height", PHOTO_SIZE)
      .attr("href", getPhoto(person))
      .attr("clip-path", "circle(50%)")
      .attr("preserveAspectRatio", "xMidYMid slice");

    card.append("text")
      .attr("class", "person-name")
      .attr("x", 7 + PHOTO_SIZE + 8)
      .attr("y", CARD_H / 2)
      .text(person.name || "");
  }

  /* ===== Geometry helpers ===== */
  function marriageMidX(node) {
    if (node.type === 'couple') return node.x;
    if (node.type === 'multi') return node.anchorX + CARD_W / 2;
    return node.x;
  }

  function childLine(fromX, fromY, children) {
    if (!children || children.length === 0) return "";
    const midY = fromY + (LEVEL_H - CARD_H) / 2;
    let path = `M${fromX},${fromY} L${fromX},${midY} `;

    children.forEach(c => {
      path += `M${fromX},${midY} L${c.x},${midY} L${c.x},${c.y} `;
    });

    return path;
  }

  function sortCouple(people) {
    return [...people].sort((a, b) => {
      if (a.gender === 'ญ' && b.gender === 'ช') return -1;
      if (a.gender === 'ช' && b.gender === 'ญ') return 1;
      return 0;
    });
  }

  /* ===== View control ===== */
  function fitToScreen() {
    if (!svg || !containerEl) return;

    const width = containerEl.clientWidth;
    let minX = 0, maxX = 0, maxY = 0;

    flatNodes.forEach(d => {
      if (d.type === 'multi') {
        minX = Math.min(minX, d.anchorX - 20);
        const last = d.spouses[d.spouses.length - 1];
        maxX = Math.max(maxX, last.cardX + CARD_W + 20);
      } else if (d.type === 'couple') {
        minX = Math.min(minX, d.x - CARD_W - COUPLE_GAP / 2 - 20);
        maxX = Math.max(maxX, d.x + CARD_W + COUPLE_GAP / 2 + 20);
      } else {
        minX = Math.min(minX, d.x - CARD_W / 2 - 20);
        maxX = Math.max(maxX, d.x + CARD_W / 2 + 20);
      }
      maxY = Math.max(maxY, d.y + CARD_H + 50);
    });

    const treeW = maxX - minX;
    const scale = Math.min(0.75, width / Math.max(treeW, width * 0.4));
    const tx = width / 2 - (minX + treeW / 2) * scale;
    const ty = 30;

    svg.call(zoomHandler.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function zoom(amount) {
    if (!svg) return;
    svg.transition().duration(250).call(zoomHandler.scaleBy, 1 + amount);
  }

  function resetZoom() {
    if (!containerEl) return;
    clear();
    drawTree(containerEl.id, window.familyRawData, ["1"]);
  }

  function centerNode(d) {
    if (!svg || !containerEl) return;

    let cx = d.x;
    if (d.type === 'multi') cx = d.anchorX + CARD_W / 2;

    const t = d3.zoomIdentity
      .translate(containerEl.clientWidth / 2 - cx * 1.1, containerEl.clientHeight / 2 - d.y * 1.1)
      .scale(1.1);

    svg.transition().duration(600).call(zoomHandler.transform, t);
  }

  function searchNode(query) {
    if (!flatNodes.length) return;

    d3.selectAll(".node-group").classed("dim highlight", false);

    const q = (query || "").trim().toLowerCase();
    if (!q) return;

    let found = null;
    d3.selectAll(".node-group").each(function(d) {
      const names = d.people.map(p => p.name).join(" ");
      const match = names.toLowerCase().includes(q);
      d3.select(this).classed("highlight", match).classed("dim", !match);
      if (match && !found) found = d;
    });

    if (found) centerNode(found);
  }

  function clear() {
    if (svg) {
      svg.remove();
      svg = null;
      g = null;
    }
    flatNodes = [];
    familyData = null;
  }

  /* ===== Stats ===== */
  function updateStats() {
    if (!familyData) return;

    const uniqueIds = new Set();
    let maxDepth = 0;

    function traverse(node, depth) {
      if (!node) return;
      node.people.forEach(p => uniqueIds.add(p.id));
      if (depth > maxDepth) maxDepth = depth;

      if (node.type === 'multi') {
        node.spouses.forEach(s => s.children.forEach(c => traverse(c, depth + 1)));
      } else if (node.children) {
        node.children.forEach(c => traverse(c, depth + 1));
      }
    }

    traverse(familyData, 0);
    updateStatsText(`${maxDepth + 1} รุ่น · ${uniqueIds.size} สมาชิก`);
  }

  function updateStatsText(text) {
    const el = document.getElementById('stats');
    if (el) el.textContent = text;
  }

  /* ===== Public API ===== */
  return {
    init: function(containerId, rawData, rootIds) {
      clear();
      drawTree(containerId, rawData, rootIds);
    },
    zoom: zoom,
    resetZoom: resetZoom,
    search: searchNode
  };
})();
