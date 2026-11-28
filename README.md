# Hydra

An observational study of how changes move between independent, AI-assisted open-source projects.

- **Lineage:** https://hydra-lineage.github.io/
- **Research paper:** https://hydra-lineage.github.io/paper.html

Hydra reads public Git history only. It follows each change from the project that first made it to the projects that later took it up, and measures how much work crosses between independent owners, how quickly, and at what rate.

## How it works

The study recomputes itself every six hours.

1. **Discover.** Find the projects in the study population, and revisit every project already recorded.
2. **Fetch.** Read every branch of every project.
3. **Record.** Add new commits and each project's current state to the ledger.
4. **Analyse.** Working from the ledger alone, group commits into changes, find where each first appeared, and find which projects later took it up.
5. **Publish.** Rebuild the lineage page and the paper with current figures.

Every figure in the paper is filled from the findings when the site is built, so the numbers in it are always current. The prose is revised by hand from time to time.

## What is kept

| Branch | Contents |
|---|---|
| `main` | The published site |
| `ledger` | The study's permanent record: commit graph, timestamps, patch fingerprints, and a registry of every project seen |
| `findings` | The latest derived tables |

The ledger holds no source code. Authors and owners appear in it only as keyed hashes, and branch names are not stored. Once a project is recorded it stays in the study, so a repository that later disappears keeps its place in the findings.

## Findings

| File | Contents |
|---|---|
| `summary.json` | Headline figures |
| `projects.csv` | One row per project |
| `adoptions.csv` | One row per arrival of a change in another project |
| `hydra.json` | The data behind the lineage page |

Projects appear by repository name without the owning account. Owners appear as numbered groups. People are never named.
