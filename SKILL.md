# Workflow Orchestration Skill

## Purpose
This skill defines how to approach complex development tasks — from planning through verification and self-improvement. Apply it whenever a task involves multiple steps, architectural decisions, or any risk of cascading side effects.

**When to invoke this skill:** Multi-step tasks, bug reports, feature builds, refactors, or any work where getting it wrong would require significant cleanup.

**When NOT to invoke this skill:** Single-file edits, config tweaks, clearly scoped one-liners, or trivial fixes where the solution is obvious and self-contained.

---

## Project File Structure
This skill references two persistent project files. Create them if they don't exist:
- `tasks/todo.md` — active plan with checkable items and a results/review section.
- `tasks/lessons.md` — running log of corrections, patterns, and self-improvement rules. 

*Critical File Safety:* When updating `tasks/lessons.md`, always **append** new lessons to the bottom of the file. Do not rewrite, summarize, or delete the existing historical lessons.

---

## 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.
- **Skip plan mode for:** single-file edits, config changes, or clearly-scoped one-liners.

## 2. Subagent Strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- One task per subagent for focused execution.
- *Handoff Rule:* When spinning up a subagent, provide it with a strictly scoped prompt, only the files it strictly needs, and a clear definition of the exact output format you require from it to continue your main task.

## 3. Self-Improvement Loop
- After ANY correction from the user: append the pattern to `tasks/lessons.md`.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review `tasks/lessons.md` at the session start for the relevant project.

## 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness.
- Every item in `tasks/todo.md` must meet this bar before being marked complete.

## 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky, apply this reframing prompt:
  > **"Knowing everything I know now, implement the elegant solution."**
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

## 6. Autonomous Bug Fixing
- When given a bug report: pinpoint the issue and fix it. 
- Point at logs, errors, or failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI tests without being told how.

---

## Task Management

Every non-trivial task follows this sequence, which balances autonomous execution with safety:

1. **Plan First**: Write the plan to `tasks/todo.md` with checkable items.
2. **Verify Plan**: For routine tasks, state your assumptions and proceed immediately to implementation. For high-risk architectural changes, pause and ask for approval before writing code.
3. **Track Progress**: Mark items complete as you go — only after verifying each one works.
4. **Explain Changes**: Provide a high-level summary at each step.
5. **Document Results**: Add a review section to `tasks/todo.md`.
6. **Capture Lessons**: Append updates to `tasks/lessons.md` after any corrections.

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Anti-Patterns & Constraints

Avoid these common failure modes:

- **Infer intent when possible:** Instead of asking clarifying questions for minor details, make a reasonable assumption, state it, and proceed.
- **Scope fixes strictly:** Instead of making sweeping refactors to fix a narrow bug, isolate your changes to the specific failing lines of code unless instructed otherwise.
- **Stop on failure:** Instead of continuing to push code when something breaks, stop, re-plan, and then continue.
- **Prove completeness:** Instead of marking tasks complete on assumption, verify them with tests, logs, or a demonstrated output.
- **Maintain simplicity:** Instead of introducing new abstractions to solve a one-time problem, prioritize elegant, readable solutions.
- **Read the docs:** Never silently skip the lessons review. If `tasks/lessons.md` exists, read it before starting.