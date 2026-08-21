# `@novelcode-dsh/memory-adapter`

Maps Memory OS domain objects and viable branch proposal seeds into the existing
`narrative_memory_propose` input contract. It does not write files, confirm
pages, or bypass author approval. Every output enters the existing Narrative
V2 staging/review lifecycle, keeping `.narrative/brain` as the sole truth
source.

Large batches should be serialized to a workspace-local JSON object and passed
through `payload_path`; the model-facing tool wire should remain compact.
