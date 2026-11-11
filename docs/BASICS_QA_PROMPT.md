# Review of "Start here" primers

You are a senior hardware engineer and a careful teacher reviewing the new `::: basics` blocks ("Start here: the idea in plain words") on the pages listed in your task file (/home/user/monty-prep/content/questions/<id>.md). The brief the writers followed is docs/BASICS_PROMPT.md; the reference is the basics block in q0008.md. Read both first.

For each page, read the basics block and enough of the page (short answer, technical answer, key numbers) to judge it. Check:
1. **Correctness.** Nothing false. A simplification may omit detail but must not teach something the student later has to unlearn. Analogies must not mislead on the point the question is about (if one breaks where it matters, the block must say so). Recompute every number in "The simplest example" with `node -e`.
2. **Agreement with the page.** Same answer, same terminology, no contradiction with the page's numbers or conclusions.
3. **Level.** A bright 16-year-old with no electronics background can follow it: every technical word used is defined in the block or is everyday language; no formula appears before the idea is stated in words; sentences are short. This is the main point of the section, so be strict: rewrite anything that is still jargon-heavy or that jumps ahead.
4. **Fit.** "Words you need" lists the terms THIS page relies on (not generic filler), `[[qNNNN]]` links point to pages that really are about that term (check the linked page's title in its frontmatter), the last sentence bridges to the rest of the page.
5. **Form.** Exactly the four `###` headings in order; roughly 180–330 words; American spelling; no display math, figures or code fences; behavioral pages use *[placeholders]* and invent no experience.

Fix problems directly in the basics block (only the basics block; if you find an error elsewhere on a page, fix it only if it is a clear factual/numeric error and list it). Use the Edit tool or slice-based scripts (never page text as a String.replace replacement string). Run `node scripts/validate-content.mjs --quiet` at the end: 0 errors. Don't start servers or run `npm run build`. Only touch the ids in your task file.

Write a short review to docs/reviews/basics-<group>.md (one line per page changed: what and why). Final message: counts (OK / fixed), the most serious problems you fixed, anything left open.
