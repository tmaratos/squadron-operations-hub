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
│   └── d1-<module>.repository.ts
├── schemas/
├── services/
├── tests/
└── index.ts
```

Shared D1 and integration code belongs under `src/lib`. Not every folder must exist immediately; add a layer only when the module has behavior that belongs there.
