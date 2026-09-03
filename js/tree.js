let searchTerm = '';

export function setSearch(term) {
  searchTerm = term;
}

export function buildTree(data) {
  const map = {};
  data.forEach(p => map[p.id] = p);

  const primaryIds = new Set(data.filter(p => p.father || p.mother).map(p => p.id));

  function isNoParent(p) {
    return !p.father && !p.mother;
  }

  const rootHeads = [];
  const handled = new Set();

  for (const p of data) {
    if (!isNoParent(p) || handled.has(p.id)) continue;

    const spouses = (p.spouse || []).map(sid => map[sid]).filter(Boolean);
    const hasSpouseWithParents = spouses.some(s => s && !isNoParent(s));

    if (hasSpouseWithParents) continue;

    const noParentSpouses = spouses.filter(isNoParent);
    const group = [p, ...noParentSpouses];

    const head = group.find(x => x.gender === 'ช') || group[0];

    rootHeads.push(head);
    group.forEach(x => handled.add(x.id));
  }

  rootHeads.forEach(h => primaryIds.add(h.id));

  function primaryParent(child) {
    const f = map[child.father];
    const m = map[child.mother];
    if (f && primaryIds.has(f.id)) return f;
    if (m && primaryIds.has(m.id)) return m;
    return null;
  }

  function buildNode(person, visited = new Set()) {
    if (visited.has(person.id)) return null;
    visited.add(person.id);

    const node = {
      person,
      spouses: (person.spouse || []).map(sid => map[sid]).filter(Boolean),
      children: []
    };

    node.children = data
      .filter(c => primaryParent(c) === person)
      .map(c => buildNode(c, visited))
      .filter(Boolean);

    return node;
  }

  return rootHeads.map(h => buildNode(h)).filter(Boolean);
}

export function renderForest(roots, container) {
  container.innerHTML = '';

  if (!roots || roots.length === 0) {
    container.innerHTML = '<p style="text-align:center">ไม่พบข้อมูลครอบครัว</p>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'tree-forest';

  roots.forEach(root => {
    const tree = document.createElement('div');
    tree.className = 'tree';
    tree.appendChild(createNodeElement(root));
    wrapper.appendChild(tree);
  });

  container.appendChild(wrapper);
}

function createNodeElement(node) {
  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.id = node.person.id;

  const hasChildren = node.children && node.children.length > 0;
  const isMatch = searchTerm && node.person.name.includes(searchTerm);

  const card = document.createElement('div');
  card.className = 'node-card ' +
    (node.person.gender === 'ช' ? 'male' : 'female') +
    (isMatch ? ' matched' : '');

  const spousesText = node.spouses.map(s => s.name).join(', ') || '-';

  card.innerHTML = `
    <div class="node-name">${node.person.name}</div>
    <div class="node-spouses">คู่สมรส: ${spousesText}</div>
    <div class="node-info">${node.person.gender === 'ช' ? 'ชาย' : 'หญิง'}</div>
  `;

  if (hasChildren) {
    const toggle = document.createElement('div');
    toggle.className = 'toggle-btn';
    toggle.textContent = '▼ ย่อ';
    card.appendChild(toggle);

    card.addEventListener('click', () => {
      const childrenEl = el.querySelector('.children');
      childrenEl.classList.toggle('collapsed');
      toggle.textContent = childrenEl.classList.contains('collapsed') ? '▶ ขยาย' : '▼ ย่อ';
    });
  }

  el.appendChild(card);

  if (hasChildren) {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'children';
    node.children.forEach(child => {
      childrenEl.appendChild(createNodeElement(child));
    });
    el.appendChild(childrenEl);
  }

  return el;
}

export function expandAll(container) {
  container.querySelectorAll('.children').forEach(el => el.classList.remove('collapsed'));
  container.querySelectorAll('.toggle-btn').forEach(el => el.textContent = '▼ ย่อ');
}

export function collapseAll(container) {
  container.querySelectorAll('.children').forEach(el => el.classList.add('collapsed'));
  container.querySelectorAll('.toggle-btn').forEach(el => el.textContent = '▶ ขยาย');
}
