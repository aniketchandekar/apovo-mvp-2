# Talk with Apovo Chat Design

## Intent
Make Talk with Apovo feel as focused and familiar as ChatGPT while preserving Apovo's personalized care-concierge opening, application context, and existing chat behavior.

## Goals
- Center the conversation in a comfortable reading column with clean assistant messages and compact user bubbles.
- Use a large rounded message composer with a circular send button and clear keyboard behavior.
- Present suggested actions as polished prompt cards near the opening message.
- Keep the conversation free of an inner chat header or separate live grant/question context rail.
- Add a collapse/expand control to the main Apovo navigation sidebar; retain recognizable icons on navigation tabs and show tooltips when collapsed.
- Preserve the current personalized opening message and all grant, eligibility, personal-note, and question-answer flows.

## Non-goals
- No chat history, model picker, authentication changes, or new backend behavior.
- No chat-history navigation or changes to unrelated page layouts beyond the shared navigation width.

## Constraints
- Build on the existing Next.js, React, Lucide, and styled-jsx implementation.
- Preserve responsive behavior and accessible labels, focus states, and controls.

## Approaches
1. **Selected: refine the existing interface.** Restyle `TalkWithApovoView` and update `AppShell` with collapsible navigation. This delivers the desired look without changing concierge behavior.
2. Rebuild as a full ChatGPT-style workspace with chat history and another collapsible rail. Rejected because it adds unnecessary navigation and state.

## Implementation direction
The main navigation will collapse to an icon-only rail and remember its state during the session. The chat will keep its existing data loading and message logic, with changes limited to structure, presentation, composer interaction, and responsive layout. The inner chat header and separate context rail are omitted so the conversation and composer remain the sole focus.

## Validation
Run the existing lint, test, and production build commands. Exercise sending a suggested prompt and a typed message, answering or cancelling a pending question, and collapsing/expanding navigation at desktop and mobile widths.
