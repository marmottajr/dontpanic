import base from '@dontpanic/config/eslint';

export default [
  ...base,
  {
    rules: {
      // NestJS leans heavily on constructor DI and decorators
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
