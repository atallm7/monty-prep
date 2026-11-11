# "Start here" primer pass

A student told us: "sometimes it goes into deep complicated stuff too quick without me understanding the simple stuff to build on it." Every question page now gets a `::: basics` section, shown first on the page as "Start here: the idea in plain words". You are writing those sections for the page ids in your task, in /home/user/monty-prep/content/questions/.

**The reference is `content/questions/q0008.md`** (its `::: basics` block). Read it first and match its voice, length and structure.

## What to write
Insert a `::: basics` … `:::` block immediately **before** the line `::: testing`. Use exactly these four `###` headings, in this order:

1. `### In plain words`: the answer to the question in 2–4 sentences a bright 16-year-old would follow. No jargon that you haven't defined. Say what the thing *is* and what it is *for* before anything else.
2. `### Picture it`: one everyday analogy (water, stairs, traffic, a bucket, a seesaw, a queue, a thermostat…) or a concrete mental picture, 3–5 sentences. Pick the analogy that fits *this* idea; don't reuse the same one everywhere. If the analogy breaks down somewhere that matters, say so in one short sentence.
3. `### Words you need`: 3–6 bullets, `- **Term**: one-line plain definition.` Choose the terms THIS page's answer actually uses and a newcomer would trip on. On early/fundamental pages that means voltage, current, resistance. On later pages don't re-define voltage; define that page's own stepping stones (e.g. "duty cycle", "open-drain", "cache miss") and, where a term is a whole topic, link its page with `[[qNNNN]]` (the page's frontmatter `prereqs` are good candidates).
4. `### The simplest example`: the smallest worked case with small round numbers (compute them; they must be right), or for non-numeric questions the simplest concrete scenario. 3–6 sentences. End with one sentence that bridges to the rest of the page ("That is the whole idea. The rest of this page shows…"), naming the one or two things the deeper sections add.

Total length 180–330 words. Short sentences. Active voice. American spelling.

## Rules
- Read the whole page first. The primer must agree with the page's own answer, numbers and terminology; it is a gentler on-ramp to the same content, not a different explanation. Reuse the page's own example numbers when they are simple enough.
- Be correct. Simplify by leaving detail out, never by saying something false. Don't invent facts, part numbers or statistics.
- For behavioral / experience questions ("tell me about a time…"), keep the four headings but adapt: plain words = what the interviewer is really asking; picture it = what a good answer looks like in miniature; words you need = e.g. STAR, trade-off, root cause; simplest example = a 3–4 sentence skeleton answer with *[placeholders]* (never invent experience).
- For "draw / design" questions, the simplest example describes the minimal version in words (the diagrams are further down the page).
- Inline math with `$…$` is fine (keep it light: at most one or two simple formulas). No display math, figures, sims or code fences in this section. Never write a bare `$` for currency (write "USD 5").
- Only add the basics block. Do not change any other part of the file. Use the Edit tool, or a script that inserts by slicing/concatenating (never pass page text as a String.replace replacement string: `$` patterns corrupt math).
- Skip a page that already has `::: basics`.
- After each batch of pages run `node scripts/validate-content.mjs --quiet` from /home/user/monty-prep: it must report 0 errors. `git diff --numstat -- content/questions/<id>.md` should show only additions.
- Don't start servers and don't run `npm run build`. Other agents are editing other pages; touch only your ids.

Final message: ids completed, validator summary line, and any page where the existing content looked wrong or the question was ambiguous (one line each).
- Scratch files: create your own directory with `mktemp -d` and use only that (other agents write to shared /tmp paths and will overwrite your helpers).
