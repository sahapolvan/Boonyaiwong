// tree.js - ผังครอบครัว
// Version: Multi-spouse orthogonal routing
// เส้นคู่สมรสหลายคนจะแยกกันและหักขึ้นด้านบน

const TreeApp = (function () {

  /* =========================================================
     ค่าคงที่
  ========================================================= */

  const CARD_W = 110;
  const CARD_H = 46;
  const PHOTO_SIZE = 32;

  const COUPLE_GAP = 22;
  const LEVEL_H = 130;
  const SIBLING_GAP = 34;

  // ระยะที่เส้นคู่สมรสแต่ละเส้นจะหักขึ้น
  const MARRIAGE_ROUTE_GAP = 22;

  const MALE_COLOR = "#cfe2f3";
  const FEMALE_COLOR = "#f4cccc";

  const LINE_COLOR = "#8d6e63";


  /* =========================================================
     State
  ========================================================= */

  let svg = null;
  let g = null;
  let zoomHandler = null;

  let flatNodes = [];
  let familyData = null;
  let containerEl = null;


  /* =========================================================
     Normalize Data
  ========================================================= */

  function normalizeFamilyData(rawData) {

    const byId = {};

    rawData.forEach(p => {

      let spouses = [];

      if (p.spouse) {

        if (Array.isArray(p.spouse)) {
          spouses = [...p.spouse];
        }

        else if (typeof p.spouse === "string") {
          spouses = p.spouse
            .split("|")
            .map(s => s.trim())
            .filter(Boolean);
        }
      }

      byId[p.id] = {
        ...p,

        spouse: spouses,

        spouses: [],

        childrenBySpouse: {},

        // รองรับอนาคต
        // marriageStatus สามารถเป็น:
        // "current"
        // "divorced"
        // "deceased"
        marriageStatus: p.marriageStatus || {},

      };
    });


    /* เชื่อม spouse */

    Object.values(byId).forEach(person => {

      person.spouse.forEach(spouseId => {

        if (
          byId[spouseId] &&
          !person.spouses.includes(spouseId)
        ) {
          person.spouses.push(spouseId);
        }

      });

    });


    /* เชื่อมพ่อแม่กับลูก */

    Object.values(byId).forEach(child => {

      if (
        child.father &&
        byId[child.father] &&
        child.mother &&
        byId[child.mother]
      ) {

        const father = byId[child.father];
        const mother = byId[child.mother];


        if (father.spouses.includes(child.mother)) {

          if (!father.childrenBySpouse[child.mother]) {
            father.childrenBySpouse[child.mother] = [];
          }

          father.childrenBySpouse[child.mother].push(child.id);
        }


        if (mother.spouses.includes(child.father)) {

          if (!mother.childrenBySpouse[child.father]) {
            mother.childrenBySpouse[child.father] = [];
          }

          mother.childrenBySpouse[child.father].push(child.id);
        }

      }

    });


    return byId;
  }


  /* =========================================================
     Build Family Tree
  ========================================================= */

  function buildFamilyTree(rawData, rootIds) {

    const byId = normalizeFamilyData(rawData);


    function buildNodes(personId, visited = new Set()) {

      if (visited.has(personId)) {
        return [];
      }

      visited.add(personId);

      const person = byId[personId];

      if (!person) {
        return [];
      }


      /* ไม่มีคู่ */

      if (
        !person.spouses ||
        person.spouses.length === 0
      ) {

        return [{
          type: "single",
          people: [person],
          children: []
        }];

      }


      /* มีคู่เดียว */

      if (person.spouses.length === 1) {

        const spouse = byId[person.spouses[0]];

        const childIds =
          person.childrenBySpouse[person.spouses[0]] || [];

        const children = [];


        childIds.forEach(cid => {

          children.push(
            ...buildNodes(cid, new Set(visited))
          );

        });


        if (spouse) {
          visited.add(spouse.id);
        }


        return [{
          type: "couple",

          people: [
            person,
            spouse
          ].filter(Boolean),

          children: children,

          marriageStatus:
            getMarriageStatus(person, spouse)
        }];
      }


      /* =====================================================
         มีหลายคู่
      ===================================================== */

      const spouseData = [];


      person.spouses.forEach(spouseId => {

        const spouse = byId[spouseId];

        if (!spouse) return;


        const childIds =
          person.childrenBySpouse[spouseId] || [];

        const children = [];


        childIds.forEach(cid => {

          children.push(
            ...buildNodes(cid, new Set(visited))
          );

        });


        spouseData.push({

          spouse: spouse,

          children: children,

          marriageStatus:
            getMarriageStatus(person, spouse)

        });


        visited.add(spouse.id);

      });


      return [{

        type: "multi",

        people: [
          person,
          ...spouseData.map(s => s.spouse)
        ],

        anchor: person,

        spouses: spouseData

      }];
    }


    /* =====================================================
       Roots
    ===================================================== */

    let roots = rootIds;


    if (!roots || roots.length === 0) {

      roots = [];

      const includedSpouses = new Set();


      Object.values(byId)

        .filter(p =>
          (!p.father || !byId[p.father]) &&
          (!p.mother || !byId[p.mother])
        )

        .forEach(p => {

          if (!includedSpouses.has(p.id)) {

            roots.push(p.id);

            p.spouses.forEach(
              sid => includedSpouses.add(sid)
            );

          }

        });
    }


    const children = [];


    roots.forEach(rid => {

      children.push(
        ...buildNodes(rid)
      );

    });


    if (children.length === 1) {
      return children[0];
    }


    return {

      type: "root",

      people: [],

      children: children

    };
  }


  /* =========================================================
     Marriage Status
  ========================================================= */

  function getMarriageStatus(person, spouse) {

    if (!person || !spouse) {
      return "current";
    }


    /*
      รองรับข้อมูลในอนาคต เช่น

      marriageStatus: {
        "20": "divorced",
        "25": "current"
      }
    */


    if (
      person.marriageStatus &&
      person.marriageStatus[spouse.id]
    ) {

      return person.marriageStatus[spouse.id];

    }


    if (
      spouse.marriageStatus &&
      spouse.marriageStatus[person.id]
    ) {

      return spouse.marriageStatus[person.id];

    }


    return "current";
  }


  /* =========================================================
     Helper
  ========================================================= */

  function getPhoto(person) {

    if (
      person.photo &&
      person.photo.trim()
    ) {
      return person.photo;
    }


    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      person.name
    )}&background=random&color=fff&size=64`;
  }


  function genderColor(gender) {

    return gender === "ช"
      ? MALE_COLOR
      : FEMALE_COLOR;
  }


  function childrenWidth(children) {

    return children.reduce(
      (sum, c, i) =>
        sum +
        c.subtreeW +
        (i > 0 ? SIBLING_GAP : 0),

      0
    );
  }


  /* =========================================================
     Layout
  ========================================================= */

  function measure(node) {

    if (!node) return;


    if (!node.children) {
      node.children = [];
    }


    /* Single */

    if (node.type === "single") {

      node.subtreeW = CARD_W;

    }


    /* Couple */

    else if (node.type === "couple") {

      node.children.forEach(c => measure(c));


      node.subtreeW = Math.max(

        CARD_W * 2 + COUPLE_GAP,

        childrenWidth(node.children)

      );

    }


    /* Multi */

    else if (node.type === "multi") {

      let totalW = CARD_W;


      node.spouses.forEach(s => {

        s.children.forEach(c => measure(c));


        s.columnW = Math.max(

          CARD_W,

          childrenWidth(s.children)

        );


        totalW +=
          COUPLE_GAP +
          s.columnW;

      });


      node.subtreeW = totalW;

    }


    /* Root */

    else if (node.type === "root") {

      node.children.forEach(c => measure(c));

      node.subtreeW =
        childrenWidth(node.children);

    }
  }


  function placeChildren(
    children,
    centerX,
    baseY
  ) {

    const totalW =
      children.reduce(

        (sum, c, i) =>
          sum +
          c.subtreeW +
          (i > 0 ? SIBLING_GAP : 0),

        0
      );


    let curX =
      centerX -
      totalW / 2;


    children.forEach((c, i) => {

      if (i > 0) {
        curX += SIBLING_GAP;
      }


      place(
        c,

        curX +
        c.subtreeW / 2,

        baseY
      );


      curX += c.subtreeW;

    });
  }


  function place(node, x, y) {

    if (!node) return;


    node.x = x;
    node.y = y;


    flatNodes.push(node);


    /* Single */

    if (node.type === "single") {

      if (node.children.length > 0) {

        placeChildren(
          node.children,
          x,
          y + LEVEL_H
        );

      }

    }


    /* Couple */

    else if (node.type === "couple") {

      if (node.children.length > 0) {

        placeChildren(
          node.children,
          x,
          y + LEVEL_H
        );

      }

    }


    /* =====================================================
       Multi spouse
    ===================================================== */

    else if (node.type === "multi") {

      node.anchorX =
        x -
        node.subtreeW / 2;


      let curX =
        node.anchorX +
        CARD_W +
        COUPLE_GAP;


      node.spouses.forEach((s, index) => {

        s.x =
          curX +
          s.columnW / 2;


        s.cardX =
          s.x -
          CARD_W / 2;


        s.y = y;


        /*
          เก็บ index เอาไว้สำหรับคำนวณ
          ระดับที่เส้นจะหักขึ้น
        */

        s.marriageIndex = index;


        if (s.children.length > 0) {

          placeChildren(
            s.children,
            s.x,
            y + LEVEL_H
          );

        }


        curX +=
          s.columnW +
          COUPLE_GAP;

      });

    }


    /* Root */

    else if (node.type === "root") {

      placeChildren(
        node.children,
        x,
        y + LEVEL_H
      );

    }
  }


  /* =========================================================
     Draw Tree
  ========================================================= */

  function drawTree(
    containerId,
    rawData,
    rootIds
  ) {

    containerEl =
      document.getElementById(containerId);


    if (!containerEl) {

      console.error(
        "Tree container not found:",
        containerId
      );

      return;
    }


    if (typeof d3 === "undefined") {

      console.error(
        "D3.js is not loaded"
      );

      return;
    }


    if (
      !rawData ||
      !rawData.length
    ) {

      updateStatsText(
        "ไม่พบข้อมูล"
      );

      return;
    }


    try {

      familyData =
        buildFamilyTree(
          rawData,
          rootIds || []
        );

    }

    catch (err) {

      updateStatsText(
        "สร้างผังไม่สำเร็จ"
      );

      console.error(err);

      return;
    }


    const rect =
      containerEl.getBoundingClientRect();


    let width = rect.width;
    let height = rect.height;


    if (height < 50) {

      height =
        window.innerHeight - 200;

    }


    if (width < 50) {

      width =
        window.innerWidth;

    }


    /* SVG */

    svg =
      d3.select("#" + containerId)

        .append("svg")

        .attr("width", width)

        .attr("height", height)

        .attr("id", "treeSvg")

        .style(
          "cursor",
          "grab"
        );


    g =
      svg.append("g");


    /* Zoom */

    zoomHandler =
      d3.zoom()

        .scaleExtent([
          0.1,
          2
        ])

        .on(
          "zoom",
          e =>
            g.attr(
              "transform",
              e.transform
            )
        );


    svg.call(
      zoomHandler
    );


    flatNodes = [];


    measure(
      familyData
    );


    place(
      familyData,
      0,
      40
    );


    /*
      สำคัญ:
      เส้นถูกวาดก่อน node
      เพื่อให้ node อยู่ด้านบน
    */

    drawLinks();

    drawMarriageLines();

    drawHearts();

    drawNodes();


    fitToScreen();

    updateStats();
  }


  /* =========================================================
     Parent → Child Links
  ========================================================= */

  function drawLinks() {

    g.selectAll(".link")

      .data(
        flatNodes.filter(
          d => d.type !== "root"
        )
      )

      .enter()

      .append("path")

      .attr(
        "class",
        "link"
      )

      .attr(
        "d",
        d => {

          let path = "";

          const fromY =
            d.y +
            CARD_H / 2;


          if (d.type === "single") {

            path += childLine(
              d.x,
              fromY,
              d.children
            );

          }


          else if (
            d.type === "couple"
          ) {

            const midX =
              marriageMidX(d);


            path += childLine(
              midX,
              fromY,
              d.children
            );

          }


          else if (
            d.type === "multi"
          ) {

            /*
              ลูกของแต่ละคู่
              ยังคงใช้จุดกลางของคู่
            */

            d.spouses.forEach(
              s => {

                const midX =
                  marriageConnectionX(
                    d,
                    s
                  );


                path += childLine(
                  midX,
                  fromY,
                  s.children
                );

              }
            );

          }


          return path;
        }
      );
  }


  /* =========================================================
     Marriage Lines
     
     ⭐ จุดที่แก้หลัก
     
     แต่ละคู่จะมี PATH ของตัวเอง
     
     รูปแบบ:
     
     [แก้ว] ───────┐
                   │
                   └──────── [น็อต]
     
     ไม่ใช้เส้นเดียวกัน
  ========================================================= */

  function drawMarriageLines() {

    const marriageData = [];


    flatNodes.forEach(node => {

      /* คู่เดียว */

      if (
        node.type === "couple"
      ) {

        if (
          node.people.length >= 2
        ) {

          marriageData.push({

            node: node,

            personA: node.people[0],

            personB: node.people[1],

            status:
              node.marriageStatus ||
              "current",

            index: 0

          });

        }

      }


      /* หลายคู่ */

      else if (
        node.type === "multi"
      ) {

        node.spouses.forEach(
          (s, index) => {

            marriageData.push({

              node: node,

              personA:
                node.anchor,

              personB:
                s.spouse,

              spouseData: s,

              status:
                s.marriageStatus ||
                "current",

              index: index

            });

          }
        );

      }

    });


    g.selectAll(
      ".marriage-line"
    )

      .data(marriageData)

      .enter()

      .append("path")

      .attr(
        "class",
        "marriage-line"
      )

      .attr(
        "fill",
        "none"
      )

      .attr(
        "stroke",
        LINE_COLOR
      )

      .attr(
        "stroke-width",
        2
      )

      .attr(
        "stroke-dasharray",
        d =>
          isDivorced(d.status)
            ? "7,5"
            : null
      )

      .attr(
        "d",
        d =>
          createMarriagePath(d)
      );
  }


  /* =========================================================
     สร้างเส้นคู่สมรส
     
     หักด้านบน
  ========================================================= */

  function createMarriagePath(data) {

    const node =
      data.node;


    const y =
      node.y +
      CARD_H / 2;


    /* =====================================================
       คู่เดียว
       
       ใช้เส้นตรงถ้าไม่มีสิ่งกีดขวาง
    ===================================================== */

    if (
      node.type === "couple"
    ) {

      const sorted =
        sortCouple(
          node.people
        );


      const leftX =
        node.x -
        (CARD_W + COUPLE_GAP) / 2 +
        CARD_W;


      const rightX =
        node.x +
        (CARD_W + COUPLE_GAP) / 2 -
        CARD_W;


      return `
        M${leftX},${y}
        L${rightX},${y}
      `;
    }


    /* =====================================================
       หลายคู่
       
       ⭐ ทุกคู่แยก PATH
       ⭐ หักขึ้นด้านบน
    ===================================================== */

    if (
      node.type === "multi" &&
      data.spouseData
    ) {

      const spouse =
        data.spouseData;


      const anchorRight =
        node.anchorX +
        CARD_W;


      const spouseLeft =
        spouse.cardX;


      /*
        แต่ละคู่ใช้ระดับ Y
        ของตัวเอง

        คู่แรก:
        y - 22

        คู่สอง:
        y - 44

        คู่สาม:
        y - 66

        ทำให้เส้นไม่ทับกัน
      */

      const routeY =
        y -
        MARRIAGE_ROUTE_GAP *
        (data.index + 1);


      /*
        เส้น:

        anchor
           │
           └──────── spouse

        แต่เนื่องจากเราต้องการ
        ให้เส้นหักขึ้นด้านบน
        จึงเป็น:

        [แก้ว]────────┐
                      │
                      └────────[น็อต]
      */

      return `
        M${anchorRight},${y}
        L${anchorRight},${routeY}
        L${spouseLeft},${routeY}
        L${spouseLeft},${y}
      `;
    }


    return "";
  }


  /* =========================================================
     ตรวจสถานะหย่า
  ========================================================= */

  function isDivorced(status) {

    return (
      status === "divorced" ||
      status === "หย่า" ||
      status === "divorce"
    );
  }


  /* =========================================================
     Hearts
  ========================================================= */

  function drawHearts() {

    /*
      ตอนนี้หัวใจจะแสดงเฉพาะคู่เดียว
      เพราะกรณีหลายคู่ เส้นแยกกันแล้ว
      ไม่ควรวางหัวใจทับกัน
    */

    g.selectAll(".heart")

      .data(
        flatNodes.filter(
          d =>
            d.type === "couple"
        )
      )

      .enter()

      .append("text")

      .attr(
        "class",
        "heart"
      )

      .attr(
        "text-anchor",
        "middle"
      )

      .attr(
        "y",
        d =>
          d.y +
          CARD_H / 2 +
          4
      )

      .attr(
        "x",
        d =>
          marriageMidX(d)
      )

      .text("❤");
  }
/* =========================================================
     Draw Nodes
  ========================================================= */

  function drawNodes() {

    const nodeSel =
      g.selectAll(
        ".node-group"
      )

      .data(
        flatNodes.filter(
          d =>
            d.type !== "root"
        )
      )

      .enter()

      .append("g")

      .attr(
        "class",
        "node-group"
      )

      .attr(
        "id",
        d =>
          "node-" +
          d.people
            .map(p => p.name)
            .join("-")
      )

      .on(
        "click",
        (e, d) =>
          centerNode(d)
      );


    nodeSel.each(
      function(d) {

        const el =
          d3.select(this);


        /* Single */

        if (
          d.type === "single"
        ) {

          drawPersonCard(
            el,

            d.x -
              CARD_W / 2,

            d.y,

            d.people[0]
          );

        }


        /* Couple */

        else if (
          d.type === "couple"
        ) {

          const sorted =
            sortCouple(
              d.people
            );


          drawPersonCard(

            el,

            d.x -
              CARD_W -
              COUPLE_GAP / 2,

            d.y,

            sorted[0]

          );


          drawPersonCard(

            el,

            d.x +
              COUPLE_GAP / 2,

            d.y,

            sorted[1]

          );

        }


        /* Multi */

        else if (
          d.type === "multi"
        ) {

          drawPersonCard(

            el,

            d.anchorX,

            d.y,

            d.anchor

          );


          d.spouses.forEach(
            s => {

              drawPersonCard(

                el,

                s.cardX,

                s.y,

                s.spouse

              );

            }
          );

        }

      }
    );
  }


  /* =========================================================
     Person Card
  ========================================================= */

  function drawPersonCard(
    el,
    x,
    y,
    person
  ) {

    const card =
      el.append("g")

        .attr(
          "transform",
          `translate(${x},${y})`
        );


    card.append("rect")

      .attr(
        "class",
        "person-bg"
      )

      .attr(
        "x",
        0
      )

      .attr(
        "y",
        0
      )

      .attr(
        "width",
        CARD_W
      )

      .attr(
        "height",
        CARD_H
      )

      .attr(
        "fill",
        genderColor(
          person.gender
        )
      )

      .attr(
        "rx",
        999
      )

      .attr(
        "ry",
        999
      );


    card.append("image")

      .attr(
        "class",
        "person-photo"
      )

      .attr(
        "x",
        7
      )

      .attr(
        "y",
        7
      )

      .attr(
        "width",
        PHOTO_SIZE
      )

      .attr(
        "height",
        PHOTO_SIZE
      )

      .attr(
        "href",
        getPhoto(person)
      )

      .attr(
        "clip-path",
        "circle(50%)"
      )

      .attr(
        "preserveAspectRatio",
        "xMidYMid slice"
      );


    card.append("text")

      .attr(
        "class",
        "person-name"
      )

      .attr(
        "x",
        7 +
        PHOTO_SIZE +
        8
      )

      .attr(
        "y",
        CARD_H / 2
      )

      .text(
        person.name || ""
      );
  }


  /* =========================================================
     Geometry
  ========================================================= */

  function sortCouple(
    people
  ) {

    return [
      ...people
    ].sort(
      (a, b) => {

        if (
          a.gender === "ญ" &&
          b.gender === "ช"
        ) {
          return -1;
        }


        if (
          a.gender === "ช" &&
          b.gender === "ญ"
        ) {
          return 1;
        }


        return 0;

      }
    );
  }


  function childTargetPoint(
    node
  ) {

    if (
      node.type === "single"
    ) {

      return {

        x: node.x,

        y:
          node.y +
          CARD_H / 2

      };

    }


    if (
      node.type === "couple"
    ) {

      const sorted =
        sortCouple(
          node.people
        );


      const main =
        node.people[0];


      const mainIndex =
        sorted[0].id === main.id
          ? 0
          : 1;


      let x;


      if (
        mainIndex === 0
      ) {

        x =
          node.x -
          COUPLE_GAP / 2 -
          CARD_W / 2;

      }

      else {

        x =
          node.x +
          COUPLE_GAP / 2 +
          CARD_W / 2;

      }


      return {

        x: x,

        y:
          node.y +
          CARD_H / 2

      };

    }


    if (
      node.type === "multi"
    ) {

      return {

        x:
          node.anchorX +
          CARD_W / 2,

        y:
          node.y +
          CARD_H / 2

      };

    }


    return {

      x: node.x,

      y:
        node.y +
        CARD_H / 2

    };
  }


  function marriageMidX(
    node
  ) {

    if (
      node.type === "couple"
    ) {
      return node.x;
    }


    if (
      node.type === "multi"
    ) {

      return (
        node.anchorX +
        CARD_W / 2
      );

    }


    return node.x;
  }


  /*
    จุดเชื่อมสำหรับลูกของแต่ละคู่
  */

  function marriageConnectionX(
    node,
    spouseData
  ) {

    const anchorRight =
      node.anchorX +
      CARD_W;


    const spouseLeft =
      spouseData.cardX;


    return (
      anchorRight +
      (spouseLeft -
        anchorRight) / 2
    );
  }


  /* =========================================================
     Parent → Child Line
  ========================================================= */

  function childLine(
    fromX,
    fromY,
    children
  ) {

    if (
      !children ||
      children.length === 0
    ) {
      return "";
    }


    const midY =
      fromY +
      (LEVEL_H -
        CARD_H) / 2;


    let path =
      `M${fromX},${fromY}
       L${fromX},${midY}`;


    children.forEach(
      c => {

        const p =
          childTargetPoint(c);


        path +=
          `M${fromX},${midY}
           L${p.x},${midY}
           L${p.x},${p.y}`;

      }
    );


    return path;
  }


  /* =========================================================
     View Control
  ========================================================= */

  function fitToScreen() {

    if (
      !svg ||
      !containerEl
    ) {
      return;
    }


    const width =
      containerEl.clientWidth;


    let minX = 0;
    let maxX = 0;
    let maxY = 0;


    flatNodes.forEach(
      d => {

        if (
          d.type === "multi"
        ) {

          minX =
            Math.min(
              minX,
              d.anchorX - 20
            );


          const last =
            d.spouses[
              d.spouses.length - 1
            ];


          maxX =
            Math.max(
              maxX,
              last.cardX +
              CARD_W +
              20
            );

        }


        else if (
          d.type === "couple"
        ) {

          minX =
            Math.min(
              minX,
              d.x -
              CARD_W -
              COUPLE_GAP / 2 -
              20
            );


          maxX =
            Math.max(
              maxX,
              d.x +
              CARD_W +
              COUPLE_GAP / 2 +
              20
            );

        }


        else {

          minX =
            Math.min(
              minX,
              d.x -
              CARD_W / 2 -
              20
            );


          maxX =
            Math.max(
              maxX,
              d.x +
              CARD_W / 2 +
              20
            );

        }


        /*
          เผื่อพื้นที่ด้านบน
          สำหรับเส้นที่หักขึ้น
        */

        if (
          d.type === "multi"
        ) {

          maxY =
            Math.max(
              maxY,
              d.y +
              CARD_H +
              50
            );

        }

        else {

          maxY =
            Math.max(
              maxY,
              d.y +
              CARD_H +
              50
            );

        }

      }
    );


    const treeW =
      maxX -
      minX;


    const scale =
      Math.min(

        0.75,

        width /
        Math.max(
          treeW,
          width * 0.4
        )

      );


    const tx =
      width / 2 -
      (
        minX +
        treeW / 2
      ) *
      scale;


    const ty = 50;


    svg.call(

      zoomHandler.transform,

      d3.zoomIdentity

        .translate(
          tx,
          ty
        )

        .scale(scale)

    );
  }


  function zoom(
    amount
  ) {

    if (!svg) return;


    svg.transition()

      .duration(250)

      .call(
        zoomHandler.scaleBy,
        1 + amount
      );
  }


  function resetZoom() {

    if (!containerEl) {
      return;
    }


    clear();


    drawTree(

      containerEl.id,

      window.familyRawData,

      ["1"]

    );
  }


  function centerNode(d) {

    if (
      !svg ||
      !containerEl
    ) {
      return;
    }


    let cx = d.x;


    if (
      d.type === "multi"
    ) {

      cx =
        d.anchorX +
        CARD_W / 2;

    }


    const t =
      d3.zoomIdentity

        .translate(

          containerEl.clientWidth / 2 -
          cx * 1.1,

          containerEl.clientHeight / 2 -
          d.y * 1.1

        )

        .scale(1.1);


    svg.transition()

      .duration(600)

      .call(
        zoomHandler.transform,
        t
      );
  }


  /* =========================================================
     Search
  ========================================================= */

  function searchNode(
    query
  ) {

    if (
      !flatNodes.length
    ) {
      return;
    }


    d3.selectAll(
      ".node-group"
    )
      .classed(
        "dim highlight",
        false
      );


    const q =
      (
        query || ""
      )
        .trim()
        .toLowerCase();


    if (!q) {
      return;
    }


    let found = null;


    d3.selectAll(
      ".node-group"
    )
      .each(
        function(d) {

          const names =
            d.people
              .map(
                p => p.name
              )
              .join(" ");


          const match =
            names
              .toLowerCase()
              .includes(q);


          d3.select(this)

            .classed(
              "highlight",
              match
            )

            .classed(
              "dim",
              !match
            );


          if (
            match &&
            !found
          ) {

            found = d;

          }

        }
      );


    if (found) {

      centerNode(
        found
      );

    }
  }


  /* =========================================================
     Clear
  ========================================================= */

  function clear() {

    if (svg) {

      svg.remove();

      svg = null;

      g = null;

    }


    flatNodes = [];

    familyData = null;
  }


  /* =========================================================
     Stats
  ========================================================= */

  function updateStats() {

    if (!familyData) {
      return;
    }


    const uniqueIds =
      new Set();


    let maxDepth = 0;


    function traverse(
      node,
      depth
    ) {

      if (!node) {
        return;
      }


      node.people.forEach(
        p =>
          uniqueIds.add(
            p.id
          )
      );


      if (
        depth >
        maxDepth
      ) {

        maxDepth =
          depth;

      }


      if (
        node.type ===
        "multi"
      ) {

        node.spouses.forEach(
          s =>
            s.children.forEach(
              c =>
                traverse(
                  c,
                  depth + 1
                )
            )
        );

      }


      else if (
        node.children
      ) {

        node.children.forEach(
          c =>
            traverse(
              c,
              depth + 1
            )
        );

      }

    }


    traverse(
      familyData,
      0
    );


    updateStatsText(

      `${maxDepth + 1} รุ่น · ${uniqueIds.size} สมาชิก`

    );
  }


  function updateStatsText(
    text
  ) {

    const el =
      document.getElementById(
        "stats"
      );


    if (el) {
      el.textContent =
        text;
    }
  }
  /* =========================================================
     Export
  ========================================================= */

  function getTreeBounds() {

    if (
      !flatNodes.length
    ) {

      return {

        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0

      };

    }


    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;


    flatNodes.forEach(
      d => {

        let left;
        let right;

        let top =
          d.y;

        let bottom =
          d.y +
          CARD_H;


        if (
          d.type === "multi"
        ) {

          left =
            d.anchorX;


          const last =
            d.spouses[
              d.spouses.length - 1
            ];


          right =
            last
              ? last.cardX +
                CARD_W
              : left +
                CARD_W;


          /*
            เผื่อเส้นหักขึ้น
          */

          const routeTop =
            d.y -
            (
              d.spouses.length *
              MARRIAGE_ROUTE_GAP
            ) -
            20;


          top =
            Math.min(
              top,
              routeTop
            );

        }


        else if (
          d.type === "couple"
        ) {

          left =
            d.x -
            CARD_W -
            COUPLE_GAP / 2;


          right =
            d.x +
            CARD_W +
            COUPLE_GAP / 2;

        }


        else {

          left =
            d.x -
            CARD_W / 2;


          right =
            d.x +
            CARD_W / 2;

        }


        let deepest =
          bottom;


        function findDeep(
          node
        ) {

          if (!node) {
            return;
          }


          if (
            node.y +
            CARD_H >
            deepest
          ) {

            deepest =
              node.y +
              CARD_H;

          }


          if (
            node.type ===
            "multi"
          ) {

            node.spouses.forEach(
              s =>
                s.children.forEach(
                  findDeep
                )
            );

          }


          else if (
            node.children
          ) {

            node.children.forEach(
              findDeep
            );

          }

        }


        findDeep(d);


        minX =
          Math.min(
            minX,
            left - 20
          );


        maxX =
          Math.max(
            maxX,
            right + 20
          );


        minY =
          Math.min(
            minY,
            top - 20
          );


        maxY =
          Math.max(
            maxY,
            deepest + 40
          );

      }
    );


    return {

      minX,
      maxX,
      minY,
      maxY

    };
  }


  /* =========================================================
     Export Image
  ========================================================= */

  function exportImage(
    format
  ) {

    if (
      typeof html2canvas ===
      "undefined"
    ) {

      alert(
        "กำลังโหลดตัวสร้างภาพ กรุณารอสักครู่แล้วลองอีกครั้ง"
      );

      return;
    }


    const bounds =
      getTreeBounds();


    const treeWidth =
      bounds.maxX -
      bounds.minX;


    const treeHeight =
      bounds.maxY -
      bounds.minY;


    if (
      treeWidth <= 0 ||
      treeHeight <= 0
    ) {

      alert(
        "ไม่พบผังสำหรับบันทึก"
      );

      return;
    }


    const originalTransform =
      d3.zoomTransform(
        svg.node()
      );


    const scale =
      Math.min(

        containerEl.clientWidth /
          treeWidth,

        containerEl.clientHeight /
          treeHeight

      ) *
      0.92;


    const tx =
      containerEl.clientWidth / 2 -
      (
        bounds.minX +
        treeWidth / 2
      ) *
      scale;


    const ty =
      containerEl.clientHeight / 2 -
      (
        bounds.minY +
        treeHeight / 2
      ) *
      scale;


    svg.call(

      zoomHandler.transform,

      d3.zoomIdentity

        .translate(
          tx,
          ty
        )

        .scale(scale)

    );


    setTimeout(
      () => {

        html2canvas(
          containerEl,
          {

            backgroundColor:
              "#f6f3ed",

            scale: 2,

            useCORS: true,

            allowTaint: true,

            logging: false

          }

        )

          .then(
            canvas => {

              svg.call(

                zoomHandler.transform,

                originalTransform

              );


              if (
                format === "png" ||
                format === "jpg"
              ) {

                const mime =
                  format === "jpg"
                    ? "image/jpeg"
                    : "image/png";


                const link =
                  document.createElement(
                    "a"
                  );


                link.download =
                  `family-tree.${format}`;


                link.href =
                  canvas.toDataURL(
                    mime,
                    0.95
                  );


                link.click();

              }


              else if (
                format === "pdf"
              ) {

                const {
                  jsPDF
                } =
                  window.jspdf;


                const imgData =
                  canvas.toDataURL(
                    "image/png"
                  );


                const pdf =
                  new jsPDF({

                    orientation:
                      treeWidth >
                      treeHeight
                        ? "landscape"
                        : "portrait",

                    unit: "mm",

                    format: "a4"

                  });


                const pageWidth =
                  pdf.internal
                    .pageSize
                    .getWidth();


                const pageHeight =
                  pdf.internal
                    .pageSize
                    .getHeight();


                const ratio =
                  Math.min(

                    pageWidth /
                      canvas.width,

                    pageHeight /
                      canvas.height

                  );


                const imgW =
                  canvas.width *
                  ratio;


                const imgH =
                  canvas.height *
                  ratio;


                const x =
                  (
                    pageWidth -
                    imgW
                  ) / 2;


                const y =
                  (
                    pageHeight -
                    imgH
                  ) / 2;


                pdf.addImage(

                  imgData,

                  "PNG",

                  x,
                  y,

                  imgW,
                  imgH

                );


                pdf.save(
                  "family-tree.pdf"
                );

              }

            }
          )

          .catch(
            err => {

              svg.call(

                zoomHandler.transform,

                originalTransform

              );


              console.error(
                err
              );


              alert(
                "บันทึกไม่สำเร็จ อาจเกิดจากรูปภาพภายนอกถูกบล็อก CORS"
              );

            }
          );

      },

      350
    );
  }


  /* =========================================================
     Public API
  ========================================================= */

  return {

    init:
      function(
        containerId,
        rawData,
        rootIds
      ) {

        clear();

        drawTree(
          containerId,
          rawData,
          rootIds
        );

      },

    zoom:
      zoom,

    resetZoom:
      resetZoom,

    search:
      searchNode,

    exportImage:
      exportImage

  };

})();
