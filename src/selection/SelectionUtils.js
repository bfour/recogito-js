import { Selection } from 'eu-eleysion-recogito-client-core';

export const trimRange = range => {
  let quote = range.toString();
  let leadingSpaces = 0;
  let trailingSpaces = 0;

  // Count/strip leading spaces
  while (quote.substring(0, 1) === ' ') {
    leadingSpaces += 1;
    quote = quote.substring(1);
  }

  // Count/strip trailing spaces
  while (quote.substring(quote.length - 1) === ' ') {
    trailingSpaces += 1;
    quote = quote.substring(0, quote.length - 1);
  }

  // Adjust range
  if (leadingSpaces > 0)
    range.setStart(range.startContainer, range.startOffset + leadingSpaces);

  if (trailingSpaces > 0) {
    const correctedEnd = range.endOffset - trailingSpaces;
    if (correctedEnd < 0) {
      // This correction crosses container tag boundaries
      const prevContainer = range.endContainer.previousSibling || range.endContainer.parentNode;

      // Get last text child in previous container
      const prevText = Array.from(prevContainer.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE).pop();

      range.setEnd(prevText, prevText.textContent.length + correctedEnd);
    } else {
      range.setEnd(range.endContainer, correctedEnd);
    }
  }

  return range;
};

export const rangeToSelection = (range, containerEl) => {
  const rangeBefore = document.createRange();

  // A helper range from the start of the contentNode to the start of the selection
  rangeBefore.setStart(containerEl, 0);
  rangeBefore.setEnd(range.startContainer, range.startOffset);

  const quote = range.toString();
  const start = rangeBefore.toString().length;

  return new Selection({
    selector: [{
      type: 'TextQuoteSelector',
      exact: quote
    }, {
      type: 'TextPositionSelector',
      start: start,
      end: start + quote.length
    }]
  });

};

/**
 * Util function that checks if the given selection is an exact overlap to any
 * existing annotations, and returns them, if so
 */
export const getExactOverlaps = (selection, selectedSpans) => {
  // All existing annotations at this point
  const existingAnnotations = [];

  selectedSpans.forEach(span => {
    const enclosingAnnotationSpan = span.closest('.r6o-annotation');
    const enclosingAnnotation = enclosingAnnotationSpan?.annotation;

    if (enclosingAnnotation && !existingAnnotations.includes(enclosingAnnotation))
      existingAnnotations.push(enclosingAnnotation);
  });

  if (existingAnnotations.length > 0)
    return existingAnnotations.filter(anno => {
      const pos = selection.selector('TextPositionSelector');
      const isSameStart = anno.start === pos.start;
      const isSameEnd = anno.end === pos.end;
      return isSameStart && isSameEnd;
    });
  else
    return [];
};

export const enableTouch = (element, selectHandler) => {
  let touchTimeout;
  let lastTouchEvent;

  const onTouchStart = evt => {
    if (!touchTimeout) {
      lastTouchEvent = evt;
      touchTimeout = setTimeout(executeTouchSelect, 1000);
    }
  }

  const executeTouchSelect = () => {
    if (lastTouchEvent) {
      selectHandler(lastTouchEvent);
      touchTimeout = null;
      lastTouchEvent = null;
    }
  };

  const resetTouch = evt => {
    if (touchTimeout) {
      clearTimeout(touchTimeout);
      touchTimeout = setTimeout(executeTouchSelect, 1500);
    }
  }

  element.addEventListener('touchstart', onTouchStart);
  document.addEventListener('selectionchange', resetTouch);
}