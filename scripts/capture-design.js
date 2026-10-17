() => {
  const rounded = n => Math.round(n * 1000) / 1000;
  const hex = color => {
    const parts = color.match(/[\d.]+/g)?.map(Number);
    if (!parts || parts.length < 3) return undefined;
    if (parts.length > 3 && parts[3] === 0) return undefined;
    return '#' + parts.slice(0, 3).map(n => Math.round(n).toString(16).padStart(2, '0')).join('') + (parts.length > 3 && parts[3] < 1 ? Math.round(parts[3] * 255).toString(16).padStart(2, '0') : '');
  };
  let sequence = 0;
  const grids = [];
  const rectangle = r => ({ x: rounded(r.x), y: rounded(r.y), width: rounded(r.width), height: rounded(r.height) });
  function visit(element, parentRect) {
    if (!(element instanceof Element)) return [];
    if (['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'META', 'BR'].includes(element.tagName) || element.closest('#__framer-badge-container')) return [];
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return [];
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [...element.children].flatMap(child => visit(child, parentRect));
    const box = rectangle(rect);
    const base = { id: 'n' + (++sequence), name: element.getAttribute('data-framer-name') || element.tagName.toLowerCase(), x: rounded(rect.x - parentRect.x), y: rounded(rect.y - parentRect.y), width: box.width, height: box.height };
    const metadata = { type: 'dom', tag: element.tagName, css: { display: style.display, columns: style.gridTemplateColumns, gap: style.gap, padding: style.padding, transform: style.transform, mixBlendMode: style.mixBlendMode }, ...(element.getAttribute('href') ? { href: element.getAttribute('href') } : {}) };
    if (style.display === 'grid') grids.push({ ...box, name: base.name, columns: style.gridTemplateColumns, gap: style.columnGap, padding: style.padding });
    const node = { ...base, type: 'frame', layout: 'none', clip: ['hidden', 'clip'].includes(style.overflow), metadata, children: [] };
    const background = hex(style.backgroundColor);
    if (background) node.fill = background;
    const radius = parseFloat(style.borderTopLeftRadius);
    if (radius) node.cornerRadius = radius;
    if (Number(style.opacity) < 1) node.opacity = Number(style.opacity);
    if (parseFloat(style.borderTopWidth) > 0 && hex(style.borderTopColor)) {
      node.stroke = hex(style.borderTopColor);
      node.strokeWidth = { top: parseFloat(style.borderTopWidth), right: parseFloat(style.borderRightWidth), bottom: parseFloat(style.borderBottomWidth), left: parseFloat(style.borderLeftWidth) };
      node.strokeAlignment = 'inner';
    }
    if (['IMG', 'VIDEO', 'IFRAME', 'SVG'].includes(element.tagName.toUpperCase())) {
      const image = element.currentSrc || element.src;
      if (element.tagName === 'IMG') node.fill = { type: 'image', url: image, mode: style.objectFit === 'contain' ? 'contain' : style.objectFit === 'fill' ? 'stretch' : 'cover' };
      if (element.tagName === 'VIDEO' && element.poster) node.fill = { type: 'image', url: element.poster, mode: 'cover' };
      if (['VIDEO', 'IFRAME'].includes(element.tagName)) {
        node.metadata.mediaSource = element.getAttribute('src') || element.dataset.portfolioEmbed || '';
        node.metadata.staticMedia = true;
        if (!node.fill) node.fill = '#111111';
      }
      if (element.tagName.toUpperCase() === 'SVG') { node.metadata.svg = new XMLSerializer().serializeToString(element); node.fill = '#00000000'; }
      return [node];
    }
    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) node.children.push(...visit(child, rect));
      else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        const range = document.createRange(); range.selectNodeContents(child);
        const textRect = range.getBoundingClientRect();
        if (!textRect.width || !textRect.height) continue;
        let content = style.whiteSpace.startsWith('pre') ? child.textContent : child.textContent.replace(/\s+/g, ' ').trim();
        if (style.textTransform === 'uppercase') content = content.toUpperCase();
        if (style.textTransform === 'lowercase') content = content.toLowerCase();
        const fontSize = parseFloat(style.fontSize);
        const text = { id: 'n' + (++sequence), type: 'text', name: content.slice(0, 60), content, x: rounded(textRect.x - rect.x), y: rounded(textRect.y - rect.y), width: rounded(textRect.width), height: rounded(textRect.height), textGrowth: 'fixed-width-height', fill: hex(style.color) || '#000000', fontFamily: style.fontFamily.split(',')[0].replaceAll('"', '').replace(' Variable', ''), fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, letterSpacing: parseFloat(style.letterSpacing) || 0, textAlign: ['left', 'center', 'right', 'justify'].includes(style.textAlign) ? style.textAlign : 'left', metadata: { type: 'dom-text', lineRects: [...range.getClientRects()].map(rectangle) } };
        if (parseFloat(style.lineHeight)) text.lineHeight = parseFloat(style.lineHeight) / fontSize;
        if (style.textDecorationLine.includes('underline')) text.underline = true;
        node.children.push(text);
      }
    }
    if (!node.children.length && !node.fill && !node.stroke) return [];
    return [node];
  }
  return { width: innerWidth, height: document.body.scrollHeight, title: document.title, grids, children: visit(document.body, { x: 0, y: 0 }) };
}
