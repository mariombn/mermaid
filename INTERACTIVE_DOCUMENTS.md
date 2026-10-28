# Interactive diagram documents (fork extension)

This fork adds a small document format and a browser API for navigating between Mermaid diagrams. The diagrams themselves remain ordinary Mermaid definitions and may use different diagram types.

```text
@start overview
@diagram overview
flowchart TD
  A --> B
  A --> C
  B --> D[Open details]
  C --> D
@end
@diagram details
sequenceDiagram
  participant Alice
  participant Bob
  Alice->>Bob: Request
@end
@link overview.D -> details
@link details.Alice -> overview
```

`@start` is optional and defaults to the first diagram. Each `@diagram ID` must end with `@end`. `@link sourceDiagram.elementID -> destinationDiagram` connects a rendered element to another diagram. IDs currently use ASCII letters, digits, underscores, and hyphens, beginning with a letter. A missing diagram or rendered target produces an error instead of a dead link.

```ts
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const viewer = await mermaid.mountInteractiveDocument(container, documentSource);

await viewer.go('details');
await viewer.back();
viewer.destroy();
```

The returned handle exposes `current`, `go`, `back`, and `destroy`. A Back button is included in the mounted view. Interactive elements support mouse and keyboard activation. The library uses Mermaid's normal `render` API, then attaches navigation to elements with stable model IDs; it does not require Mermaid's `click` syntax or `securityLevel: 'loose'`.

Programmatic `go` and `back` calls reject on rendering errors. Errors from clicking a target or the Back button are dispatched on the container as `mermaid:interactive-error` custom events (`event.detail` contains the error). The current diagram stays visible if a destination cannot render.

Node-like elements rendered by Mermaid's shared renderer are supported, including flowchart, state, class, ER entity, and use-case nodes. Sequence-diagram participants are supported through their existing `data-id` attributes. Other diagram-specific elements (for example sequence messages or timeline events) need explicit target adapters and are not yet navigable. A document can still **display** any Mermaid diagram type as a destination.

This format is specific to this fork. Other Mermaid renderers will not understand it. Use a pinned version of the fork in the consuming application.
