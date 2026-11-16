const CURSOR_ELEMENT = "LINGEE-AGENT-CURSOR";
const CURSOR_ATTRIBUTE = "data-lingee-agent-cursor";

export function normalizeDomSnapshot(snapshot) {
  const strings = Array.isArray(snapshot?.strings) ? snapshot.strings : [];
  return (snapshot?.documents || []).map((document) => normalizeDocument(document, strings));
}

function normalizeDocument(document, strings) {
  const nodes = document?.nodes || {};
  const count = nodes.nodeName?.length || 0;
  const excluded = new Set();
  const attributes = Array.from({ length: count }, (_, index) => decodeAttributes(nodes.attributes?.[index], strings));
  for (let index = 0; index < count; index += 1) {
    const parent = nodes.parentIndex?.[index];
    const name = stringAt(strings, nodes.nodeName?.[index]);
    if (excluded.has(parent) || name === CURSOR_ELEMENT || Object.hasOwn(attributes[index], CURSOR_ATTRIBUTE)) excluded.add(index);
  }

  const layoutByNode = new Map();
  for (let index = 0; index < (document?.layout?.nodeIndex?.length || 0); index += 1) {
    layoutByNode.set(document.layout.nodeIndex[index], {
      bounds: document.layout.bounds?.[index] || null,
      styles: (document.layout.styles?.[index] || []).map((value) => stringAt(strings, value))
    });
  }

  return {
    url: stringAt(strings, document?.documentURL),
    baseURL: stringAt(strings, document?.baseURL),
    nodes: Array.from({ length: count }, (_, index) => index).filter((index) => !excluded.has(index)).map((index) => ({
      parent: nodes.parentIndex?.[index] ?? -1,
      type: nodes.nodeType?.[index] ?? 0,
      name: stringAt(strings, nodes.nodeName?.[index]),
      value: stringAt(strings, nodes.nodeValue?.[index]),
      attributes: attributes[index],
      layout: layoutByNode.get(index) || null
    }))
  };
}

function decodeAttributes(values, strings) {
  const result = {};
  for (let index = 0; index < (values?.length || 0); index += 2) result[stringAt(strings, values[index])] = stringAt(strings, values[index + 1]);
  return result;
}

function stringAt(strings, index) { return Number.isInteger(index) && index >= 0 ? strings[index] || "" : ""; }
