# Minimal homepage and focused onboarding

## Intent
Make Apovo's first experience calm, credible, and easy to complete. The homepage and onboarding should share a minimal visual language and collect only information needed to begin finding support.

## Goals
- Use Inter Tight throughout both experiences.
- Remove decorative badges, pills, glass effects, gradients, and emoji from these experiences.
- Use warm, dignified online photography of real people.
- Keep the palette to white, soft neutral surfaces, near-black text, muted gray, and one restrained rose accent.
- Turn onboarding into a focused, Typeform-inspired sequence with one question or small decision per screen.
- Preserve draft saving, demo filling, consent, inbox creation, program matching, and navigation to the dashboard.

## Non-goals
- Do not redesign the dashboard, inbox, tasks, or application-detail screens.
- Do not change the existing support-program data or downstream task workflow.
- Do not collect full street address, personal email, income, employment, insurance, treatment types, or clinician details during onboarding. Ask later only when a specific application requires them.

## Constraints
- Keep the current Next.js app and existing API routes; no new dependencies.
- Use `next/font/google` for Inter Tight and stable remote Unsplash image URLs.
- Support mobile, keyboard navigation, visible focus, and reduced motion.
- Keep required fields compatible with the existing `PatientProfile`; omitted optional-for-onboarding fields receive neutral empty/default values only where the current store requires them.

## Approaches
- **Chosen: focused Typeform-style flow.** One question per screen, large responses, automatic advance for single-choice questions, Enter to continue for text entry, and restrained progress. Photography is reserved for welcome and completion so the form remains distraction-free.
- **Rejected: persistent split-screen.** More visual presence throughout onboarding, but photography competes with answers and takes scarce mobile space.

## Design
### Visual system
- Colors: paper `#FFFFFF`, soft surface `#F7F6F4`, ink `#20201F`, muted text `#6F6B67`, line `#E7E3DF`, rose `#B4526D`.
- Inter Tight is both display and UI type. Headlines are compact and medium weight; body copy is plain and conversational.
- Layout is left-aligned, spacious, and mostly border-free. Controls use modest corners and no decorative shadows.
- Photography is warm and natural, with people shown in ordinary moments rather than clinical settings.

### Homepage
- A simple wordmark and two navigation actions.
- An asymmetric hero with concise copy, a primary start action, and a large warm people photograph.
- A short, plain three-part explanation of what Apovo does without cards or badge treatments.
- Existing start, resume, and demo destinations remain available.

### Onboarding
1. Welcome with warm photography and the option to use the demo patient.
2. Legal first and last name together because they form one identity response.
3. Date of birth.
4. Phone number.
5. ZIP code.
6. Cancer stage, with a “Not sure” choice.
7. Treatment status.
8. Support needs, allowing multiple choices.
9. Plain-language consent and full-name signature.
10. Completion with care email and matched programs, followed by the existing dashboard action.

Single-choice screens advance after selection; text and multi-select screens use an explicit Continue action. Back remains available. Progress reflects the current question without badges or decorative step labels. Demo fill still populates the complete downstream demo profile, while the visible form remains reduced.

## Builder decisions
- Keep API submission and profile creation compatible with current store behavior rather than redesigning the data model.
- Replace the welcome, consent, and inbox visual treatments while retaining their responsibilities.
- Verify the real onboarding path through completion, plus build and lint.
