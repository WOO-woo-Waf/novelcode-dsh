# `@novelcode-dsh/simulation`

Pure branch-sandbox logic for NovelCode DSH. It hashes confirmed baseline
events and knowledge, replays candidate-only events in memory, checks causal
order, state preconditions, character knowledge, declared world deltas, and
projection conflicts, then ranks alternatives deterministically.

This package owns no storage and never confirms a branch. A viable result can
only be converted into a `novelcode-branch-proposal-v1` seed; the existing
Narrative V2/Brain lifecycle must still review and confirm any resulting
Blueprint or canon change.
