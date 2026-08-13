module.exports = {
  extends: ['expo'],
  rules: {},
  overrides: [
    {
      files: ['jest.setup.js', '**/*.test.ts', '**/*.test.tsx'],
      env: { jest: true },
    },
    {
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
  ],
};
