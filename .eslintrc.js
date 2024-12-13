module.exports = {
    extends: [
      'airbnb',
      'airbnb-typescript',
      'plugin:@typescript-eslint/recommended',
      'plugin:prettier/recommended'
    ],
    parserOptions: {
      project: './tsconfig.json',
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'import/prefer-default-export': 'off',
    }
  };