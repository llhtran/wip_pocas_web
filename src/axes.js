const AXES = [
  { key: 'authoritarianState', label: 'Authoritarian State' },
  { key: 'environmentalCollapse', label: 'Environmental Collapse' },
  { key: 'socialConflict', label: 'Social Conflict' },
  { key: 'capitalistHegemony', label: 'Capitalist Hegemony' }
];

const DIFFICULTIES = {
  easy: { key: 'easy', label: 'Easy', min: 1, max: 2 },
  moderate: { key: 'moderate', label: 'Moderate', min: 2, max: 3 },
  difficult: { key: 'difficult', label: 'Hard', min: 3, max: 5 },
  full: { key: 'full', label: 'Wildcard', min: 1, max: 5 }
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollAxes(difficultyKey = 'moderate') {
  const selected = DIFFICULTIES[difficultyKey] || DIFFICULTIES.moderate;
  const axes = AXES.map((axis) => ({
    ...axis,
    score: randomInt(selected.min, selected.max)
  }));

  return {
    difficulty: { ...selected },
    axes
  };
}

module.exports = {
  AXES,
  DIFFICULTIES,
  rollAxes
};

