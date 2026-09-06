// tree-extra.js
// View Control + Search + Stats + Export + Public API

const TreeExtra = (function () {

  /* =========================================================
     STATE
  ========================================================= */

  function state() {
    return TreeCore.getState();
  }


  /* =========================================================
     6. VIEW CONTROL
  ========================================================= */

  function fitToScreen() {

    const {
      svg,
      containerEl,
      flatNodes,
      zoomHandler
    } = state();


    if (
      !svg ||
      !containerEl ||
      !zoomHandler
    ) {
      return;
    }


    const width =
      containerEl.clientWidth;


    let minX = 0;
    let maxX = 0;
    let maxY = 0;


    flatNodes.forEach(d => {

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


        if (last) {

          maxX =
            Math.max(
              maxX,
              last.cardX +
                110 +
                20
            );

        }

      }


      else if (
        d.type === "couple"
      ) {

        minX =
          Math.min(
            minX,
            d.x -
              110 -
              22 / 2 -
              20
          );


        maxX =
          Math.max(
            maxX,
            d.x +
              110 +
              22 / 2 +
              20
          );

      }


      else {

        minX =
          Math.min(
            minX,
            d.x -
              110 / 2 -
              20
          );


        maxX =
          Math.max(
            maxX,
            d.x +
              110 / 2 +
              20
          );

      }


      maxY =
        Math.max(
          maxY,
          d.y +
            46 +
            50
        );

    });


    const treeW =
      maxX - minX;


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


    const ty = 30;


    svg.call(
      zoomHandler.transform,
      d3.zoomIdentity
        .translate(tx, ty)
        .scale(scale)
    );

  }


  function zoom(amount) {

    const {
      svg,
      zoomHandler
    } = state();


    if (
      !svg ||
      !zoomHandler
    ) {
      return;
    }


    svg.transition()
      .duration(250)
      .call(
        zoomHandler.scaleBy,
        1 + amount
      );

  }


  function resetZoom() {

    const {
      containerEl
    } = state();


    if (
      !containerEl
    ) {
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

    const {
      svg,
      containerEl,
      zoomHandler
    } = state();


    if (
      !svg ||
      !containerEl ||
      !zoomHandler
    ) {
      return;
    }


    let cx = d.x;


    if (
      d.type === "multi"
    ) {

      cx =
        d.anchorX +
        110 / 2;

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


  function clear() {

    const {
      svg
    } = state();


    if (svg) {
      svg.remove();
    }


    TreeCore.setState({

      svg: null,
      g: null,

      flatNodes: [],
      familyData: null

    });

  }


  /* =========================================================
     7. SEARCH
  ========================================================= */

  function searchNode(query) {

    const {
      flatNodes
    } = state();


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
      (query || "")
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
            .map(p => p.name)
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
      centerNode(found);
    }

  }


  /* =========================================================
     8. STATS
  ========================================================= */

  function updateStats() {

    const {
      familyData
    } = state();


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
          uniqueIds.add(p.id)
      );


      if (
        depth > maxDepth
      ) {
        maxDepth = depth;
      }


      if (
        node.type === "multi"
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


  function updateStatsText(text) {

    const el =
      document.getElementById(
        "stats"
      );


    if (el) {
      el.textContent = text;
    }

  }


  /* =========================================================
     9. EXPORT
  ========================================================= */

  function getTreeBounds() {

    const {
      flatNodes
    } = state();


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


    flatNodes.forEach(d => {

      let left;
      let right;

      const top = d.y;
      const bottom =
        d.y + 46;


      if (
        d.type === "multi"
      ) {

        left = d.anchorX;


        const last =
          d.spouses[
            d.spouses.length - 1
          ];


        right =
          last
            ? last.cardX + 110
            : left + 110;

      }


      else if (
        d.type === "couple"
      ) {

        left =
          d.x -
          110 -
          22 / 2;


        right =
          d.x +
          110 +
          22 / 2;

      }


      else {

        left =
          d.x -
          110 / 2;


        right =
          d.x +
          110 / 2;

      }


      let deepest = bottom;


      function findDeep(node) {

        if (!node) {
          return;
        }


        deepest =
          Math.max(
            deepest,
            node.y + 46
          );


        if (
          node.type === "multi"
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

    });


    return {
      minX,
      maxX,
      minY,
      maxY
    };

  }


  function exportImage(format) {

    const {
      svg,
      containerEl,
      zoomHandler
    } = state();


    if (
      typeof html2canvas ===
      "undefined"
    ) {

      alert(
        "กำลังโหลดตัวสร้างภาพ กรุณารอสักครู่แล้วลองอีกครั้ง"
      );

      return;

    }


    if (
      !svg ||
      !containerEl
    ) {
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

      ) * 0.92;


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
        .translate(tx, ty)
        .scale(scale)
    );


    setTimeout(() => {

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

      .then(canvas => {

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
          } = window.jspdf;


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
            (pageWidth -
              imgW) / 2;


          const y =
            (pageHeight -
              imgH) / 2;


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

      })

      .catch(err => {

        svg.call(
          zoomHandler.transform,
          originalTransform
        );


        console.error(err);


        alert(
          "บันทึกไม่สำเร็จ อาจเกิดจากรูปภาพภายนอกถูกบล็อก CORS"
        );

      });

    }, 350);

  }


  /* =========================================================
     INITIALIZE
  ========================================================= */

  function init(
    containerId,
    rawData,
    rootIds
  ) {

    clear();


    TreeCore.drawTree(
      containerId,
      rawData,
      rootIds
    );


    updateStats();


    setTimeout(
      fitToScreen,
      50
    );

  }


  /* =========================================================
     PUBLIC API
  ========================================================= */

  return {

    init,
    zoom,
    resetZoom,
    search: searchNode,
    exportImage,

    fitToScreen,
    centerNode,
    clear,

    updateStats

  };

})();
