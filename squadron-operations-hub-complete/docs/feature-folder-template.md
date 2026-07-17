# Feature module template

Use this shape when adding a major module:

```text
src/modules/<module-name>/
├── actions/
├── components/
├── domain/
│   ├── <module>.types.ts
│   ├── <module>.rules.ts
│   └── <module>.errors.ts
├── repositories/
│   ├── <module>.repository.ts
│   └── prisma-<module>.repository.ts
├── schemas/
├── services/
├── tests/
└── index.ts
```

Not every folder must exist immediately. Add folders when the module has behavior that belongs there.
