# Example watch plans

Fixtures. Not live. Not customers.

Tests and `bun run examples` read this dir. Live watches live in `.sentinel/kb/` (gitignored).

```
bun run examples            # print derived configs from these files
bun run examples:load       # copy into .sentinel/kb so local webhook/distill see them
bun run examples:personas   # Maya / Andre / Priya walks (needs JEV_API_KEY)
```
