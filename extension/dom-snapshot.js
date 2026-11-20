export function domSnapshotExpression(params = {}) {
  const maxNodes = Math.max(1, Math.min(Number(params.maxNodes) || 1000, 5000));
  const maxTextChars = Math.max(100, Math.min(Number(params.maxTextChars) || 20000, 200000));
  const includeGenericClickable = params.includeGenericClickable === true;
  const includeFormContext = params.includeFormContext !== false;
  return `(() => {
    const maxNodes = ${maxNodes}; const maxTextChars = ${maxTextChars};
    const includeGenericClickable = ${includeGenericClickable}; const includeFormContext = ${includeFormContext};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const selector = (el) => {
      if (el.id && CSS.escape) return '#' + CSS.escape(el.id);
      if (el.getAttribute('data-testid')) return '[data-testid="' + CSS.escape(String(el.getAttribute('data-testid'))) + '"]';
      if (el.getAttribute('name')) return el.localName + '[name="' + CSS.escape(String(el.getAttribute('name'))) + '"]';
      const parts = []; let node = el;
      while (node && node.nodeType === 1 && parts.length < 6) {
        let part = node.localName; if (!part) break;
        const parent = node.parentElement;
        if (parent) { const peers = [...parent.children].filter(x => x.localName === node.localName); if (peers.length > 1) part += ':nth-of-type(' + (peers.indexOf(node) + 1) + ')'; }
        parts.unshift(part); node = parent;
      }
      return parts.join(' > ');
    };
    const role = (el) => el.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT: el.type === 'checkbox' ? 'checkbox' : 'textbox',SELECT:'combobox',TEXTAREA:'textbox'}[el.tagName] || null);
    const label = (el) => {
      const explicit = normalize(el.getAttribute('aria-label') || (el.labels ? [...el.labels].map(x => x.innerText || x.textContent || '').join(' ') : ''));
      if (explicit) return explicit.slice(0, 500);
      let node = el.parentElement;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        const texts = [...node.children].filter(x => x !== el && !x.contains(el)).map(x => normalize(x.innerText || x.textContent)).filter(x => x && x.length <= 200).sort((a,b) => a.length - b.length);
        if (texts[0]) return texts[0];
      }
      return null;
    };
    const attrNames = ['id','class','role','type','name','placeholder','title','aria-checked','aria-selected','aria-expanded','aria-disabled','data-testid','data-field','data-key','data-state'];
    const nodes = [];
    const base = 'a,button,input,select,textarea,[role],[contenteditable="true"],summary,[tabindex]';
    const candidates = document.querySelectorAll(includeGenericClickable ? base + ',div,span' : base);
    for (const el of candidates) {
      if (nodes.length >= maxNodes) break;
      const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      const genericClickable = (el.localName === 'div' || el.localName === 'span') && style.cursor === 'pointer' && !el.matches(base);
      if ((el.localName === 'div' || el.localName === 'span') && !el.matches(base) && !genericClickable) continue;
      const type = String(el.getAttribute('type') || '').toLowerCase() || null;
      const attributes = {}; for (const name of attrNames) { const value = el.getAttribute(name); if (value != null && value !== '') attributes[name] = String(value).slice(0, 500); }
      nodes.push({
        selector: selector(el), tag: el.localName, role: role(el),
        name: normalize(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder')).slice(0, 500),
        fieldLabel: includeFormContext ? label(el) : null,
        value: includeFormContext && type !== 'password' && 'value' in el ? String(el.value).slice(0, 2000) : null,
        valueRedacted: includeFormContext && type === 'password', placeholder: el.getAttribute('placeholder'), type,
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true', checked: typeof el.checked === 'boolean' ? el.checked : null,
        genericClickable, attributes, rect: {x:r.x,y:r.y,width:r.width,height:r.height}
      });
    }
    return { url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, maxTextChars), nodes };
  })()`;
}
