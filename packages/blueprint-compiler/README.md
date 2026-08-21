# Blueprint compiler

Compiles one viable, current branch simulation into the existing Narrative V2
`narrative_blueprint_propose` contract. Branch provenance is emitted as a
separate `narrative_memory_propose` candidate because Narrative V2 deliberately
normalizes and strips unknown Blueprint fields.

The compiler is pure. It does not write a workspace, submit review, confirm a
Blueprint, or promote simulated state into canon.
