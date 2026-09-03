// /js/utils.js
// Helper ทั่วไปที่ใช้หลายไฟล์

export function getPhoto(person) {
  if (!person) return '';
  if (person.photo) return person.photo;
  const color = person.gender === 'ญ' ? 'ff9999' : '99ccff';
  const name = encodeURIComponent(person.name || '?');
  return `https://ui-avatars.com/api/?name=${name}&background=${color}&color=fff&size=128`;
}

export function genderColor(gender) {
  if (gender === 'ญ') return '#ffe6e6';
  if (gender === 'ช') return '#e6f2ff';
  return '#f0f0f0';
}

export function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML.replace(/\n/g, '<br>');
}

export function throttle(fn, wait = 200) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    }
  };
}
