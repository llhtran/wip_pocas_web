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
        'You categorize motivation/availability for collaborative projects at pocas. Respond with exactly one word: Burned Out, Low, Medium, High, or Very High.',
      user: [
        'Given the following participant description, classify their motivation and availability level for collaborating in a pocas.',
        [
          'Guidelines:',
          '- Burned Out: exhausted, injured, or explicitly unable to help.',
          '- Low: very limited availability (e.g., “barely any time”, “maybe once a month”).',
          '- Medium: mixed signals, partial availability, or conflicting condition vs availability.',
          '- High: they sound generally available/energized (phrases like “mostly available”, “can help most days”, “strong and fit” should be High unless they also state strict limits).',
          '- Very High: explicit surplus time/energy plus strong eagerness (“full-time free”, “all my time is yours”, etc.).',
          'Availability signals override condition. If availability is clearly good and condition is positive, prefer High. Only fall back to Medium when the description is ambiguous or balanced between High and Low.'
        ].join('\n'),
        'Description:',
        '"""',
        context,
        '"""'
      ].join('\n')
    });

    const normalized = response.draft?.trim().toLowerCase();
    if (
      [
        'burned out',
        'burned-out',
        'burnedout',
        'low',
        'medium',
        'high',
        'very high',
        'very-high',
        'veryhigh'
      ].includes(normalized)
    ) {
      if (normalized.startsWith('burn')) {
        return 'burned-out';
      }
      if (normalized.startsWith('very')) {
        return 'very-high';
      }
      return normalized;
    }
  } catch (error) {
    console.error('Failed to assess motivation level', error);
  }

  return 'medium';
}

module.exports = assessMotivationLevel;

