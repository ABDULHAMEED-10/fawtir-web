# Design source of truth

## The rule

**When anything about a screen is in doubt, the Figma design decides.**

Layout, spacing, icon, colour, label, field order, sequence, component choice — the answer is in the
file, and the file wins over inference, over convention, and over what looks tidier in code. Go and
look before guessing, and before asking.

## The file

https://www.figma.com/design/9cUaVMybChEiMAIyNNbxHp/Fawtir-Web?node-id=0-1

File key `9cUaVMybChEiMAIyNNbxHp`. One page today:

| Page | Node | What it holds |
| --- | --- | --- |
| **Web** | `0:1` | the full design |

There was a second page, **Web Dev** (`1:27134`), holding the Settings and Catalog handoff. The
client removed it on 5 Sep 2026 once those screens were built; that node id is dead. Future design
work will arrive as new frames, so **resolve frames by name, never by a remembered node id**.

## The one exception

**POS has no design.** `/pos` was built without a frame behind it, so it is the only screen where
the file cannot be consulted and judgement is the fallback. Any change there is a decision to make
and flag, not a detail to look up.

## Where the design is wrong

The design is the authority on *intent*, not on *arithmetic*. Its hand-typed figures have repeatedly
disagreed with themselves — KPI totals that do not match their own tables, tab counts above the row
count, percentages taken off the wrong base, a weekday label that did not match its date.

Those get **fixed and flagged, not copied**. The working method is: model one population per screen,
derive every printed figure from it, prove it with a throwaway check script, and only then write the
UI — which is what surfaces the contradictions in the first place. Where a correction changes what a
screen *means* rather than what it computes, ask first.

## Reading the file

The Figma MCP server (`get_metadata`, `get_screenshot`) is the working route. `get_metadata` on a
whole page can return well over a million characters — write it to a file and parse frame names with
a script rather than reading it inline.

The REST API is the fallback and needs a personal access token (figma.com → Settings → Security →
Personal access tokens, read-only). The token issued in Aug 2026 has expired. Never commit a token.
