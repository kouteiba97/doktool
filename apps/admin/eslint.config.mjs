import next from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'src/api/schema.d.ts'] },
  ...next,
  ...nextTypescript,
  {
    // eslint-plugin-react cannot detect the version under ESLint 10; state it.
    settings: { react: { version: '19.3' } },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$|rgba?[(]|hsla?[(]/]',
          message: 'Colours come from the design tokens (Tailwind preset), never literals.',
        },
      ],
    },
  },
];

export default config;
