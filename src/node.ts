import { rect } from "./builders/primitives";
import { Path, Element } from "./types/elements";
import { path, style, svg } from "./builders/elements";
import { SVGBaseAttributes, SVGPathAttributes, SVGNode } from "./types/svg";
import { convert as convertPath } from "./path";

const elementToPath: (element: SVGNode) => string = require("element-to-path");

const camelCase = require("lodash.camelcase");
const upperFirst = require("lodash.upperfirst");

function joinTransforms(...transforms: (string | undefined)[]) {
  return transforms.filter((x) => !!x).join(" ");
}

function createPathElement(
  attributes: SVGPathAttributes,
  context: SVGBaseAttributes
): Path {
  const { d } = attributes;

  const {
    fill,
    stroke,
    ["stroke-opacity"]: strokeOpacity = 1,
    ["stroke-width"]: strokeWidth,
    ["stroke-linecap"]: strokeLineCap,
  } = { ...context, ...attributes };

  return path(
    style(
      fill,
      stroke,
      strokeWidth != null ? parseFloat(strokeWidth) : undefined,
      strokeLineCap,
      strokeOpacity
    ),
    convertPath(d, joinTransforms(context.transform, attributes.transform))
  );
}

// Convert all svg nodes into a simplified JSON structure.
// Currently, all drawing nodes (rect, circle, polyline) are converted
// to <path> nodes for simpler rendering.
function convertElement(
  child: SVGNode,
  context: SVGBaseAttributes
): Element | null {
  switch (child.name) {
    case "title":
    case "desc":
      return null;
    case "svg": {
      const { viewBox } = child.attributes;

      const [vx, vy, vw, vh] = viewBox.split(" ").map(parseFloat);

      return svg(rect(vx, vy, vw, vh));
    }
    case "path": {
      return createPathElement(child.attributes, context);
    }
    case "polyline":
    case "polygon": {
      const { points, ...rest } = child.attributes;
      const path = elementToPath(child);
      return createPathElement({ d: path, ...rest }, context);
    }
    case "circle": {
      const { cx, cy, r, ...rest } = child.attributes;
      const path = elementToPath(child);
      return createPathElement({ d: path, ...rest }, context);
    }
    case "rect": {
      const { x, y, width, height, rx, ry, ...rest } = child.attributes;
      const path = elementToPath(child);
      return createPathElement({ d: path, ...rest }, context);
    }
    case "g": {
      const transform = joinTransforms(
        context.transform,
        child.attributes.transform
      );

      return {
        type: "group",
        path: [],
        context: { ...context, ...child.attributes, transform },
        data: { children: [] },
      };
    }
    default:
      console.log("Unused svg", child["type"], child["name"]);
      return null;
  }
}

/**
 * Generate a name for an SVG element
 *
 * @param elementName The name of the element's type, e.g. circle
 * @param attributes The elements attributes, potentially containing an id
 * @param index The index of the element within its parent
 */
function generateName(
  attributes: SVGBaseAttributes | null,
  elementName: string,
  index: number
): string {
  return (
    (attributes && upperFirst(camelCase(attributes.id))) ||
    elementName + index.toString()
  );
}

/**
 * Convert all children, filtering out groups and the "element path",
 * which is ultimately used as the variable name, to each node
 */
function convertNodes(
  nodes: SVGNode[],
  parentPath: string[],
  context: SVGBaseAttributes
): Element[] {
  return nodes.reduce((acc: Element[], node: SVGNode, index: number) => {
    const attributes = "attributes" in node ? node.attributes : null;

    const name = generateName(attributes, node.name, index);

    const converted = convert(node, [...parentPath, name], context);

    if (!converted) {
      return acc;
    } else if (converted.type === "group") {
      return [...acc, ...converted.data.children];
    } else {
      return [...acc, converted];
    }
  }, []);
}

export function convert(
  node: SVGNode,
  path: string[] = [],
  context: SVGBaseAttributes = {} as SVGBaseAttributes
): Element | null {
  const converted = convertElement(node, context);

  if (!converted) return null;

  converted.path = path;

  if (converted.type === "group" || converted.type === "svg") {
    const children = "children" in node ? node.children : [];

    converted.data.children = convertNodes(
      children,
      path,
      converted.type === "group" ? converted.context : context
    );
  }

  return converted;
}
