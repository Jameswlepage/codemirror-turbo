# codemirror-ai Commands & Guidelines

## Build Commands
- `pnpm install` - Install dependencies
- `pnpm dev` - Run development server
- `pnpm build` - Build for production
- `pnpm test` - Run all tests
- `pnpm test src/__tests__/inline-completion.test.ts` - Run specific test file
- `pnpm test -t "should fetch suggestions"` - Run tests matching description
- `pnpm typecheck` - Type check the codebase
- `pnpm lint` - Run linter

## Code Style Guidelines
- **Formatting**: Uses Biome with tab indentation (100 char line limit)
- **Imports**: Organized automatically with Biome
- **Quotes**: Double quotes with trailing commas
- **Types**: Strict TypeScript with noUncheckedIndexedAccess
- **Testing**: Vitest with vi.mock for dependencies
- **Error Handling**: Avoid console.log (use onError callbacks)
- **Naming**: Descriptive camelCase for variables, PascalCase for types
- **State Management**: Use CodeMirror's compartments and facets