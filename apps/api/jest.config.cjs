module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/dist/test/test/**/*.spec.js'],
  testPathIgnorePatterns: ['\\.integration\\.spec\\.js$'],
  transform: {},
  clearMocks: true,
};
