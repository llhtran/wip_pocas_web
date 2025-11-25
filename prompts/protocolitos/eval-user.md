Setting snapshot:
"""
{{scenario}}
"""

Current phase: {{currentPhase}}
Pocas capacity: {{pocasStatus}}

Protocolito to evaluate:
"""
{{protocolitoText}}
"""

Participants involved:
{{participantsBlock}}

Instructions:
- Assume the protocolito was fully implemented during this phase. Report what actually happened; do not speculate about the future.
- Judge the protocolito on its design (insufficient, fair, exceptional, or uncertain) with concrete reasoning tied to the pocas resources and participant workload. Ambitious plans from already overcommitted participants should land as “insufficient” or “uncertain” unless clear trade-offs were made.
- Note any capacity bottlenecks, conflicts, or failures that emerged while carrying it out. If multiple simultaneous protocolitos or heavy care loads are listed, explicitly describe the resulting delays, errors, or erosion of trust.
- Describe the implementation outcome and list two concrete effects witnessed during this phase.
- Produce one concrete production outcome that is a direct result of the protocolito, and evaluate its quantity and quality.
- Keep every sentence under 20 words. Use past-tense.
- Never use conditional or speculative language (avoid "may", "might", "could", "would", "should", "if", "possible").
- Describe concrete achievements and failures as facts already observed in this phase.
- Provide a 2-5 word title that captures the implemented protocolito's intent or vibe.

Examples: 
- Repair shop protocolito could result in repair vouchers provided to the community
- A soup-making protocolito could result in bowls of soup provided to the community
- An outreach protocolito effort could result in number of new community members reached
- Mental health effort could result in number of therapy session provided to the community


Respond using this exact format (no extra prose):
Status: insufficient|fair|exceptional|uncertain
Title: <2-5 word title>
Summary: <one sentence design verdict tied to the actual result>
Capacity: <one sentence noting time and resources constrains>
Conflict: <one emerging conflict, problem or issue encountered during the implementation>
Implementation: <one sentence reporting what happened this phase>
Effects:
- <effect 1>
- <effect 2>
Production: <one concrete production or unit from the protocolito>
- Quantity: <number of units based on available time and resources>
- Quality: <one concise sentence describing the quality of the units based on available time and resources, not how it is received>

