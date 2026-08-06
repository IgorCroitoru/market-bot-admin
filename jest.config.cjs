module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/test/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
  moduleNameMapper: {
    "^@market-bot-admin/shared$": "<rootDir>/packages/shared/src/index.ts",
  },
  clearMocks: true,
};
