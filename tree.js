// tree.js
// ระบบข้อมูล + Layout + Draw + Geometry

const TreeCore = (function () {

  /* =========================================================
     1. CONSTANTS
  ========================================================= */

  const CARD_W = 110;
  const CARD_H = 46;
  const PHOTO_SIZE = 32;
  const COUPLE_GAP = 22;
  const LEVEL_H = 130;
  const SIBLING_GAP = 34;

  const MALE_COLOR = "#cfe2f3";
  const FEMALE_COLOR = "#f4cccc";

  /* =========================================================
     2. STATE
  ========================================================= */

  let svg = null;
  let g = null;
  let zoomHandler = null;

  let flatNodes = [];
  let familyData = null;
  let containerEl = null;

  /* =========================================================
     3. DATA
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
            .filter(s => s.trim());
        }
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

        if (
          byId[sid] &&
          !p.spouses.includes(sid)
        ) {
          p.spouses.push(sid);
        }

      });

    });


    Object.values(byId).forEach(child => {

      if (
        child.father &&
        byId[child.father] &&
        child.mother &&
        byId[child.mother]
      ) {

        const father = byId[child.father];
        const mother = byId[child.mother];


        if (
          father.spouses.includes(child.mother)
        ) {

          if (
            !father.childrenBySpouse[child.mother]
          ) {
            father.childrenBySpouse[child.mother] = [];
          }

          father.childrenBySpouse[
            child.mother
          ].push(child.id);

        }


        if (
          mother.spouses.includes(child.father)
        ) {

          if (
            !mother.childrenBySpouse[child.father]
          ) {
            mother.childrenBySpouse[child.father] = [];
          }

          mother.childrenBySpouse[
            child.father
          ].push(child.id);

        }

      }

    });

    return byId;
  }


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


      /* คนโสด */

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

        const spouse =
          byId[person.spouses[0]];

        const childIds =
          person.childrenBySpouse[
            person.spouses[0]
          ] || [];


        const children = [];

        childIds.forEach(cid => {

          children.push(
            ...buildNodes(
              cid,
              new Set(visited)
            )
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
          children
        }];

      }


      /* มีหลายคู่ */

      return [{

        type: "multi",

        people: [
          person,
          ...person.spouses
            .map(sid => byId[sid])
            .filter(Boolean)
        ],

        anchor: person,

        spouses: person.spouses
          .map(spouseId => {

            const spouse =
              byId[spouseId];

            const childIds =
              person.childrenBySpouse[
                spouseId
              ] || [];


            const children = [];

            childIds.forEach(cid => {

              children.push(
                ...buildNodes(
                  cid,
                  new Set(visited)
                )
              );

            });


            if (spouse) {
              visited.add(spouse.id);
            }


            return {
              spouse,
              children
            };

          })
          .filter(s => s.spouse)

      }];

    }


    let roots = rootIds;


    if (
      !roots ||
      roots.length === 0
    ) {

      roots = [];

      const includedSpouses =
        new Set();


      Object.values(byId)

        .filter(p =>
          (!p.father || !byId[p.father]) &&
          (!p.mother || !byId[p.mother])
        )

        .forEach(p => {

          if (
            !includedSpouses.has(p.id)
          ) {

            roots.push(p.id);

            p.spouses.forEach(
              sid =>
                includedSpouses.add(sid)
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
      children
    };

  }


  /* =========================================================
     4. HELPERS
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


  function sortCouple(people) {

    return [...people].sort(
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


  /* =========================================================
     5. LAYOUT
  ========================================================= */

  function measure(node) {

    if (!node) {
      return;
    }


    if (!node.children) {
      node.children = [];
    }


    /* SINGLE */

    if (node.type === "single") {

      node.subtreeW = CARD_W;

    }


    /* COUPLE */

    else if (node.type === "couple") {

      node.children.forEach(
        c => measure(c)
      );


      node.subtreeW =
        Math.max(
          CARD_W * 2 + COUPLE_GAP,
          childrenWidth(node.children)
        );

    }


    /* MULTI */

    else if (node.type === "multi") {

      let totalW = CARD_W;


      node.spouses.forEach(s => {

        s.children.forEach(
          c => measure(c)
        );


        s.columnW =
          Math.max(
            CARD_W,
            childrenWidth(
              s.children
            )
          );


        totalW +=
          COUPLE_GAP +
          s.columnW;

      });


      node.subtreeW = totalW;

    }


    /* ROOT */

    else if (node.type === "root") {

      node.children.forEach(
        c => measure(c)
      );


      node.subtreeW =
        childrenWidth(
          node.children
        );

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
          (i > 0
            ? SIBLING_GAP
            : 0),
        0
      );


    let curX =
      centerX -
      totalW / 2;


    children.forEach(
      (c, i) => {

        if (i > 0) {
          curX += SIBLING_GAP;
        }


        place(
          c,
          curX +
            c.subtreeW / 2,
          baseY
        );


        curX +=
          c.subtreeW;

      }
    );

  }


  function place(
    node,
    x,
    y
  ) {

    if (!node) {
      return;
    }


    node.x = x;
    node.y = y;


    flatNodes.push(node);


    if (
      node.type === "single" ||
      node.type === "couple"
    ) {

      if (
        node.children.length > 0
      ) {

        placeChildren(
          node.children,
          x,
          y + LEVEL_H
        );

      }

    }


    else if (
      node.type === "multi"
    ) {

      node.anchorX =
        x -
        node.subtreeW / 2;


      let curX =
        node.anchorX +
        CARD_W +
        COUPLE_GAP;


      node.spouses.forEach(s => {

        s.x =
          curX +
          s.columnW / 2;

        s.cardX =
          s.x -
          CARD_W / 2;

        s.y = y;


        if (
          s.children.length > 0
        ) {

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


    else if (
      node.type === "root"
    ) {

      placeChildren(
        node.children,
        x,
        y + LEVEL_H
      );

    }

  }


  /* =========================================================
     6. DRAW TREE
  ========================================================= */

  function drawTree(
    containerId,
    rawData,
    rootIds
  ) {

    containerEl =
      document.getElementById(
        containerId
      );


    if (!containerEl) {
      console.error(
        "Tree container not found:",
        containerId
      );
      return;
    }


    if (
      typeof d3 === "undefined"
    ) {
      console.error(
        "D3.js is not loaded"
      );
      return;
    }


    if (
      !rawData ||
      !rawData.length
    ) {
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


    svg =
      d3.select(
        "#" + containerId
      )
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("id", "treeSvg")
      .style(
        "cursor",
        "grab"
      );


    g = svg.append("g");


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


    drawLinks();
    drawMarriageLines();
    drawHearts();
    drawNodes();

  }


  /* =========================================================
     7. LINKS
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


          if (
            d.type === "single"
          ) {

            path +=
              childLine(
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


            path +=
              childLine(
                midX,
                fromY,
                d.children
              );

          }


          else if (
            d.type === "multi"
          ) {

            d.spouses.forEach(
              s => {

                const midX =
                  (
                    d.anchorX +
                    CARD_W +
                    s.cardX
                  ) / 2;


                path +=
                  childLine(
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


  function drawMarriageLines() {

    g.selectAll(
      ".marriage-line"
    )
    .data(
      flatNodes.filter(
        d =>
          d.type === "couple" ||
          d.type === "multi"
      )
    )
    .enter()
    .append("path")
    .attr(
      "class",
      "marriage-line"
    )
    .attr(
      "d",
      d => {

        let path = "";

        const y =
          d.y +
          CARD_H / 2;


        if (
          d.type === "couple"
        ) {

          const leftX =
            d.x -
            (CARD_W +
              COUPLE_GAP) /
              2 +
            CARD_W;


          const rightX =
            d.x +
            (CARD_W +
              COUPLE_GAP) /
              2 -
            CARD_W;


          path +=
            `M${leftX},${y} L${rightX},${y}`;

        }


        else if (
          d.type === "multi"
        ) {

          d.spouses.forEach(
            s => {

              const anchorRight =
                d.anchorX +
                CARD_W;


              const spouseLeft =
                s.cardX;


              path +=
                `M${anchorRight},${y} L${spouseLeft},${y}`;

            }
          );

        }


        return path;

      }
    );

  }


  function drawHearts() {

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
      .on(
        "click",
        (e, d) =>
          centerNode(d)
      );


    nodeSel.each(
      function(d) {

        const el =
          d3.select(this);


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
     8. GEOMETRY
  ========================================================= */

  function childTargetPoint(node) {

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
        x,
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


  function marriageMidX(node) {

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
        CARD_H) /
        2;


    let path =
      `M${fromX},${fromY} ` +
      `L${fromX},${midY} `;


    children.forEach(
      c => {

        const p =
          childTargetPoint(c);


        path +=
          `M${fromX},${midY} ` +
          `L${p.x},${midY} ` +
          `L${p.x},${p.y} `;

      }
    );


    return path;

  }


  /* =========================================================
     PUBLIC CORE API
  ========================================================= */

  
  return {

    drawTree,
    normalizeFamilyData,
    buildFamilyTree,

    getPhoto,
    genderColor,
    childrenWidth,
    sortCouple,

    measure,
    placeChildren,
    place,

    drawLinks,
    drawMarriageLines,
    drawHearts,
    drawNodes,
    drawPersonCard,

    childTargetPoint,
    marriageMidX,
    childLine,

    getState: function() {

      return {
        svg,
        g,
        zoomHandler,
        flatNodes,
        familyData,
        containerEl
      };

    },

    setState: function(state) {

      if ("svg" in state)
        svg = state.svg;

      if ("g" in state)
        g = state.g;

      if ("zoomHandler" in state)
        zoomHandler =
          state.zoomHandler;

      if ("flatNodes" in state)
        flatNodes =
          state.flatNodes;

      if ("familyData" in state)
        familyData =
          state.familyData;

      if ("containerEl" in state)
        containerEl =
          state.containerEl;

    }

  };

})();
