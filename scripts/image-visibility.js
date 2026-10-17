window.__auditImageVisible = image => {
  if (!image.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const box = image.getBoundingClientRect();
  let left = box.left, right = box.right, top = box.top, bottom = box.bottom;
  if (!box.width || !box.height) return false;
  for (let parent = image.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'contents') continue;
    const rect = parent.getBoundingClientRect();
    if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
    if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
    if (right <= left || bottom <= top) return false;
  }
  return true;
};
