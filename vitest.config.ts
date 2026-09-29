import { defineConfig } from 'vitest/config';

export default defineConfig({
	ssr: {
		resolve: {
			conditions: ['source'],
		},
	},
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['test/**/*.test.ts'],
				},
			},
		],
	},
});
