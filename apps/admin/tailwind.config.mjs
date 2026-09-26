// The only Tailwind theme is the generated DokTool preset (Lock L35): no raw colours or sizes.
import preset from '@doktool/design-tokens/tailwind-preset';

const config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
};

export default config;
