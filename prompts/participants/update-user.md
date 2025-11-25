You are closing {{currentPhase}}. Use only the facts below to update each participant’s record.

Development stage hint:
{{developmentStage}}

Scenario snapshot:
{{scenario}}

Collective highlights:
{{summaryHighlights}}

Protocolito evaluations:
{{evaluationsBlock}}

Participant dossiers (one entry per participant, separated by ---):
{{participantsBlock}}

Instructions:
- For each participant, output exactly one sentence that states how motivated they feel and how heavy their workload/commitments are right now.
- Tie the sentence to concrete evidence from protocolito outcomes and the participant dossier (capacities, capabilities, condition). Mention specific protocolitos when relevant.
- When “Protocolitos this phase” exceeds 1 or the care-load text signals limited availability, assume stress compounds: flag overwork, missed details, or looming conflict unless the outcomes clearly stayed small and manageable.
- Keep every sentence ≤30 words, present tense, and free of speculation about future phases.
- If no meaningful signals exist, explicitly say the workload/motivation are unchanged.

Respond with **only** a JSON array. Each object must include:
participantId, statusLine.

