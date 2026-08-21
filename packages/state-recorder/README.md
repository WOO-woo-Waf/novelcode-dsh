# State recorder

Validates an author-approved Narrative V2 chapter revision and compiles
evidence-bound StoryEvent, KnowledgeClaim, and ForeshadowDebt candidates into
the existing `narrative_memory_propose` lifecycle.

Every candidate is bound to the immutable chapter hash plus a checked line
range and excerpt hash. The package reads workspace files but never writes the
Brain, confirms a candidate, or treats a derived index as a source of truth.
