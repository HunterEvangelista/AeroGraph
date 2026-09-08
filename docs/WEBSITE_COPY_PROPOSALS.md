# Website copy proposals

Status: proposals only. No site copy, templates, or layout changes are authorized by this document.

Scope: `apps/website/content/{site,examples,project}.json`, with `scripts/render.mjs` reviewed for placement and repetition. Product claims checked against the root README. This is a source-copy review, not a visual or usability test.

## Overall recommendation

**Cut repeated explanations before cutting personality.** The site has a clear, thoughtful voice, but too many sections restate the same promise: keep context, connect it, and retrieve it later. Visitors have to read several variations before learning that the product is a local command-line tool.

The main sources of friction:

- **Too many introductions.** “Project knowledge for people & coding agents,” “Context in practice,” “A few ways to use it,” and “The simple idea underneath” repeatedly introduce the subject rather than advance it.
- **Abstract language where concrete language would help.** “Explicit, connected project knowledge,” “review state,” and “a useful slice” take more effort than “linked notes,” “ready for review,” and “relevant context.”
- **The handoff gets explained three times:** the homepage introduction, its expandable steps, and the dedicated example. It also appears in the example cards.
- **Caveats occupy too much space.** The boundaries are important, but orchestration terminology and repeated disclaimers make the site feel defensive.
- **The product identity arrives late.** Keep “local,” “command-line,” “open source,” and “alpha” easy to find. SQLite and retrieval mechanics do not need homepage prominence.

Keep the concrete checkout brief, the decision example, and “Pick up the thread without starting over.” These explain value more effectively than another general statement about context.

## 1. Homepage: fewer sections, clearer purpose

Recommended reading path:

1. **Hero:** what it is, who it helps, and how to start.
2. **One compact example:** show the brief and its linked context, not a workflow tutorial.
3. **Other uses:** two cards for decisions and unfinished investigations.
4. **Closing action:** installation link and a small project/source link.

Propose removing the standalone “Keep it. Connect it. Find it when it matters.” section and the large project teaser/facts block from the homepage. Their useful information can fit in the hero and project page. Keep the project navigation link.

This is a proposed structure change, not merely shorter JSON strings; it would require a separate template pass if approved.

### Hero — `site.json: hero`

The current headline is warm but could describe almost any collaboration product. Recommended replacement:

> **Project context for you and your coding agents.**
>
> AeroGraph is a local command-line tool for saving decisions, linking them to code, and finding the context for your next task.
>
> **Get started** · See an example
>
> Open source · In alpha

Omit the eyebrow: it would repeat the headline. “Get started” is a better match for the existing installation-documentation destination than “Try AeroGraph,” which can suggest an in-browser experience.

If preserving the existing headline is important, keep “Good work starts with shared context.” and use the proposed description beneath it. Avoid retaining both the original eyebrow and another audience statement.

### Featured handoff — `site.json: featured`

Keep:

> **Hand off the context. Not just the task.**
>
> Give the next agent a brief with the decisions and constraints it needs.
>
> **See the handoff example**

Keep the brief title and description:

> **Add session expiry**
>
> Expire inactive sessions without interrupting an active checkout.

Propose moving the three expandable workflow steps entirely to the detail page. The brief and its connections already demonstrate the central idea; status reporting is secondary.

Replace the long disclaimer with:

> Example workflow. AeroGraph stores the context; your agents handle the work.

Keep this beside the preview, not hidden in the footer. Retain “Example brief” as a short label so the visual is not mistaken for a live product interface.

The preview’s “Why sessions expire” link leads to a use-case article, not an actual saved decision. Propose labeling these links “Related example: session decisions” and “Related example: unfinished work,” or separating them from the mock brief. Short copy should not make the destination less clear.

### Other examples — `site.json: examples`; `examples.json: summary`

Use **“Other ways to use AeroGraph”** as the heading, with no eyebrow or introductory paragraph. Omit the handoff card here if the featured section remains directly above it.

Suggested card copy:

| Example | Title | Summary |
| --- | --- | --- |
| Decision | Keep the reason behind the code. | Link a decision to the code it explains. |
| Unfinished work | Pick up the thread without starting over. | Save what you found and what to check next. |

Categories such as “Understanding a decision” duplicate these titles; propose omitting them from homepage cards.

These titles and summaries are shared with detail pages in the current renderer. Either adopt them in both places or explicitly separate card copy during implementation; do not silently change detail-page meaning to fit a card.

### Closing action — `site.json: cta`

Keep the strongest line and shorten the rest:

> **Start with something worth remembering.**
>
> Save one decision from your project.
>
> **Get started** · GitHub

On the homepage, the hero already identifies the alpha stage. On inner pages, retain a compact note if there is no nearby status disclosure:

> In alpha. See the docs for setup and current usage.

Use consistent action labels instead of “Try AeroGraph,” “Explore the source,” “Read the source,” and “Get started” for overlapping destinations. Suggested vocabulary: **Get started**, **GitHub**, **About AeroGraph**, and specific example links.

## 2. Example pages: keep the situation, lose the tutorial padding

Each page currently includes a summary, situation, three step explanations, three artifacts, a boundary paragraph, a takeaway, a related card, and the shared closing section. The examples are useful; the repeated framing makes them feel longer than necessary.

Proposed pattern:

- Title and a two-sentence situation; omit the separate summary from the visible detail-page header if it repeats the situation. It can remain metadata/card copy.
- Three short steps, one sentence each.
- One strong sample note or brief, rather than an artifact for every step.
- One short limitation specific to the example.
- One related-example link and a compact “Get started” action.

Suggested editorial budget: roughly **150–220 words per example**, excluding navigation/footer. This is a target, not a measured reduction.

### Handoff — `examples.json: agent-handoff`

Proposed situation:

> An agent needs to add session expiry without interrupting checkout. Give it a brief linked to the security decision and checkout constraint.

Proposed steps:

1. **Prepare the brief.** Record the goal, review criteria, and links to the relevant decisions.
2. **Record progress.** The working agent adds findings and updates the brief’s status tag.
3. **Review with context.** The coordinating agent retrieves the result and its supporting context.

Keep the existing assignment artifact. Move literal `#status:in-progress` and `#status:review-ready` examples to usage documentation; those conventions are not the reason to try the tool.

Proposed boundary:

> Status tags are conventions, not automation. Your agents handle delegation, updates, and review.

Propose omitting the takeaway: the title and brief already communicate it.

### Decision — `examples.json: remember-the-reason`

Proposed situation:

> A checkout exception looks safe to remove. The linked decision explains why active payments need it.

Proposed steps:

1. **Save the reason.** Record the session policy and the checkout constraint.
2. **Link it to the code.** Connect the decision to the session-handling code reference.
3. **Use it in review.** Retrieve the decision before changing session handling.

Keep the existing “Inactive sessions expire after 30 minutes…” artifact. It is more persuasive than the abstract connection diagram and extra review question combined.

Proposed boundary:

> People or agents must record and maintain these links. Check that the decision still applies before relying on it.

### Unfinished work — `examples.json: pick-up-the-thread`

Proposed situation:

> The debugging session ends before the bug is fixed. Save what you learned so the next session has a starting point.

Proposed steps:

1. **Save the findings.** Note what you observed, ruled out, and still need to check.
2. **Link the background.** Attach the relevant policy and code reference.
3. **Resume with a question.** Retrieve the note and give your agent the next thing to investigate.

Keep the existing “The timeout only appears…” artifact. Omit the other two artifacts.

Proposed boundary:

> Notes must be saved and retrieved explicitly. AeroGraph does not capture chats or resume agent sessions automatically.

The existing takeaway, “Preserve the useful result of a session, not every line of the conversation,” is worth keeping if it replaces other explanation rather than adding another layer.

## 3. Project page: useful facts, not an engineering essay

`project.json` repeats the homepage promise and gives each design choice a paragraph plus a formal “The trade-off” paragraph. Propose one short introduction, three brief facts, and links.

Suggested copy:

> **About AeroGraph**
>
> AeroGraph is an open-source command-line tool for keeping project knowledge connected. Created by Hunter Evangelista.
>
> **Local to your project**
>
> Your knowledge is stored locally. No hosted account is required.
>
> **Connections you control**
>
> People and agents record the notes and links. AeroGraph does not infer them from your code.
>
> **Context, not orchestration**
>
> Export context as Markdown for your coding agent. Your agent handles execution and review.
>
> **In alpha**
>
> Interfaces are evolving. The repository has setup instructions and current usage.
>
> Get started · GitHub · Share feedback

Keep the license link and author attribution. SQLite can remain as a small optional technical fact here, but does not need its own homepage fact tile. Omit “Small enough to inspect. Useful enough to build on.”: it is an unsubstantiated evaluation rather than useful product information.

## 4. What to move, and what not to hide

| Detail | Proposal | Reason |
| --- | --- | --- |
| Local storage, command-line interface | State early in plain language | Sets expectations about what visitors can use. |
| Open source, alpha stage | Keep concise and visible | Important adoption information, not clutter. |
| SQLite | Project page or README | Implementation detail rather than primary benefit. |
| Status-tag syntax and querying mechanics | Usage docs | Useful during setup, distracting during discovery. |
| “Orchestration layer,” “capture-and-retrieval loop,” “command-line ergonomics” | Replace with direct language | Adds specialist vocabulary without adding necessary meaning. |
| No automated delegation or session capture | Keep beside the relevant example | Prevents stronger claims than the product supports. |
| Manual upkeep of notes and links | Keep on project/decision pages | Essential expectation, but need not be repeated everywhere. |
| License and attribution | Footer/project page | Preserve access without repeating a facts grid. |

Do not replace the current caveats with claims such as “never lose context,” “automatic memory,” “seamless handoffs,” or “always up to date.” Shorter copy still needs to describe explicit capture and retrieval honestly.

## Suggested approval order

1. **Highest impact:** compact homepage structure; direct product description; move handoff steps off the homepage.
2. **Next:** shorten example pages and consolidate the project explanation.
3. **Polish:** consistent links, fewer eyebrows, shorter caveats, and “AeroGraph” consistently in prose (the split visual wordmark can remain).

If approved, check shared-field effects, example boundaries, mobile wrapping, and social-preview text as part of implementation. No changes to public content are included in these proposals.
