import { describe, expect } from 'vitest';
import { addDiagrams } from './diagram-api/diagram-orchestration.js';
import mermaid from './mermaid.js';
import { jsdomIt } from './tests/util.js';

addDiagrams();

describe('interactive document rendering', () => {
  jsdomIt(
    'navigates across real flowchart, use-case, state, class, ER and sequence SVGs',
    async () => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      const container = document.createElement('div');
      document.body.append(container);
      const handle = await mermaid.mountInteractiveDocument(
        container,
        `@diagram flow
flowchart TD
  A --> D[Details]
@end
@diagram cases
usecase-beta
actor User
Login("Sign in")
User --> Login
@end
@diagram states
stateDiagram-v2
[*] --> Idle
Idle --> Done
@end
@diagram classes
classDiagram
class Customer
@end
@diagram entities
erDiagram
CUSTOMER ||--o{ ORDER : places
@end
@diagram sequence
sequenceDiagram
participant Alice
Alice->>Bob: Hello
@end
@link flow.D -> cases
@link cases.Login -> states
@link states.Idle -> classes
@link classes.Customer -> entities
@link entities.CUSTOMER -> sequence
@link sequence.Alice -> flow`
      );
      for (const [modelId, destination] of [
        ['D', 'cases'],
        ['Login', 'states'],
        ['Idle', 'classes'],
        ['Customer', 'entities'],
        ['CUSTOMER', 'sequence'],
        ['Alice', 'flow'],
      ]) {
        const target = [...container.querySelectorAll('.interactive-diagram-link')].find(
          (element) =>
            (element.getAttribute('data-mermaid-node-id') ?? element.getAttribute('data-id')) ===
            modelId
        );
        expect(target, `missing ${modelId}`).toBeDefined();
        await handle.go(destination);
        expect(handle.current).toBe(destination);
      }
      handle.destroy();
    },
    30_000
  );
});
