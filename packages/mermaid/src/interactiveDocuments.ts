import type { RenderResult } from './types.js';

export interface InteractiveDocument {
  start: string;
  diagrams: Map<string, string>;
  links: Map<string, Map<string, string>>;
}

export interface InteractiveDocumentHandle {
  readonly current: string;
  go(id: string): Promise<void>;
  back(): Promise<void>;
  destroy(): void;
}

type RenderDiagram = (id: string, text: string, container?: Element) => Promise<RenderResult>;

let nextInstanceId = 0;

/**
 * Parse a document made of ordinary Mermaid diagrams. Navigation declarations stay
 * outside each diagram, so existing Mermaid grammars do not need to change.
 */
export function parseInteractiveDocument(source: string): InteractiveDocument {
  const diagrams = new Map<string, string>();
  const links = new Map<string, Map<string, string>>();
  let start: string | undefined;
  let activeId: string | undefined;
  let body: string[] = [];
  const name = '[A-Za-z][A-Za-z0-9_-]*';
  const diagramPattern = new RegExp(`^@diagram (${name})$`);
  const linkPattern = new RegExp(`^@link (${name})\\.(${name}) -> (${name})$`);
  const startPattern = new RegExp(`^@start (${name})$`);

  for (const [index, line] of source.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const directive = line.trim();
    if (activeId !== undefined) {
      if (directive === '@end') {
        const text = body.join('\n').trim();
        if (!text) {
          throw new Error(`Diagram ${activeId} is empty`);
        }
        diagrams.set(activeId, text);
        activeId = undefined;
        body = [];
      } else {
        body.push(line);
      }
      continue;
    }
    if (!directive || directive.startsWith('%%')) {
      continue;
    }
    const diagram = diagramPattern.exec(directive);
    if (diagram) {
      if (diagrams.has(diagram[1])) {
        throw new Error(`Duplicate diagram: ${diagram[1]}`);
      }
      activeId = diagram[1];
      body = [];
      continue;
    }
    const link = linkPattern.exec(directive);
    if (link) {
      const [, from, element, to] = link;
      let byElement = links.get(from);
      if (!byElement) {
        byElement = new Map();
        links.set(from, byElement);
      }
      if (byElement.has(element)) {
        throw new Error(`Duplicate link: ${from}.${element}`);
      }
      byElement.set(element, to);
      continue;
    }
    const entry = startPattern.exec(directive);
    if (entry) {
      if (start !== undefined) {
        throw new Error('Only one @start directive is allowed');
      }
      start = entry[1];
      continue;
    }
    throw new Error(`Unknown interactive document directive at line ${index + 1}: ${directive}`);
  }
  if (activeId !== undefined) {
    throw new Error(`Diagram ${activeId} is missing @end`);
  }
  start ??= diagrams.keys().next().value;
  if (!start || !diagrams.has(start)) {
    throw new Error(`Start diagram does not exist: ${start ?? '(none)'}`);
  }
  for (const [from, byElement] of links) {
    if (!diagrams.has(from)) {
      throw new Error(`Link source diagram does not exist: ${from}`);
    }
    for (const to of byElement.values()) {
      if (!diagrams.has(to)) {
        throw new Error(`Link target diagram does not exist: ${to}`);
      }
    }
  }
  return { start, diagrams, links };
}

/** Mount an interactive document in an application-owned HTML element. */
export async function mountInteractiveDocument(
  container: HTMLElement,
  source: string | InteractiveDocument,
  render: RenderDiagram
): Promise<InteractiveDocumentHandle> {
  const document = typeof source === 'string' ? parseInteractiveDocument(source) : source;
  const instanceId = ++nextInstanceId;
  const history: string[] = [];
  let current = document.start;
  let sequence = 0;
  let destroyed = false;
  const reportNavigationError = (error: unknown) => {
    const EventType = container.ownerDocument.defaultView?.CustomEvent;
    if (EventType) {
      container.dispatchEvent(new EventType('mermaid:interactive-error', { detail: error }));
    }
  };

  const show = async (id: string, remember: boolean): Promise<void> => {
    if (destroyed) {
      throw new Error('Interactive document has been destroyed');
    }
    const definition = document.diagrams.get(id);
    if (!definition) {
      throw new Error(`Diagram does not exist: ${id}`);
    }
    const request = ++sequence;
    const result = await render(`interactive-${instanceId}-${request}`, definition, container);
    if (destroyed || request !== sequence) {
      return;
    }
    const view = container.ownerDocument.createElement('div');
    view.innerHTML = result.svg;
    const svg = view.querySelector('svg');
    if (!svg) {
      throw new Error(`Diagram ${id} did not render an SVG`);
    }
    const targets = document.links.get(id);
    const found = new Set<string>();
    for (const node of svg.querySelectorAll<SVGElement>(
      '[data-mermaid-node-id], [data-et="participant"][data-id]'
    )) {
      const modelId = node.getAttribute('data-mermaid-node-id') ?? node.getAttribute('data-id');
      if (modelId && targets?.has(modelId)) {
        found.add(modelId);
        node.classList.add('interactive-diagram-link');
        node.setAttribute('role', 'link');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-label', `Open diagram ${targets.get(modelId)}`);
        node.style.cursor = 'pointer';
      }
    }
    for (const modelId of targets?.keys() ?? []) {
      if (!found.has(modelId)) {
        throw new Error(`Interactive target not found in diagram ${id}: ${modelId}`);
      }
    }
    const backButton = container.ownerDocument.createElement('button');
    backButton.type = 'button';
    backButton.textContent = 'Back';
    backButton.hidden = !remember && history.length === 0;
    backButton.addEventListener('click', () => void handle.back().catch(reportNavigationError));
    container.replaceChildren(backButton, view);
    result.bindFunctions?.(view);
    if (remember) {
      history.push(current);
    }
    current = id;
    backButton.hidden = history.length === 0;
  };

  const handle: InteractiveDocumentHandle = {
    get current() {
      return current;
    },
    go: (id) => show(id, true),
    async back() {
      const previous = history.at(-1);
      if (!previous) {
        return;
      }
      await show(previous, false);
      history.pop();
      const button = container.querySelector('button');
      if (button) {
        button.hidden = history.length === 0;
      }
    },
    destroy() {
      destroyed = true;
      sequence++;
      container.removeEventListener('click', onActivate);
      container.removeEventListener('keydown', onActivate);
      container.replaceChildren();
    },
  };

  const onActivate = (event: Event) => {
    if (event.type === 'keydown' && !['Enter', ' '].includes((event as KeyboardEvent).key)) {
      return;
    }
    const target = event.target;
    if (!target || !('closest' in target) || typeof target.closest !== 'function') {
      return;
    }
    const node = target.closest('.interactive-diagram-link');
    const modelId = node?.getAttribute('data-mermaid-node-id') ?? node?.getAttribute('data-id');
    const destination = modelId && document.links.get(current)?.get(modelId);
    if (destination) {
      event.preventDefault();
      void handle.go(destination).catch(reportNavigationError);
    }
  };
  container.addEventListener('click', onActivate);
  container.addEventListener('keydown', onActivate);
  try {
    await show(document.start, false);
  } catch (error) {
    handle.destroy();
    throw error;
  }
  return handle;
}
