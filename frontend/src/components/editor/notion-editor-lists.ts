export interface ListNavigationCallbacks {
  canvas: HTMLElement;
  placeCursorIn: (el: HTMLElement) => void;
  recordChange: () => void;
  turnBlockInto: (block: HTMLElement, type: string) => void;
}

export function indentListItem(
  li: HTMLElement,
  callbacks: Pick<ListNavigationCallbacks, 'placeCursorIn' | 'recordChange'>,
): boolean {
  const prevLi = li.previousElementSibling as HTMLElement | null;
  if (!prevLi || prevLi.tagName.toLowerCase() !== 'li') {
    return false;
  }

  const parentList = li.parentElement;
  if (!parentList) return false;
  const parentTag = parentList.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul';

  // Procura se prevLi já possui uma sublista filha correspondente
  let sublist = prevLi.querySelector(`:scope > ${parentTag}`) as HTMLElement | null;
  if (!sublist) {
    sublist = prevLi.querySelector(':scope > ul, :scope > ol') as HTMLElement | null;
  }

  if (!sublist) {
    sublist = document.createElement(parentTag);
    prevLi.appendChild(sublist);
  }

  sublist.appendChild(li);
  callbacks.placeCursorIn(li);
  callbacks.recordChange();
  return true;
}

export function outdentListItem(
  li: HTMLElement,
  callbacks: Pick<ListNavigationCallbacks, 'canvas' | 'placeCursorIn' | 'recordChange'>,
): boolean {
  const currentList = li.parentElement;
  if (!currentList) return false;

  // Verifica se a lista atual está aninhada dentro de outro li pai
  const parentLi = currentList.closest('li');
  const grandparentList = parentLi?.parentElement;

  if (
    parentLi &&
    grandparentList &&
    (grandparentList.tagName.toLowerCase() === 'ul' ||
      grandparentList.tagName.toLowerCase() === 'ol')
  ) {
    // Outdent de nível aninhado: move o li para depois do parentLi no grandparentList
    parentLi.insertAdjacentElement('afterend', li);

    // Se a sublista anterior ficou vazia, remove-a
    if (currentList.querySelectorAll('li').length === 0) {
      currentList.remove();
    }

    callbacks.placeCursorIn(li);
    callbacks.recordChange();
    return true;
  }

  // Outdent do nível raiz: converte o li em parágrafo <p>
  const topList = currentList;
  if (
    topList.parentElement === callbacks.canvas ||
    topList.parentElement?.tagName.toLowerCase() === 'blockquote'
  ) {
    const p = document.createElement('p');

    // Extrai o conteúdo direto do li, preservando links e formatação inline mas separando sublistas
    let hasContent = false;
    const childLists: HTMLElement[] = [];
    for (const child of Array.from(li.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        ['UL', 'OL'].includes((child as HTMLElement).tagName)
      ) {
        childLists.push(child as HTMLElement);
      } else {
        p.appendChild(child.cloneNode(true));
        if (child.textContent?.trim()) hasContent = true;
      }
    }

    if (!hasContent && !p.innerHTML.trim()) {
      p.innerHTML = '<br>';
    }

    const prevSiblings: HTMLElement[] = [];
    let sib = li.previousElementSibling as HTMLElement | null;
    while (sib) {
      prevSiblings.unshift(sib);
      sib = sib.previousElementSibling as HTMLElement | null;
    }

    const nextSiblings: HTMLElement[] = [];
    sib = li.nextElementSibling as HTMLElement | null;
    while (sib) {
      nextSiblings.push(sib);
      sib = sib.nextElementSibling as HTMLElement | null;
    }

    if (prevSiblings.length > 0 && nextSiblings.length > 0) {
      // Divide a lista em duas partes
      const nextList = document.createElement(topList.tagName);
      for (const nextLi of nextSiblings) {
        nextList.appendChild(nextLi);
      }
      topList.insertAdjacentElement('afterend', p);
      p.insertAdjacentElement('afterend', nextList);
      li.remove();
    } else if (prevSiblings.length > 0) {
      topList.insertAdjacentElement('afterend', p);
      li.remove();
    } else if (nextSiblings.length > 0) {
      topList.insertAdjacentElement('beforebegin', p);
      li.remove();
    } else {
      topList.replaceWith(p);
    }

    // Se havia sublistas filhas, insere-as logo após o parágrafo
    let lastInserted: HTMLElement = p;
    for (const childList of childLists) {
      lastInserted.insertAdjacentElement('afterend', childList);
      lastInserted = childList;
    }

    callbacks.placeCursorIn(p);
    callbacks.recordChange();
    return true;
  }

  return false;
}

export function handleEnterInListItem(
  li: HTMLElement,
  e: KeyboardEvent,
  callbacks: Pick<ListNavigationCallbacks, 'canvas' | 'placeCursorIn' | 'recordChange'>,
): boolean {
  let liText = '';
  let hasChildList = false;
  for (const child of Array.from(li.childNodes)) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      ['UL', 'OL'].includes((child as HTMLElement).tagName)
    ) {
      hasChildList = true;
    } else {
      liText += child.textContent || '';
    }
  }

  if (!liText.trim()) {
    e.preventDefault();
    outdentListItem(li, callbacks);
    return true;
  }

  if (hasChildList) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const sublist = li.querySelector(':scope > ul, :scope > ol') as HTMLElement | null;
      if (sublist && !sublist.contains(range.startContainer)) {
        e.preventDefault();
        const newLi = document.createElement('li');
        newLi.innerHTML = '<br>';
        sublist.insertAdjacentElement('beforebegin', newLi);
        callbacks.placeCursorIn(newLi);
        callbacks.recordChange();
        return true;
      }
    }
  }

  return false;
}

export function handleBackspaceInListItem(
  li: HTMLElement,
  e: KeyboardEvent,
  callbacks: Pick<ListNavigationCallbacks, 'canvas' | 'placeCursorIn' | 'recordChange'>,
): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return false;
  }

  const range = selection.getRangeAt(0);
  let isAtStart = false;
  if (range.startOffset === 0) {
    let node: Node | null = range.startContainer;
    isAtStart = true;
    while (node && node !== li) {
      if (node.previousSibling) {
        isAtStart = false;
        break;
      }
      node = node.parentNode;
    }
  }

  if (isAtStart) {
    let liText = '';
    for (const child of Array.from(li.childNodes)) {
      if (
        child.nodeType !== Node.ELEMENT_NODE ||
        !['UL', 'OL'].includes((child as HTMLElement).tagName)
      ) {
        liText += child.textContent || '';
      }
    }

    if (!liText.trim()) {
      e.preventDefault();
      outdentListItem(li, callbacks);
      return true;
    }

    const parentLi = li.parentElement?.closest('li');
    if (parentLi) {
      e.preventDefault();
      outdentListItem(li, callbacks);
      return true;
    }
  }

  return false;
}

export function checkMarkdownInputRules(
  callbacks: ListNavigationCallbacks,
): void {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent || '';
  const parent = node.parentElement;
  if (!parent || parent.tagName.toLowerCase() !== 'p') return;

  if (text.startsWith('# ')) {
    node.textContent = text.substring(2);
    callbacks.turnBlockInto(parent, 'h1');
  } else if (text.startsWith('## ')) {
    node.textContent = text.substring(3);
    callbacks.turnBlockInto(parent, 'h2');
  } else if (text.startsWith('### ')) {
    node.textContent = text.substring(4);
    callbacks.turnBlockInto(parent, 'h3');
  } else if (
    text.startsWith('- ') ||
    text.startsWith('* ') ||
    text.startsWith('+ ') ||
    text.startsWith('• ')
  ) {
    node.textContent = text.replace(/^[-*+•–—]\s/, '');
    const prevEl = parent.previousElementSibling;
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    li.textContent = node.textContent || '';
    if (prevEl && prevEl.tagName.toLowerCase() === 'ul') {
      prevEl.appendChild(li);
      parent.remove();
    } else {
      const ul = document.createElement('ul');
      ul.appendChild(li);
      parent.replaceWith(ul);
    }
    callbacks.placeCursorIn(li);
    callbacks.recordChange();
  } else if (text.startsWith('1. ')) {
    node.textContent = text.substring(3);
    const prevEl = parent.previousElementSibling;
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    li.textContent = node.textContent || '';
    if (prevEl && prevEl.tagName.toLowerCase() === 'ol') {
      prevEl.appendChild(li);
      parent.remove();
    } else {
      const ol = document.createElement('ol');
      ol.appendChild(li);
      parent.replaceWith(ol);
    }
    callbacks.placeCursorIn(li);
    callbacks.recordChange();
  } else if (text.startsWith('[] ') || text.startsWith('[ ] ')) {
    node.textContent = text.replace(/^\[\s?\]\s/, '');
    callbacks.turnBlockInto(parent, 'todo');
  } else if (text.startsWith('> ')) {
    node.textContent = text.substring(2);
    callbacks.turnBlockInto(parent, 'quote');
  } else if (text.startsWith('--- ')) {
    const hr = document.createElement('hr');
    parent.replaceWith(hr);
    const newP = document.createElement('p');
    newP.innerHTML = '<br>';
    hr.insertAdjacentElement('afterend', newP);
    callbacks.placeCursorIn(newP);
    callbacks.recordChange();
  }
}
