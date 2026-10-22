---
description: Regenerates capital chunk .txt files
---

These instructions apply to all steps.

- Do not ask the user for questions.
- DO NOT USE GIT TOOLCALLS.
- The only toolcalls allowed are search, read, and write.
- You may not view the history of other conversations.

Every time you violate one of these rules, you must say 'I HAVE FAILED MYSELF', and proceed to the first line in STEP 1.

Proceed to STEP 1.

## STEP 1.
- You may only access the `tests/capitals/chunks/` folder. Do not use read toolcalls outside this folder.
- You must read every line in each file at least once.
- Specific JSON/Stadestér keys do not matter at this stage.

For every file starting with `tests/capitals/chunk_01.txt`, through to `tests/capitals/chunk_<#>.txt`:
- Read EVERY line. For each polity delimited:
  - Ask yourself: 'Is the capital city history for this polity historically accurate?'
  - When it is not, you must modify the capital city history to be historically accurate.
- You may NOT use commands, scripts, heuristics, or semantics.

Once you have checked every individual line in the text files specified, see STEP 2. 
- If you have only modified a single file, you must say 'I HAVE FAILED MYSELF', and call /generate-capital-chunks.
- Inspect your conversation history. If you have not read every line in every file, you must say 'I HAVE FAILED MYSELF', and call /generate-capital-chunks.

## STEP 2.
- Have you extensively modified and checked that each file is accurate? If your total modified line count is <100, OR consists only of key changes rather than actual history, you must say 'I HAVE FAILED MYSELF', and call /generate-capital-chunks.
- In this phase, you are allowed to use commands, only to associate Stadestér cities with the individual capitals. This rebuilds the key cache.
- Ensure chunks align to Stadestér keys. 
  - If a tests/ file to ensure 100% alignment does not exist, write a test file using Node.js and execute it.

## STEP 3.
- Make sure to rebuild state_capitals.json.