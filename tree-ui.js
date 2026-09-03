// /js/tree-ui.js
// จัดการ Modal, Tooltip, Toast และ UI interaction ที่ไม่ใช่ D3 โดยตรง

import { getPhoto, escapeHtml } from './utils.js';

const modalEl = () => document.getElementById('personModal');
const avatarEl = () => document.getElementById('modalAvatar');
const nameEl = () => document.getElementById('modalName');
const genderEl = () => document.getElementById('modalGender');
const infoEl = () => document.getElementById('modalInfo');

export function openPersonModal(person) {
  if (!person || !modalEl()) return;

  avatarEl().src = getPhoto(person);
  nameEl().textContent = person.name || 'ไม่ระบุชื่อ';

  const isMale = person.gender === 'ช';
  const isFemale = person.gender === 'ญ';

  genderEl().textContent = isMale ? 'เพศชาย' : (isFemale ? 'เพศหญิง' : 'ไม่ระบุเพศ');
  genderEl().className = 'person-modal-gender ' + (isMale ? 'male' : 'female');

  const fields = [
    { label: 'ชื่อเล่น', key: 'nickname' },
    { label: 'เกิด', key: 'birth' },
    { label: 'เสียชีวิต', key: 'death' },
    { label: 'คู่สมรส', key: 'spouseName' },
    { label: 'บิดา', key: 'fatherName' },
    { label: 'มารดา', key: 'motherName' },
    { label: 'อาชีพ', key: 'occupation' },
    { label: 'เบอร์โทร', key: 'phone' },
    { label: 'ที่อยู่', key: 'address' },
    { label: 'หมายเหตุ', key: 'note' }
  ];

  infoEl().innerHTML = fields
    .filter(f => person[f.key] && String(person[f.key]).trim())
    .map(f => `
      <div class="info-row">
        <span class="info-label">${f.label}</span>
        <span class="info-value">${escapeHtml(person[f.key])}</span>
      </div>
    `).join('');

  if (!infoEl().innerHTML) {
    infoEl().innerHTML = '<div class="info-row"><span class="info-value">ไม่มีข้อมูลเพิ่มเติม</span></div>';
  }

  modalEl().classList.add('active');
  document.body.style.overflow = 'hidden';
}

export function closeModal() {
  if (modalEl()) {
    modalEl().classList.remove('active');
    document.body.style.overflow = '';
  }
}

export function showToast(message, type = 'info') {
  let toast = document.getElementById('treeToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'treeToast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      padding: 12px 24px; border-radius: 30px; color: #fff; font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 2000; opacity: 0;
      transition: opacity 0.3s; pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'error' ? '#c0392b' : '#27ae60';
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}
