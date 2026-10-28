import { describe, expect, it, vi } from 'vitest';
import { mountInteractiveDocument, parseInteractiveDocument } from './interactiveDocuments.js';

const source = `@start overview
@diagram overview
flowchart TD
  A --> D[Details]
@end
@diagram details
sequenceDiagram
  participant Alice
  Alice->>Bob: Hello
@end
@link overview.D -> details
@link details.Alice -> overview`;

describe('interactive documents', () => {
  it('keeps Mermaid diagrams separate and resolves cross-type links', () => {
    const document = parseInteractiveDocument(source);
    expect(document.start).toBe('overview');
    expect(document.diagrams.get('details')).toContain('sequenceDiagram');
    expect(document.links.get('overview')?.get('D')).toBe('details');
    expect(document.links.get('details')?.get('Alice')).toBe('overview');
  });

  it('rejects malformed references and duplicate names', () => {
    expect(() =>
      parseInteractiveDocument('@diagram x\nflowchart TD\n@end\n@link x.A -> missing')
    ).toThrow('Link target diagram does not exist');
    expect(() => parseInteractiveDocument('@diagram x\nflowchart TD\n@end\n@diagram x')).toThrow(
      'Duplicate diagram'
    );
  });

  it('navigates by click and keyboard, then returns through history', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const render = vi.fn((_id: string, text: string) =>
      Promise.resolve({
        svg: text.startsWith('flowchart')
          ? '<svg><g data-mermaid-node-id="D"><text>Details</text></g></svg>'
          : '<svg><g data-et="participant" data-id="Alice"><text>Alice</text></g></svg>',
        diagramType: text.startsWith('flowchart') ? 'flowchart' : 'sequence',
        bindFunctions: undefined,
      })
    );
    const handle = await mountInteractiveDocument(container, source, render);
    expect(container.querySelector('[data-mermaid-node-id="D"]')?.getAttribute('role')).toBe(
      'link'
    );
    container.querySelector('text')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(handle.current).toBe('details'));
    expect(container.querySelector('button')?.hidden).toBe(false);
    const actor = container.querySelector('[data-id="Alice"]');
    actor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(handle.current).toBe('overview'));
    await handle.back();
    expect(handle.current).toBe('details');
    expect(render).toHaveBeenCalledTimes(4);
    handle.destroy();
    expect(container.childElementCount).toBe(0);
  });
});
