async function assessMotivationLevel(lmClient, availabilityText = '', conditionText = '') {
  const availability = (availabilityText || '').trim();
  const condition = (conditionText || '').trim();

  if (!availability && !condition) {
    return 'medium';
  }

  const context = [
    availability ? `Availability notes: ${availability}` : '',
    condition ? `Condition notes: ${condition}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await lmClient.generate({
      system:
        'You categorize motivation/availability for a collaborative projects at pocas. Respond with exactly one word: Burned Out, Low, Medium, or High.',
      user: [
        'Given the following participant description, classify their motivation and availability level for collaborating in a pocas.',
        'Return Burned Out if they are exhausted, hurt, or cannot help at all; Low if they have very little bandwidth; Medium if they can help somewhat; or High if they seem broadly available and in good condition. Consider the mix of both their availability and condition, if they are somewhat at odds go for the medium level. If they explicitly state their availability, consider it highly relevant to the classification. Availability is more relevant than condition.',
        'Description:',
        '"""',
        context,
        '"""'
      ].join('\n')
    });

    const normalized = response.draft?.trim().toLowerCase();
    if (['burned out', 'burned-out', 'burnedout', 'low', 'medium', 'high'].includes(normalized)) {
      if (normalized.startsWith('burn')) {
        return 'burned-out';
      }
      return normalized;
    }
  } catch (error) {
    console.error('Failed to assess motivation level', error);
  }

  return 'medium';
}

module.exports = assessMotivationLevel;

