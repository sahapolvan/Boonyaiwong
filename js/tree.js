let searchTerm = '';

export function renderTree(data, container, isRoot = true) {
  container.innerHTML = '';
  const treeEl = document.createElement('div');
  treeEl.className = 'tree';
  treeEl.appendChild(createNode(data));
  container.appendChild(treeEl);
}

function createNode(person) {
  const node = document.createElement('div');
  node.className = 'node';
  node.dataset.id = person.id;

  const hasChildren = person.children && person.children.length > 0;
  const isMatch = searchTerm && person.name.includes(searchTerm);

  const card = document.createElement('div');
  card.className = 'node-card' + (isMatch ? ' matched' : '');
  card.innerHTML = `
    <div class="node-name">${person.name}</div>
    <div class="node-info">${person.info || ''}</div>
  `;

  if (hasChildren) {
    const toggle = document.createElement('div');
    toggle.className = 'toggle-btn';
    toggle.textContent = '▼ ย่อ';
    card.appendChild(toggle);

    card.addEventListener('click', () => {
      const childrenEl = node.querySelector('.children');
      childrenEl.classList.toggle('collapsed');
      toggle.textContent = childrenEl.classList.contains('collapsed') ? '▶ ขยาย' : '▼ ย่อ';
    });
  }

  node.appendChild(card);

  if (hasChildren) {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'children';
    person.children.forEach(child => {
      childrenEl.appendChild(createNode(child));
    });
    node.appendChild(childrenEl);
  }

  return node;
}

export function setSearch(term) {
  searchTerm = term;
}

export function expandAll(container) {
  container.querySelectorAll('.children').forEach(el => el.classList.remove('collapsed'));
  container.querySelectorAll('.toggle-btn').forEach(el => el.textContent = '▼ ย่อ');
}

export function collapseAll(container) {
  container.querySelectorAll('.children').forEach(el => el.classList.add('collapsed'));
  container.querySelectorAll('.toggle-btn').forEach(el => el.textContent = '▶ ขยาย');
}
