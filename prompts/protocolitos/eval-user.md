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
- Judge the protocolito on its design (insufficient, fair, exceptional, or uncertain) with concrete reasoning tied to the pocos resources and participant workload.
- Consider the time span for this phase when determining feasibility.
- Describe the likely outcome over this phase and list concrete effects.

Respond using this exact format (no extra prose):
Status: insufficient|fair|exceptional|uncertain
Summary: <one paragraph design verdict>
Capacity: <one paragraph noting time/resources/conflicts>
Outcome: <one paragraph forecasting results for this phase>
Effects:
- <effect 1>
- <effect 2>

