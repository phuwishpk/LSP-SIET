"""
Feature modules package.

Bundles the AI feature add-ons that were folded in from the
`My-ai-quiz` and `ai-roadmap-generator` repositories. All services
respect multi-user isolation by requiring an `owner_id` on every
operation and by keying cache entries with that id.
"""
