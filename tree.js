/* =========================================================
   tree.js
   ระบบแสดงผังครอบครัว
   - D3.js
   - เส้นคู่สมรสหลายคนแบบหักหลบ
   - เส้นพ่อแม่ -> ลูกไม่ตัดผ่านสมาชิก
   ========================================================= */
const TreeExtra = (function () {

  "use strict";

  let svg;
  let rootGroup;
  let linkGroup;
  let marriageGroup;
  let nodeGroup;

  let currentData = [];
  let currentRoots = [];

  let zoomBehavior;
  let currentScale = 1;

  let width = 1200;
  let height = 800;

  const NODE_W = 120;
  const NODE_H = 52;

  const X_GAP = 55;
  const Y_GAP = 150;

  const SPOUSE_LANE_GAP = 28;
  const CHILD_LANE_GAP = 45;

  const COLORS = {
    line: "#8d6e63",
    male: "#cfe2f3",
    female: "#f4cccc",
    text: "#222",
    heart: "#e53935"
  };


  /* =========================================================
     Utility
     ========================================================= */

  function byId(id) {
    return currentData.find(d => String(d.id) === String(id));
  }

  function cleanId(id) {
    if (id === null || id === undefined || id === "") {
      return null;
    }

    return String(id);
  }

  function getSpouses(person) {
    if (!person || !Array.isArray(person.spouse)) {
      return [];
    }

    return person.spouse
      .map(cleanId)
      .filter(Boolean)
      .map(id => byId(id))
      .filter(Boolean);
  }

  function getChildren(personId) {
    return currentData.filter(p => {
      return (
        cleanId(p.father) === cleanId(personId) ||
        cleanId(p.mother) === cleanId(personId)
      );
    });
  }

  function isMale(person) {
    return person && person.gender === "ช";
  }

  function nodeFill(person) {
    return isMale(person)
      ? COLORS.male
      : COLORS.female;
  }


  /* =========================================================
     Generation
     ========================================================= */

  function calculateGeneration(data) {

    const map = new Map();

    data.forEach(person => {
      map.set(String(person.id), person);
    });

    const memo = new Map();
    const visiting = new Set();

    function depth(id) {

      id = String(id);

      if (memo.has(id)) {
        return memo.get(id);
      }

      if (visiting.has(id)) {
        return 0;
      }

      visiting.add(id);

      const p = map.get(id);

      if (!p) {
        visiting.delete(id);
        return 0;
      }

      const parents = [];

      if (p.father && map.has(String(p.father))) {
        parents.push(String(p.father));
      }

      if (p.mother && map.has(String(p.mother))) {
        parents.push(String(p.mother));
      }

      let result = 0;

      if (parents.length) {
        result =
          Math.max(...parents.map(depth)) + 1;
      }

      visiting.delete(id);

      memo.set(id, result);

      return result;
    }

    data.forEach(p => {
      p.__generation = depth(p.id);
    });

    return data;
  }


  /* =========================================================
     Build family units
     ========================================================= */

  function buildFamilyUnits(data) {

    const units = [];
    const usedChildren = new Set();

    data.forEach(person => {

      const children = getChildren(person.id);

      if (!children.length) {
        return;
      }

      const spouses = getSpouses(person);

      let partner = null;

      for (const spouse of spouses) {

        const partnerChildren =
          getChildren(spouse.id);

        const sameChildren =
          partnerChildren.filter(c =>
            children.some(x =>
              String(x.id) === String(c.id)
            )
          );

        if (sameChildren.length) {
          partner = spouse;
          break;
        }
      }

      const parentIds = [String(person.id)];

      if (partner) {
        parentIds.push(String(partner.id));
      }

      const childIds = children.map(c =>
        String(c.id)
      );

      const key =
        parentIds.slice().sort().join("-") +
        "|" +
        childIds.slice().sort().join("-");

      if (
        units.some(u => u.key === key)
      ) {
        return;
      }

      childIds.forEach(id =>
        usedChildren.add(id)
      );

      units.push({
        key,
        parents: parentIds,
        children: childIds,
        generation: person.__generation
      });

    });

    return units;
  }


  /* =========================================================
     Position nodes
     ========================================================= */

  function calculatePositions(data) {

    const generations = {};

    data.forEach(person => {

      const g = person.__generation || 0;

      if (!generations[g]) {
        generations[g] = [];
      }

      generations[g].push(person);

    });

    const positions = new Map();

    const maxGeneration =
      Math.max(
        ...Object.keys(generations)
          .map(Number)
      );

    /*
      วางสมาชิกแต่ละรุ่นในแนวนอน
    */

    for (
      let g = 0;
      g <= maxGeneration;
      g++
    ) {

      const members =
        generations[g] || [];

      members.forEach((person, index) => {

        positions.set(
          String(person.id),
          {
            x:
              100 +
              index *
              (NODE_W + X_GAP),

            y:
              100 +
              g *
              Y_GAP
          }
        );

      });

    }

    /*
      จัดกลุ่มลูกของคู่เดียวกัน
      ให้อยู่ใกล้กัน
    */

    const units =
      buildFamilyUnits(data);

    units.forEach(unit => {

      const parents =
        unit.parents
          .map(id => positions.get(id))
          .filter(Boolean);

      if (!parents.length) {
        return;
      }

      const center =
        parents.reduce(
          (sum, p) => sum + p.x,
          0
        ) / parents.length;

      const children =
        unit.children
          .map(id => ({
            id,
            pos: positions.get(id)
          }))
          .filter(x => x.pos);

      if (!children.length) {
        return;
      }

      const childWidth =
        (children.length - 1) *
        (NODE_W + X_GAP);

      const start =
        center - childWidth / 2;

      children.forEach((child, index) => {

        child.pos.x =
          start +
          index *
          (NODE_W + X_GAP);

      });

    });

    return positions;
  }


  /* =========================================================
     Collision adjustment
     ========================================================= */

  function preventNodeCollision(
    data,
    positions
  ) {

    const generations = {};

    data.forEach(person => {

      const g =
        person.__generation || 0;

      if (!generations[g]) {
        generations[g] = [];
      }

      generations[g].push(person);

    });

    Object.keys(generations)
      .forEach(g => {

        const members =
          generations[g]
            .sort((a, b) =>
              positions.get(String(a.id)).x -
              positions.get(String(b.id)).x
            );

        for (
          let i = 1;
          i < members.length;
          i++
        ) {

          const prev =
            positions.get(
              String(members[i - 1].id)
            );

          const curr =
            positions.get(
              String(members[i].id)
            );

          const minX =
            prev.x +
            NODE_W +
            X_GAP;

          if (curr.x < minX) {
            curr.x = minX;
          }

        }

      });
  }


  /* =========================================================
     Node rectangle edge
     ========================================================= */

  function nodeLeft(pos) {
    return pos.x - NODE_W / 2;
  }

  function nodeRight(pos) {
    return pos.x + NODE_W / 2;
  }

  function nodeTop(pos) {
    return pos.y - NODE_H / 2;
  }

  function nodeBottom(pos) {
    return pos.y + NODE_H / 2;
  }


  /* =========================================================
     Marriage routing
     
     สำคัญ:
     แต่ละคู่จะมี "เส้นของตัวเอง"
     ไม่ใช้เส้นเดียวร่วมกัน
     ========================================================= */

  function createMarriagePath(
    person,
    spouse,
    positions,
    spouseIndex
  ) {

    const a =
      positions.get(String(person.id));

    const b =
      positions.get(String(spouse.id));

    if (!a || !b) {
      return null;
    }

    /*
      ถ้าอยู่ติดกันจริง
      ใช้เส้นตรงได้
    */

    const distance =
      Math.abs(a.x - b.x);

    if (
      distance <=
      NODE_W + X_GAP + 10
    ) {

      return {
        path:
          `M ${nodeRight(a)} ${a.y}
           L ${nodeLeft(b)} ${b.y}`,

        centerX:
          (a.x + b.x) / 2,

        centerY:
          (a.y + b.y) / 2
      };
    }

    /*
      ถ้าไม่ติดกัน
      ให้หักหลบด้านบน

      คู่แต่ละคนมี lane ของตัวเอง
    */

    const left =
      a.x < b.x ? a : b;

    const right =
      a.x < b.x ? b : a;

    /*
      lane จะอยู่เหนือ node
      และแยกออกจากกัน
    */

    const laneY =
      Math.min(
        nodeTop(a),
        nodeTop(b)
      ) -
      35 -
      spouseIndex *
      SPOUSE_LANE_GAP;

    const startX =
      a.x < b.x
        ? nodeRight(a)
        : nodeLeft(a);

    const endX =
      b.x > a.x
        ? nodeLeft(b)
        : nodeRight(b);

    const path = `
      M ${startX} ${a.y}
      L ${startX} ${laneY}
      L ${endX} ${laneY}
      L ${endX} ${b.y}
    `;

    return {
      path,
      centerX:
        (a.x + b.x) / 2,
      centerY:
        laneY
    };
  }


  /* =========================================================
     Parent -> Child routing
     ========================================================= */

  function createParentChildPath(
    parentIds,
    child,
    positions
  ) {

    const parents =
      parentIds
        .map(id =>
          positions.get(String(id))
        )
        .filter(Boolean);

    const childPos =
      positions.get(String(child.id));

    if (
      !parents.length ||
      !childPos
    ) {
      return null;
    }

    /*
      จุดกลางของพ่อแม่
    */

    const centerX =
      parents.reduce(
        (sum, p) => sum + p.x,
        0
      ) / parents.length;

    const parentBottom =
      Math.max(
        ...parents.map(nodeBottom)
      );

    const childTop =
      nodeTop(childPos);

    /*
      connector อยู่กึ่งกลางระหว่างรุ่น
    */

    const laneY =
      parentBottom +
      (childTop - parentBottom) *
      0.45;

    /*
      เส้น:
      พ่อแม่ -> จุดกลาง
      จุดกลาง -> เหนือลูก
      เหนือลูก -> ลูก
    */

    const path = `
      M ${centerX} ${parentBottom}
      L ${centerX} ${laneY}
      L ${childPos.x} ${laneY}
      L ${childPos.x} ${childTop}
    `;

    return {
      path,
      centerX,
      centerY: laneY
    };
  }


  /* =========================================================
     Find parent couple
     ========================================================= */

  function findParentCouple(person) {

    if (
      !person.father &&
      !person.mother
    ) {
      return null;
    }

    const parents = [];

    if (person.father) {
      parents.push(
        String(person.father)
      );
    }

    if (person.mother) {
      parents.push(
        String(person.mother)
      );
    }

    if (!parents.length) {
      return null;
    }

    return parents;
  }


  /* =========================================================
     Draw marriage lines
     ========================================================= */

  function drawMarriageLines(
    data,
    positions
  ) {

    marriageGroup.selectAll("*").remove();

    const drawn = new Set();

    data.forEach(person => {

      const spouses =
        getSpouses(person);

      spouses.forEach(
        (spouse, index) => {

          const key = [
            String(person.id),
            String(spouse.id)
          ]
            .sort()
            .join("-");

          /*
            ป้องกันวาดเส้นซ้ำ
          */

          if (drawn.has(key)) {
            return;
          }

          drawn.add(key);

          const result =
            createMarriagePath(
              person,
              spouse,
              positions,
              index
            );

          if (!result) {
            return;
          }

          const path =
            marriageGroup
              .append("path")
              .attr("class", "marriage-line")
              .attr("d", result.path)
              .attr("data-a", person.id)
              .attr("data-b", spouse.id);

          /*
            หัวใจตรงกลางเส้น
          */

          marriageGroup
            .append("text")
            .attr("class", "heart")
            .attr(
              "x",
              result.centerX
            )
            .attr(
              "y",
              result.centerY - 5
            )
            .attr(
              "text-anchor",
              "middle"
            )
            .text("♥");

        }
      );

    });
  }


  /* =========================================================
     Draw parent -> child
     ========================================================= */

  function drawParentChildLines(
    data,
    positions
  ) {

    linkGroup.selectAll("*").remove();

    data.forEach(child => {

      const parents =
        findParentCouple(child);

      if (!parents) {
        return;
      }

      const result =
        createParentChildPath(
          parents,
          child,
          positions
        );

      if (!result) {
        return;
      }

      linkGroup
        .append("path")
        .attr("class", "link")
        .attr("d", result.path)
        .attr(
          "data-child",
          child.id
        )
        .attr(
          "data-father",
          child.father || ""
        )
        .attr(
          "data-mother",
          child.mother || ""
        );

    });
  }


  /* =========================================================
     Draw nodes
     ========================================================= */

  function drawNodes(
    data,
    positions
  ) {

    nodeGroup.selectAll("*").remove();

    const groups =
      nodeGroup
        .selectAll(".node-group")
        .data(
          data,
          d => String(d.id)
        )
        .enter()
        .append("g")
        .attr("class", "node-group")
        .attr(
          "transform",
          d => {

            const p =
              positions.get(
                String(d.id)
              );

            return `
              translate(
                ${p.x - NODE_W / 2},
                ${p.y - NODE_H / 2}
              )
            `;
          }
        );

    groups
      .append("rect")
      .attr("class", "person-bg")
      .attr("width", NODE_W)
      .attr("height", NODE_H)
      .attr("rx", NODE_H / 2)
      .attr("fill", d =>
        nodeFill(d)
      );

    /*
      จุดสีเล็ก ๆ แสดงเพศ
    */

    groups
      .append("circle")
      .attr("cx", 25)
      .attr("cy", NODE_H / 2)
      .attr("r", 13)
      .attr(
        "fill",
        d =>
          isMale(d)
            ? "#2e7d9a"
            : "#ef6c00"
      );

    groups
      .append("text")
      .attr("class", "person-name")
      .attr("x", 47)
      .attr(
        "y",
        NODE_H / 2
      )
      .text(d => d.name || "");

    /*
      รูปภาพ
      ถ้ามี photo
    */

    groups
      .filter(d =>
        d.photo &&
        String(d.photo).trim() !== ""
      )
      .append("image")
      .attr("x", 5)
      .attr("y", 5)
      .attr("width", 40)
      .attr("height", 40)
      .attr("preserveAspectRatio", "xMidYMid slice")
      .attr(
        "href",
        d => d.photo
      )
      .attr("clip-path", "circle(20px at 20px 20px)");

    /*
      คลิกสมาชิก
    */

    groups.on("click", function (event, d) {

      event.stopPropagation();

      highlightPerson(
        String(d.id)
      );

    });

  }


  /* =========================================================
     Highlight
     ========================================================= */

  function highlightPerson(id) {

    nodeGroup
      .selectAll(".node-group")
      .classed(
        "highlight",
        d =>
          String(d.id) === String(id)
      );

    /*
      ทำให้เส้นที่เกี่ยวข้องชัด
    */

    linkGroup
      .selectAll(".link")
      .classed(
        "dim",
        function () {

          const child =
            this.getAttribute(
              "data-child"
            );

          const father =
            this.getAttribute(
              "data-father"
            );

          const mother =
            this.getAttribute(
              "data-mother"
            );

          return ![
            child,
            father,
            mother
          ].includes(String(id));

        }
      );

    marriageGroup
      .selectAll(".marriage-line")
      .classed(
        "dim",
        function () {

          const a =
            this.getAttribute("data-a");

          const b =
            this.getAttribute("data-b");

          return (
            String(a) !== String(id) &&
            String(b) !== String(id)
          );

        }
      );
  }


  /* =========================================================
     Reset highlight
     ========================================================= */

  function clearHighlight() {

    nodeGroup
      .selectAll(".node-group")
      .classed(
        "highlight",
        false
      );

    linkGroup
      .selectAll(".link")
      .classed(
        "dim",
        false
      );

    marriageGroup
      .selectAll(".marriage-line")
      .classed(
        "dim",
        false
      );
  }


  /* =========================================================
     Zoom
     ========================================================= */

  function setupZoom() {

    zoomBehavior =
      d3.zoom()
        .scaleExtent([0.2, 3])
        .on(
          "zoom",
          event => {

            currentScale =
              event.transform.k;

            rootGroup.attr(
              "transform",
              event.transform
            );

          }
        );

    svg.call(
      zoomBehavior
    );

  }


  function zoom(delta) {

    if (!svg || !zoomBehavior) {
      return;
    }

    svg.transition()
      .duration(250)
      .call(
        zoomBehavior.scaleBy,
        1 + delta
      );
  }


  function resetZoom() {

    if (!svg || !zoomBehavior) {
      return;
    }

    svg.transition()
      .duration(300)
      .call(
        zoomBehavior.transform,
        d3.zoomIdentity
      );

  }


  /* =========================================================
     Center tree
     ========================================================= */

  function centerTree(
    positions
  ) {

    const all =
      Array.from(
        positions.values()
      );

    if (!all.length) {
      return;
    }

    const minX =
      Math.min(
        ...all.map(p =>
          p.x - NODE_W / 2
        )
      );

    const maxX =
      Math.max(
        ...all.map(p =>
          p.x + NODE_W / 2
        )
      );

    const minY =
      Math.min(
        ...all.map(p =>
          p.y - NODE_H / 2
        )
      );

    const maxY =
      Math.max(
        ...all.map(p =>
          p.y + NODE_H / 2
        )
      );

    const treeWidth =
      maxX - minX;

    const treeHeight =
      maxY - minY;

    const scaleX =
      (width - 100) /
      Math.max(treeWidth, 1);

    const scaleY =
      (height - 100) /
      Math.max(treeHeight, 1);

    const scale =
      Math.min(
        1,
        scaleX,
        scaleY
      );

    const tx =
      (width - treeWidth * scale) / 2 -
      minX * scale;

    const ty =
      (height - treeHeight * scale) / 2 -
      minY * scale;

    svg.call(
      zoomBehavior.transform,
      d3.zoomIdentity
        .translate(tx, ty)
        .scale(scale)
    );

  }


  /* =========================================================
     Render
     ========================================================= */

  function render() {

    if (!svg) {
      return;
    }

    /*
      คำนวณรุ่น
    */

    currentData =
      calculateGeneration(
        currentData
      );

    /*
      ตำแหน่ง
    */

    const positions =
      calculatePositions(
        currentData
      );

    preventNodeCollision(
      currentData,
      positions
    );

    /*
      เส้นลูกก่อน
    */

    drawParentChildLines(
      currentData,
      positions
    );

    /*
      เส้นคู่สมรส
    */

    drawMarriageLines(
      currentData,
      positions
    );

    /*
      ตัวบุคคลอยู่บนสุด
      ดังนั้นเส้นจะไม่บังตัวบุคคล
    */

    drawNodes(
      currentData,
      positions
    );

    /*
      จัดขนาด SVG
    */

    const all =
      Array.from(
        positions.values()
      );

    if (all.length) {

      const maxX =
        Math.max(
          ...all.map(p =>
            p.x + NODE_W
          )
        );

      const maxY =
        Math.max(
          ...all.map(p =>
            p.y + NODE_H
          )
        );

      rootGroup
        .attr(
          "width",
          maxX + 200
        )
        .attr(
          "height",
          maxY + 200
        );

    }

    /*
      ข้อมูลสถิติ
    */

    const stats =
      document.getElementById(
        "stats"
      );

    if (stats) {

      const generations =
        new Set(
          currentData.map(
            d => d.__generation
          )
        );

      stats.textContent =
        `${generations.size} รุ่น · ${currentData.length} สมาชิก`;

    }

    /*
      จัดต้นไม้ให้อยู่กลาง
    */

    setTimeout(
      () => centerTree(positions),
      50
    );

  }
  /* =========================================================
     Init
     ========================================================= */

  function init(
    containerId,
    data,
    roots
  ) {

    const container =
      document.getElementById(
        containerId
      );

    if (!container) {
      throw new Error(
        "ไม่พบ container: " +
        containerId
      );
    }

    if (
      typeof d3 === "undefined"
    ) {
      throw new Error(
        "ไม่พบ D3.js"
      );
    }

    if (
      !Array.isArray(data)
    ) {
      throw new Error(
        "familyRawData ต้องเป็น Array"
      );
    }

    currentData =
      data.map(d => ({
        ...d,
        spouse:
          Array.isArray(d.spouse)
            ? [...d.spouse]
            : []
      }));

    currentRoots =
      roots || [];

    /*
      ล้างของเก่า
    */

    container.innerHTML = "";

    width =
      Math.max(
        container.clientWidth,
        800
      );

    height =
      Math.max(
        container.clientHeight,
        600
      );

    /*
      SVG
    */

    svg =
      d3.select(container)
        .append("svg")
        .attr(
          "id",
          "treeSvg"
        )
        .attr(
          "width",
          "100%"
        )
        .attr(
          "height",
          "100%"
        )
        .attr(
          "viewBox",
          `0 0 ${width} ${height}`
        );

    /*
      กลุ่มหลัก
    */

    rootGroup =
      svg
        .append("g")
        .attr(
          "class",
          "tree-root"
        );

    /*
      เส้นลูก
    */

    linkGroup =
      rootGroup
        .append("g")
        .attr(
          "class",
          "parent-links"
        );

    /*
      เส้นคู่สมรส
    */

    marriageGroup =
      rootGroup
        .append("g")
        .attr(
          "class",
          "marriages"
        );

    /*
      node
    */

    nodeGroup =
      rootGroup
        .append("g")
        .attr(
          "class",
          "nodes"
        );

    /*
      คลิกพื้นที่ว่าง
      = ยกเลิก highlight
    */

    svg.on(
      "click",
      function () {
        clearHighlight();
      }
    );

    setupZoom();

    render();

  }


  /* =========================================================
     Search
     ========================================================= */

  function search(query) {

    query =
      String(query || "")
        .trim()
        .toLowerCase();

    if (!query) {

      clearHighlight();

      return;

    }

    const found =
      currentData.find(
        person =>
          String(
            person.name || ""
          )
            .toLowerCase()
            .includes(query)
      );

    if (!found) {
      return;
    }

    highlightPerson(
      String(found.id)
    );

  }


  /* =========================================================
     PNG Export
     ========================================================= */

  async function exportImage(
    type
  ) {

    if (
      typeof html2canvas ===
      "undefined"
    ) {

      alert(
        "ไม่พบ html2canvas"
      );

      return;

    }

    const container =
      document.getElementById(
        "treeContainer"
      );

    if (!container) {
      return;
    }

    try {

      const canvas =
        await html2canvas(
          container,
          {
            backgroundColor:
              "#f6f3ed",
            scale: 2,
            useCORS: true
          }
        );

      const link =
        document.createElement(
          "a"
        );

      link.download =
        "family-tree.png";

      link.href =
        canvas.toDataURL(
          "image/png"
        );

      link.click();

    } catch (err) {

      console.error(err);

      alert(
        "ไม่สามารถบันทึก PNG ได้: " +
        err.message
      );

    }

  }


  /* =========================================================
     Resize
     ========================================================= */

  window.addEventListener(
    "resize",
    function () {

      if (!svg) {
        return;
      }

      const container =
        document.getElementById(
          "treeContainer"
        );

      if (!container) {
        return;
      }

      width =
        Math.max(
          container.clientWidth,
          800
        );

      height =
        Math.max(
          container.clientHeight,
          600
        );

      svg.attr(
        "viewBox",
        `0 0 ${width} ${height}`
      );

      render();

    }
  );


  /* =========================================================
     TreeExtra API
     
     จุดสำคัญ:
     HTML ของคุณเรียก TreeExtra.init()
     ดังนั้นต้องประกาศ TreeExtra ตรงนี้
     ========================================================= */

  window.TreeExtra = {

    init,

    search,

    zoom,

    resetZoom,

    exportImage,

    clearHighlight

  };


})();
