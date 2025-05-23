const RENDER_BATCH_SIZE = 100; // Number of annotations to render in one frame

const uniqueItems = (items) => Array.from(new Set(items));

const baseFormatter = (annotation) => {
  const tags = annotation.body
    .filter((b) => b.purpose === "tagging")
    .map((b) => b.value);
  console.debug("format", tags, annotation.level);

  const result = {
    className: "",
  };

  if (tags.length > 1) {
    result.className = "multi";
  }

  if (annotation.level) {
    result.style = "padding-bottom: " + annotation.level * 3 + "px";
  }

  return result;
};

export default class Highlighter {
  constructor(element, formatter) {
    this.el = element;
    this.formatter = formatter ?? baseFormatter;
  }

  init = (annotations) =>
    new Promise((resolve, _) => {
      const startTime = performance.now();

      // Discard all annotations without a TextPositionSelector
      console.log("annotations", annotations);
      const highlights = annotations.flatMap((annotation) => {
        // For each annotation, create a highlight entry for each valid target (i.e. with a TextPositionSelector)
        return annotation.targets
          .filter(
            (target) =>
              target.selector != null &&
              target.selector.some((s) => s.type === "TextPositionSelector")
          )
          .map((target) => ({
            annotation: annotation,
            target: target,
            start: target.selector.find(
              (s) => s.type === "TextPositionSelector"
            ).start,
            end: target.selector.find((s) => s.type === "TextPositionSelector")
              .end,
          }));
      });
      console.log("highlights", highlights);

      // Sorting top to bottom will render the overlapping annonation borders better
      highlights.sort((a, b) => {
        return a.start !== b.start ? a.start - b.start : b.end - a.end;
      });

      // Render loop
      const render = (highlights) => {
        const batch = highlights.slice(0, RENDER_BATCH_SIZE);
        const remainder = highlights.slice(RENDER_BATCH_SIZE);

        requestAnimationFrame(() => {
          batch.forEach((highlight) =>
            this._addAnnotation(
              highlight.annotation,
              undefined,
              highlight.target
            )
          );
          if (remainder.length > 0) {
            render(remainder);
          } else {
            console.log(
              `Rendered ${highlights.length}, took ${
                performance.now() - startTime
              }ms`
            );
            resolve();
          }
        });
      };

      render(highlights);
    });

  _addAnnotation = (annotation, level, target) => {
    try {
      // Use the provided target or fall back to the first target
      const targetToUse =
        target ??
        (Array.isArray(annotation.target)
          ? annotation.target[0]
          : annotation.target);

      // Find the TextPositionSelector
      const positionSelector = targetToUse.selector.find(
        (s) => s.type === "TextPositionSelector"
      );
      if (!positionSelector) {
        console.warn("Annotation missing TextPositionSelector:", annotation);
        return;
      }

      const [domStart, domEnd] = this.charOffsetsToDOMPosition([
        positionSelector.start,
        positionSelector.end,
      ]);

      if (!domStart || !domEnd) {
        console.warn(
          "Could not find DOM positions for annotation:",
          annotation
        );
        return;
      }

      const range = document.createRange();
      range.setStart(domStart.node, domStart.offset);
      range.setEnd(domEnd.node, domEnd.offset);

      const spans = this.wrapRange(range);

      this._applyLevel(annotation, spans, level);
      this.applyStyles(annotation, spans);
      this.bindAnnotation(annotation, spans);
    } catch (error) {
      console.warn("Could not render annotation:", error);
      console.warn("Annotation:", annotation);
    }
  };

  _applyLevel = (annotation, spans, existingLevel) => {
    if (existingLevel !== undefined) {
      annotation.level = existingLevel;
      return;
    }

    const overlaps = [];
    spans.forEach((span) => {
      const spanOverlaps = this.getAnnotationsAt(span).filter(
        (a) => a !== undefined
      );
      overlaps.push(...spanOverlaps);
    });

    const levels = overlaps.map((a) => a.level).filter((l) => l !== undefined);
    let level = this._getFreeLevel(levels);

    annotation.level = level;
    //console.debug("_applyLevel", annotation.id, level);
  };

  _getFreeLevel = (levels) => {
    let nextLevel = 0;

    while (true) {
      if (!levels.includes(nextLevel)) return nextLevel;
      nextLevel = nextLevel + 1;
    }
  };

  findAnnotationSpans = (annotationOrId) => {
    const id = annotationOrId.id || annotationOrId;
    const spans = Array.from(
      document.querySelectorAll(`.r6o-annotation[data-id="${id}"]`)
    );
    return spans;
  };

  getAnnotation = (annotationOrId) => {
    const spans = this.findAnnotationSpans(annotationOrId);
    return spans.length > 0 ? spans[0].annotation : null;
  };

  getAllAnnotations = () => {
    const allAnnotationSpans = this.el.querySelectorAll(".r6o-annotation");
    const allAnnotations = Array.from(allAnnotationSpans).map(
      (span) => span.annotation
    );
    return [...new Set(allAnnotations)];
  };

  addOrUpdateAnnotation = (annotation, maybePrevious) => {
    // TODO index annotation to make this faster
    const annoSpans = this.findAnnotationSpans(annotation);
    const prevSpans = maybePrevious
      ? this.findAnnotationSpans(maybePrevious)
      : [];
    const spans = uniqueItems(annoSpans.concat(prevSpans));

    if (spans.length > 0) {
      const annoData = this.getAnnotation(annotation);
      const level = annoData ? annoData.level : null;
      //console.debug("addOrUpdateAnnotation", annoData, level);

      // naive approach
      this._unwrapHighlightings(spans);
      this.el.normalize();
      this._addAnnotation(annotation, level);
    } else {
      this._addAnnotation(annotation);
    }
  };

  removeAnnotation = (annotation) => {
    const spans = this.findAnnotationSpans(annotation);
    if (spans) {
      this._unwrapHighlightings(spans);
      this.el.normalize();
    }
  };

  clear = () => {
    const allAnnotationSpans = Array.from(
      this.el.querySelectorAll(".r6o-annotation")
    );
    this._unwrapHighlightings(allAnnotationSpans);
    this.el.normalize();
  };

  /**
   * Forces a new ID on the annotation with the given ID. This method handles
   * the ID update within the Highlighter ONLY. It's up to the application to
   * keep the RelationsLayer in sync!
   *
   * @returns the updated annotation for convenience
   */
  overrideId = (originalId, forcedId) => {
    const allSpans = document.querySelectorAll(
      `.r6o-annotation[data-id="${originalId}"]`
    );
    const annotation = allSpans[0].annotation;

    const updatedAnnotation = annotation.clone({ id: forcedId });
    this.bindAnnotation(updatedAnnotation, allSpans);

    return updatedAnnotation;
  };

  _unwrapHighlightings(highlightSpans) {
    for (const span of highlightSpans) {
      const parent = span.parentNode;
      const childNodes = span.childNodes;

      if (childNodes?.length > 0) {
        const len = childNodes.length;
        for (let i = 0; i < len; i++) {
          parent.insertBefore(childNodes[0], span);
        }
      } else {
        parent.insertBefore(document.createTextNode(span.textContent), span);
      }

      parent.removeChild(span);
    }
  }

  /**
   * Apply styles using this highlighter's formatter, which is a user-defined
   * function that takes an annotation as input, and returns either a string,
   * or an object. If a string is returned, this will be appended to the
   * annotation element CSS class list. Otherwise, the object can have the
   * following properties:
   *
   * - 'className' added to the CSS class list
   * - 'data-*' added as data attributes
   * - 'style' a list of CSS styles (in the form of a string)
   */
  applyStyles = (annotation, spans) => {
    let extraClasses = "";
    const format = this.formatter ? this.formatter(annotation) : null;

    if (format) {
      if (typeof format === "string" || format instanceof String) {
        // string: append to class list
        extraClasses = format;
      } else {
        // object: extract className and style
        const { className, style } = format;
        if (className) extraClasses = className;
        if (style)
          spans.forEach((span) => {
            span.setAttribute("style", `${span.style.cssText} ${style}`.trim());
          });
      }
      // Copy data attributes
      for (const key in format) {
        if (format.hasOwnProperty(key) && key.startsWith("data-")) {
          spans.forEach((span) => span.setAttribute(key, format[key]));
        }
      }
    }

    // apply extra classes if there are any; ensure .r6o-annotation added regardless
    spans.forEach(
      (span) => (span.className = `r6o-annotation ${extraClasses}`.trim())
    );

    // get first span with content & apply special class
    const firstSpan = spans.find((s) => s.innerText) ?? spans[0];
    firstSpan.className = firstSpan.className + " r6o-first";
  };

  bindAnnotation = (annotation, elements) => {
    elements.forEach((el) => {
      el.annotation = annotation;
      el.dataset.id = annotation.id;
    });
  };

  walkTextNodes = (node, stopOffset) => {
    const nodes = [];

    const ni = document.createNodeIterator(node, NodeFilter.SHOW_TEXT);
    var runningOffset = 0;
    let n = ni.nextNode();
    while (n != null) {
      runningOffset += n.textContent.length;
      nodes.push(n);
      if (runningOffset > stopOffset) {
        break;
      }
      n = ni.nextNode();
    }
    return nodes;
  };

  charOffsetsToDOMPosition = (charOffsets) => {
    const maxOffset = Math.max.apply(null, charOffsets);

    const textNodeProps = (() => {
      let start = 0;
      return this.walkTextNodes(this.el, maxOffset).map(function (node) {
        var nodeLength = node.textContent.length,
          nodeProps = { node: node, start: start, end: start + nodeLength };

        start += nodeLength;
        return nodeProps;
      });
    })();

    return this.calculateDomPositionWithin(textNodeProps, charOffsets);
  };

  /**
   * Given a rootNode, this helper gets all text between a given
   * start- and end-node.
   */
  textNodesBetween = (startNode, endNode, rootNode) => {
    const ni = document.createNodeIterator(rootNode, NodeFilter.SHOW_TEXT);

    let n = ni.nextNode();
    let take = false;
    const nodesBetween = [];

    while (n != null) {
      if (n === endNode) take = false;

      if (take) nodesBetween.push(n);

      if (n === startNode) take = true;

      n = ni.nextNode();
    }

    return nodesBetween;
  };

  calculateDomPositionWithin = (textNodeProperties, charOffsets) => {
    var positions = [];

    textNodeProperties.forEach(function (props, i) {
      charOffsets.forEach(function (charOffset, j) {
        if (charOffset >= props.start && charOffset <= props.end) {
          // Don't attach nodes for the same charOffset twice
          var previousOffset =
            positions.length > 0
              ? positions[positions.length - 1].charOffset
              : false;

          if (previousOffset !== charOffset)
            positions.push({
              charOffset: charOffset,
              node: props.node,
              offset: charOffset - props.start,
            });
        }
      });

      // Break (i.e. return false) if all positions are computed
      return positions.length < charOffsets.length;
    });

    return positions;
  };

  wrapRange = (range, commonRoot) => {
    const root = commonRoot ? commonRoot : this.el;

    const surround = (range) => {
      var wrapper = document.createElement("SPAN");
      range.surroundContents(wrapper);
      return wrapper;
    };

    if (range.startContainer === range.endContainer) {
      return [surround(range)];
    } else {
      // The tricky part - we need to break the range apart and create
      // sub-ranges for each segment
      var nodesBetween = this.textNodesBetween(
        range.startContainer,
        range.endContainer,
        root
      );

      // Start with start and end nodes
      var startRange = document.createRange();
      startRange.selectNodeContents(range.startContainer);
      startRange.setStart(range.startContainer, range.startOffset);
      var startWrapper = surround(startRange);

      var endRange = document.createRange();
      endRange.selectNode(range.endContainer);
      endRange.setEnd(range.endContainer, range.endOffset);
      var endWrapper = surround(endRange);

      // And wrap nodes in between, if any
      var centerWrappers = nodesBetween.reverse().map(function (node) {
        const wrapper = document.createElement("SPAN");
        node.parentNode.insertBefore(wrapper, node);
        wrapper.appendChild(node);
        return wrapper;
      });

      return [startWrapper].concat(centerWrappers, [endWrapper]);
    }
  };

  getAnnotationsAt = (element) => {
    // Helper to get all annotations in case of multipe nested annotation spans
    var getAnnotationsRecursive = function (element, a) {
        var annotations = a ? a : [],
          parent = element.parentNode;

        annotations.push(element.annotation);

        return parent.classList.contains("r6o-annotation")
          ? getAnnotationsRecursive(parent, annotations)
          : annotations;
      },
      sortByStart = function (annotations) {
        return annotations.sort(function (a, b) {
          return a.start != b.start ? a.start - b.start : b.end - a.end;
        });
      };

    return sortByStart(getAnnotationsRecursive(element));
  };
}
