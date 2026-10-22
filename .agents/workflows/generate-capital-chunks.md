---
description: Regenerates capital chunk .txt files
---

These instructions apply to all steps.

- Do not ask the user for questions.
- DO NOT USE GIT TOOLCALLS.
- The only toolcalls allowed are search, read, and write.

Every time you violate one of these rules, you must say 'I HAVE FAILED MYSELF', and call /generate-capital-chunks again.

Proceed to STEP 1.

## STEP 1.
- You may only access the `tests/capitals/chunks/` folder. 
- You must read every line in each file at least once.

Following the exact format specified in `tests/capitals/chunks_<#>.txt`, ensure that each individual polity within each chunk is aligned to historical reality. You must ensure ALL files in the `tests/capitals/` folder align with historical reality.
- Do not use read toolcalls outside this folder.

- You are only allowed to edit text files in aligning chunks to historical reality. You may NOT use commands, scripts, heuristics, or semantics.
- You must rigourously check each individual polity. If its capital city history is not accurate, you must change it to align with historical reality.

Once you have checked every individual line in the text files specified, see STEP 2.

## STEP 2.

- In this phase, you are allowed to use commands, only to associate Stadestér cities with the individual capitals. This rebuilds the key cache.

## STEP 3.

- Make sure to rebuild state_capitals.json.